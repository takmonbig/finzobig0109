import os
import re
import io
import csv
import time
import asyncio
import secrets
from datetime import timedelta, datetime

import chain
from pymongo.errors import DuplicateKeyError

import cloudinary
import cloudinary.api
import cloudinary.utils
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from core import (db, iso, now, uid, client_ip, get_current_user, get_settings, post_ledger, reserve, release, wallets_of, to_minor,
                  RANKS, COMMISSION, team_counts, rank_for, safe_url, strip_html, notify_user, rate_limit, security_event)

router = APIRouter(prefix="/api")
cloudinary.config(cloud_name=os.environ["CLOUDINARY_CLOUD_NAME"], api_key=os.environ["CLOUDINARY_API_KEY"],
                  api_secret=os.environ["CLOUDINARY_API_SECRET"], secure=True)
P0 = {"_id": 0}


def page_args(page: int = 1, size: int = 20):
    size = max(1, min(size, 100))
    return max(page, 1), size


async def paged(coll, q, page, size, sort=("created_at", -1), proj=P0):
    total = await coll.count_documents(q)
    items = await coll.find(q, proj).sort(*sort).skip((page - 1) * size).limit(size).to_list(size)
    for i in items:
        i.pop("_id", None)
    return {"items": items, "total": total, "page": page, "size": size}


async def feature_on(name):
    s = await get_settings()
    if not s["features"].get(name, True):
        raise HTTPException(403, f"The {name} feature is currently disabled")


# ---------------- public ----------------
@router.get("/public/site")
async def public_site():
    s = await get_settings()
    content = await db.website_content.find({}, P0).to_list(100)
    keys = ["site_name", "logo_url", "favicon_url", "theme", "demo_mode", "real_money_enabled", "contact", "company_info", "telegram", "coin", "maintenance_mode", "features", "referral_rewards"]
    return {"settings": {k: s[k] for k in keys}, "content": {c["key"]: c["value"] for c in content}}


@router.get("/public/plans")
async def public_plans():
    return await db.demo_plan_definitions.find({"active": True, "archived": False}, P0).sort("deposit", 1).to_list(50)


@router.get("/public/rewards")
async def public_rewards():
    return await db.rewards.find({"active": True}, P0).sort("milestone", 1).to_list(50)


@router.get("/public/rewards/{slug}")
async def public_reward(slug: str):
    r = await db.rewards.find_one({"slug": slug, "active": True}, P0)
    if not r:
        raise HTTPException(404, "Reward not found")
    return r


@router.get("/public/ranks")
async def public_ranks():
    return {"ranks": RANKS, "commission_bp": COMMISSION}


class CalcIn(BaseModel):
    deposit: float = Field(gt=0, le=10_000_000)
    daily: float = Field(ge=0, le=10_000_000)
    days: int = Field(gt=0, le=3650)


