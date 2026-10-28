"""Iteration 7: mobile login, admin set-password, admin change-own-password, public referrer, progress report, filtered downline export."""
import os
import csv
import io
import random
import time
import requests
import pytest
from pymongo import MongoClient

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MONGO = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

ADMIN = {"email": "takmonboost90@gmail.com", "password": "Admin@Demo2026"}
DEMO_PW = "Demo@12345"
DEMO_A_ID = "5e603513-2a5c-4b32-8222-ce4fb91a4de4"


def login(**payload):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json=payload)
    return s, r


@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO)
    db = c[DB_NAME]
    yield db
    db.login_attempts.delete_many({})
    c.close()


@pytest.fixture(scope="module")
def admin():
    s, r = login(**ADMIN)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def test_user(mongo):
    n = random.randint(10000000, 99999999)
    email = f"test_iter7_{n}@example.com"
    mob = f"77{n}"
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/register", json={
        "full_name": "TEST Iter Seven", "country": "India", "email": email, "country_code": "+91", "mobile": mob,
        "password": "Test@12345", "confirm_password": "Test@12345", "accept_terms": True})
    assert r.status_code == 200, r.text
    me = s.get(f"{BASE}/api/auth/me").json()
    uid = me.get("id") or me.get("user", {}).get("id")
    yield {"email": email, "mobile": mob, "id": uid, "session": s}
    # cleanup
    u = mongo.users.find_one({"email": email})
    if u:
        for col in mongo.list_collection_names():
            if col != "users":
                mongo[col].delete_many({"user_id": u["id"]})
        mongo.users.delete_one({"id": u["id"]})
    mongo.login_attempts.delete_many({})


# ---------- Mobile login ----------
class TestMobileLogin:
    def test_mobile_login_demo_a(self, mongo):
        mongo.login_attempts.delete_many({})
        s, r = login(country_code="+91", mobile="9000000000", password=DEMO_PW)
        assert r.status_code == 200, r.text
        me = s.get(f"{BASE}/api/auth/me").json()
        assert "demo.a@example.com" in str(me)
        assert "access_token" in s.cookies.get_dict()

    def test_mobile_wrong_password(self, mongo):
        _, r = login(country_code="+91", mobile="9000000000", password="Wrong@1234")
        assert r.status_code == 401
        mongo.login_attempts.delete_many({})

    def test_missing_identifier(self):
        _, r = login(password=DEMO_PW)
        assert r.status_code == 400
        _, r = login(mobile="9000000000", password=DEMO_PW)
        assert r.status_code == 400

    def test_email_login_still_works(self):
        s, r = login(email="demo.b@example.com", password=DEMO_PW)
        assert r.status_code == 200

    def test_mobile_lockout(self, test_user, mongo):
        mongo.login_attempts.delete_many({})
        codes = []
        for _ in range(5):
            _, r = login(country_code="+91", mobile=test_user["mobile"], password="Wrong@1234")
            codes.append(r.status_code)
        assert codes == [401] * 5, codes
        _, r = login(country_code="+91", mobile=test_user["mobile"], password="Test@12345")
        assert r.status_code == 429, r.text
        mongo.login_attempts.delete_many({})
        _, r = login(country_code="+91", mobile=test_user["mobile"], password="Test@12345")
        assert r.status_code == 200


# ---------- Admin set password ----------
class TestAdminSetPassword:
    def test_non_admin_forbidden(self, test_user):
        r = test_user["session"].post(f"{BASE}/api/admin/users/{test_user['id']}/password", json={"new_password": "Newpass123"})
        assert r.status_code == 403

    def test_weak_password(self, admin, test_user):
        r = admin.post(f"{BASE}/api/admin/users/{test_user['id']}/password", json={"new_password": "abcdefgh"})
        assert r.status_code == 400
        r = admin.post(f"{BASE}/api/admin/users/{test_user['id']}/password", json={"new_password": "ab1"})
        assert r.status_code in (400, 422)

    def test_unknown_user(self, admin):
        r = admin.post(f"{BASE}/api/admin/users/nope-xyz/password", json={"new_password": "Newpass123"})
        assert r.status_code == 404

    def test_set_password_revokes_sessions(self, admin, test_user, mongo):
        s2, r = login(email=test_user["email"], password="Test@12345")
        assert r.status_code == 200
        r = admin.post(f"{BASE}/api/admin/users/{test_user['id']}/password", json={"new_password": "Newpass123"})
        assert r.status_code == 200 and r.json()["ok"] is True
        assert mongo.sessions.count_documents({"user_id": test_user["id"], "revoked": False}) == 0
        # refresh should fail on revoked session
        rr = s2.post(f"{BASE}/api/auth/refresh")
        assert rr.status_code == 401
        _, r = login(email=test_user["email"], password="Test@12345")
        assert r.status_code == 401
        mongo.login_attempts.delete_many({})
        s3, r = login(email=test_user["email"], password="Newpass123")
        assert r.status_code == 200
        test_user["session"] = s3


