import re

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

from datetime import timedelta

from core import db, iso, uid, now, get_current_user, require_admin, audit, client_ip, strip_html, notify_user, send_push, award_coins

router = APIRouter(prefix="/api")
P0 = {"_id": 0}
YT = re.compile(r"(?:youtube(?:-nocookie)?\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/|live/|v/)|youtu\.be/)([A-Za-z0-9_-]{11})")
EVENTS = ["PageView", "CompleteRegistration", "ViewContent", "InitiateCheckout", "Lead"]
ICONS = ["ArrowDownToLine", "ArrowUpFromLine", "Landmark", "Smartphone", "ShieldCheck", "Wallet", "Users", "PlayCircle", "BookOpen"]

WEBINAR_DEFAULT = {
    "key": "main", "enabled": True, "required": True, "title": "Welcome webinar: everything about Finzo.cc",
    "subtitle": "A guided tour of the platform — your wallet, plans, team network and rewards in one session.",
    "host": "Finzo.cc team", "duration": "15 min", "video_url": "", "video_id": "",
    "description": "Watch this short session to understand how the platform works before you start. It covers your USDT wallet, deposits and withdrawals, participation plans, your team network and rewards.",
    "highlights": ["How your USDT wallet, deposits and withdrawals work", "Choosing a participation plan and tracking it daily",
                   "Building your team and growing your rank", "Rewards, notifications and getting support"],
    "cta_text": "Continue to my dashboard", "min_watch_seconds": 60,
    "reminder_enabled": True, "reminder_hours": 24,
}
GUIDES = [
    ("how-to-deposit-usdt", "How to deposit USDT", "ArrowDownToLine", "Send USDT to your wallet and get it credited automatically.",
     ["Open Deposit and choose TRC20 or BEP20.", "Enter the amount and tap Continue to payment.", "Send the exact amount shown to the address.", "Paste the transaction hash, upload the screenshot and submit."]),
    ("how-to-withdraw-usdt", "How to withdraw USDT", "ArrowUpFromLine", "Request a payout from your USDT balance to your own wallet.",
     ["Open Withdrawal and enter the amount.", "Choose the network and paste your wallet address.", "Check the fee and net amount, then submit.", "Track the status until it shows Completed."]),
    ("how-to-buy-usdt-bank-transfer", "Buy USDT with a bank transfer", "Landmark", "Turn bank money into USDT on an exchange, then deposit it.",
     ["Create and verify an account on a crypto exchange you trust.", "Add money by bank transfer or P2P.", "Buy USDT and withdraw it on TRC20 or BEP20.", "Use the deposit address from your Deposit page."]),
    ("how-to-install-the-app", "Install the Finzo.cc app", "Smartphone", "Add the app to your home screen for one-tap access.",
     ["Tap Install app in the top bar.", "On iPhone use Share → Add to Home Screen.", "Open Finzo.cc from your home screen.", "Enable notifications for instant updates."]),
]


def video_id(url):
    url = (url or "").strip()
    if not url:
        return ""
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", url):
        return url
    m = YT.search(url)
    if not m:
        raise HTTPException(400, "Enter a valid YouTube link (watch, youtu.be, shorts, live or embed URL)")
    return m.group(1)


@router.get("/public/referrer/{code}")
async def public_referrer(code: str):
    u = await db.users.find_one({"referral_code": code.strip().upper()[:16], "status": "active", "deleted": {"$ne": True}}, {"_id": 0, "full_name": 1})
    if not u:
        raise HTTPException(404, "Referral code not found")
    parts = u["full_name"].split()
    return {"name": parts[0] + (f" {parts[-1][0]}." if len(parts) > 1 else "")}


async def seed_learn():
    await db.guides.create_index("slug", unique=True)
    await db.meta_pixels.create_index("pixel_id", unique=True)
    await db.webinar_config.update_one({"key": "main"}, {"$setOnInsert": WEBINAR_DEFAULT}, upsert=True)
    if not await db.guides.count_documents({}):
        for i, (slug, title, icon, desc, steps) in enumerate(GUIDES):
            await db.guides.insert_one({"id": uid(), "slug": slug, "title": title, "icon": icon, "description": desc, "steps": steps,
                                        "video_url": "", "video_id": "", "order": i, "active": True, "views": 0, "created_at": iso()})


# ---------------- webinar ----------------
@router.get("/webinar")
async def get_webinar(user=Depends(get_current_user)):
    w = await db.webinar_config.find_one({"key": "main"}, P0)
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "webinar_completed_at": 1})
    return {**w, "completed_at": u.get("webinar_completed_at")}


@router.post("/webinar/start")
async def start_webinar(user=Depends(get_current_user)):
    await db.users.update_one({"id": user["id"], "webinar_started_at": {"$exists": False}}, {"$set": {"webinar_started_at": iso()}})
    return {"ok": True}