@router.post("/public/calculate")
async def calculate(b: CalcIn):
    dep, daily = to_minor(b.deposit), to_minor(b.daily)
    total = daily * b.days
    return {"deposit": dep, "daily": daily, "days": b.days, "total_payout": total, "net_gain": total - dep,
            "simple_daily_rate_percent": round(daily / dep * 100, 3), "breakeven_day": -(-dep // daily) if daily else None,
            "hypothetical": True, "note": "Calculation: total = daily x days; net = total - plan amount."}


@router.get("/push/public-key")
async def push_key():
    return {"publicKey": os.environ["VAPID_PUBLIC_KEY"]}


# ---------------- dashboard ----------------
def day_key(s):
    return s[:10]


async def downline_ids(user_id, gens=5):
    rows = await db.users.find({"$or": [{f"ancestors.{i}": user_id} for i in range(gens)], "deleted": {"$ne": True}}, {"_id": 0, "id": 1}).to_list(100000)
    return [r["id"] for r in rows]


@router.get("/dashboard")
async def dashboard(user=Depends(get_current_user)):
    uid_ = user["id"]
    w = await wallets_of(uid_)
    ens = await db.demo_plan_enrollments.find({"user_id": uid_}, P0).to_list(1000)
    direct, team = await team_counts(uid_)
    unread = await db.notification_recipients.count_documents({"user_id": uid_, "read": False})
    recent = await db.ledger_transactions.find({"user_id": uid_}, P0).sort("created_at", -1).limit(8).to_list(8)
    since = iso(now() - timedelta(days=30))
    ledger = await db.ledger_transactions.find({"user_id": uid_, "created_at": {"$gte": since}}, P0).sort("created_at", 1).to_list(5000)
    days = [(now() - timedelta(days=29 - i)).strftime("%Y-%m-%d") for i in range(30)]
    activity = {d: 0 for d in days}
    bal = {}
    for e in ledger:
        d = day_key(e["created_at"])
        if d in activity:
            activity[d] += 1
        if e["account"] in ("demo_coins", "sim_earnings"):
            bal.setdefault(e["account"], {})[d] = e["balance_after"]
    series, last = [], {"demo_coins": 0, "sim_earnings": 0}
    first = {a: next((e["balance_after"] - e["amount"] for e in ledger if e["account"] == a), w.get(a, {}).get("balance", 0)) for a in last}
    last = first
    for d in days:
        for a in last:
            last[a] = bal.get(a, {}).get(d, last[a])
        series.append({"date": d[5:], "demo_coins": last["demo_coins"] / 100, "sim_earnings": last["sim_earnings"] / 100})
    members = await db.users.find({"$or": [{f"ancestors.{i}": uid_} for i in range(5)], "created_at": {"$gte": since}}, {"_id": 0, "created_at": 1, "ancestors": 1}).to_list(10000)
    growth = {d: {"team": 0, "direct": 0} for d in days}
    for m in members:
        d = day_key(m["created_at"])
        if d in growth:
            growth[d]["team"] += 1
            growth[d]["direct"] += 1 if m["ancestors"][0] == uid_ else 0
    statuses = {}
    for coll, label in ((db.payment_submissions, "deposit"), (db.withdrawal_requests, "withdrawal")):
        for r in await coll.aggregate([{"$match": {"user_id": uid_}}, {"$group": {"_id": "$status", "n": {"$sum": 1}}}]).to_list(20):
            statuses[f"{label}:{r['_id']}"] = r["n"]
    return {
        "wallets": w, "total_sim_deposits": sum(e["amount"] for e in ens), "active_plans": sum(1 for e in ens if e["status"] == "active"),
        "sim_earnings": w.get("sim_earnings", {}).get("balance", 0), "direct": direct, "team": team, "rank": user.get("rank", "Member"),
        "unread": unread, "recent": recent,
        "charts": {"activity": [{"date": d[5:], "events": activity[d]} for d in days], "balance": series,
                   "growth": [{"date": d[5:], **growth[d]} for d in days], "status": [{"name": k, "value": v} for k, v in statuses.items()]},
    }


@router.get("/activity/calendar")
async def activity_calendar(month: str, user=Depends(get_current_user)):
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month):
        raise HTTPException(400, "month must be YYYY-MM")
    q = {"user_id": user["id"], "created_at": {"$regex": f"^{month}"}}
    ledger = await db.ledger_transactions.find({**q, "account": {"$in": ["verified", "promo"]}}, {"_id": 0, "id": 1, "account": 1, "amount": 1, "type": 1, "memo": 1, "created_at": 1}).to_list(2000)
    deps = await db.payment_submissions.find(q, {"_id": 0, "id": 1, "amount": 1, "status": 1, "method_name": 1, "created_at": 1}).to_list(500)
    wds = await db.withdrawal_requests.find(q, {"_id": 0, "id": 1, "amount": 1, "net_amount": 1, "status": 1, "destination_type": 1, "created_at": 1}).to_list(500)
    return {"month": month, "ledger": ledger, "deposits": deps, "withdrawals": wds}


@router.get("/wallet")
async def wallet(account: str | None = None, page: int = 1, size: int = 20, user=Depends(get_current_user)):
    page, size = page_args(page, size)
    q = {"user_id": user["id"]}
    if account:
        q["account"] = account
    return {"wallets": await wallets_of(user["id"]), "ledger": await paged(db.ledger_transactions, q, page, size)}


# ---------------- plans ----------------
@router.get("/plans")
async def plans(user=Depends(get_current_user)):
    return await public_plans()


class EnrollIn(BaseModel):
    idem_key: str = Field(min_length=8, max_length=64)


@router.post("/plans/{plan_id}/enroll")
async def enroll(plan_id: str, body: EnrollIn, user=Depends(get_current_user)):
    await feature_on("plans")
    plan = await db.demo_plan_definitions.find_one({"id": plan_id, "active": True, "archived": False}, P0)
    if not plan:
        raise HTTPException(404, "Plan not available")
    if await db.demo_plan_enrollments.find_one({"idem_key": f"{user['id']}:{body.idem_key}"}):
        raise HTTPException(409, "Duplicate enrollment request")
    eid = uid()
    await post_ledger(user["id"], "demo_coins", -plan["deposit"], "plan_enrollment", f"Plan enrollment: {plan['name']}", ref=eid, idem_key=f"enroll:{user['id']}:{body.idem_key}")
    doc = {"id": eid, "user_id": user["id"], "plan_id": plan["id"], "plan_name": plan["name"], "plan_version": plan["version"], "amount": plan["deposit"],
           "daily": plan["daily"], "duration_days": plan["duration_days"], "days_credited": 0, "credited_total": 0, "status": "active",
           "started_at": iso(), "idem_key": f"{user['id']}:{body.idem_key}", "hypothetical": True, "created_at": iso()}
    await db.demo_plan_enrollments.insert_one(dict(doc))
    await notify_user(user["id"], "Plan started", f"{plan['name']} is now active.", kind="plan")
    return doc


@router.get("/enrollments")
async def enrollments(user=Depends(get_current_user)):
    return await db.demo_plan_enrollments.find({"user_id": user["id"]}, {"_id": 0, "idem_key": 0}).sort("created_at", -1).to_list(500)


