import os
import re
import uuid
import json
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse

import bcrypt
import jwt
from fastapi import Request, HTTPException, Depends, WebSocket
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument

log = logging.getLogger("core")
client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
JWT_ALG = "HS256"


def now():
    return datetime.now(timezone.utc)


def iso(dt=None):
    return (dt or now()).isoformat()


def uid():
    return str(uuid.uuid4())


def clean(x):
    if isinstance(x, list):
        return [clean(i) for i in x]
    if isinstance(x, dict):
        return {k: clean(v) for k, v in x.items() if k != "_id"}
    return x


def client_ip(request: Request):
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "")


# ---------------- settings ----------------
DEFAULT_SETTINGS = {
    "site_name": "Finzo.cc",
    "logo_url": "",
    "favicon_url": "",
    "theme": "midnight-gold",
    "demo_mode": False,
    "real_money_enabled": True,
    "contact": {"email": "support@example.com", "phone": "[Your phone]", "address": "[Your registered address]"},
    "company_info": "[Company legal name, registration details and jurisdiction — to be provided by the business]",
    "telegram": {"username": "your_support", "url": "https://t.me/your_support", "button_text": "Chat on Telegram",
                 "availability": "Support available Mon–Sat", "default_message": "Hello, I need help with my payment record."},
    "coin": {"name": "Finzo Coin", "symbol": "FZC", "decimals": 2, "rates": {"USD": 100}, "history": []},
    "simulation_day_seconds": 86400,
    "signup_demo_grant": 10000,
    "referral_rewards": {"friend_signup": 50, "friend_webinar": 50, "own_webinar": 20, "l2_signup": 20, "l2_webinar": 20, "l3_signup": 10, "l3_webinar": 10},
    "session_timeout_minutes": 60,
    "maintenance_mode": False,
    "features": {"deposits": True, "withdrawals": True, "plans": True, "team_messages": True, "rewards": True, "push": True},
    "withdrawal": {"min": 100, "max": 100000, "fee_percent": 2, "fee_flat": 0},
    "team_message_daily_limit": 5,
}

_settings_cache = {"v": None, "t": 0}


async def get_settings():
    if _settings_cache["v"] and (now().timestamp() - _settings_cache["t"] < 5):
        return _settings_cache["v"]
    doc = await db.system_settings.find_one({"key": "global"}, {"_id": 0})
    if not doc:
        doc = {"key": "global", **DEFAULT_SETTINGS}
        await db.system_settings.insert_one(dict(doc))
    merged = {**DEFAULT_SETTINGS, **doc, "referral_rewards": {**DEFAULT_SETTINGS["referral_rewards"], **(doc.get("referral_rewards") or {})}}
    _settings_cache.update(v=merged, t=now().timestamp())
    return merged


def bust_settings():
    _settings_cache["v"] = None


# ---------------- auth ----------------
def hash_password(p):
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p, h):
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False


def make_token(user_id, sid, kind, minutes):
    payload = {"sub": user_id, "sid": sid, "type": kind, "exp": now() + timedelta(minutes=minutes)}
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm=JWT_ALG)


def decode_token(token, kind):
    try:
        p = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    if p.get("type") != kind:
        raise HTTPException(401, "Invalid token type")
    return p


PUBLIC_USER_FIELDS = {"_id": 0, "password_hash": 0, "totp_secret": 0, "totp_pending": 0}


async def user_from_token(token):
    if not token:
        raise HTTPException(401, "Not authenticated")
    p = decode_token(token, "access")
    sess = await db.sessions.find_one({"id": p["sid"], "revoked": False})
    if not sess:
        raise HTTPException(401, "Session ended")
    user = await db.users.find_one({"id": p["sub"]}, PUBLIC_USER_FIELDS)
    if not user or user.get("deleted"):
        raise HTTPException(401, "User not found")
    if user.get("status") == "suspended":
        raise HTTPException(403, "Account suspended")
    user["_sid"] = p["sid"]
    return user


async def get_current_user(request: Request):
    token = request.cookies.get("access_token")
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
    user = await user_from_token(token)
    s = await get_settings()
    if s.get("maintenance_mode") and user["role"] != "super_admin":
        raise HTTPException(503, "Platform under maintenance")
    last = user.get("last_active_at")
    if not last or (now() - datetime.fromisoformat(last)).total_seconds() > 120:
        await db.users.update_one({"id": user["id"]}, {"$set": {"last_active_at": iso()}})
    return user


async def require_admin(user=Depends(get_current_user)):
    if user.get("role") != "super_admin":
        raise HTTPException(403, "Admin access required")
    return user


async def rate_limit(key, limit, window_seconds):
    since = iso(now() - timedelta(seconds=window_seconds))
    count = await db.rate_limits.count_documents({"key": key, "at": {"$gte": since}})
    if count >= limit:
        raise HTTPException(429, "Too many requests. Please try again later.")
    await db.rate_limits.insert_one({"key": key, "at": iso(), "expires": now() + timedelta(seconds=window_seconds)})


