import re
import io
import csv
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

import time
import os
import cloudinary.utils
from core import (db, iso, now, uid, client_ip, require_admin, audit, get_settings, bust_settings, post_ledger, release, wallets_of, to_minor,
                  RANKS, COMMISSION, team_counts, recompute_rank, safe_url, strip_html, notify_user, ACCOUNTS, clean, rank_for)
from routes_user import paged, page_args, verify_asset, P0, team_volume
from jobs import run_simulation, dispatch_campaign, resolve_audience
import chain
from datetime import datetime

router = APIRouter(prefix="/api/admin")
UPROJ = {"_id": 0, "password_hash": 0, "totp_secret": 0, "totp_pending": 0}


@router.get("/overview")
async def overview(admin=Depends(require_admin)):
    u = db.users
    base = {"role": "user", "deleted": {"$ne": True}}
    week = iso(now() - timedelta(days=7))
    ranks = await u.aggregate([{"$match": base}, {"$group": {"_id": "$rank", "n": {"$sum": 1}}}]).to_list(10)
    days = [(now() - timedelta(days=13 - i)).strftime("%Y-%m-%d") for i in range(14)]
    regs = {d: 0 for d in days}
    for r in await u.find({**base, "created_at": {"$gte": iso(now() - timedelta(days=14))}}, {"_id": 0, "created_at": 1}).to_list(100000):
        if r["created_at"][:10] in regs:
            regs[r["created_at"][:10]] += 1
    alerts = await db.security_events.find({"severity": {"$in": ["warning", "critical"]}}, P0).sort("created_at", -1).limit(8).to_list(8)
    return {
        "total_users": await u.count_documents(base), "active_users": await u.count_documents({**base, "last_active_at": {"$gte": week}}),
        "new_registrations": await u.count_documents({**base, "created_at": {"$gte": week}}), "suspended": await u.count_documents({**base, "status": "suspended"}),
        "pending_kyc": await u.count_documents({**base, "kyc_status": "pending"}), "pending_deposits": await db.payment_submissions.count_documents({"status": "pending_verification"}),
        "verified_deposits": await db.payment_submissions.count_documents({"status": "verified"}),
        "pending_withdrawals": await db.withdrawal_requests.count_documents({"status": {"$in": ["submitted", "under_review", "approved", "processing"]}}),
        "open_tickets": await db.support_tickets.count_documents({"status": {"$ne": "closed"}}), "push_subscriptions": await db.push_subscriptions.count_documents({"active": True}),
        "reward_requests": await db.reward_claims.count_documents({"status": "pending_review"}), "active_enrollments": await db.demo_plan_enrollments.count_documents({"status": "active"}),
        "rank_distribution": [{"name": r["_id"] or "Member", "value": r["n"]} for r in ranks], "registrations": [{"date": d[5:], "count": regs[d]} for d in days], "alerts": clean(alerts),
    }


# ---------------- users ----------------
def user_query(q, status, rank, kyc, group):
    query = {"deleted": {"$ne": True}} if status != "deleted" else {"deleted": True}
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"email": rx}, {"full_name": rx}, {"referral_code": rx}, {"mobile": rx}]
    if status in ("active", "suspended"):
        query["status"] = status
    if rank:
        query["rank"] = rank
    if kyc:
        query["kyc_status"] = kyc
    if group:
        query["group"] = group
    return query


@router.get("/users")
async def users(q: str = "", status: str = "", rank: str = "", kyc: str = "", group: str = "", page: int = 1, size: int = 20, admin=Depends(require_admin)):
    page, size = page_args(page, size)
    return await paged(db.users, user_query(q, status, rank, kyc, group), page, size, proj=UPROJ)


@router.get("/users/export")
async def export_users(q: str = "", status: str = "", rank: str = "", kyc: str = "", group: str = "", ids: str = "", request: Request = None, admin=Depends(require_admin)):
    query = {"id": {"$in": ids.split(",")}} if ids else user_query(q, status, rank, kyc, group)
    rows = await db.users.find(query, UPROJ).to_list(50000)
    buf = io.StringIO()
    w = csv.writer(buf)
    cols = ["id", "full_name", "email", "country_code", "mobile", "status", "rank", "kyc_status", "group", "referral_code", "created_at", "last_active_at"]
    w.writerow(cols)
    for r in rows:
        w.writerow([r.get(c, "") for c in cols])
    await audit(admin, "users.export", "user", None, {"count": len(rows)}, client_ip(request))
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=users.csv"})


@router.get("/users/{user_id}")
async def user_detail(user_id: str, admin=Depends(require_admin)):
    u = await db.users.find_one({"id": user_id}, UPROJ)
    if not u:
        raise HTTPException(404, "User not found")
    direct, team = await team_counts(user_id)
    referrer = await db.users.find_one({"id": u.get("referrer_id")}, {"_id": 0, "id": 1, "full_name": 1, "email": 1}) if u.get("referrer_id") else None
    return {"user": u, "wallets": await wallets_of(user_id), "direct": direct, "team": team, "referrer": referrer, "team_volume": await team_volume(user_id),
            "deposits": await db.payment_submissions.find({"user_id": user_id}, {"_id": 0, "reference_norm": 0}).sort("created_at", -1).to_list(50),
            "withdrawals": await db.withdrawal_requests.find({"user_id": user_id}, {"_id": 0, "open_lock": 0}).sort("created_at", -1).to_list(50),
            "enrollments": await db.demo_plan_enrollments.find({"user_id": user_id}, {"_id": 0, "idem_key": 0}).to_list(100),
            "rank_history": await db.rank_history.find({"user_id": user_id}, P0).sort("created_at", -1).to_list(50),
            "sessions": await db.sessions.find({"user_id": user_id}, {"_id": 0, "id": 1, "ip": 1, "user_agent": 1, "created_at": 1, "last_seen_at": 1, "revoked": 1, "expires_at": 1}).sort("created_at", -1).to_list(30),
            "security_events": await db.security_events.find({"user_id": user_id}, P0).sort("created_at", -1).to_list(30),
            "ledger": await db.ledger_transactions.find({"user_id": user_id}, P0).sort("created_at", -1).to_list(100),
            "active_sessions": await db.sessions.count_documents({"user_id": user_id, "revoked": False})}


