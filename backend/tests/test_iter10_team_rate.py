"""Iteration 10: admin team members section + admin-controlled coin rate."""
import os
import requests
import pytest

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN = {"email": "takmonboost90@gmail.com", "password": "Admin@Demo2026"}
USER = {"email": "demo.a@example.com", "password": "Demo@12345"}


def _login(c):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json=c, timeout=30)
    assert r.status_code == 200, r.text
    tok = s.cookies.get("csrf_token") or s.cookies.get("csrf")
    if tok:
        s.headers["X-CSRF-Token"] = tok
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def user():
    return _login(USER)


def _site():
    return requests.get(f"{BASE}/api/public/site", timeout=30).json().get("content", {})


# Coin rate
class TestCoinRate:
    def test_publish_appends_history(self, admin):
        before = (_site().get("coin_rate") or {}).get("history", [])
        r = admin.post(f"{BASE}/api/admin/coin-rate", json={"price_usd": 0.1311, "volume_usd": 12345.678})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["price_usd"] == 0.1311 and d["volume_usd"] == 12345.68
        cr = _site()["coin_rate"]
        assert cr["price_usd"] == 0.1311
        assert len(cr["history"]) == min(len(before) + 1, 365)
        assert cr["history"][-1]["price_usd"] == 0.1311

    def test_validation(self, admin):
        assert admin.post(f"{BASE}/api/admin/coin-rate", json={"price_usd": 0}).status_code == 422
        assert admin.post(f"{BASE}/api/admin/coin-rate", json={"price_usd": -1}).status_code == 422
        assert admin.post(f"{BASE}/api/admin/coin-rate", json={"price_usd": 1, "volume_usd": -5}).status_code == 422
        assert admin.post(f"{BASE}/api/admin/coin-rate", json={"price_usd": 2_000_000}).status_code == 422

    def test_user_forbidden(self, user):
        assert user.post(f"{BASE}/api/admin/coin-rate", json={"price_usd": 1}).status_code in (401, 403)

    def test_anon_forbidden(self):
        assert requests.post(f"{BASE}/api/admin/coin-rate", json={"price_usd": 1}).status_code in (401, 403)


# Team members
class TestTeamMembers:
    def test_save_and_public(self, admin):
        body = {"members": [{"name": "TEST_Alice", "role": "CEO", "bio": "<b>Founder</b>", "image_url": "https://res.cloudinary.com/x/a.jpg"}]}
        r = admin.put(f"{BASE}/api/admin/team-members", json=body)
        assert r.status_code == 200, r.text
        m = _site()["team_members"]
        assert len(m) == 1 and m[0]["name"] == "TEST_Alice" and m[0]["role"] == "CEO"
        assert "<b>" not in m[0]["bio"]

    def test_bad_image_url(self, admin):
        r = admin.put(f"{BASE}/api/admin/team-members", json={"members": [{"name": "TEST_B", "role": "CTO", "image_url": "javascript:alert(1)"}]})
        print("js url ->", r.status_code, r.text[:200])
        assert r.status_code in (200, 400, 422)
        if r.status_code == 200:
            assert not r.json()["members"][0]["image_url"].startswith("javascript")

    def test_validation(self, admin):
        assert admin.put(f"{BASE}/api/admin/team-members", json={"members": [{"name": "A", "role": "CEO"}]}).status_code == 422
        assert admin.put(f"{BASE}/api/admin/team-members", json={"members": [{"name": "Al", "role": "C"}]}).status_code == 422
        many = [{"name": f"TEST_{i}", "role": "Dev"} for i in range(25)]
        assert admin.put(f"{BASE}/api/admin/team-members", json={"members": many}).status_code == 422

    def test_user_forbidden(self, user):
        assert user.put(f"{BASE}/api/admin/team-members", json={"members": []}).status_code in (401, 403)

    def test_clear(self, admin):
        assert admin.put(f"{BASE}/api/admin/team-members", json={"members": []}).status_code == 200
        assert _site()["team_members"] == []