async def audit(admin, action, target_type, target_id=None, details=None, ip=""):
    await db.admin_audit_logs.insert_one({"id": uid(), "admin_id": admin["id"], "admin_email": admin["email"], "action": action,
                                          "target_type": target_type, "target_id": target_id, "details": details or {}, "ip": ip, "created_at": iso()})


async def security_event(kind, user_id=None, ip="", details=None, severity="info"):
    await db.security_events.insert_one({"id": uid(), "type": kind, "user_id": user_id, "ip": ip, "details": details or {},
                                         "severity": severity, "created_at": iso()})


# ---------------- wallet / ledger (integer minor units) ----------------
ACCOUNTS = {
    "demo_coins": "Plan coins",
    "sim_earnings": "Plan earnings (coins, not withdrawable)",
    "verified": "USDT balance",
    "promo": "Promotional credits",
    "referral_coins": "Referral reward coins (not withdrawable)",
}


def to_minor(amount):
    return int(round(float(amount) * 100))


async def ensure_wallets(user_id):
    for acc in ACCOUNTS:
        await db.wallet_accounts.update_one({"user_id": user_id, "account": acc},
                                            {"$setOnInsert": {"id": uid(), "user_id": user_id, "account": acc, "balance": 0, "reserved": 0, "created_at": iso()}},
                                            upsert=True)


async def post_ledger(user_id, account, amount, tx_type, memo="", ref=None, idem_key=None, reserved_delta=0):
    """Atomic append-only ledger posting. Debits fail if available balance is insufficient."""
    if idem_key and await db.ledger_transactions.find_one({"idem_key": idem_key}):
        return None
    cond = {"user_id": user_id, "account": account}
    need = -amount + reserved_delta
    if need > 0:
        cond["$expr"] = {"$gte": [{"$subtract": ["$balance", "$reserved"]}, need]}
    w = await db.wallet_accounts.find_one_and_update(cond, {"$inc": {"balance": amount, "reserved": reserved_delta}},
                                                     return_document=ReturnDocument.AFTER)
    if not w:
        raise HTTPException(400, "Insufficient available balance")
    entry = {"id": uid(), "user_id": user_id, "account": account, "amount": amount, "type": tx_type, "memo": memo, "ref": ref,
             "balance_after": w["balance"], "created_at": iso()}
    if idem_key:
        entry["idem_key"] = idem_key
    await db.ledger_transactions.insert_one(dict(entry))
    return entry


async def reserve(user_id, account, amount):
    w = await db.wallet_accounts.find_one_and_update(
        {"user_id": user_id, "account": account, "$expr": {"$gte": [{"$subtract": ["$balance", "$reserved"]}, amount]}},
        {"$inc": {"reserved": amount}}, return_document=ReturnDocument.AFTER)
    if not w:
        raise HTTPException(400, "Insufficient available verified balance")


async def release(user_id, account, amount):
    await db.wallet_accounts.update_one({"user_id": user_id, "account": account}, {"$inc": {"reserved": -amount}})


async def wallets_of(user_id):
    rows = await db.wallet_accounts.find({"user_id": user_id}, {"_id": 0}).to_list(10)
    return {r["account"]: {"balance": r["balance"], "reserved": r["reserved"], "available": r["balance"] - r["reserved"], "label": ACCOUNTS[r["account"]]} for r in rows}


REWARD_LABELS = {"friend_signup": "A friend joined with your link", "friend_webinar": "Your friend finished the welcome webinar",
                 "own_webinar": "You finished the welcome webinar", "l2_signup": "A level 2 member joined", "l2_webinar": "A level 2 member finished the webinar",
                 "l3_signup": "A level 3 member joined", "l3_webinar": "A level 3 member finished the webinar"}
REWARD_KEYS = tuple(REWARD_LABELS)
LEVEL_ACTIONS = {"signup": ("friend_signup", "l2_signup", "l3_signup"), "webinar": ("friend_webinar", "l2_webinar", "l3_webinar")}


async def award_upline(ancestors, kind, source_user_id):
    for lvl, upline in enumerate((ancestors or [])[:3]):
        await award_coins(upline, LEVEL_ACTIONS[kind][lvl], source_user_id)


async def award_coins(user_id, action, source_user_id=None):
    s = await get_settings()
    amt = int((s.get("referral_rewards") or {}).get(action, 0)) * 100
    if amt <= 0:
        return
    await ensure_wallets(user_id)
    e = await post_ledger(user_id, "referral_coins", amt, "coin_reward", REWARD_LABELS[action], ref=source_user_id,
                          idem_key=f"coinrw:{action}:{user_id}:{source_user_id or ''}")
    if e:
        await db.coin_rewards.insert_one({"id": uid(), "user_id": user_id, "action": action, "source_user_id": source_user_id, "amount": amt, "created_at": iso()})