@router.post("/webinar/complete")
async def complete_webinar(user=Depends(get_current_user)):
    r = await db.users.update_one({"id": user["id"], "webinar_completed_at": {"$exists": False}}, {"$set": {"webinar_completed_at": iso()}})
    if r.modified_count:
        await award_coins(user["id"], "own_webinar")
        if user.get("referrer_id"):
            await award_coins(user["referrer_id"], "friend_webinar", user["id"])
    return {"ok": True}


class WebinarIn(BaseModel):
    enabled: bool
    required: bool
    title: str = Field(min_length=3, max_length=120)
    subtitle: str = Field(max_length=300)
    host: str = Field(max_length=80)
    duration: str = Field(max_length=30)
    video_url: str = Field(max_length=300)
    video_url_bn: str = Field(default="", max_length=300)
    video_url_hi: str = Field(default="", max_length=300)
    description: str = Field(max_length=2000)
    highlights: list[str] = Field(max_length=8)
    cta_text: str = Field(min_length=2, max_length=60)
    min_watch_seconds: int = Field(ge=0, le=3600)
    reminder_enabled: bool = True
    reminder_hours: int = Field(default=24, ge=1, le=720)


@router.get("/admin/webinar")
async def admin_webinar(admin=Depends(require_admin)):
    w = await db.webinar_config.find_one({"key": "main"}, P0)
    base = {"role": "user", "deleted": {"$ne": True}}
    stats = {"users": await db.users.count_documents(base), "started": await db.users.count_documents({**base, "webinar_started_at": {"$exists": True}}),
             "completed": await db.users.count_documents({**base, "webinar_completed_at": {"$exists": True}}),
             "reminded": await db.users.count_documents({**base, "webinar_reminder_at": {"$exists": True}})}
    return {"reminder_enabled": True, "reminder_hours": 24, **w, "stats": stats}


async def send_webinar_reminders():
    w = await db.webinar_config.find_one({"key": "main"}, P0)
    if not w or not w.get("enabled") or not (w.get("video_id") or w.get("video_id_bn") or w.get("video_id_hi")) or not w.get("reminder_enabled", True):
        return 0
    cutoff = iso(now() - timedelta(hours=w.get("reminder_hours", 24)))
    q = {"role": "user", "status": "active", "deleted": {"$ne": True}, "created_at": {"$lte": cutoff},
         "webinar_completed_at": {"$exists": False}, "webinar_reminder_at": {"$exists": False}}
    sent = 0
    for u in await db.users.find(q, {"_id": 0, "id": 1}).to_list(200):
        if not await db.users.find_one_and_update({"id": u["id"], "webinar_reminder_at": {"$exists": False}}, {"$set": {"webinar_reminder_at": iso()}}):
            continue
        title = "Your welcome webinar is waiting"
        msg = f"Take {w.get('duration') or 'a few minutes'} to watch \"{w['title']}\" and learn how everything works."
        n = await notify_user(u["id"], title, msg, kind="system", link="/app/webinar", cta_label="Watch now")
        await send_push(u["id"], {"title": title, "body": msg, "url": "/app/webinar", "nid": n["id"] if n else None})
        sent += 1
    return sent


@router.put("/admin/webinar")
async def save_webinar(b: WebinarIn, request: Request, admin=Depends(require_admin)):
    d = {k: strip_html(v) if isinstance(v, str) else v for k, v in b.model_dump().items()}
    d["highlights"] = [strip_html(h) for h in b.highlights if h.strip()]
    d["video_id"] = video_id(b.video_url)
    d["video_id_bn"] = video_id(b.video_url_bn)
    d["video_id_hi"] = video_id(b.video_url_hi)
    await db.webinar_config.update_one({"key": "main"}, {"$set": d}, upsert=True)
    await audit(admin, "webinar.update", "webinar", "main", {"video_id": d["video_id"], "enabled": b.enabled, "required": b.required}, client_ip(request))
    return await db.webinar_config.find_one({"key": "main"}, P0)


# ---------------- guides ----------------
@router.get("/guides")
async def list_guides(user=Depends(get_current_user)):
    return await db.guides.find({"active": True}, P0).sort("order", 1).to_list(50)


@router.get("/guides/{slug}")
async def get_guide(slug: str, user=Depends(get_current_user)):
    g = await db.guides.find_one_and_update({"slug": slug, "active": True}, {"$inc": {"views": 1}}, projection=P0)
    if not g:
        raise HTTPException(404, "Guide not found")
    return g


class GuideIn(BaseModel):
    title: str = Field(min_length=3, max_length=100)
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=80)
    description: str = Field(max_length=400)
    video_url: str = Field(max_length=300)
    video_url_bn: str = Field(default="", max_length=300)
    video_url_hi: str = Field(default="", max_length=300)
    icon: str
    steps: list[str] = Field(max_length=12)
    order: int = 0
    active: bool = True