@router.get("/users/{user_id}/downline")
async def user_downline(user_id: str, admin=Depends(require_admin)):
    rows = await db.users.find({"$or": [{f"ancestors.{i}": user_id} for i in range(5)]},
                               {"_id": 0, "id": 1, "full_name": 1, "email": 1, "country": 1, "country_code": 1, "mobile": 1, "rank": 1, "status": 1, "deleted": 1,
                                "created_at": 1, "last_login_at": 1, "last_active_at": 1, "last_login_ip": 1, "ancestors": 1, "referral_code": 1, "kyc_status": 1}).to_list(5000)
    ids = [r["id"] for r in rows]
    bal = {w["user_id"]: w.get("balance", 0) for w in await db.wallet_accounts.find({"user_id": {"$in": ids}, "account": "verified"}, {"_id": 0, "user_id": 1, "balance": 1}).to_list(5000)}
    dep = {d["_id"]: d["total"] for d in await db.payment_submissions.aggregate([{"$match": {"user_id": {"$in": ids}, "status": "verified"}},
                                                                                     {"$group": {"_id": "$user_id", "total": {"$sum": {"$ifNull": ["$credited_amount", "$amount"]}}}}]).to_list(5000)}
    out = []
    for r in rows:
        anc = r.pop("ancestors")
        r.update(generation=anc.index(user_id) + 1, parent_id=anc[0], usdt_balance=bal.get(r["id"], 0), verified_deposits=dep.get(r["id"], 0))
        out.append(r)
    by_gen = [sum(1 for r in out if r["generation"] == g) for g in range(1, 6)]
    return {"items": out, "by_generation": by_gen, "total": len(out)}


class SetPwIn(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)


@router.post("/users/{user_id}/password")
async def admin_set_password(user_id: str, b: SetPwIn, request: Request, admin=Depends(require_admin)):
    from routes_auth import check_password_strength
    from core import hash_password, security_event
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "email": 1, "country_code": 1, "mobile": 1})
    if not u:
        raise HTTPException(404, "User not found")
    check_password_strength(b.new_password)
    await db.users.update_one({"id": user_id}, {"$set": {"password_hash": hash_password(b.new_password), "password_changed_at": iso()}})
    await db.sessions.update_many({"user_id": user_id, "revoked": False}, {"$set": {"revoked": True, "revoked_reason": "admin_password_reset"}})
    idents = [":" + re.escape(u["email"]) + "$"] + ([":" + re.escape(f"{u['country_code']}{u['mobile']}") + "$"] if u.get("mobile") else [])
    await db.login_attempts.delete_many({"identifier": {"$regex": "|".join(idents)}})
    await security_event("admin_password_reset", user_id, client_ip(request), {"by": admin["email"]}, "warning")
    await audit(admin, "user.password_reset", "user", user_id, {}, client_ip(request))
    await notify_user(user_id, "Your password was changed", "An administrator set a new password for your account. Contact support if you did not request this.", kind="security")
    return {"ok": True}


@router.get("/reports/progress")
async def progress_report(admin=Depends(require_admin)):
    rewards = await db.rewards.find({"active": True}, {"_id": 0, "id": 1, "title": 1, "milestone": 1}).sort("milestone", 1).to_list(50)
    claims = {(c["user_id"], c["reward_id"]): c["status"] for c in await db.reward_claims.find({}, {"_id": 0, "user_id": 1, "reward_id": 1, "status": 1}).to_list(5000)}
    rows = []
    for u in await db.users.find({"role": "user", "deleted": {"$ne": True}}, {"_id": 0, "id": 1, "full_name": 1, "email": 1, "rank": 1, "status": 1}).to_list(1000):
        tc = await team_counts(u["id"])
        direct, team = (tc["direct"], tc["team"]) if isinstance(tc, dict) else (tc[0], tc[1])
        names = [r["name"] for r in RANKS]
        cur = names.index(u["rank"]) if u.get("rank") in names else -1
        nxt = RANKS[cur + 1] if cur + 1 < len(RANKS) else None
        parts = [] if not nxt else [min(1, x / need) for x, need in ((direct, nxt["min_direct"]), (team, nxt["min_team"])) if need]
        rank_pct = 100 if not nxt else round(100 * sum(parts) / len(parts)) if parts else 100
        vol = await team_volume(u["id"])
        reached = [r["title"] for r in rewards if vol >= r["milestone"]]
        nr = next((r for r in rewards if vol < r["milestone"]), None)
        rows.append({**u, "direct": direct, "team": team, "next_rank": nxt["name"] if nxt else None,
                     "next_rank_needs": {"direct": max(0, nxt["min_direct"] - direct), "team": max(0, nxt["min_team"] - team)} if nxt else None, "rank_progress": rank_pct,
                     "team_volume": vol, "rewards_reached": reached, "next_reward": nr["title"] if nr else None,
                     "reward_progress": round(100 * vol / nr["milestone"]) if nr else 100,
                     "claims": [f"{r['title']}: {claims[(u['id'], r['id'])]}" for r in rewards if (u["id"], r["id"]) in claims]})
    rows.sort(key=lambda r: (-r["rank_progress"] if r["next_rank"] else -101, -r["reward_progress"]))
    return {"items": rows, "rank_counts": {n: sum(1 for r in rows if r.get("rank") == n) for n in ["Member"] + [x["name"] for x in RANKS]}}


@router.get("/users/{user_id}/downline/export")
async def export_downline(user_id: str, request: Request, q: str = "", generation: int = 0, admin=Depends(require_admin)):
    root = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1, "full_name": 1})
    if not root:
        raise HTTPException(404, "User not found")
    data = await user_downline(user_id, admin)
    names = {r["id"]: r["full_name"] for r in data["items"]}
    ql = q.strip().lower()
    data["items"] = [r for r in data["items"] if (not generation or r["generation"] == generation) and (not ql or ql in f"{r['full_name']} {r.get('email', '')}".lower())]
    data["total"] = len(data["items"])
    names[user_id] = root["full_name"]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Generation", "Name", "Email", "Country", "Mobile", "Referral code", "Referred by", "Rank", "Status", "KYC", "Joined", "Last login", "Last login IP", "Last active", "USDT balance", "Verified deposits (USDT)"])
    for r in sorted(data["items"], key=lambda x: (x["generation"], x.get("created_at", ""))):
        w.writerow([f"T{r['generation']}", r["full_name"], r.get("email"), r.get("country") or "", f"{r.get('country_code') or ''} {r.get('mobile') or ''}".strip(), r.get("referral_code"),
                    names.get(r["parent_id"], ""), r.get("rank", "Member"), "deleted" if r.get("deleted") else r.get("status"), r.get("kyc_status", ""), r.get("created_at", ""),
                    r.get("last_login_at", ""), r.get("last_login_ip", ""), r.get("last_active_at", ""), f"{r['usdt_balance'] / 100:.2f}", f"{r['verified_deposits'] / 100:.2f}"])
    await audit(admin, "user.downline_export", "user", user_id, {"rows": data["total"]}, client_ip(request))
    fname = re.sub(r"[^A-Za-z0-9._-]", "_", root["email"])
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=downline_{fname}.csv"})