@router.get("/enrollments/{eid}/entries")
async def entries(eid: str, user=Depends(get_current_user)):
    return await db.demo_calculation_entries.find({"enrollment_id": eid, "user_id": user["id"]}, P0).sort("day_index", 1).to_list(5000)


# ---------------- team ----------------
def mask_name(n):
    parts = (n or "").split()
    return " ".join(p[0] + "*" * max(len(p) - 1, 1) if i else p for i, p in enumerate(parts)) or "Member"


MEMBER_PROJ = {"_id": 0, "id": 1, "full_name": 1, "rank": 1, "created_at": 1, "ancestors": 1, "referral_code": 1, "status": 1, "last_active_at": 1}


async def coin_stats(ids):
    out = {}
    for r in await db.coin_rewards.aggregate([{"$match": {"user_id": {"$in": ids}}}, {"$group": {"_id": {"u": "$user_id", "a": "$action"}, "n": {"$sum": "$amount"}}}]).to_list(100000):
        out.setdefault(r["_id"]["u"], {})[r["_id"]["a"]] = r["n"]
    return out


def member_view(m, me):
    gen = m["ancestors"].index(me) + 1
    la = m.get("last_active_at")
    return {"id": m["id"], "name": m["full_name"] if gen == 1 else mask_name(m["full_name"]), "rank": m.get("rank", "Member"), "generation": gen,
            "joined": m["created_at"][:10], "referral_code": m["referral_code"] if gen == 1 else None, "status": m.get("status"), "parent_id": m["ancestors"][0],
            "activity": "active" if la and la >= iso(now() - timedelta(days=7)) else "inactive"}


@router.get("/coin-rewards")
async def my_coin_rewards(user=Depends(get_current_user)):
    by = (await coin_stats([user["id"]])).get(user["id"], {})
    hist = await db.coin_rewards.find({"user_id": user["id"]}, P0).sort("created_at", -1).to_list(200)
    ids = [h["source_user_id"] for h in hist if h.get("source_user_id")]
    names = {u["id"]: u["full_name"] for u in await db.users.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "full_name": 1}).to_list(1000)}
    for h in hist:
        h["from"] = names.get(h.get("source_user_id"))
    s = await get_settings()
    return {"total": sum(by.values()), "by_action": by, "history": hist, "amounts": s.get("referral_rewards", {})}


