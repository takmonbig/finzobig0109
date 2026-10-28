"""Iteration 13: 3-level fixed Finzo Coin referral rewards (A->B->C chain) + promo banner (Refer & Earn) API."""
import os
import time
import requests
import pytest
from pymongo import MongoClient

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN = {"email": "takmonboost90@gmail.com", "password": "Admin@Demo2026"}
PW = "Demo@12345"
PWD = "Test@12345x"
TS = str(int(time.time()))[-6:]
DEFAULT = {"friend_signup": 50, "friend_webinar": 50, "own_webinar": 20, "l2_signup": 20, "l2_webinar": 20, "l3_signup": 10, "l3_webinar": 10}
DB = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))[os.environ.get("DB_NAME", "test_database")]


def _login(email, pw=PW):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, r.text
    return s


def _me(s):
    d = s.get(f"{BASE}/api/auth/me", timeout=30).json()
    return d.get("user", d)


def _cr(s):
    r = s.get(f"{BASE}/api/coin-rewards", timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def admin():
    s = _login(ADMIN["email"], ADMIN["password"])
    assert s.put(f"{BASE}/api/admin/settings", json={"referral_rewards": DEFAULT}).status_code == 200
    yield s
    s.put(f"{BASE}/api/admin/settings", json={"referral_rewards": DEFAULT})


@pytest.fixture(scope="module")
def chain(admin):
    users = {k: _login(f"demo.{k}@example.com") for k in "abc"}
    before = {k: _cr(s) for k, s in users.items()}
    code_c = _me(users["c"])["referral_code"]
    x = requests.Session()
    r = x.post(f"{BASE}/api/auth/register", json={"full_name": "TEST_Xen Level", "email": f"test_xen_{TS}@example.com", "country": "India",
                                                  "country_code": "+91", "mobile": f"79{TS}22", "password": PWD, "confirm_password": PWD,
                                                  "referral_code": code_c, "accept_terms": True}, timeout=30)
    assert r.status_code == 200, r.text
    return {"u": users, "before": before, "x": x, "x_id": _me(x)["id"]}


def _new_hist(after, x_id):
    return sorted((h["action"], h["amount"]) for h in after["history"] if h.get("source_user_id") == x_id)


# Signup rewards at L1/L2/L3
def test_signup_3_levels(chain):
    exp = {"c": [("friend_signup", 5000)], "b": [("l2_signup", 2000)], "a": [("l3_signup", 1000)]}
    for k, e in exp.items():
        after = _cr(chain["u"][k])
        assert _new_hist(after, chain["x_id"]) == e, (k, after["history"][:3])
        assert after["total"] == chain["before"][k]["total"] + e[0][1], k


# Webinar rewards at L1/L2/L3 + own, idempotent
def test_webinar_3_levels_idempotent(chain):
    for _ in range(3):
        assert chain["x"].post(f"{BASE}/api/webinar/complete").status_code == 200
    n = _cr(chain["x"])
    assert n["by_action"] == {"own_webinar": 2000} and n["total"] == 2000
    exp = {"c": [("friend_signup", 5000), ("friend_webinar", 5000)], "b": [("l2_signup", 2000), ("l2_webinar", 2000)],
           "a": [("l3_signup", 1000), ("l3_webinar", 1000)]}
    for k, e in exp.items():
        after = _cr(chain["u"][k])
        assert _new_hist(after, chain["x_id"]) == e, k
        assert after["total"] == chain["before"][k]["total"] + sum(v for _, v in e), k
    assert DB.coin_rewards.count_documents({"source_user_id": chain["x_id"]}) == 6


# Public site exposes 7 keys + promo
def test_public_site(admin):
    d = requests.get(f"{BASE}/api/public/site").json()
    assert set(d["settings"]["referral_rewards"]) == set(DEFAULT)
    assert d["settings"]["referral_rewards"] == DEFAULT


def test_admin_settings_7_keys(admin):
    new = {k: v + 1 for k, v in DEFAULT.items()}
    r = admin.put(f"{BASE}/api/admin/settings", json={"referral_rewards": new})
    assert r.status_code == 200 and r.json()["referral_rewards"] == new
    assert requests.get(f"{BASE}/api/public/site").json()["settings"]["referral_rewards"] == new
    assert admin.put(f"{BASE}/api/admin/settings", json={"referral_rewards": {**DEFAULT, "l3_webinar": -1}}).status_code == 400
    assert admin.put(f"{BASE}/api/admin/settings", json={"referral_rewards": DEFAULT}).status_code == 200


def test_promo_banner(admin):
    orig = requests.get(f"{BASE}/api/public/site").json()["content"].get("promo_banner") or {}
    body = {"popup_image_url": "https://res.cloudinary.com/demo/image/upload/sample.jpg",
            "panel_image_url": "https://res.cloudinary.com/demo/image/upload/sample.jpg", "enabled": False}
    r = admin.put(f"{BASE}/api/admin/promo-banner", json=body)
    assert r.status_code == 200, r.text
    pb = requests.get(f"{BASE}/api/public/site").json()["content"]["promo_banner"]
    assert pb["popup_image_url"] == body["popup_image_url"] and pb["panel_image_url"] == body["panel_image_url"] and pb["enabled"] is False
    assert pb.get("version")
    bad = admin.put(f"{BASE}/api/admin/promo-banner", json={**body, "popup_image_url": "javascript:alert(1)"})
    print("bad url status", bad.status_code, bad.text[:200])
    assert bad.status_code in (400, 422)
    # restore
    r = admin.put(f"{BASE}/api/admin/promo-banner", json={"popup_image_url": orig.get("popup_image_url", ""),
                                                         "panel_image_url": orig.get("panel_image_url", ""), "enabled": orig.get("enabled", True)})
    assert r.status_code == 200


def test_promo_banner_access():
    s = _login("demo.a@example.com")
    assert s.put(f"{BASE}/api/admin/promo-banner", json={"enabled": True}).status_code == 403
    assert requests.put(f"{BASE}/api/admin/promo-banner", json={"enabled": True}).status_code in (401, 403)