class UserEditIn(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=80)
    group: str | None = Field(default=None, max_length=40)
    kyc_status: str | None = Field(default=None, pattern=r"^(not_submitted|pending|verified|rejected)$")
    messaging_disabled: bool | None = None
    mobile_verified: bool | None = None


@router.patch("/users/{user_id}")
async def edit_user(user_id: str, b: UserEditIn, request: Request, admin=Depends(require_admin)):
    upd = {k: (strip_html(v) if isinstance(v, str) else v) for k, v in b.model_dump().items() if v is not None}
    if not upd:
        raise HTTPException(400, "Nothing to update")
    r = await db.users.update_one({"id": user_id, "role": "user"}, {"$set": upd})
    if not r.matched_count:
        raise HTTPException(404, "User not found")
    await audit(admin, "user.edit", "user", user_id, upd, client_ip(request))
    if "kyc_status" in upd:
        await notify_user(user_id, "Verification status updated", f"Your account verification status is now: {upd['kyc_status']}.", kind="account")
    return clean(await db.users.find_one({"id": user_id}, UPROJ))


class BulkIn(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=1000)
    action: str = Field(pattern=r"^(suspend|reactivate|soft_delete|set_group|set_kyc|announce)$")
    value: str | None = None
    title: str | None = None
    message: str | None = None
    confirm: bool = False


@router.post("/users/bulk")
async def bulk(b: BulkIn, request: Request, admin=Depends(require_admin)):
    if b.action in ("suspend", "soft_delete") and not b.confirm:
        raise HTTPException(400, "Confirmation required for destructive actions")
    q = {"id": {"$in": b.ids}, "role": "user"}
    affected = await db.users.find(q, {"_id": 0, "id": 1, "ancestors": 1}).to_list(1000)
    if b.action == "suspend":
        r = await db.users.update_many(q, {"$set": {"status": "suspended", "suspended_at": iso()}})
        await db.sessions.update_many({"user_id": {"$in": b.ids}}, {"$set": {"revoked": True, "revoked_reason": "suspended"}})
    elif b.action == "reactivate":
        r = await db.users.update_many(q, {"$set": {"status": "active", "deleted": False}})
    elif b.action == "soft_delete":
        r = await db.users.update_many(q, {"$set": {"deleted": True, "status": "suspended", "deleted_at": iso()}})
        await db.sessions.update_many({"user_id": {"$in": b.ids}}, {"$set": {"revoked": True, "revoked_reason": "deleted"}})
    elif b.action == "set_group":
        r = await db.users.update_many(q, {"$set": {"group": strip_html(b.value or "default")}})
    elif b.action == "set_kyc":
        if b.value not in ("not_submitted", "pending", "verified", "rejected"):
            raise HTTPException(400, "Invalid KYC status")
        r = await db.users.update_many(q, {"$set": {"kyc_status": b.value}})
    else:
        if not b.title or not b.message:
            raise HTTPException(400, "Title and message required")
        for a in affected:
            await notify_user(a["id"], b.title, b.message, kind="admin", popup=True)
        await audit(admin, "users.bulk.announce", "user", None, {"count": len(affected)}, client_ip(request))
        return {"affected": len(affected)}
    if b.action in ("suspend", "reactivate", "soft_delete"):
        anc = {x for a in affected for x in (a.get("ancestors") or [])[:5]}
        for a in anc:
            await recompute_rank(a)
    await audit(admin, f"users.bulk.{b.action}", "user", None, {"ids": b.ids, "value": b.value}, client_ip(request))
    return {"affected": r.modified_count}


class AdjustIn(BaseModel):
    account: str = Field(pattern=r"^(demo_coins|promo)$")
    amount: float
    memo: str = Field(min_length=3, max_length=200)


@router.post("/users/{user_id}/adjust")
async def adjust(user_id: str, b: AdjustIn, request: Request, admin=Depends(require_admin)):
    e = await post_ledger(user_id, b.account, to_minor(b.amount), "admin_adjustment", strip_html(b.memo), ref=admin["id"])
    await audit(admin, "ledger.adjust", "user", user_id, {"account": b.account, "amount": to_minor(b.amount), "memo": b.memo}, client_ip(request))
    return e


# ---------------- uploads ----------------
class AdminSigIn(BaseModel):
    folder: str = Field(pattern=r"^(qr|rewards|notifications|cms|branding)$")


@router.post("/uploads/signature")
async def admin_sig(b: AdminSigIn, admin=Depends(require_admin)):
    folder = f"admin/{b.folder}"
    ts = int(time.time())
    params = {"timestamp": ts, "folder": folder, "allowed_formats": "jpg,jpeg,png,webp"}
    return {"signature": cloudinary.utils.api_sign_request(params, os.environ["CLOUDINARY_API_SECRET"]), "timestamp": ts, "folder": folder,
            "allowed_formats": params["allowed_formats"], "api_key": os.environ["CLOUDINARY_API_KEY"], "cloud_name": os.environ["CLOUDINARY_CLOUD_NAME"]}


class AssetIn(BaseModel):
    public_id: str


@router.post("/uploads/verify")
async def admin_verify_asset(b: AssetIn, admin=Depends(require_admin)):
    return await verify_asset(b.public_id, "admin/", 8 * 1024 * 1024)


# ---------------- deposits ----------------
@router.get("/deposits")
async def deposits(status: str = "", q: str = "", page: int = 1, size: int = 20, admin=Depends(require_admin)):
    page, size = page_args(page, size)
    query = {}
    if status:
        query["status"] = status
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"reference": rx}, {"user_email": rx}]
    return await paged(db.payment_submissions, query, page, size, proj={"_id": 0, "reference_norm": 0})


class DepActIn(BaseModel):
    action: str = Field(pattern=r"^(recheck|credit_onchain|approve_manual|reject|refund)$")
    note: str = Field(min_length=3, max_length=500)


