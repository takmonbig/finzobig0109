import os, sys, requests
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
mode = sys.argv[1]
s = requests.Session()
s.post(f"{BASE}/api/auth/login", json={"email": "takmonboost90@gmail.com", "password": "Admin@Demo2026"})
w = s.get(f"{BASE}/api/admin/webinar").json()
keys = ["enabled", "required", "title", "subtitle", "host", "duration", "description", "highlights", "cta_text", "min_watch_seconds", "reminder_enabled", "reminder_hours"]
b = {k: w[k] for k in keys}
vids = {"three": ("https://youtu.be/dQw4w9WgXcQ", "https://www.youtube.com/watch?v=9bZkp7q19f0", "https://youtu.be/kJQP7kiw5Fk"),
        "en": ("https://youtu.be/dQw4w9WgXcQ", "", ""), "clear": ("", "", "")}[mode]
b.update(video_url=vids[0], video_url_bn=vids[1], video_url_hi=vids[2])
print(s.put(f"{BASE}/api/admin/webinar", json=b).status_code)
g = next(x for x in s.get(f"{BASE}/api/admin/guides").json() if x["slug"] == "how-to-deposit-usdt")
gb = {k: g[k] for k in ("title", "slug", "description", "icon", "steps", "order", "active")}
gv = {"three": ("https://youtu.be/dQw4w9WgXcQ", "", "https://youtu.be/kJQP7kiw5Fk")}.get(mode, ("", "", ""))
gb.update(video_url=gv[0], video_url_bn=gv[1], video_url_hi=gv[2])
print(s.put(f"{BASE}/api/admin/guides/{g['id']}", json=gb).status_code)
u = requests.Session(); r = u.post(f"{BASE}/api/auth/login", json={"email": "demo.a@example.com", "password": "Demo@12345"})
print("USERID", u.get(f"{BASE}/api/auth/me").json().get("id"))
