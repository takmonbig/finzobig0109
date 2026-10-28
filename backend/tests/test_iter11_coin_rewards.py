"""Iteration 11: action-based Finzo Coin referral rewards (signup/webinar), team coin columns, admin coin rewards."""
import os
import time
import requests
import pytest

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN = {"email": "takmonboost90@gmail.com", "password": "Admin@Demo2026"}
USER = {"email": "demo.a@example.com", "password": "Demo@12345"}
PWD = "Test@12345x"
TS = str(int(time.time()))[-6:]
DEFAULT = {"friend_signup": 50, "friend_webinar": 50, "own_webinar": 20}


def _login(c):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json=c, timeout=30)
    assert r.status_code == 200, r.text
    return s


def _register(name, email, mobile, ref=None):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/register", json={"full_name": name, "email": email, "country": "India", "country_code": "+91",
                                                  "mobile": mobile, "password": PWD, "confirm_password": PWD, "referral_code": ref, "accept_terms": True}, timeout=30)
    return s, r


def _site():
    return requests.get(f"{BASE}/api/public/site", timeout=30).json()


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def chain(admin):
    # ensure default amounts
    admin.put(f"{BASE}/api/admin/settings", json={"referral_rewards": DEFAULT})
    sa, ra = _register("TEST_Alpha Owner", f"test_alpha_{TS}@example.com", f"77{TS}01")
    assert ra.status_code == 200, ra.text
    me_a = sa.get(f"{BASE}/api/auth/me").json()
    me_a = me_a.get("user", me_a)
    sb, rb = _register("TEST_Bravo Friend", f"test_bravo_{TS}@example.com", f"77{TS}02", me_a["referral_code"])
    assert rb.status_code == 200, rb.text
    me_b = sb.get(f"{BASE}/api/auth/me").json()
    me_b = me_b.get("user", me_b)
    sc, rc = _register("TEST_Charlie Deep", f"test_charlie_{TS}@example.com", f"77{TS}03", me_b["referral_code"])
    assert rc.status_code == 200, rc.text
    return {"sa": sa, "sb": sb, "sc": sc, "a": me_a, "b": me_b}


# Public site / landing settings
def test_public_site_has_referral_rewards():
    d = _site()
    s = d.get("settings", d)
    assert s.get("referral_rewards") == DEFAULT, s.get("referral_rewards")


# Signup reward
def test_signup_credits_referrer(chain):
    r = chain["sa"].get(f"{BASE}/api/coin-rewards").json()
    assert r["by_action"].get("friend_signup") == 5000, r
    assert r["total"] == 5000
    assert r["history"][0]["from"] == "TEST_Bravo Friend"
    assert r["amounts"] == DEFAULT


def test_duplicate_register_rejected(chain):
    _, r = _register("TEST_Bravo Friend", chain["b"]["email"], f"77{TS}09", chain["a"]["referral_code"])
    assert r.status_code == 400
    _, r2 = _register("TEST_Bravo Dup", f"test_dup_{TS}@example.com", f"77{TS}02", chain["a"]["referral_code"])
    assert r2.status_code == 400
    assert chain["sa"].get(f"{BASE}/api/coin-rewards").json()["total"] == 5000


# Webinar rewards + idempotency
def test_webinar_complete_awards_and_idempotent(chain):
    for _ in range(2):
        assert chain["sb"].post(f"{BASE}/api/webinar/complete").status_code == 200
    b = chain["sb"].get(f"{BASE}/api/coin-rewards").json()
    a = chain["sa"].get(f"{BASE}/api/coin-rewards").json()
    assert b["by_action"].get("own_webinar") == 2000, b
    assert b["by_action"].get("friend_signup") == 5000  # from Charlie
    assert a["by_action"].get("friend_webinar") == 5000, a
    assert a["total"] == 10000
    fw = [h for h in a["history"] if h["action"] == "friend_webinar"]
    assert len(fw) == 1 and fw[0]["from"] == "TEST_Bravo Friend"


def test_wallet_referral_coins_balance(chain):
    from pymongo import MongoClient
    db = MongoClient("mongodb://localhost:27017")["test_database"]
    w = db.wallet_accounts.find_one({"user_id": chain["a"]["id"], "account": "referral_coins"})
    assert w and w["balance"] == 10000
    assert db.ledger_transactions.count_documents({"user_id": chain["a"]["id"], "type": "coin_reward"}) == 2


# Team members / tree
def test_team_members_coin_fields_and_privacy(chain):
    r = chain["sa"].get(f"{BASE}/api/team/members").json()
    items = {m["generation"]: m for m in r["items"]}
    g1, g2 = items[1], items[2]
    assert g1["name"] == "TEST_Bravo Friend"
    assert g2["name"] != "TEST_Charlie Deep" and "*" in g2["name"]
    assert g1["coins_earned"] == 7000 and g1["earned_by"] == {"friend_signup": 5000, "own_webinar": 2000}
    assert g1["activity"] == "active"
    for m in r["items"]:
        for k in ("email", "mobile", "balance", "deposits", "usdt_balance", "verified_deposits", "last_active_at", "ancestors"):
            assert k not in m, k


def test_team_tree_coin_fields(chain):
    t = chain["sa"].get(f"{BASE}/api/team/tree").json()
    n = t["root"]["children"][0]
    assert n["coins_earned"] == 7000 and n["activity"] == "active"
    c = n["children"][0]
    assert "*" in c["name"] and "email" not in c


# Admin
def test_admin_coin_rewards_list_search(admin, chain):
    r = admin.get(f"{BASE}/api/admin/coin-rewards", params={"q": f"test_alpha_{TS}"}).json()
    assert r["total"] == 2  # A earned friend_signup + friend_webinar
    emails = {x["user"]["email"] for x in r["items"]}
    assert chain["a"]["email"] in emails
    src = [x for x in r["items"] if x.get("source")]
    assert any(x["source"]["email"] == chain["b"]["email"] for x in src)
    assert "friend_signup" in r["totals"]


def test_admin_validation(admin):
    for bad in ({"friend_signup": -1, "friend_webinar": 50, "own_webinar": 20}, {"friend_signup": 100001, "friend_webinar": 50, "own_webinar": 20},
                {"friend_signup": "abc", "friend_webinar": 50, "own_webinar": 20}):
        r = admin.put(f"{BASE}/api/admin/settings", json={"referral_rewards": bad})
        assert r.status_code == 400, (bad, r.status_code, r.text)


def test_admin_update_reflects_public(admin):
    r = admin.put(f"{BASE}/api/admin/settings", json={"referral_rewards": {"friend_signup": 75, "friend_webinar": 40, "own_webinar": 10}})
    assert r.status_code == 200
    s = _site()
    s = s.get("settings", s)
    assert s["referral_rewards"] == {"friend_signup": 75, "friend_webinar": 40, "own_webinar": 10}
    admin.put(f"{BASE}/api/admin/settings", json={"referral_rewards": DEFAULT})
    s = _site()
    assert s.get("settings", s)["referral_rewards"] == DEFAULT


def test_non_admin_forbidden(chain):
    assert chain["sa"].get(f"{BASE}/api/admin/coin-rewards").status_code == 403
    assert chain["sa"].put(f"{BASE}/api/admin/settings", json={"referral_rewards": DEFAULT}).status_code == 403
    assert requests.get(f"{BASE}/api/coin-rewards").status_code in (401, 403)