@router.post("/deposits/{did}/action")
async def deposit_action(did: str, b: DepActIn, request: Request, admin=Depends(require_admin)):
    d0 = await db.payment_submissions.find_one({"id": did}, P0)
    if not d0:
        raise HTTPException(404, "Not found")
    if b.action in ("recheck", "credit_onchain"):
        if b.action == "recheck" and d0["status"] != "pending_verification":
            raise HTTPException(400, "Only pending deposits can be re-checked")
        if b.action == "credit_onchain" and (d0["status"] not in ("pending_verification", "failed") or not d0.get("reference_norm")):
            raise HTTPException(400, "Only submitted pending or failed deposits can be credited from the blockchain")
        d = await chain.check_deposit(did, admin_credit=b.action == "credit_onchain")
        await audit(admin, f"deposit.{b.action}", "payment_submission", did, {"note": b.note, "result": d["status"]}, client_ip(request))
        if b.action == "credit_onchain" and d["status"] != "verified":
            raise HTTPException(400, f"Not credited: {d['status_note']}")
        return {"ok": True, "status": d["status"], "note": d["status_note"]}
    allowed = {"reject": ["draft", "pending_verification", "failed"], "refund": ["verified"], "approve_manual": ["draft", "pending_verification", "failed"]}[b.action]
    new = {"reject": "rejected", "refund": "refunded", "approve_manual": "verified"}[b.action]
    extra = {"credited_amount": d0["amount"], "verified_at": iso(), "verification": "manual"} if b.action == "approve_manual" else {}
    d = await db.payment_submissions.find_one_and_update({"id": did, "status": {"$in": allowed}},
                                                         {"$set": {"status": new, "status_note": strip_html(b.note), "reviewed_by": admin["email"], "reviewed_at": iso(), **extra},
                                                          "$push": {"history": {"status": new, "at": iso(), "by": admin["email"], "note": strip_html(b.note)}}})
    if not d:
        raise HTTPException(400, "Invalid status transition")
    if b.action == "approve_manual":
        await post_ledger(d["user_id"], "verified", d["amount"], "deposit_confirmed", f"USDT deposit approved by admin {d.get('reference', '')[:12]}", ref=did, idem_key=f"dep:{did}")
    if b.action == "refund":
        amt = d.get("credited_amount", d["amount"])
        await post_ledger(d["user_id"], "verified", -amt, "deposit_refund_reversal", f"Reversal for refunded deposit {d.get('reference', '')[:12]}", ref=did, idem_key=f"depref:{did}")
    await audit(admin, f"deposit.{b.action}", "payment_submission", did, {"note": b.note}, client_ip(request))
    await notify_user(d["user_id"], f"Deposit {new}", f"Your deposit request is now {new}. Note: {strip_html(b.note)}", kind="payment", link="/app/deposit")
    return {"ok": True, "status": new}


# ---------------- withdrawals ----------------
@router.get("/withdrawals")
async def withdrawals(status: str = "", page: int = 1, size: int = 20, admin=Depends(require_admin)):
    page, size = page_args(page, size)
    return await paged(db.withdrawal_requests, {"status": status} if status else {}, page, size, proj={"_id": 0, "open_lock": 0, "idem_key": 0})


class WdActIn(BaseModel):
    action: str = Field(pattern=r"^(under_review|approved|processing|completed|rejected)$")
    note: str = Field(min_length=3, max_length=500)
    payout_ref: str | None = None


WD_FLOW = {"under_review": ["submitted"], "approved": ["under_review"], "processing": ["approved"], "completed": ["processing"], "rejected": ["submitted", "under_review", "approved"]}


@router.post("/withdrawals/{wid}/action")
async def withdrawal_action(wid: str, b: WdActIn, request: Request, admin=Depends(require_admin)):
    extra = {}
    if b.action == "completed":
        w0 = await db.withdrawal_requests.find_one({"id": wid, "status": "processing"}, P0)
        if not w0:
            raise HTTPException(400, "Invalid status transition")
        h = chain.norm_hash(w0["destination_type"], b.payout_ref)
        if not h:
            raise HTTPException(400, "Payout transaction hash must be 64 hexadecimal characters")
        if await db.withdrawal_requests.find_one({"payout_ref_norm": h}, {"_id": 1}):
            raise HTTPException(409, "This payout transaction is already linked to another withdrawal")
        try:
            r = await chain.find_transfer(w0["destination_type"], h, w0["destination"], chain.raw_units(w0["destination_type"], w0["net_amount"]))
        except chain.ChainError:
            raise HTTPException(503, "Blockchain lookup unavailable. Try again shortly.")
        if r["state"] == "not_found":
            raise HTTPException(400, "Payout transaction not found on-chain yet")
        if r["state"] == "failed":
            raise HTTPException(400, "Payout transaction failed on-chain")
        if not r["match"]:
            raise HTTPException(400, f"No USDT transfer of exactly {w0['net_amount'] / 100:,.2f} to the user's destination was found in this transaction")
        if r["timestamp"] < datetime.fromisoformat(w0["created_at"]).timestamp() - 600:
            raise HTTPException(400, "This transaction was made before the withdrawal request")
        if r["state"] == "pending":
            raise HTTPException(400, f"Payout is still confirming ({r['confirmations']}/{r['required']}). Try again shortly.")
        extra = {"payout_ref_norm": h, "payout_confirmations": r["confirmations"]}
    upd = {"$set": {"status": b.action, "status_note": strip_html(b.note), "reviewed_by": admin["email"], "payout_ref": b.payout_ref, **extra},
           "$push": {"history": {"status": b.action, "at": iso(), "by": admin["email"], "note": strip_html(b.note)}}}
    if b.action in ("completed", "rejected"):
        upd["$unset"] = {"open_lock": ""}
    w = await db.withdrawal_requests.find_one_and_update({"id": wid, "status": {"$in": WD_FLOW[b.action]}}, upd)
    if not w:
        raise HTTPException(400, "Invalid status transition")
    if b.action == "completed":
        await post_ledger(w["user_id"], "verified", -w["amount"], "withdrawal_completed", f"USDT withdrawal {b.payout_ref[:12]}… (on-chain confirmed)", ref=wid, idem_key=f"wd:{wid}", reserved_delta=-w["amount"])
    elif b.action == "rejected":
        await release(w["user_id"], "verified", w["amount"])
    await audit(admin, f"withdrawal.{b.action}", "withdrawal_request", wid, {"note": b.note, "payout_ref": b.payout_ref}, client_ip(request))
    await notify_user(w["user_id"], f"Withdrawal {b.action.replace('_', ' ')}", f"Your withdrawal request is now {b.action.replace('_', ' ')}. {strip_html(b.note)}", kind="withdrawal", link="/app/withdraw")
    return {"ok": True}


