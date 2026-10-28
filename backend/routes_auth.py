import re
import secrets
from datetime import timedelta, datetime

import pyotp
from fastapi import APIRouter, Request, Response, HTTPException, Depends
from pydantic import BaseModel, EmailStr, Field

from core import (db, iso, now, uid, client_ip, hash_password, verify_password, make_token, decode_token, get_current_user,
                  get_settings, ensure_wallets, post_ledger, recompute_ancestors, security_event, rate_limit, PUBLIC_USER_FIELDS, log)

router = APIRouter(prefix="/api/auth")
ACCESS_MIN = 15
REFRESH_DAYS = 7


class RegisterIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=80)
    country: str | None = Field(default=None, max_length=60)
    email: EmailStr
    country_code: str = Field(pattern=r"^\+\d{1,4}$")
    mobile: str = Field(pattern=r"^\d{6,14}$")
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str
    referral_code: str | None = None
    accept_terms: bool


class LoginIn(BaseModel):
    email: EmailStr | None = None
    country_code: str | None = Field(default=None, max_length=6)
    mobile: str | None = Field(default=None, max_length=20)
    password: str


def check_password_strength(p):
    if not (re.search(r"[A-Za-z]", p) and re.search(r"\d", p)):
        raise HTTPException(400, "Password must contain letters and numbers")


async def new_referral_code():
    while True:
        code = secrets.token_hex(4).upper()
        if not await db.users.find_one({"referral_code": code}):
            return code


async def start_session(user, request: Request, response: Response):
    sid = uid()
    await db.sessions.insert_one({"id": sid, "user_id": user["id"], "ip": client_ip(request), "user_agent": request.headers.get("user-agent", "")[:200],
                                  "created_at": iso(), "last_seen_at": iso(), "revoked": False})
    set_cookies(response, make_token(user["id"], sid, "access", ACCESS_MIN), make_token(user["id"], sid, "refresh", REFRESH_DAYS * 1440))
    await db.users.update_one({"id": user["id"]}, {"$set": {"last_login_at": iso(), "last_active_at": iso()}})
    u = await db.users.find_one({"id": user["id"]}, PUBLIC_USER_FIELDS)
    u.pop("_id", None)
    return u


def set_cookies(response, access, refresh=None):
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=ACCESS_MIN * 60, path="/")
    if refresh:
        response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=REFRESH_DAYS * 86400, path="/")


from core import award_upline  # noqa: E402


@router.post("/register")
async def register(body: RegisterIn, request: Request, response: Response):
    ip = client_ip(request)
    await rate_limit(f"register:{ip}", 10, 3600)
    if not body.accept_terms:
        raise HTTPException(400, "You must accept the terms and risk disclosure")
    if body.password != body.confirm_password:
        raise HTTPException(400, "Passwords do not match")
    check_password_strength(body.password)
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    if await db.users.find_one({"country_code": body.country_code, "mobile": body.mobile}):
        raise HTTPException(400, "Mobile number already registered")
    ancestors, referrer = [], None
    if body.referral_code and body.referral_code.strip():
        referrer = await db.users.find_one({"referral_code": body.referral_code.strip().upper(), "deleted": {"$ne": True}}, {"_id": 0})
        if not referrer or referrer.get("status") == "suspended":
            raise HTTPException(400, "Invalid referral code")
        ancestors = [referrer["id"]] + (referrer.get("ancestors") or [])[:19]
    user = {"id": uid(), "full_name": body.full_name.strip(), "email": email, "country": body.country, "country_code": body.country_code, "mobile": body.mobile,
            "mobile_verified": False, "email_verified": False, "password_hash": hash_password(body.password), "role": "user", "status": "active",
            "kyc_status": "not_submitted", "referral_code": await new_referral_code(), "referrer_id": referrer["id"] if referrer else None,
            "ancestors": ancestors, "rank": "Member", "totp_enabled": False, "registration_ip": ip, "group": "default",
            "prefs": {"allow_team_messages": True, "marketing_push": True, "push_reminders": True}, "created_at": iso(), "deleted": False}
    await db.users.insert_one(dict(user))
    if referrer:
        await db.referral_relationships.insert_one({"id": uid(), "user_id": user["id"], "referrer_id": referrer["id"], "ancestors": ancestors, "created_at": iso()})
        if referrer.get("registration_ip") == ip:
            await security_event("same_ip_referral", user["id"], ip, {"referrer_id": referrer["id"]}, "warning")
    recent = await db.users.count_documents({"registration_ip": ip, "created_at": {"$gte": iso(now() - timedelta(hours=24))}})
    if recent > 3:
        await security_event("multiple_accounts_same_ip", user["id"], ip, {"count_24h": recent}, "warning")
    await ensure_wallets(user["id"])
    s = await get_settings()
    await post_ledger(user["id"], "demo_coins", int(s["signup_demo_grant"]) * 100, "signup_grant", "Welcome coins", idem_key=f"grant:{user['id']}")
    await recompute_ancestors(user)
    await award_upline(ancestors, "signup", user["id"])
    return await start_session(user, request, response)