# ---------- Admin change own password ----------
class TestAdminChangeOwnPassword:
    def test_change_and_revert(self, mongo):
        s, r = login(**ADMIN)
        assert r.status_code == 200
        try:
            r = s.post(f"{BASE}/api/auth/change-password", json={"current_password": "wrong", "new_password": "Admin@Temp2026"})
            assert r.status_code == 400
            r = s.post(f"{BASE}/api/auth/change-password", json={"current_password": ADMIN["password"], "new_password": "Admin@Temp2026"})
            assert r.status_code == 200
            _, r2 = login(email=ADMIN["email"], password="Admin@Temp2026")
            assert r2.status_code == 200
        finally:
            s4, r4 = login(email=ADMIN["email"], password="Admin@Temp2026")
            if r4.status_code == 200:
                rb = s4.post(f"{BASE}/api/auth/change-password", json={"current_password": "Admin@Temp2026", "new_password": ADMIN["password"]})
                assert rb.status_code == 200
            mongo.login_attempts.delete_many({})
        _, r = login(**ADMIN)
        assert r.status_code == 200


# ---------- Public referrer ----------
class TestReferrer:
    def test_known_code(self):
        r = requests.get(f"{BASE}/api/public/referrer/B3D494B2")
        assert r.status_code == 200
        assert r.json()["name"] == "Demo A."
        r = requests.get(f"{BASE}/api/public/referrer/b3d494b2")
        assert r.status_code == 200

    def test_unknown_code(self):
        r = requests.get(f"{BASE}/api/public/referrer/ZZZZ0000")
        assert r.status_code == 404


# ---------- Progress report ----------
class TestProgressReport:
    def test_admin_progress(self, admin):
        r = admin.get(f"{BASE}/api/admin/reports/progress")
        assert r.status_code == 200
        d = r.json()
        assert len(d["items"]) >= 6
        for k in ["rank", "direct", "team", "next_rank", "rank_progress", "team_volume", "next_reward", "reward_progress"]:
            assert all(k in it for it in d["items"]), k
        a = next(it for it in d["items"] if it["email"] == "demo.a@example.com")
        assert a["direct"] == 1 and a["team"] >= 5
        assert all(0 <= it["rank_progress"] <= 100 for it in d["items"])
        assert "_id" not in a and "password_hash" not in a

    def test_non_admin(self):
        s, _ = login(email="demo.a@example.com", password=DEMO_PW)
        assert s.get(f"{BASE}/api/admin/reports/progress").status_code == 403


# ---------- Filtered downline export ----------
def _rows(text):
    return list(csv.reader(io.StringIO(text)))[1:]


class TestDownlineExport:
    def test_all(self, admin):
        r = admin.get(f"{BASE}/api/admin/users/{DEMO_A_ID}/downline/export")
        assert r.status_code == 200 and "text/csv" in r.headers["content-type"]
        assert len(_rows(r.text)) == 5

    def test_generation_2(self, admin):
        r = admin.get(f"{BASE}/api/admin/users/{DEMO_A_ID}/downline/export?generation=2")
        rows = _rows(r.text)
        assert len(rows) == 1 and all(x[0] == "T2" for x in rows)
        assert rows[0][2] == "demo.c@example.com"

    def test_q_filter(self, admin):
        r = admin.get(f"{BASE}/api/admin/users/{DEMO_A_ID}/downline/export?q=demo.c")
        rows = _rows(r.text)
        assert len(rows) == 1 and rows[0][2] == "demo.c@example.com"

    def test_non_admin(self):
        s, _ = login(email="demo.a@example.com", password=DEMO_PW)
        assert s.get(f"{BASE}/api/admin/users/{DEMO_A_ID}/downline/export").status_code == 403