# ---------------- payment methods ----------------
class MethodIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    type: str = Field(pattern=r"^(usdt_trc20|usdt_bep20)$")
    network: str = Field(max_length=40)
    currency: str = Field(pattern=r"^USDT$")
    address: str = Field(min_length=4, max_length=120)
    instructions: str = Field(max_length=2000)
    qr_public_id: str | None = None
    min_amount: float = Field(gt=0)
    max_amount: float = Field(gt=0)
    active: bool = True
    sort: int = 0


async def method_doc(b: MethodIn):
    d = b.model_dump()
    d["instructions"] = strip_html(d["instructions"])
    d["address"] = d["address"].strip()
    if not chain.valid_address(b.type, d["address"]):
        raise HTTPException(400, "Wallet address is not a valid address for this network")
    d["min_amount"], d["max_amount"] = to_minor(b.min_amount), to_minor(b.max_amount)
    if d["min_amount"] >= d["max_amount"]:
        raise HTTPException(400, "Minimum must be less than maximum")
    if b.qr_public_id:
        d["qr_url"] = (await verify_asset(b.qr_public_id, "admin/qr/", 8 * 1024 * 1024))["secure_url"]
    return d


@router.get("/payment-methods")
async def list_methods(admin=Depends(require_admin)):
    return clean(await db.payment_methods.find({}, P0).sort("sort", 1).to_list(50))


@router.post("/payment-methods")
async def create_method(b: MethodIn, request: Request, admin=Depends(require_admin)):
    d = {"id": uid(), **(await method_doc(b)), "test_mode": True, "created_at": iso()}
    await db.payment_methods.insert_one(dict(d))
    await audit(admin, "payment_method.create", "payment_method", d["id"], {"name": b.name}, client_ip(request))
    return d


@router.put("/payment-methods/{mid}")
async def update_method(mid: str, b: MethodIn, request: Request, admin=Depends(require_admin)):
    d = await method_doc(b)
    if not b.qr_public_id:
        d.pop("qr_public_id")
    r = await db.payment_methods.update_one({"id": mid}, {"$set": {**d, "updated_at": iso()}})
    if not r.matched_count:
        raise HTTPException(404, "Method not found")
    await audit(admin, "payment_method.update", "payment_method", mid, {"name": b.name, "address": b.address, "active": b.active}, client_ip(request))
    return clean(await db.payment_methods.find_one({"id": mid}, P0))


# ---------------- plans ----------------
class PlanIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    description: str = Field(max_length=500)
    deposit: float = Field(gt=0)
    daily: float = Field(gt=0)
    duration_days: int = Field(gt=0, le=3650)
    payout_schedule: str = Field(pattern=r"^(daily|weekly|end_of_term)$")
    active: bool = True


@router.get("/plans")
async def list_plans(admin=Depends(require_admin)):
    return clean(await db.demo_plan_definitions.find({}, P0).sort([("archived", 1), ("deposit", 1)]).to_list(200))


def plan_doc(b: PlanIn, family=None, version=1):
    dep, daily = to_minor(b.deposit), to_minor(b.daily)
    return {"id": uid(), "family_id": family or uid(), "version": version, "name": strip_html(b.name), "description": strip_html(b.description), "deposit": dep, "daily": daily,
            "duration_days": b.duration_days, "total_payout": daily * b.duration_days, "net_gain": daily * b.duration_days - dep, "payout_schedule": b.payout_schedule,
            "active": b.active, "archived": False, "hypothetical": True, "created_at": iso()}


@router.post("/plans")
async def create_plan(b: PlanIn, request: Request, admin=Depends(require_admin)):
    d = plan_doc(b)
    await db.demo_plan_definitions.insert_one(dict(d))
    await audit(admin, "plan.create", "plan", d["id"], {"name": b.name}, client_ip(request))
    return d


@router.put("/plans/{pid}")
async def version_plan(pid: str, b: PlanIn, request: Request, admin=Depends(require_admin)):
    old = await db.demo_plan_definitions.find_one({"id": pid, "archived": False}, P0)
    if not old:
        raise HTTPException(404, "Plan not found or archived")
    d = plan_doc(b, old["family_id"], old["version"] + 1)
    await db.demo_plan_definitions.update_one({"id": pid}, {"$set": {"archived": True, "active": False, "archived_at": iso(), "superseded_by": d["id"]}})
    await db.demo_plan_definitions.insert_one(dict(d))
    await audit(admin, "plan.version", "plan", d["id"], {"previous": pid, "version": d["version"]}, client_ip(request))
    return d


@router.post("/plans/{pid}/toggle")
async def toggle_plan(pid: str, request: Request, admin=Depends(require_admin)):
    p = await db.demo_plan_definitions.find_one({"id": pid, "archived": False}, P0)
    if not p:
        raise HTTPException(404, "Plan not found")
    await db.demo_plan_definitions.update_one({"id": pid}, {"$set": {"active": not p["active"]}})
    await audit(admin, "plan.toggle", "plan", pid, {"active": not p["active"]}, client_ip(request))
    return {"active": not p["active"]}


@router.post("/simulation/run")
async def sim_run(request: Request, admin=Depends(require_admin)):
    res = await run_simulation()
    await audit(admin, "simulation.run", "system", None, res, client_ip(request))
    return res


# ---------------- rewards ----------------
class RewardIn(BaseModel):
    title: str = Field(min_length=2, max_length=80)
    slug: str = Field(pattern=r"^[a-z0-9-]{2,60}$")
    category: str = Field(max_length=40)
    description: str = Field(max_length=3000)
    milestone: float = Field(gt=0)
    qualification_rules: list[str] = []
    eligibility: list[str] = []
    terms: list[str] = []
    redemption: list[str] = []
    faqs: list[dict] = []
    duration: str | None = None
    inventory: int = Field(ge=0)
    expires_at: str | None = None
    image_url: str | None = None
    image_public_id: str | None = None
    active: bool = True


