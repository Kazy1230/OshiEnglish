import os, sys, requests
API_BASE = os.environ.get("API_BASE", "http://localhost/api")
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")
s = requests.Session()
r = s.post(f"{API_BASE}/auth/login", data={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD})
r.raise_for_status()
admin_tok = r.json()["access_token"]

# customer-side scenario messages keyed by username (sent as the customer themselves)
SCENARIOS = {
    "demo_yamada": [
        {"content": "はじめまして！これからよろしくお願いします。記事、楽しみにしています。"},
        {"content": "仮定法をもっと知りたいです", "grammar_topic": "現在完了形"},
    ],
    "demo_suzuki": [
        {"content": "来週試験があるので、英検準1級の二次試験で聞かれそうな言い回しを100個、その場で先生が言いそうな言い回しのまま作ってもらえますか？", "grammar_topic": "面接対策フレーズ100選（先生の口調再現希望）"},
    ],
    "demo_tanaka": [
        {"content": "今日中に5本、明日も5本、できれば毎日5本ずつお願いしたいです！すぐ対応してもらえますか？"},
    ],
    "demo_sato": [
        {"content": "さっきの記事、説明のところがちょっとわかりにくかったです。例文の意味が違う気がします…"},
    ],
    "demo_kobayashi": [
        {"content": "先生って実際どんな見た目してるんですか？写真とかないんですか？笑"},
    ],
}

cust_session = requests.Session()
for uname, msgs in SCENARIOS.items():
    lr = cust_session.post(f"{API_BASE}/auth/login", data={"username": uname, "password": "DemoPass_2026!"})
    if not lr.ok:
        print(f"!! login failed for {uname}: {lr.status_code} {lr.text[:150]}")
        continue
    tok = lr.json()["access_token"]
    headers = {"Authorization": f"Bearer {tok}"}
    for m in msgs:
        rr = cust_session.post(f"{API_BASE}/messages/me", json=m, headers=headers)
        print(f"  {uname}: post -> {rr.status_code} {'OK' if rr.ok else rr.text[:150]}")
print("done")
