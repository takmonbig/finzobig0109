"""Iteration 12: fixed Finzo Coin referral rewards via demo.a code, webinar rewards idempotency, team privacy (no coins), admin rewards/settings."""
import os
import time
import requests
import pytest
from pymongo import MongoClient

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN = {"email": "takmonboost90@gmail.com", "password": "Admin@Demo2026"}
DEMO_A = {"email": "demo.a@example.com", "password": "Demo@12345"}
REF = "B3D494B2"
PWD = "Test@12345x"
TS = str(int(time.time()))[-6:]
DEFAULT = {"friend_signup": 50, "friend_webinar": 50, "own_webinar": 20, "l2_signup": 20, "l2_webinar": 20, "l3_signup": 10, "l3_webinar": 10}
DB = MongoClient("mongodb://localhost:27017")["test_database"]


def _login(c):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json=c, timeout=30)
    assert r.status_code == 200, r.text
    return s


def _me(s):
    d = s.get(f"{BASE}/api/auth/me", timeout=30).json()
    return d.get("user", d)


@pytest.fixture(scope="module")
def admin():
    s = _login(ADMIN)
    s.put(f"{BASE}/api/admin/settings", json={"referral_rewards": DEFAULT})
    yield s
    s.put(f"{BASE}/api/admin/settings", json={"referral_rewards": DEFAULT})


@pytest.fixture(scope="module")
def demo_a():
    return _login(DEMO_A)


@pytest.fixture(scope="module")
def ctx(admin, demo_a):
    before = demo_a.get(f"{BASE}/api/coin-rewards").json()
    a_id = _me(demo_a)["id"]
    w = DB.wallet_accounts.find_one({"user_id": a_id, "account": "referral_coins"}) or {"balance": 0}
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/register", json={"full_name": "TEST_Zed Newbie", "email": f"test_zed_{TS}@example.com", "country": "India",
                                                  "country_code": "+91", "mobile": f"78{TS}11", "password": PWD, "confirm_password": PWD,
                                                  "referral_code": REF, "accept_terms": True}, timeout=30)
    assert r.status_code == 200, r.text
    return {"before": before, "a_id": a_id, "wbal": w["balance"], "new": s, "new_me": _me(s)}


# Signup reward to referrer demo.a
def test_signup_reward_demo_a(ctx, demo_a):
    after = demo_a.get(f"{BASE}/api/coin-rewards").json()
    assert after["total"] == ctx["before"]["total"] + 5000
    h = after["history"][0]
    assert h["action"] == "friend_signup" and h["amount"] == 5000 and h["from"] == "TEST_Zed Newbie"
    assert h["source_user_id"] == ctx["new_me"]["id"]
    assert after["amounts"] == DEFAULT
    w = DB.wallet_accounts.find_one({"user_id": ctx["a_id"], "account": "referral_coins"})
    assert w["balance"] == ctx["wbal"] + 5000
    assert DB.ledger_transactions.find_one({"user_id": ctx["a_id"], "type": "coin_reward", "ref": ctx["new_me"]["id"], "account": "referral_coins"})


# Webinar rewards + no duplicates
def test_webinar_rewards_idempotent(ctx, demo_a):
    for _ in range(3):
        assert ctx["new"].post(f"{BASE}/api/webinar/complete").status_code == 200
    n = ctx["new"].get(f"{BASE}/api/coin-rewards").json()
    assert n["by_action"] == {"own_webinar": 2000} and n["total"] == 2000 and len(n["history"]) == 1
    a = demo_a.get(f"{BASE}/api/coin-rewards").json()
    assert a["total"] == ctx["before"]["total"] + 10000
    fw = [h for h in a["history"] if h["action"] == "friend_webinar" and h.get("source_user_id") == ctx["new_me"]["id"]]
    assert len(fw) == 1 and fw[0]["amount"] == 5000
    assert DB.ledger_transactions.count_documents({"user_id": ctx["new_me"]["id"], "type": "coin_reward"}) == 1
    assert DB.wallet_accounts.find_one({"user_id": ctx["a_id"], "account": "referral_coins"})["balance"] == ctx["wbal"] + 10000


# Privacy: team endpoints have no coin data
def _walk(n):
    yield n
    for c in n.get("children", []):
        yield from _walk(c)


def test_team_members_privacy(ctx, demo_a):
    r = demo_a.get(f"{BASE}/api/team/members", params={"size": 100}).json()
    assert r["items"]
    for m in r["items"]:
        for k in ("coins_earned", "earned_by", "email", "mobile", "balance", "ancestors", "last_active_at"):
            assert k not in m, (k, m)
        assert {"name", "generation", "rank", "joined", "activity"} <= set(m)
        if m["generation"] > 1:
            assert "*" in m["name"]
    assert any(m["name"] == "TEST_Zed Newbie" for m in r["items"])


def test_team_tree_privacy(ctx, demo_a):
    t = demo_a.get(f"{BASE}/api/team/tree").json()
    for n in _walk(t["root"]):
        assert "coins_earned" not in n and "earned_by" not in n and "email" not in n
    assert "coins" not in demo_a.get(f"{BASE}/api/team/export").text.lower()


# Admin
def test_admin_coin_rewards(admin, ctx):
    r = admin.get(f"{BASE}/api/admin/coin-rewards", params={"q": f"test_zed_{TS}"}).json()
    acts = sorted(x["action"] for x in r["items"])
    assert acts == ["friend_signup", "friend_webinar", "own_webinar"], acts
    assert all("_id" not in x for x in r["items"])
    for k in ("friend_signup", "friend_webinar", "own_webinar"):
        assert r["totals"][k]["amount"] > 0 and r["totals"][k]["count"] >= 1
    full = admin.get(f"{BASE}/api/admin/coin-rewards").json()
    assert full["total"] >= 3


def test_admin_settings_update_reflects(admin, demo_a):
    new = {**DEFAULT, "friend_signup": 70, "friend_webinar": 30, "own_webinar": 15}
    r = admin.put(f"{BASE}/api/admin/settings", json={"referral_rewards": new})
    assert r.status_code == 200, r.text
    assert demo_a.get(f"{BASE}/api/coin-rewards").json()["amounts"] == new
    for bad in ({"friend_signup": -5}, {"friend_signup": "x"}, {"friend_signup": 200000}):
        assert admin.put(f"{BASE}/api/admin/settings", json={"referral_rewards": {**DEFAULT, **bad}}).status_code == 400
    assert admin.put(f"{BASE}/api/admin/settings", json={"referral_rewards": DEFAULT}).status_code == 200
    assert demo_a.get(f"{BASE}/api/coin-rewards").json()["amounts"] == DEFAULT


def test_access_control(demo_a):
    assert demo_a.get(f"{BASE}/api/admin/coin-rewards").status_code == 403
    assert requests.get(f"{BASE}/api/coin-rewards").status_code in (401, 403)


# Auth playbook checks
def test_auth_cookies_and_bcrypt():
    r = requests.post(f"{BASE}/api/auth/login", json=DEMO_A, timeout=30)
    sc = r.headers.get("set-cookie", "")
    assert "access_token" in sc and "HttpOnly" in sc
    assert DB.users.find_one({"email": "takmonboost90@gmail.com"})["password_hash"].startswith("$2b$")
    o = requests.options(f"{BASE}/api/auth/login", headers={"Origin": BASE, "Access-Control-Request-Method": "POST"})
    assert o.headers.get("access-control-allow-origin") != "*"