async def reward_doc(b: RewardIn):
    d = b.model_dump()
    d["milestone"] = to_minor(b.milestone)
    if b.image_public_id:
        d["image_url"] = (await verify_asset(b.image_public_id, "admin/rewards/", 8 * 1024 * 1024))["secure_url"]
    elif d.get("image_url") and not d["image_url"].startswith("/"):
        d["image_url"] = safe_url(d["image_url"])
    d["concept"] = True
    return d


@router.get("/rewards")
async def list_rewards(admin=Depends(require_admin)):
    return clean(await db.rewards.find({}, P0).sort("milestone", 1).to_list(100))


@router.post("/rewards")
async def create_reward(b: RewardIn, request: Request, admin=Depends(require_admin)):
    if await db.rewards.find_one({"slug": b.slug}):
        raise HTTPException(400, "Slug already used")
    d = {"id": uid(), **(await reward_doc(b)), "created_at": iso()}
    await db.rewards.insert_one(dict(d))
    await audit(admin, "reward.create", "reward", d["id"], {"title": b.title}, client_ip(request))
    return d


@router.put("/rewards/{rid}")
async def update_reward(rid: str, b: RewardIn, request: Request, admin=Depends(require_admin)):
    if await db.rewards.find_one({"slug": b.slug, "id": {"$ne": rid}}):
        raise HTTPException(400, "Slug already used")
    r = await db.rewards.update_one({"id": rid}, {"$set": {**(await reward_doc(b)), "updated_at": iso()}})
    if not r.matched_count:
        raise HTTPException(404, "Reward not found")
    await audit(admin, "reward.update", "reward", rid, {"title": b.title}, client_ip(request))
    return clean(await db.rewards.find_one({"id": rid}, P0))


@router.get("/reward-claims")
async def reward_claims(status: str = "", admin=Depends(require_admin)):
    return clean(await db.reward_claims.find({"status": status} if status else {}, P0).sort("created_at", -1).to_list(500))


class ClaimActIn(BaseModel):
    action: str = Field(pattern=r"^(approved|rejected|fulfilled)$")
    note: str = Field(min_length=3, max_length=500)


@router.post("/reward-claims/{cid}/action")
async def claim_action(cid: str, b: ClaimActIn, request: Request, admin=Depends(require_admin)):
    flow = {"approved": ["pending_review"], "rejected": ["pending_review"], "fulfilled": ["approved"]}
    c = await db.reward_claims.find_one({"id": cid, "status": {"$in": flow[b.action]}}, P0)
    if not c:
        raise HTTPException(400, "Invalid status transition")
    if b.action == "approved":
        r = await db.rewards.update_one({"id": c["reward_id"], "inventory": {"$gt": 0}}, {"$inc": {"inventory": -1}})
        if not r.modified_count:
            raise HTTPException(400, "No inventory left")
    await db.reward_claims.update_one({"id": cid}, {"$set": {"status": b.action, "note": strip_html(b.note)}, "$push": {"history": {"status": b.action, "at": iso(), "by": admin["email"], "note": strip_html(b.note)}}})
    await audit(admin, f"reward_claim.{b.action}", "reward_claim", cid, {"note": b.note}, client_ip(request))
    await notify_user(c["user_id"], f"Reward claim {b.action}", f"{c['reward_title']}: {strip_html(b.note)}", kind="reward", link="/app/rewards")
    return {"ok": True}


# ---------------- campaigns ----------------
class CampaignIn(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    message: str = Field(min_length=2, max_length=2000)
    image_public_id: str | None = None
    link: str | None = None
    cta_label: str | None = Field(default=None, max_length=40)
    audience: dict
    channels: list[str] = Field(min_length=1)
    priority: str = Field(default="normal", pattern=r"^(low|normal|high)$")
    scheduled_at: str | None = None
    expires_at: str | None = None


@router.get("/campaigns")
async def campaigns(admin=Depends(require_admin)):
    return clean(await db.notification_campaigns.find({}, P0).sort("created_at", -1).to_list(200))


@router.post("/campaigns/audience-preview")
async def audience_preview(audience: dict, admin=Depends(require_admin)):
    ids = await resolve_audience(audience)
    granted = await db.users.count_documents({"id": {"$in": ids}, "push_permission": "granted"})
    return {"count": len(ids), "push_granted": granted}


@router.post("/campaigns")
async def create_campaign(b: CampaignIn, request: Request, admin=Depends(require_admin)):
    if not set(b.channels) <= {"inbox", "popup", "push", "dashboard"}:
        raise HTTPException(400, "Invalid channel")
    if b.audience.get("type") not in ("all", "selected", "group", "push_enabled", "push_disabled", "active_recent", "inactive"):
        raise HTTPException(400, "Invalid audience")
    if (b.audience["type"] == "selected" and not b.audience.get("user_ids")) or (b.audience["type"] == "group" and not b.audience.get("group")):
        raise HTTPException(400, "Audience requires user IDs or a group name")
    image = (await verify_asset(b.image_public_id, "admin/notifications/", 8 * 1024 * 1024))["secure_url"] if b.image_public_id else None
    sched = b.scheduled_at if b.scheduled_at and b.scheduled_at > iso() else None
    d = {"id": uid(), "title": strip_html(b.title), "message": strip_html(b.message), "image_url": image, "link": safe_url(b.link) if b.link else None,
         "cta_label": strip_html(b.cta_label) if b.cta_label else None, "audience": b.audience, "channels": b.channels, "priority": b.priority,
         "scheduled_at": sched, "expires_at": b.expires_at, "status": "scheduled", "created_by": admin["email"], "created_at": iso(), "stats": {}}
    await db.notification_campaigns.insert_one(dict(d))
    await audit(admin, "campaign.create", "campaign", d["id"], {"title": d["title"], "scheduled_at": sched}, client_ip(request))
    if not sched:
        d = await dispatch_campaign(d["id"]) or d
    return d


@router.post("/campaigns/{cid}/test")
async def test_campaign(cid: str, admin=Depends(require_admin)):
    from core import send_push
    c = await db.notification_campaigns.find_one({"id": cid}, P0)
    if not c:
        raise HTTPException(404, "Campaign not found")
    await notify_user(admin["id"], f"[TEST] {c['title']}", c["message"], kind="test", link=c["link"], image_url=c["image_url"], cta_label=c["cta_label"], popup=True)
    push = await send_push(admin["id"], {"title": f"[TEST] {c['title']}", "body": c["message"][:180], "url": c["link"] or "/app/notifications", "image": c["image_url"]})
    return {"ok": True, "push": push}


@router.post("/campaigns/{cid}/disable")
async def disable_campaign(cid: str, request: Request, admin=Depends(require_admin)):
    await db.notification_campaigns.update_one({"id": cid}, {"$set": {"status": "disabled", "disabled_at": iso()}})
    r = await db.notification_recipients.update_many({"campaign_id": cid}, {"$set": {"popup_seen": True, "expires_at": iso()}})
    await audit(admin, "campaign.disable", "campaign", cid, {"recipients_hidden": r.modified_count}, client_ip(request))
    return {"ok": True}


# ---------------- team moderation & inspection ----------------
@router.get("/team-messages")
async def team_messages(admin=Depends(require_admin)):
    return clean(await db.announcement_messages.find({}, P0).sort([("reports", -1), ("created_at", -1)]).to_list(300))


@router.post("/team-messages/{mid}/hide")
async def hide_message(mid: str, request: Request, admin=Depends(require_admin)):
    await db.announcement_messages.update_one({"id": mid}, {"$set": {"hidden": True, "status": "removed"}})
    r = await db.notification_recipients.delete_many({"team_message_id": mid})
    await audit(admin, "team_message.remove", "announcement", mid, {"removed_from_inboxes": r.deleted_count}, client_ip(request))
    return {"ok": True}


@router.get("/team/inspect/{user_id}")
async def inspect(user_id: str, admin=Depends(require_admin)):
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "full_name": 1, "email": 1, "rank": 1, "ancestors": 1})
    if not u:
        raise HTTPException(404, "User not found")
    chain = [await db.users.find_one({"id": a}, {"_id": 0, "id": 1, "full_name": 1, "email": 1, "rank": 1}) for a in u["ancestors"][:5]]
    gens = [await db.users.count_documents({f"ancestors.{i}": user_id}) for i in range(5)]
    direct, team = await team_counts(user_id)
    return {"user": u, "upline": [c for c in chain if c], "generations": gens, "direct": direct, "team": team, "computed_rank": rank_for(direct, team)}