# ---------------- ranks / commissions ----------------
RANKS = [
    {"name": "Bronze", "min_direct": 1, "min_team": 0},
    {"name": "Silver", "min_direct": 5, "min_team": 50},
    {"name": "Gold", "min_direct": 10, "min_team": 100},
    {"name": "Platinum", "min_direct": 10, "min_team": 250},
    {"name": "Diamond", "min_direct": 10, "min_team": 500},
]
COMMISSION = {
    "Bronze": [50, 25, 12, 6, 3], "Silver": [100, 50, 25, 12, 6], "Gold": [160, 80, 40, 20, 10],
    "Platinum": [300, 150, 75, 40, 20], "Diamond": [500, 250, 125, 60, 30],
}  # basis points x 100 -> value/10000 = percent/100


def rank_for(direct, team):
    current = "Member"
    for r in RANKS:
        if direct >= r["min_direct"] and team >= r["min_team"]:
            current = r["name"]
    return current


async def team_counts(user_id):
    active = {"status": {"$ne": "suspended"}, "deleted": {"$ne": True}}
    direct = await db.users.count_documents({"ancestors.0": user_id, **active})
    team = await db.users.count_documents({"$or": [{f"ancestors.{i}": user_id} for i in range(5)], **active})
    return direct, team


async def recompute_rank(user_id):
    direct, team = await team_counts(user_id)
    new = rank_for(direct, team)
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "rank": 1})
    if not u:
        return
    old = u.get("rank", "Member")
    if new != old:
        await db.users.update_one({"id": user_id}, {"$set": {"rank": new}})
        await db.rank_history.insert_one({"id": uid(), "user_id": user_id, "from": old, "to": new, "direct": direct, "team": team, "created_at": iso()})
        order = ["Member"] + [r["name"] for r in RANKS]
        up = order.index(new) > order.index(old)
        await notify_user(user_id, f"Rank {'achieved' if up else 'updated'}: {new}",
                          f"Your membership rank changed from {old} to {new} (direct: {direct}, team: {team}).", kind="rank")


async def recompute_ancestors(user):
    for a in (user.get("ancestors") or [])[:5]:
        await recompute_rank(a)


# ---------------- safe URLs ----------------
DOMAIN_RE = re.compile(r"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?::\d{2,5})?(?:[/?#].*)?$", re.I)


def safe_url(url):
    if not url:
        return None
    url = url.strip()
    if url.startswith("/") and not url.startswith("//"):
        return url
    if re.match(r"^[a-z][a-z0-9+.-]*:", url, re.I) and not re.match(r"^https?://", url, re.I):
        raise HTTPException(400, "Unsafe URL scheme")
    if not re.match(r"^https?://", url, re.I):
        if not DOMAIN_RE.match(url):
            raise HTTPException(400, "Invalid URL")
        url = "https://" + url
    p = urlparse(url)
    if not p.netloc or any(c in url for c in "<>\"'` "):
        raise HTTPException(400, "Invalid URL")
    return url


def strip_html(text):
    return re.sub(r"<[^>]*>", "", text or "")


# ---------------- realtime + notifications ----------------
class WSManager:
    def __init__(self):
        self.conns = {}

    async def connect(self, user_id, ws: WebSocket):
        self.conns.setdefault(user_id, set()).add(ws)

    def disconnect(self, user_id, ws):
        self.conns.get(user_id, set()).discard(ws)

    async def send(self, user_id, payload):
        for ws in list(self.conns.get(user_id, set())):
            try:
                await ws.send_json(payload)
            except Exception:
                self.disconnect(user_id, ws)


ws_manager = WSManager()


async def notify_user(user_id, title, message, kind="system", link=None, image_url=None, campaign_id=None, cta_label=None, popup=False, priority="normal", expires_at=None, **extra):
    doc = {"id": uid(), "user_id": user_id, "campaign_id": campaign_id, "title": strip_html(title), "message": strip_html(message), "kind": kind,
           "link": link, "cta_label": cta_label, "image_url": image_url, "popup": popup, "priority": priority, "expires_at": expires_at,
           "read": False, "popup_seen": False, "clicked": False, "created_at": iso(), **extra}
    await db.notification_recipients.insert_one(dict(doc))
    doc.pop("_id", None)
    await ws_manager.send(user_id, {"type": "notification", "data": doc})
    return doc


def _push_sync(sub, payload):
    from pywebpush import webpush, WebPushException
    try:
        webpush(subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]}, data=json.dumps(payload),
                vapid_private_key=os.environ["VAPID_PRIVATE_KEY_PATH"], vapid_claims={"sub": os.environ["VAPID_SUBJECT"]}, timeout=10)
        return "sent"
    except WebPushException as e:
        status = getattr(getattr(e, "response", None), "status_code", None)
        return "gone" if status in (404, 410) else "failed"
    except Exception:
        return "failed"


async def send_push(user_id, payload):
    subs = await db.push_subscriptions.find({"user_id": user_id, "active": True}, {"_id": 0}).to_list(20)
    if not subs:
        return "unavailable"
    results = []
    for s in subs:
        r = await asyncio.to_thread(_push_sync, s, payload)
        if r == "gone":
            await db.push_subscriptions.update_one({"endpoint": s["endpoint"]}, {"$set": {"active": False}})
        results.append(r)
    return "sent" if "sent" in results else "failed"