@router.post("/login")
async def login(body: LoginIn, request: Request, response: Response):
    ip = client_ip(request)
    if body.email:
        email = body.email.lower()
        lookup = {"email": email}
    elif body.mobile and body.country_code:
        mob = re.sub(r"\D", "", body.mobile)
        email = f"{body.country_code}{mob}"
        lookup = {"country_code": body.country_code, "mobile": {"$in": list({mob, body.mobile.strip()})}}
    else:
        raise HTTPException(400, "Enter your email or mobile number")
    ident = f"{ip}:{email}"
    att = await db.login_attempts.find_one({"identifier": ident})
    if att and att.get("count", 0) >= 5 and att.get("locked_until") and datetime.fromisoformat(att["locked_until"]) > now():
        raise HTTPException(429, "Too many failed attempts. Try again in 15 minutes.")
    user = await db.users.find_one({**lookup, "deleted": {"$ne": True}}, {"_id": 0})
    if not user or not verify_password(body.password, user["password_hash"]):
        cnt = (att or {}).get("count", 0) + 1
        await db.login_attempts.update_one({"identifier": ident}, {"$set": {"count": cnt, "locked_until": iso(now() + timedelta(minutes=15)) if cnt >= 5 else None}}, upsert=True)
        await security_event("login_failed", user["id"] if user else None, ip, {"email": email, "attempt": cnt}, "warning" if cnt >= 3 else "info")
        raise HTTPException(401, "Invalid login details or password")
    if user.get("status") == "suspended":
        raise HTTPException(403, "Account suspended. Contact support.")
    await db.login_attempts.delete_one({"identifier": ident})
    last_ip = user.get("last_login_ip")
    if last_ip and last_ip != ip:
        await security_event("new_ip_login", user["id"], ip, {"previous_ip": last_ip})
    await db.users.update_one({"id": user["id"]}, {"$set": {"last_login_ip": ip}})
    if user.get("totp_enabled"):
        return {"requires_2fa": True, "challenge_token": make_token(user["id"], "2fa", "2fa", 5)}
    return await start_session(user, request, response)


class TwoFALoginIn(BaseModel):
    challenge_token: str
    code: str