@router.get("/team/anomalies")
async def anomalies(admin=Depends(require_admin)):
    clusters = await db.users.aggregate([{"$match": {"role": "user"}}, {"$group": {"_id": "$registration_ip", "n": {"$sum": 1}, "emails": {"$push": "$email"}}},
                                         {"$match": {"n": {"$gt": 2}}}, {"$sort": {"n": -1}}, {"$limit": 50}]).to_list(50)
    events = await db.security_events.find({"type": {"$in": ["same_ip_referral", "multiple_accounts_same_ip", "duplicate_payment_reference"]}}, P0).sort("created_at", -1).limit(100).to_list(100)
    return {"ip_clusters": [{"ip": c["_id"], "count": c["n"], "emails": c["emails"][:10]} for c in clusters], "events": clean(events)}


@router.post("/ranks/recompute")
async def ranks_recompute(request: Request, admin=Depends(require_admin)):
    ids = [u["id"] for u in await db.users.find({"role": "user", "deleted": {"$ne": True}}, {"_id": 0, "id": 1}).to_list(100000)]
    for i in ids:
        await recompute_rank(i)
    await audit(admin, "ranks.recompute", "system", None, {"users": len(ids)}, client_ip(request))
    return {"processed": len(ids)}


@router.get("/ranks/review")
async def rank_review(admin=Depends(require_admin)):
    rows = await db.users.find({"role": "user", "deleted": {"$ne": True}, "rank": {"$ne": "Member"}}, {"_id": 0, "id": 1, "full_name": 1, "email": 1, "rank": 1}).to_list(500)
    for r in rows:
        r["direct"], r["team"] = await team_counts(r["id"])
    history = await db.rank_history.find({}, P0).sort("created_at", -1).limit(50).to_list(50)
    return {"ranked": rows, "history": clean(history)}


@router.get("/liability")
async def liability(admin=Depends(require_admin)):
    ens = await db.demo_plan_enrollments.find({}, {"_id": 0, "user_id": 1, "amount": 1, "daily": 1, "duration_days": 1}).to_list(100000)
    users = {u["id"]: u for u in await db.users.find({}, {"_id": 0, "id": 1, "ancestors": 1, "rank": 1}).to_list(100000)}
    deposits = plan_obl = comm = 0
    tiers = [0] * 5
    for e in ens:
        deposits += e["amount"]
        plan_obl += e["daily"] * e["duration_days"]
        for t, a in enumerate((users.get(e["user_id"], {}).get("ancestors") or [])[:5]):
            bp = COMMISSION.get(users.get(a, {}).get("rank"), [0] * 5)[t]
            v = e["amount"] * bp // 10000
            tiers[t] += v
            comm += v
    total = plan_obl + comm
    return {"hypothetical_deposits": deposits, "plan_payout_obligations": plan_obl, "commission_obligations": comm, "tier_obligations": tiers,
            "total_obligations": total, "coverage_ratio": round(deposits / total, 4) if total else None, "shortfall": max(total - deposits, 0), "enrollments": len(ens),
            "note": "Plan and commission obligations in coins. If obligations exceed plan amounts, the structure is unsustainable without external revenue."}


# ---------------- ledger ----------------
@router.get("/ledger")
async def ledger(user_id: str = "", account: str = "", type: str = "", page: int = 1, size: int = 30, admin=Depends(require_admin)):
    page, size = page_args(page, size)
    q = {k: v for k, v in {"user_id": user_id, "account": account, "type": type}.items() if v}
    res = await paged(db.ledger_transactions, q, page, size)
    totals = await db.ledger_transactions.aggregate([{"$group": {"_id": "$account", "sum": {"$sum": "$amount"}, "n": {"$sum": 1}}}]).to_list(10)
    res["totals"] = {t["_id"]: {"sum": t["sum"], "count": t["n"], "label": ACCOUNTS.get(t["_id"])} for t in totals}
    return res


@router.get("/reconciliation")
async def reconciliation(admin=Depends(require_admin)):
    sums = {(r["_id"]["u"], r["_id"]["a"]): r["s"] for r in await db.ledger_transactions.aggregate([{"$group": {"_id": {"u": "$user_id", "a": "$account"}, "s": {"$sum": "$amount"}}}]).to_list(200000)}
    mismatches = []
    async for w in db.wallet_accounts.find({}, P0):
        exp = sums.get((w["user_id"], w["account"]), 0)
        if exp != w["balance"] or w["reserved"] < 0 or w["reserved"] > w["balance"]:
            mismatches.append({"user_id": w["user_id"], "account": w["account"], "wallet_balance": w["balance"], "ledger_sum": exp, "reserved": w["reserved"]})
    stale = await db.payment_submissions.count_documents({"status": "pending_verification", "created_at": {"$lt": iso(now() - timedelta(days=3))}})
    return {"wallets_checked": await db.wallet_accounts.count_documents({}), "mismatches": mismatches, "stale_pending_deposits": stale, "consistent": not mismatches}