@router.get("/team/summary")
async def team_summary(user=Depends(get_current_user)):
    me = user["id"]
    direct, team = await team_counts(me)
    gens = [await db.users.count_documents({f"ancestors.{i}": me, "deleted": {"$ne": True}}) for i in range(5)]
    order = ["Member"] + [r["name"] for r in RANKS]
    cur = user.get("rank", "Member")
    nxt = next((r for r in RANKS if order.index(r["name"]) > order.index(cur)), None)
    progress = [{"name": r["name"], "min_direct": r["min_direct"], "min_team": r["min_team"], "direct_pct": min(100, direct * 100 // max(r["min_direct"], 1)),
                 "team_pct": 100 if r["min_team"] == 0 else min(100, team * 100 // r["min_team"]), "qualified": direct >= r["min_direct"] and team >= r["min_team"]} for r in RANKS]
    history = await db.rank_history.find({"user_id": me}, P0).sort("created_at", -1).to_list(50)
    members = await db.users.find({"$or": [{f"ancestors.{i}": me} for i in range(5)]}, {"_id": 0, "created_at": 1}).sort("created_at", 1).to_list(100000)
    growth, total = {}, 0
    for m in members:
        total += 1
        growth[m["created_at"][:10]] = total
    return {"direct": direct, "team": team, "indirect": team - direct, "generations": gens, "rank": cur, "next_rank": nxt, "progress": progress,
            "history": history, "growth": [{"date": k, "total": v} for k, v in growth.items()], "referral_code": user["referral_code"]}


@router.get("/team/tree")
async def team_tree(user=Depends(get_current_user)):
    me = user["id"]
    rows = await db.users.find({"$or": [{f"ancestors.{i}": me} for i in range(5)], "deleted": {"$ne": True}}, MEMBER_PROJ).to_list(5000)
    nodes = [member_view(r, me) for r in rows]
    by_parent = {}
    for n in nodes:
        by_parent.setdefault(n["parent_id"], []).append(n)

    def build(pid):
        return [{**n, "children": build(n["id"])} for n in by_parent.get(pid, [])]
    return {"root": {"id": me, "name": user["full_name"], "rank": user.get("rank", "Member"), "generation": 0, "children": build(me)}, "count": len(nodes)}


@router.get("/team/members")
async def team_members(generation: int | None = None, q: str | None = None, rank: str | None = None, page: int = 1, size: int = 20, user=Depends(get_current_user)):
    page, size = page_args(page, size)
    me = user["id"]
    query = {"deleted": {"$ne": True}}
    query["$or"] = [{f"ancestors.{generation - 1}": me}] if generation and 1 <= generation <= 5 else [{f"ancestors.{i}": me} for i in range(5)]
    if rank:
        query["rank"] = rank
    if q:
        query["full_name"] = {"$regex": re.escape(q), "$options": "i"}
    res = await paged(db.users, query, page, size, proj=MEMBER_PROJ)
    res["items"] = [member_view(m, me) for m in res["items"]]
    return res


@router.get("/team/export")
async def team_export(user=Depends(get_current_user)):
    me = user["id"]
    rows = await db.users.find({"$or": [{f"ancestors.{i}": me} for i in range(5)], "deleted": {"$ne": True}}, {"_id": 0, "id": 1, "full_name": 1, "rank": 1, "created_at": 1, "ancestors": 1, "referral_code": 1, "status": 1}).to_list(10000)
    buf = io.StringIO()
    wr = csv.writer(buf)
    wr.writerow(["Name", "Generation", "Rank", "Joined"])
    for r in rows:
        v = member_view(r, me)
        wr.writerow([v["name"], v["generation"], v["rank"], v["joined"]])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=team.csv"})


class CommSimIn(BaseModel):
    amount: float = Field(gt=0, le=100_000_000)
    ancestor_ranks: list[str] = Field(min_length=1, max_length=5)


@router.post("/team/commission-sim")
async def commission_sim(b: CommSimIn, user=Depends(get_current_user)):
    amt = to_minor(b.amount)
    rows, total = [], 0
    for tier, rk in enumerate(b.ancestor_ranks):
        bp = COMMISSION.get(rk, [0] * 5)[tier]
        val = amt * bp // 10000
        total += val
        rows.append({"tier": tier + 1, "rank": rk, "rate_percent": bp / 100, "obligation": val})
    return {"amount": amt, "tiers": rows, "total_obligation": total, "obligation_percent": round(total / amt * 100, 3),
            "educational": True, "note": "Educational calculator. Each qualifying ancestor is calculated separately; obligations overlap and stack on the same amount. No commissions are paid."}


# ---------------- uploads ----------------
class SigIn(BaseModel):
    purpose: str = Field(pattern=r"^(evidence|announcement|avatar)$")


@router.post("/uploads/signature")
async def upload_signature(b: SigIn, user=Depends(get_current_user)):
    await rate_limit(f"upload:{user['id']}", 30, 3600)
    folder = f"users/{user['id']}/{b.purpose}"
    ts = int(time.time())
    params = {"timestamp": ts, "folder": folder, "allowed_formats": "jpg,jpeg,png,webp"}
    sig = cloudinary.utils.api_sign_request(params, os.environ["CLOUDINARY_API_SECRET"])
    return {"signature": sig, "timestamp": ts, "folder": folder, "allowed_formats": params["allowed_formats"], "api_key": os.environ["CLOUDINARY_API_KEY"], "cloud_name": os.environ["CLOUDINARY_CLOUD_NAME"]}


async def verify_asset(public_id, folder_prefix, max_bytes=5 * 1024 * 1024):
    if not public_id or not public_id.startswith(folder_prefix):
        raise HTTPException(400, "Invalid upload reference")
    try:
        r = await asyncio.to_thread(cloudinary.api.resource, public_id)
    except Exception:
        raise HTTPException(400, "Uploaded file could not be verified")
    if r.get("format") not in ("jpg", "jpeg", "png", "webp") or r.get("bytes", 0) > max_bytes:
        raise HTTPException(400, "File must be JPG, PNG or WEBP under 5 MB")
    return {"public_id": public_id, "secure_url": r["secure_url"], "bytes": r["bytes"], "format": r["format"], "width": r.get("width"), "height": r.get("height")}


# ---------------- deposits ----------------
OPEN_DEP = ["draft", "pending_verification"]


@router.get("/payment-methods")
async def payment_methods(user=Depends(get_current_user)):
    return await db.payment_methods.find({"active": True}, P0).sort("sort", 1).to_list(20)


class DepositIn(BaseModel):
    method_id: str
    amount: float = Field(gt=0)


class DepositSubmitIn(BaseModel):
    reference: str = Field(min_length=6, max_length=80)
    evidence_public_id: str
    note: str | None = Field(default=None, max_length=300)


DEP_PROJ = {"_id": 0, "reference_norm": 0}


@router.post("/deposits")
async def create_deposit(b: DepositIn, user=Depends(get_current_user)):
    await feature_on("deposits")
    await rate_limit(f"deposit:{user['id']}", 10, 3600)
    m = await db.payment_methods.find_one({"id": b.method_id, "active": True}, P0)
    if not m:
        raise HTTPException(400, "Payment method unavailable")
    if not chain.valid_address(m["type"], m["address"]):
        raise HTTPException(400, "This payment method is not configured yet. Please contact support.")
    amt = to_minor(b.amount)
    if amt < m["min_amount"] or amt > m["max_amount"]:
        raise HTTPException(400, f"Amount must be between {m['min_amount'] / 100:g} and {m['max_amount'] / 100:g}")
    if await db.payment_submissions.count_documents({"user_id": user["id"], "status": "draft"}) >= 3:
        raise HTTPException(400, "You already have 3 open deposit requests. Complete or wait for them to expire.")
    dec = chain.DEC[chain.NET[m["type"]]]
    for _ in range(30):
        expected = amt * 10 ** (dec - 2) + (secrets.randbelow(9999) + 1) * 10 ** (dec - 4)
        if not await db.payment_submissions.find_one({"method_type": m["type"], "expected_raw": str(expected), "status": {"$in": OPEN_DEP}}):
            break
    doc = {"id": uid(), "user_id": user["id"], "user_email": user["email"], "method_id": m["id"], "method_name": m["name"], "method_type": m["type"],
           "network": m.get("network"), "address": m["address"], "amount": amt, "currency": "USDT", "expected_raw": str(expected),
           "expected_display": chain.display_raw(m["type"], expected), "status": "draft",
           "status_note": "Send the exact amount shown, then submit the transaction hash.", "expires_at": iso(now() + timedelta(hours=3)),
           "history": [{"status": "draft", "at": iso()}], "created_at": iso()}
    await db.payment_submissions.insert_one(dict(doc))
    return doc


@router.post("/deposits/{did}/submit")
async def submit_deposit(did: str, b: DepositSubmitIn, request: Request, user=Depends(get_current_user)):
    d = await db.payment_submissions.find_one({"id": did, "user_id": user["id"]}, P0)
    if not d or d["status"] != "draft":
        raise HTTPException(400, "This deposit request is no longer open")
    if d["expires_at"] < iso():
        raise HTTPException(400, "This deposit request has expired. Create a new one.")
    h = chain.norm_hash(d["method_type"], b.reference)
    if not h:
        raise HTTPException(400, "Transaction hash must be 64 hexadecimal characters (optionally starting with 0x)")
    if await db.payment_submissions.find_one({"method_type": d["method_type"], "reference_norm": h}):
        await security_event("duplicate_payment_reference", user["id"], client_ip(request), {"reference": h}, "warning")
        raise HTTPException(409, "This transaction hash has already been submitted")
    ev = await verify_asset(b.evidence_public_id, f"users/{user['id']}/evidence/")
    await db.payment_evidence.insert_one({"id": uid(), "submission_id": did, "user_id": user["id"], **ev, "created_at": iso()})
    try:
        ok = await db.payment_submissions.find_one_and_update(
            {"id": did, "status": "draft"},
            {"$set": {"reference": b.reference.strip(), "reference_norm": h, "evidence_url": ev["secure_url"], "note": strip_html(b.note), "status": "pending_verification",
                      "status_note": "Checking the blockchain…", "submitted_at": iso(), "next_check_at": iso()},
             "$push": {"history": {"status": "pending_verification", "at": iso()}}})
    except DuplicateKeyError:
        raise HTTPException(409, "This transaction hash has already been submitted")
    if not ok:
        raise HTTPException(400, "This deposit request is no longer open")
    return await chain.check_deposit(did)


@router.post("/deposits/{did}/recheck")
async def recheck_deposit(did: str, user=Depends(get_current_user)):
    await rate_limit(f"deprecheck:{user['id']}", 20, 600)
    if not await db.payment_submissions.find_one({"id": did, "user_id": user["id"]}, {"_id": 1}):
        raise HTTPException(404, "Not found")
    return await chain.check_deposit(did)


@router.get("/deposits")
async def my_deposits(page: int = 1, size: int = 20, user=Depends(get_current_user)):
    page, size = page_args(page, size)
    return await paged(db.payment_submissions, {"user_id": user["id"]}, page, size, proj=DEP_PROJ)


# ---------------- withdrawals ----------------
@router.get("/withdrawals/info")
async def withdrawal_info(user=Depends(get_current_user)):
    s = await get_settings()
    w = await wallets_of(user["id"])
    return {"verified": w.get("verified"), "config": s["withdrawal"],
            "totp_enabled": user.get("totp_enabled", False), "enabled": s["features"].get("withdrawals", True)}


class WithdrawIn(BaseModel):
    amount: float = Field(gt=0)
    destination_type: str = Field(pattern=r"^(usdt_trc20|usdt_bep20)$")
    destination: str = Field(min_length=4, max_length=120)
    idem_key: str = Field(min_length=8, max_length=64)
    totp_code: str | None = None


@router.post("/withdrawals")
async def create_withdrawal(b: WithdrawIn, user=Depends(get_current_user)):
    await feature_on("withdrawals")
    s = await get_settings()
    if user.get("totp_enabled"):
        import pyotp
        full = await db.users.find_one({"id": user["id"]})
        if not b.totp_code or not pyotp.TOTP(full["totp_secret"]).verify(b.totp_code, valid_window=1):
            raise HTTPException(400, "Valid 2FA code required")
    if not chain.valid_address(b.destination_type, b.destination):
        raise HTTPException(400, "Destination address is invalid for the selected network")
    cfg = s["withdrawal"]
    amt = to_minor(b.amount)
    if amt < cfg["min"] * 100 or amt > cfg["max"] * 100:
        raise HTTPException(400, f"Amount must be between {cfg['min']} and {cfg['max']}")
    fee = amt * int(cfg["fee_percent"] * 100) // 10000 + int(cfg["fee_flat"] * 100)
    wid = uid()
    try:
        await db.withdrawal_requests.insert_one({"id": wid, "user_id": user["id"], "idem_key": f"{user['id']}:{b.idem_key}", "open_lock": user["id"], "status": "submitted", "created_at": iso()})
    except Exception:
        raise HTTPException(409, "You already have an open withdrawal request or this request was already submitted")
    try:
        await reserve(user["id"], "verified", amt)
    except HTTPException:
        await db.withdrawal_requests.delete_one({"id": wid})
        raise
    doc = {"user_email": user["email"], "amount": amt, "fee": fee, "net_amount": amt - fee, "destination_type": b.destination_type, "destination": b.destination.strip(),
           "account": "verified", "currency": "USDT", "history": [{"status": "submitted", "at": iso()}]}
    await db.withdrawal_requests.update_one({"id": wid}, {"$set": doc})
    await notify_user(user["id"], "Withdrawal request submitted", f"Request for {amt / 100:,.2f} USDT is under review. The amount is reserved.", kind="withdrawal", link="/app/withdraw")
    return await db.withdrawal_requests.find_one({"id": wid}, {"_id": 0, "open_lock": 0, "idem_key": 0})


@router.get("/withdrawals")
async def my_withdrawals(page: int = 1, size: int = 20, user=Depends(get_current_user)):
    page, size = page_args(page, size)
    return await paged(db.withdrawal_requests, {"user_id": user["id"]}, page, size, proj={"_id": 0, "open_lock": 0, "idem_key": 0})


@router.post("/withdrawals/{wid}/cancel")
async def cancel_withdrawal(wid: str, user=Depends(get_current_user)):
    w = await db.withdrawal_requests.find_one_and_update({"id": wid, "user_id": user["id"], "status": {"$in": ["submitted", "under_review"]}},
                                                         {"$set": {"status": "cancelled"}, "$unset": {"open_lock": ""}, "$push": {"history": {"status": "cancelled", "at": iso()}}})
    if not w:
        raise HTTPException(400, "This request can no longer be cancelled")
    await release(user["id"], "verified", w["amount"])
    return {"ok": True}


# ---------------- rewards ----------------
async def team_volume(user_id):
    ids = await downline_ids(user_id)
    if not ids:
        return 0
    r = await db.demo_plan_enrollments.aggregate([{"$match": {"user_id": {"$in": ids}}}, {"$group": {"_id": None, "v": {"$sum": "$amount"}}}]).to_list(1)
    return r[0]["v"] if r else 0


@router.get("/rewards")
async def my_rewards(user=Depends(get_current_user)):
    vol = await team_volume(user["id"])
    rewards = await public_rewards()
    claims = {c["reward_id"]: c for c in await db.reward_claims.find({"user_id": user["id"]}, P0).to_list(50)}
    for r in rewards:
        r["progress_pct"] = min(100, vol * 100 // max(r["milestone"], 1))
        r["eligible"] = vol >= r["milestone"]
        r["claim"] = claims.get(r["id"])
    return {"team_volume": vol, "rewards": rewards}


@router.post("/rewards/{rid}/claim")
async def claim_reward(rid: str, user=Depends(get_current_user)):
    await feature_on("rewards")
    r = await db.rewards.find_one({"id": rid, "active": True}, P0)
    if not r:
        raise HTTPException(404, "Reward not found")
    if r.get("expires_at") and r["expires_at"] < iso():
        raise HTTPException(400, "This reward concept has expired")
    if r.get("inventory", 0) <= 0:
        raise HTTPException(400, "No inventory available")
    if await team_volume(user["id"]) < r["milestone"]:
        raise HTTPException(400, "Qualification milestone not reached")
    if await db.reward_claims.find_one({"user_id": user["id"], "reward_id": rid, "status": {"$ne": "rejected"}}):
        raise HTTPException(409, "You already have a claim for this reward")
    doc = {"id": uid(), "user_id": user["id"], "user_email": user["email"], "reward_id": rid, "reward_title": r["title"], "status": "pending_review", "history": [{"status": "pending_review", "at": iso()}], "created_at": iso()}
    await db.reward_claims.insert_one(dict(doc))
    return doc


# ---------------- notifications ----------------
@router.get("/notifications")
async def notifications(page: int = 1, size: int = 20, unread: bool = False, user=Depends(get_current_user)):
    page, size = page_args(page, size)
    q = {"user_id": user["id"]}
    if unread:
        q["read"] = False
    res = await paged(db.notification_recipients, q, page, size)
    res["unread"] = await db.notification_recipients.count_documents({"user_id": user["id"], "read": False})
    return res


@router.get("/notifications/popups")
async def popups(user=Depends(get_current_user)):
    q = {"user_id": user["id"], "popup": True, "popup_seen": False, "$or": [{"expires_at": None}, {"expires_at": {"$gt": iso()}}]}
    return await db.notification_recipients.find(q, P0).sort("created_at", -1).limit(3).to_list(3)


@router.get("/announcements/dashboard")
async def dashboard_banners(user=Depends(get_current_user)):
    q = {"status": "sent", "channels": "dashboard", "$or": [{"expires_at": None}, {"expires_at": {"$gt": iso()}}]}
    rows = await db.notification_campaigns.find(q, {"_id": 0, "id": 1, "title": 1, "message": 1, "link": 1, "cta_label": 1, "image_url": 1, "priority": 1}).sort("sent_at", -1).limit(3).to_list(3)
    mine = {r["campaign_id"] for r in await db.notification_recipients.find({"user_id": user["id"], "campaign_id": {"$in": [x["id"] for x in rows]}}, {"_id": 0, "campaign_id": 1}).to_list(10)}
    return [r for r in rows if r["id"] in mine]


@router.post("/notifications/{nid}/read")
async def mark_read(nid: str, user=Depends(get_current_user)):
    await db.notification_recipients.update_one({"id": nid, "user_id": user["id"]}, {"$set": {"read": True, "popup_seen": True}})
    return {"ok": True}


@router.post("/notifications/read-all")
async def read_all(user=Depends(get_current_user)):
    await db.notification_recipients.update_many({"user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}


@router.post("/notifications/{nid}/click")
async def click(nid: str, user=Depends(get_current_user)):
    n = await db.notification_recipients.find_one_and_update({"id": nid, "user_id": user["id"]}, {"$set": {"clicked": True, "read": True, "popup_seen": True, "clicked_at": iso()}})
    if n and n.get("campaign_id") and not n.get("clicked"):
        await db.notification_campaigns.update_one({"id": n["campaign_id"]}, {"$inc": {"stats.clicked": 1}})
    return {"ok": True}


@router.post("/notifications/{nid}/popup-seen")
async def popup_seen(nid: str, user=Depends(get_current_user)):
    await db.notification_recipients.update_one({"id": nid, "user_id": user["id"]}, {"$set": {"popup_seen": True}})
    return {"ok": True}


class SubIn(BaseModel):
    endpoint: str = Field(max_length=1000)
    keys: dict[str, str]
    expirationTime: int | None = None


@router.post("/push/subscribe")
async def push_subscribe(b: SubIn, user=Depends(get_current_user)):
    if not b.endpoint.startswith("https://") or "p256dh" not in b.keys or "auth" not in b.keys:
        raise HTTPException(400, "Invalid subscription")
    await db.push_subscriptions.update_one({"endpoint": b.endpoint}, {"$set": {"user_id": user["id"], "keys": b.keys, "active": True, "updated_at": iso()}, "$setOnInsert": {"id": uid(), "created_at": iso()}}, upsert=True)
    await db.users.update_one({"id": user["id"]}, {"$set": {"push_permission": "granted"}})
    return {"ok": True}


@router.post("/push/unsubscribe")
async def push_unsubscribe(b: SubIn, user=Depends(get_current_user)):
    await db.push_subscriptions.update_one({"endpoint": b.endpoint, "user_id": user["id"]}, {"$set": {"active": False}})
    return {"ok": True}


class PermIn(BaseModel):
    state: str = Field(pattern=r"^(granted|denied|default|unsupported|later)$")


@router.post("/push/permission")
async def push_permission(b: PermIn, user=Depends(get_current_user)):
    upd = {"push_prompt_later_at": iso()} if b.state == "later" else {"push_permission": b.state}
    await db.users.update_one({"id": user["id"]}, {"$set": upd})
    return {"ok": True}


# ---------------- team announcements ----------------
class TeamMsgIn(BaseModel):
    scope: str = Field(pattern=r"^(individual|selected|team)$")
    recipient_ids: list[str] = []
    title: str = Field(min_length=2, max_length=100)
    message: str = Field(min_length=2, max_length=1000)
    image_public_id: str | None = None
    link: str | None = None


@router.post("/team-messages")
async def send_team_message(b: TeamMsgIn, user=Depends(get_current_user)):
    await feature_on("team_messages")
    if user.get("messaging_disabled"):
        raise HTTPException(403, "Your messaging privileges have been disabled by an administrator")
    if user.get("rank", "Member") == "Member":
        raise HTTPException(403, "Reach Bronze rank to send team announcements")
    s = await get_settings()
    await rate_limit(f"teammsg:{user['id']}", int(s["team_message_daily_limit"]), 86400)
    link = safe_url(b.link) if b.link else None
    image = (await verify_asset(b.image_public_id, f"users/{user['id']}/announcement/"))["secure_url"] if b.image_public_id else None
    downline = set(await downline_ids(user["id"]))
    targets = list(downline) if b.scope == "team" else [r for r in b.recipient_ids if r in downline]
    if b.scope == "individual":
        targets = targets[:1]
    if not targets:
        raise HTTPException(400, "No valid recipients in your team")
    consenting = await db.users.find({"id": {"$in": targets}, "prefs.allow_team_messages": True, "status": "active"}, {"_id": 0, "id": 1}).to_list(10000)
    mid = uid()
    for c in consenting:
        await notify_user(c["id"], strip_html(b.title), strip_html(b.message), kind="team", link=link, image_url=image, team_message_id=mid, sender_name=user["full_name"])
    doc = {"id": mid, "sender_id": user["id"], "sender_name": user["full_name"], "scope": b.scope, "title": strip_html(b.title), "message": strip_html(b.message),
           "image_url": image, "link": link, "targeted": len(targets), "delivered": len(consenting), "skipped_no_consent": len(targets) - len(consenting),
           "status": "delivered", "reports": 0, "hidden": False, "created_at": iso()}
    await db.announcement_messages.insert_one(dict(doc))
    return doc


@router.get("/team-messages/sent")
async def sent_team_messages(user=Depends(get_current_user)):
    return await db.announcement_messages.find({"sender_id": user["id"]}, P0).sort("created_at", -1).to_list(100)


class ReportIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300)


@router.post("/notifications/{nid}/report")
async def report_message(nid: str, b: ReportIn, user=Depends(get_current_user)):
    n = await db.notification_recipients.find_one({"id": nid, "user_id": user["id"], "kind": "team"}, P0)
    if not n or not n.get("team_message_id"):
        raise HTTPException(400, "Only team announcements can be reported")
    await db.announcement_messages.update_one({"id": n["team_message_id"]}, {"$inc": {"reports": 1}, "$push": {"report_reasons": {"by": user["id"], "reason": strip_html(b.reason), "at": iso()}}})
    return {"ok": True}


# ---------------- support ----------------
class TicketIn(BaseModel):
    subject: str = Field(min_length=3, max_length=120)
    category: str = Field(pattern=r"^(deposit|withdrawal|account|team|rewards|other)$")
    message: str = Field(min_length=5, max_length=3000)


@router.post("/tickets")
async def create_ticket(b: TicketIn, user=Depends(get_current_user)):
    await rate_limit(f"ticket:{user['id']}", 10, 3600)
    t = {"id": uid(), "user_id": user["id"], "user_email": user["email"], "user_name": user["full_name"], "subject": strip_html(b.subject), "category": b.category,
         "status": "open", "created_at": iso(), "updated_at": iso()}
    await db.support_tickets.insert_one(dict(t))
    await db.support_replies.insert_one({"id": uid(), "ticket_id": t["id"], "author_id": user["id"], "author_role": "user", "message": strip_html(b.message), "created_at": iso()})
    return t


@router.get("/tickets")
async def my_tickets(user=Depends(get_current_user)):
    return await db.support_tickets.find({"user_id": user["id"]}, P0).sort("updated_at", -1).to_list(200)


@router.get("/tickets/{tid}")
async def ticket(tid: str, user=Depends(get_current_user)):
    t = await db.support_tickets.find_one({"id": tid, "user_id": user["id"]}, P0)
    if not t:
        raise HTTPException(404, "Ticket not found")
    t["replies"] = await db.support_replies.find({"ticket_id": tid}, P0).sort("created_at", 1).to_list(500)
    return t


class ReplyIn(BaseModel):
    message: str = Field(min_length=1, max_length=3000)


@router.post("/tickets/{tid}/reply")
async def reply(tid: str, b: ReplyIn, user=Depends(get_current_user)):
    t = await db.support_tickets.find_one({"id": tid, "user_id": user["id"]}, P0)
    if not t:
        raise HTTPException(404, "Ticket not found")
    r = {"id": uid(), "ticket_id": tid, "author_id": user["id"], "author_role": "user", "message": strip_html(b.message), "created_at": iso()}
    await db.support_replies.insert_one(dict(r))
    await db.support_tickets.update_one({"id": tid}, {"$set": {"status": "open", "updated_at": iso()}})
    r.pop("_id", None)
    return r


# ---------------- profile ----------------
class ProfileIn(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=80)
    prefs: dict[str, bool] | None = None


@router.put("/profile")
async def update_profile(b: ProfileIn, user=Depends(get_current_user)):
    upd = {}
    if b.full_name:
        upd["full_name"] = strip_html(b.full_name)
    if b.prefs:
        for k in ("allow_team_messages", "marketing_push", "push_reminders"):
            if k in b.prefs:
                upd[f"prefs.{k}"] = bool(b.prefs[k])
    if upd:
        await db.users.update_one({"id": user["id"]}, {"$set": upd})
    return await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0, "totp_secret": 0, "totp_pending": 0})


@router.post("/profile/kyc")
async def submit_kyc(user=Depends(get_current_user)):
    if user.get("kyc_status") in ("pending", "verified"):
        raise HTTPException(400, "Verification already submitted")
    await db.users.update_one({"id": user["id"]}, {"$set": {"kyc_status": "pending", "kyc_submitted_at": iso()}})
    return {"ok": True}