@router.post("/2fa/login")
async def twofa_login(body: TwoFALoginIn, request: Request, response: Response):
    p = decode_token(body.challenge_token, "2fa")
    await rate_limit(f"2fa:{p['sub']}", 8, 600)
    user = await db.users.find_one({"id": p["sub"]}, {"_id": 0})
    if not user or not pyotp.TOTP(user["totp_secret"]).verify(body.code, valid_window=1):
        raise HTTPException(401, "Invalid authentication code")
    return await start_session(user, request, response)


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(401, "No refresh token")
    p = decode_token(token, "refresh")
    sess = await db.sessions.find_one({"id": p["sid"], "revoked": False})
    if not sess:
        raise HTTPException(401, "Session ended")
    s = await get_settings()
    if (now() - datetime.fromisoformat(sess["last_seen_at"])).total_seconds() > int(s["session_timeout_minutes"]) * 60:
        await db.sessions.update_one({"id": sess["id"]}, {"$set": {"revoked": True, "revoked_reason": "idle_timeout"}})
        raise HTTPException(401, "Session expired due to inactivity")
    await db.sessions.update_one({"id": sess["id"]}, {"$set": {"last_seen_at": iso()}})
    set_cookies(response, make_token(p["sub"], p["sid"], "access", ACCESS_MIN))
    return {"ok": True}


@router.get("/me")
async def me(user=Depends(get_current_user)):
    await db.sessions.update_one({"id": user["_sid"]}, {"$set": {"last_seen_at": iso()}})
    user.pop("_sid", None)
    return user


@router.post("/logout")
async def logout(response: Response, user=Depends(get_current_user)):
    await db.sessions.update_one({"id": user["_sid"]}, {"$set": {"revoked": True, "revoked_reason": "logout"}})
    response.delete_cookie("access_token", path="/", secure=True, samesite="none")
    response.delete_cookie("refresh_token", path="/", secure=True, samesite="none")
    return {"ok": True}


@router.post("/logout-all")
async def logout_all(response: Response, user=Depends(get_current_user)):
    r = await db.sessions.update_many({"user_id": user["id"], "revoked": False}, {"$set": {"revoked": True, "revoked_reason": "logout_all"}})
    response.delete_cookie("access_token", path="/", secure=True, samesite="none")
    response.delete_cookie("refresh_token", path="/", secure=True, samesite="none")
    return {"revoked": r.modified_count}


@router.get("/sessions")
async def sessions(user=Depends(get_current_user)):
    rows = await db.sessions.find({"user_id": user["id"], "revoked": False}, {"_id": 0}).sort("created_at", -1).to_list(50)
    for r in rows:
        r["current"] = r["id"] == user["_sid"]
    return rows


@router.delete("/sessions/{sid}")
async def revoke_session(sid: str, user=Depends(get_current_user)):
    await db.sessions.update_one({"id": sid, "user_id": user["id"]}, {"$set": {"revoked": True, "revoked_reason": "user_revoked"}})
    return {"ok": True}


class ForgotIn(BaseModel):
    email: EmailStr


@router.post("/forgot-password")
async def forgot(body: ForgotIn, request: Request):
    await rate_limit(f"forgot:{client_ip(request)}", 5, 3600)
    user = await db.users.find_one({"email": body.email.lower(), "deleted": {"$ne": True}}, {"_id": 0})
    if user:
        token = secrets.token_urlsafe(32)
        await db.password_reset_tokens.insert_one({"token": token, "user_id": user["id"], "used": False, "expires_at": now() + timedelta(hours=1), "created_at": iso()})
        origin = request.headers.get("origin", "")
        link = f"{origin}/reset-password?token={token}"
        await db.email_outbox.insert_one({"id": uid(), "to": user["email"], "subject": "Password reset", "body": f"Reset your password: {link}", "status": "mocked_not_sent", "created_at": iso()})
        log.info(f"[MOCK EMAIL] Password reset for {user['email']}: {link}")
    return {"ok": True, "message": "If the email exists, a reset link has been sent."}


class ResetIn(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)


@router.post("/reset-password")
async def reset(body: ResetIn):
    check_password_strength(body.password)
    t = await db.password_reset_tokens.find_one({"token": body.token, "used": False})
    exp = t and t["expires_at"]
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=now().tzinfo)
    if not t or exp < now():
        raise HTTPException(400, "Reset link is invalid or expired")
    await db.users.update_one({"id": t["user_id"]}, {"$set": {"password_hash": hash_password(body.password)}})
    await db.password_reset_tokens.update_one({"token": body.token}, {"$set": {"used": True}})
    await db.sessions.update_many({"user_id": t["user_id"]}, {"$set": {"revoked": True, "revoked_reason": "password_reset"}})
    await security_event("password_reset", t["user_id"])
    return {"ok": True}


class ChangePwIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


@router.post("/change-password")
async def change_pw(body: ChangePwIn, user=Depends(get_current_user)):
    full = await db.users.find_one({"id": user["id"]})
    if not verify_password(body.current_password, full["password_hash"]):
        raise HTTPException(400, "Current password is incorrect")
    check_password_strength(body.new_password)
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(body.new_password), "password_changed_at": iso()}})
    await db.sessions.update_many({"user_id": user["id"], "id": {"$ne": user["_sid"]}}, {"$set": {"revoked": True, "revoked_reason": "password_change"}})
    return {"ok": True}


class CodeIn(BaseModel):
    code: str
    password: str | None = None


@router.post("/2fa/setup")
async def twofa_setup(user=Depends(get_current_user)):
    secret = pyotp.random_base32()
    await db.users.update_one({"id": user["id"]}, {"$set": {"totp_pending": secret}})
    s = await get_settings()
    return {"secret": secret, "otpauth_uri": pyotp.TOTP(secret).provisioning_uri(user["email"], issuer_name=s["site_name"])}


@router.post("/2fa/enable")
async def twofa_enable(body: CodeIn, user=Depends(get_current_user)):
    full = await db.users.find_one({"id": user["id"]})
    if not full.get("totp_pending") or not pyotp.TOTP(full["totp_pending"]).verify(body.code, valid_window=1):
        raise HTTPException(400, "Invalid code")
    await db.users.update_one({"id": user["id"]}, {"$set": {"totp_secret": full["totp_pending"], "totp_enabled": True}, "$unset": {"totp_pending": ""}})
    await security_event("2fa_enabled", user["id"])
    return {"ok": True}


@router.post("/2fa/disable")
async def twofa_disable(body: CodeIn, user=Depends(get_current_user)):
    full = await db.users.find_one({"id": user["id"]})
    if not full.get("totp_enabled") or not verify_password(body.password or "", full["password_hash"]) or not pyotp.TOTP(full["totp_secret"]).verify(body.code, valid_window=1):
        raise HTTPException(400, "Invalid password or code")
    await db.users.update_one({"id": user["id"]}, {"$set": {"totp_enabled": False}, "$unset": {"totp_secret": ""}})
    await security_event("2fa_disabled", user["id"], severity="warning")
    return {"ok": True}


@router.post("/mobile/send-otp")
async def send_mobile_otp(user=Depends(get_current_user)):
    await rate_limit(f"otp:{user['id']}", 5, 3600)
    code = f"{secrets.randbelow(1000000):06d}"
    await db.mobile_otps.update_one({"user_id": user["id"]}, {"$set": {"code_hash": hash_password(code), "expires_at": iso(now() + timedelta(minutes=10)), "attempts": 0}}, upsert=True)
    log.info(f"[MOCK SMS] OTP for {user['country_code']}{user['mobile']}: {code}")
    return {"ok": True, "demo_code": code, "note": "DEMO MODE: SMS delivery is mocked; code shown here for testing only."}


@router.post("/mobile/verify")
async def verify_mobile(body: CodeIn, user=Depends(get_current_user)):
    rec = await db.mobile_otps.find_one({"user_id": user["id"]})
    if not rec or datetime.fromisoformat(rec["expires_at"]) < now() or rec.get("attempts", 0) >= 5:
        raise HTTPException(400, "Code expired. Request a new one.")
    if not verify_password(body.code, rec["code_hash"]):
        await db.mobile_otps.update_one({"user_id": user["id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(400, "Incorrect code")
    await db.users.update_one({"id": user["id"]}, {"$set": {"mobile_verified": True}})
    await db.mobile_otps.delete_one({"user_id": user["id"]})
    return {"ok": True}
