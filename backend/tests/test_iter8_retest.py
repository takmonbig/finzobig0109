"""Iteration 8: progress report zero-requirement fix, admin password reset clears mobile lockouts, login regression."""
import os
import random
import requests
import pytest
from pymongo import MongoClient

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MONGO = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
ADMIN = {"email": "takmonboost90@gmail.com", "password": "Admin@Demo2026"}
DEMO_PW = "Demo@12345"


def login(**payload):
    s = requests.Session()
    return s, s.post(f"{BASE}/api/auth/login", json=payload)


@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO)
    db = c[DB_NAME]
    yield db
    db.login_attempts.delete_many({})
    c.close()


@pytest.fixture(scope="module")
def admin(mongo):
    mongo.login_attempts.delete_many({})
    s, r = login(**ADMIN)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def test_user(mongo):
    n = random.randint(10000000, 99999999)
    email = f"test_iter8_{n}@example.com"
    mob = f"76{n}"
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/register", json={
        "full_name": "TEST Iter Eight", "country": "India", "email": email, "country_code": "+91", "mobile": mob,
        "password": "Test@12345", "confirm_password": "Test@12345", "accept_terms": True})
    assert r.status_code == 200, r.text
    me = s.get(f"{BASE}/api/auth/me").json()
    uid = me.get("id") or me.get("user", {}).get("id")
    yield {"email": email, "mobile": mob, "id": uid}
    u = mongo.users.find_one({"email": email})
    if u:
        for col in mongo.list_collection_names():
            if col != "users":
                mongo[col].delete_many({"user_id": u["id"]})
        mongo.users.delete_one({"id": u["id"]})
    mongo.login_attempts.delete_many({})


# Progress report: Member with 0/0 => rank_progress 0
class TestProgressZero:
    def test_member_zero_progress(self, admin, test_user):
        d = admin.get(f"{BASE}/api/admin/reports/progress").json()
        row = next(it for it in d["items"] if it["email"] == test_user["email"])
        assert row["direct"] == 0 and row["team"] == 0
        assert row["next_rank"] == "Bronze"
        assert row["rank_progress"] == 0, row
        a = next(it for it in d["items"] if it["email"] == "demo.a@example.com")
        assert 0 <= a["rank_progress"] <= 100


# Admin password reset clears mobile lockouts
class TestAdminResetClearsMobileLock:
    def test_flow(self, admin, test_user, mongo):
        mongo.login_attempts.delete_many({})
        codes = [login(country_code="+91", mobile=test_user["mobile"], password="Wrong@1234")[1].status_code for _ in range(5)]
        assert codes == [401] * 5
        _, r = login(country_code="+91", mobile=test_user["mobile"], password="Test@12345")
        assert r.status_code == 429
        assert mongo.login_attempts.count_documents({"identifier": {"$regex": f"\\+91{test_user['mobile']}$"}}) >= 1
        r = admin.post(f"{BASE}/api/admin/users/{test_user['id']}/password", json={"new_password": "Newpass123"})
        assert r.status_code == 200 and r.json()["ok"] is True
        assert mongo.login_attempts.count_documents({"identifier": {"$regex": f"\\+91{test_user['mobile']}$"}}) == 0
        s, r = login(country_code="+91", mobile=test_user["mobile"], password="Newpass123")
        assert r.status_code == 200, r.text
        assert "access_token" in s.cookies.get_dict()

    def test_email_lock_also_cleared(self, admin, test_user, mongo):
        mongo.login_attempts.delete_many({})
        for _ in range(5):
            login(email=test_user["email"], password="Wrong@1234")
        assert login(email=test_user["email"], password="Newpass123")[1].status_code == 429
        assert admin.post(f"{BASE}/api/admin/users/{test_user['id']}/password", json={"new_password": "Newpass456"}).status_code == 200
        assert login(email=test_user["email"], password="Newpass456")[1].status_code == 200


# Regression: email + mobile login
class TestLoginRegression:
    def test_email(self, mongo):
        mongo.login_attempts.delete_many({})
        assert login(email="demo.b@example.com", password=DEMO_PW)[1].status_code == 200

    def test_mobile(self):
        s, r = login(country_code="+91", mobile="9000000000", password=DEMO_PW)
        assert r.status_code == 200
        assert "demo.a@example.com" in str(s.get(f"{BASE}/api/auth/me").json())

    def test_admin(self):
        assert login(**ADMIN)[1].status_code == 200
