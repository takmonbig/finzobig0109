# Leaderboard (monthly top referrers) API tests
import os
import re
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")


def login(email, pw="Demo@12345"):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code} {r.text[:200]}")
    return s


@pytest.fixture(scope="module")
def sa():
    return login("demo.a@example.com")


def test_unauth_401():
    r = requests.get(f"{BASE_URL}/api/leaderboard")
    assert r.status_code == 401


def test_leaderboard_shape(sa):
    r = sa.get(f"{BASE_URL}/api/leaderboard")
    assert r.status_code == 200, r.text
    d = r.json()
    print(d)
    assert set(d.keys()) == {"month", "top", "my_coins"}
    assert re.fullmatch(r"[A-Z][a-z]+ \d{4}", d["month"])
    top = d["top"]
    assert len(top) <= 10
    coins = [t["coins"] for t in top]
    assert coins == sorted(coins, reverse=True)
    assert [t["rank"] for t in top] == list(range(1, len(top) + 1))
    for t in top:
        assert set(t.keys()) == {"rank", "name", "coins", "referrals", "me"}
        parts = t["name"].split()
        for p in parts[1:]:
            assert re.fullmatch(r".\*+", p), t["name"]
        assert "_id" not in t and "user_id" not in t and "email" not in t


def test_me_flag_and_my_coins(sa):
    d = sa.get(f"{BASE_URL}/api/leaderboard").json()
    mine = [t for t in d["top"] if t["me"]]
    assert len(mine) <= 1
    if mine:
        assert mine[0]["coins"] == d["my_coins"]
    else:
        print("demo.a not in top list; my_coins=", d["my_coins"])
    assert isinstance(d["my_coins"], (int, float))


def test_me_flag_other_user():
    sb = login("demo.b@example.com")
    sa_ = login("demo.a@example.com")
    db_ = sb.get(f"{BASE_URL}/api/leaderboard").json()
    da = sa_.get(f"{BASE_URL}/api/leaderboard").json()
    # same ranking for everyone, only 'me' differs
    assert [(t["name"], t["coins"]) for t in da["top"]] == [(t["name"], t["coins"]) for t in db_["top"]]
    assert sum(t["me"] for t in db_["top"]) <= 1