def guide_doc(b: GuideIn):
    if b.icon not in ICONS:
        raise HTTPException(400, "Invalid icon")
    d = {k: strip_html(v) if isinstance(v, str) else v for k, v in b.model_dump().items()}
    d["steps"] = [strip_html(s) for s in b.steps if s.strip()]
    d["video_id"] = video_id(b.video_url)
    d["video_id_bn"] = video_id(b.video_url_bn)
    d["video_id_hi"] = video_id(b.video_url_hi)
    return d


@router.get("/admin/guides")
async def admin_guides(admin=Depends(require_admin)):
    return await db.guides.find({}, P0).sort("order", 1).to_list(100)


@router.post("/admin/guides")
async def create_guide(b: GuideIn, request: Request, admin=Depends(require_admin)):
    d = {"id": uid(), **guide_doc(b), "views": 0, "created_at": iso()}
    try:
        await db.guides.insert_one(dict(d))
    except DuplicateKeyError:
        raise HTTPException(409, "A guide with this slug already exists")
    await audit(admin, "guide.create", "guide", d["id"], {"title": d["title"]}, client_ip(request))
    return d


@router.put("/admin/guides/{gid}")
async def update_guide(gid: str, b: GuideIn, request: Request, admin=Depends(require_admin)):
    try:
        r = await db.guides.update_one({"id": gid}, {"$set": guide_doc(b)})
    except DuplicateKeyError:
        raise HTTPException(409, "A guide with this slug already exists")
    if not r.matched_count:
        raise HTTPException(404, "Guide not found")
    await audit(admin, "guide.update", "guide", gid, {"title": b.title}, client_ip(request))
    return await db.guides.find_one({"id": gid}, P0)


@router.delete("/admin/guides/{gid}")
async def delete_guide(gid: str, request: Request, admin=Depends(require_admin)):
    if not (await db.guides.delete_one({"id": gid})).deleted_count:
        raise HTTPException(404, "Guide not found")
    await audit(admin, "guide.delete", "guide", gid, None, client_ip(request))
    return {"ok": True}


# ---------------- meta pixels ----------------
@router.get("/public/pixels")
async def public_pixels():
    return await db.meta_pixels.find({"active": True}, {"_id": 0, "pixel_id": 1, "events": 1}).to_list(20)


class PixelIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    pixel_id: str = Field(pattern=r"^\d{10,20}$")
    active: bool = True
    events: list[str] = Field(default_factory=lambda: list(EVENTS))


def pixel_doc(b: PixelIn):
    bad = [e for e in b.events if e not in EVENTS]
    if bad:
        raise HTTPException(400, f"Unsupported events: {', '.join(bad)}")
    return {"name": strip_html(b.name), "pixel_id": b.pixel_id, "active": b.active, "events": b.events}


@router.get("/admin/pixels")
async def admin_pixels(admin=Depends(require_admin)):
    return {"items": await db.meta_pixels.find({}, P0).sort("created_at", 1).to_list(50), "events": EVENTS}


@router.post("/admin/pixels")
async def create_pixel(b: PixelIn, request: Request, admin=Depends(require_admin)):
    d = {"id": uid(), **pixel_doc(b), "created_at": iso(), "updated_at": iso()}
    try:
        await db.meta_pixels.insert_one(dict(d))
    except DuplicateKeyError:
        raise HTTPException(409, "This Pixel ID is already added")
    await audit(admin, "pixel.create", "meta_pixel", d["id"], {"pixel_id": b.pixel_id}, client_ip(request))
    return d


@router.put("/admin/pixels/{pid}")
async def update_pixel(pid: str, b: PixelIn, request: Request, admin=Depends(require_admin)):
    old = await db.meta_pixels.find_one({"id": pid}, P0)
    if not old:
        raise HTTPException(404, "Pixel not found")
    try:
        await db.meta_pixels.update_one({"id": pid}, {"$set": {**pixel_doc(b), "updated_at": iso()}})
    except DuplicateKeyError:
        raise HTTPException(409, "This Pixel ID is already added")
    action = "pixel.replace" if old["pixel_id"] != b.pixel_id else "pixel.update"
    await audit(admin, action, "meta_pixel", pid, {"old": old["pixel_id"], "new": b.pixel_id}, client_ip(request))
    return await db.meta_pixels.find_one({"id": pid}, P0)


@router.delete("/admin/pixels/{pid}")
async def delete_pixel(pid: str, request: Request, admin=Depends(require_admin)):
    old = await db.meta_pixels.find_one_and_delete({"id": pid}, projection=P0)
    if not old:
        raise HTTPException(404, "Pixel not found")
    await audit(admin, "pixel.delete", "meta_pixel", pid, {"pixel_id": old["pixel_id"]}, client_ip(request))
    return {"ok": True}
