"""Iteration 9: multi-language (en/bn/hi) webinar + guide videos."""
import os
import requests
import pytest

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN = {"email": "takmonboost90@gmail.com", "password": "Admin@Demo2026"}
USER = {"email": "demo.a@example.com", "password": "Demo@12345"}
EN, BN, HI = "https://youtu.be/dQw4w9WgXcQ", "https://www.youtube.com/watch?v=9bZkp7q19f0", "https://youtu.be/kJQP7kiw5Fk"


def _login(c):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json=c, timeout=30)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def user():
    return _login(USER)


def _webinar_body(admin, **kw):
    w = admin.get(f"{BASE}/api/admin/webinar").json()
    keys = ["enabled", "required", "title", "subtitle", "host", "duration", "video_url", "video_url_bn", "video_url_hi",
            "description", "highlights", "cta_text", "min_watch_seconds", "reminder_enabled", "reminder_hours"]
    b = {k: w.get(k, "") for k in keys}
    b.update(kw)
    return b


# Webinar multi-language
class TestWebinarLang:
    def test_save_three(self, admin, user):
        r = admin.put(f"{BASE}/api/admin/webinar", json=_webinar_body(admin, video_url=EN, video_url_bn=BN, video_url_hi=HI))
        assert r.status_code == 200, r.text
        d = r.json()
        assert (d["video_id"], d["video_id_bn"], d["video_id_hi"]) == ("dQw4w9WgXcQ", "9bZkp7q19f0", "kJQP7kiw5Fk")
        g = user.get(f"{BASE}/api/webinar").json()
        assert (g["video_id"], g["video_id_bn"], g["video_id_hi"]) == ("dQw4w9WgXcQ", "9bZkp7q19f0", "kJQP7kiw5Fk")
        assert g["video_url_hi"] == HI

    def test_invalid_bn(self, admin):
        r = admin.put(f"{BASE}/api/admin/webinar", json=_webinar_body(admin, video_url=EN, video_url_bn="https://vimeo.com/123", video_url_hi=HI))
        assert r.status_code == 400
        assert "YouTube" in r.json().get("detail", "")
        # unchanged
        g = admin.get(f"{BASE}/api/admin/webinar").json()
        assert g["video_id_bn"] == "9bZkp7q19f0"

    def test_invalid_hi(self, admin):
        r = admin.put(f"{BASE}/api/admin/webinar", json=_webinar_body(admin, video_url_hi="not a link"))
        assert r.status_code == 400

    def test_bn_only_and_clear(self, admin, user):
        r = admin.put(f"{BASE}/api/admin/webinar", json=_webinar_body(admin, video_url="", video_url_bn=BN, video_url_hi=""))
        assert r.status_code == 200
        d = r.json()
        assert d["video_id"] == "" and d["video_id_bn"] == "9bZkp7q19f0" and d["video_id_hi"] == ""

    def test_user_forbidden(self, user, admin):
        r = user.put(f"{BASE}/api/admin/webinar", json=_webinar_body(admin))
        assert r.status_code == 403


# Guides multi-language
class TestGuideLang:
    def test_guide_three(self, admin, user):
        gs = admin.get(f"{BASE}/api/admin/guides").json()
        g = next(x for x in gs if x["slug"] == "how-to-deposit-usdt")
        body = {k: g[k] for k in ("title", "slug", "description", "icon", "steps", "order", "active")}
        body.update(video_url=EN, video_url_bn=BN, video_url_hi=HI)
        r = admin.put(f"{BASE}/api/admin/guides/{g['id']}", json=body)
        assert r.status_code == 200, r.text
        d = r.json()
        assert (d["video_id"], d["video_id_bn"], d["video_id_hi"]) == ("dQw4w9WgXcQ", "9bZkp7q19f0", "kJQP7kiw5Fk")
        u = user.get(f"{BASE}/api/guides/how-to-deposit-usdt").json()
        assert (u["video_id"], u["video_id_bn"], u["video_id_hi"]) == ("dQw4w9WgXcQ", "9bZkp7q19f0", "kJQP7kiw5Fk")
        lst = user.get(f"{BASE}/api/guides").json()
        assert next(x for x in lst if x["slug"] == "how-to-deposit-usdt")["video_id_hi"] == "kJQP7kiw5Fk"
        # invalid hi
        body["video_url_hi"] = "https://example.com/x"
        assert admin.put(f"{BASE}/api/admin/guides/{g['id']}", json=body).status_code == 400
        # backward compat: omit bn/hi -> defaults ""
        body2 = {k: g[k] for k in ("title", "slug", "description", "icon", "steps", "order", "active")}
        body2["video_url"] = EN
        r = admin.put(f"{BASE}/api/admin/guides/{g['id']}", json=body2)
        assert r.status_code == 200 and r.json()["video_id_bn"] == ""
        # reset
        body2["video_url"] = ""
        assert admin.put(f"{BASE}/api/admin/guides/{g['id']}", json=body2).status_code == 200