# ---------------- support ----------------
@router.get("/tickets")
async def tickets(status: str = "", admin=Depends(require_admin)):
    return clean(await db.support_tickets.find({"status": status} if status else {}, P0).sort("updated_at", -1).to_list(500))


@router.get("/tickets/{tid}")
async def ticket(tid: str, admin=Depends(require_admin)):
    t = await db.support_tickets.find_one({"id": tid}, P0)
    if not t:
        raise HTTPException(404, "Ticket not found")
    t["replies"] = await db.support_replies.find({"ticket_id": tid}, P0).sort("created_at", 1).to_list(500)
    return clean(t)


class AdminReplyIn(BaseModel):
    message: str = Field(min_length=1, max_length=3000)
    status: str = Field(default="answered", pattern=r"^(open|answered|closed)$")


@router.post("/tickets/{tid}/reply")
async def admin_reply(tid: str, b: AdminReplyIn, request: Request, admin=Depends(require_admin)):
    t = await db.support_tickets.find_one({"id": tid}, P0)
    if not t:
        raise HTTPException(404, "Ticket not found")
    await db.support_replies.insert_one({"id": uid(), "ticket_id": tid, "author_id": admin["id"], "author_role": "admin", "message": strip_html(b.message), "created_at": iso()})
    await db.support_tickets.update_one({"id": tid}, {"$set": {"status": b.status, "updated_at": iso()}})
    await audit(admin, "ticket.reply", "ticket", tid, {"status": b.status}, client_ip(request))
    await notify_user(t["user_id"], "Support replied", f"New reply on ticket: {t['subject']}", kind="support", link="/app/support")
    return {"ok": True}


# ---------------- CMS & settings ----------------
@router.get("/content")
async def content(admin=Depends(require_admin)):
    return clean(await db.website_content.find({}, P0).sort("key", 1).to_list(100))


class ContentIn(BaseModel):
    value: dict | list | str


@router.put("/content/{key}")
async def update_content(key: str, b: ContentIn, request: Request, admin=Depends(require_admin)):
    if not re.match(r"^[a-z0-9_]{2,40}$", key):
        raise HTTPException(400, "Invalid key")
    await db.website_content.update_one({"key": key}, {"$set": {"value": b.value, "updated_at": iso(), "updated_by": admin["email"]}}, upsert=True)
    await audit(admin, "cms.update", "website_content", key, {}, client_ip(request))
    return {"ok": True}


SETTING_KEYS = {"site_name", "logo_url", "favicon_url", "theme", "contact", "company_info", "telegram", "coin", "simulation_day_seconds", "signup_demo_grant",
                "session_timeout_minutes", "maintenance_mode", "features", "withdrawal", "team_message_daily_limit"}


@router.get("/settings")
async def settings(admin=Depends(require_admin)):
    s = await get_settings()
    return {**s, "integrations": {"cloudinary_cloud": os.environ.get("CLOUDINARY_CLOUD_NAME"), "cloudinary_configured": bool(os.environ.get("CLOUDINARY_API_SECRET")),
                                  "vapid_public_key": os.environ.get("VAPID_PUBLIC_KEY"), "vapid_configured": bool(os.environ.get("VAPID_PRIVATE_KEY_PATH")), "email_provider": "MOCKED (outbox only)"}}


@router.put("/settings")
async def update_settings(body: dict, request: Request, admin=Depends(require_admin)):
    upd = {k: v for k, v in body.items() if k in SETTING_KEYS}
    s = await get_settings()
    if "telegram" in upd:
        t = upd["telegram"]
        if not str(t.get("url", "")).startswith("https://t.me/"):
            raise HTTPException(400, "Telegram URL must start with https://t.me/")
        upd["telegram"] = {k: strip_html(str(t.get(k, ""))) for k in ("username", "url", "button_text", "availability", "default_message")}
    if "coin" in upd:
        c = upd["coin"]
        if int(c.get("decimals", 2)) not in range(0, 9) or any(float(v) <= 0 for v in c.get("rates", {}).values()):
            raise HTTPException(400, "Invalid coin configuration")
        hist = s["coin"].get("history", [])
        if c.get("rates") != s["coin"].get("rates"):
            hist = hist + [{"rates": s["coin"].get("rates"), "changed_to": c.get("rates"), "by": admin["email"], "at": iso()}]
        upd["coin"] = {"name": strip_html(c.get("name", "Finzo Coin")), "symbol": strip_html(c.get("symbol", "FZC"))[:6], "decimals": int(c.get("decimals", 2)),
                       "rates": {k: float(v) for k, v in c.get("rates", {}).items()}, "history": hist}
    for k in ("logo_url", "favicon_url"):
        if upd.get(k):
            upd[k] = safe_url(upd[k])
    if "simulation_day_seconds" in upd and int(upd["simulation_day_seconds"]) < 60:
        raise HTTPException(400, "Plan day must be at least 60 seconds")
    await db.system_settings.update_one({"key": "global"}, {"$set": upd})
    bust_settings()
    await audit(admin, "settings.update", "system_settings", "global", {"keys": list(upd)}, client_ip(request))
    return await settings(admin)


# ---------------- logs ----------------
@router.get("/audit-logs")
async def audit_logs(q: str = "", page: int = 1, size: int = 30, admin=Depends(require_admin)):
    page, size = page_args(page, size)
    query = {"action": {"$regex": re.escape(q), "$options": "i"}} if q else {}
    return await paged(db.admin_audit_logs, query, page, size)


@router.get("/security-events")
async def sec_events(severity: str = "", page: int = 1, size: int = 30, admin=Depends(require_admin)):
    page, size = page_args(page, size)
    return await paged(db.security_events, {"severity": severity} if severity else {}, page, size)


@router.get("/email-outbox")
async def outbox(admin=Depends(require_admin)):
    return clean(await db.email_outbox.find({}, P0).sort("created_at", -1).limit(50).to_list(50))
