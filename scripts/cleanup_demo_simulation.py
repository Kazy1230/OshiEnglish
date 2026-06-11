#!/usr/bin/env python3
"""
デモ運用シミュレーション用データの削除スクリプト
====================================================
seed_demo_simulation.py で投入した「demo_」プレフィックスの顧客と
「デモ：」プレフィックスのキャラクターをまとめて削除します。

使い方:
  ADMIN_USERNAME=admin ADMIN_PASSWORD=xxxxx python cleanup_demo_simulation.py [--yes]

--yes を付けない場合は削除対象一覧を表示するだけ（確認用）。
"""
import os
import sys
import requests

API_BASE = os.environ.get("API_BASE", "http://localhost/api")
CONFIRM = "--yes" in sys.argv

ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")
if not ADMIN_USERNAME or not ADMIN_PASSWORD:
    print("ERROR: ADMIN_USERNAME / ADMIN_PASSWORD を環境変数で指定してください")
    sys.exit(1)

s = requests.Session()
resp = s.post(f"{API_BASE}/auth/login", data={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD})
resp.raise_for_status()
s.headers.update({"Authorization": f"Bearer {resp.json()['access_token']}"})

customers = s.get(f"{API_BASE}/customers/").json()
characters = s.get(f"{API_BASE}/characters/").json()

target_customers = [c for c in customers if c["username"].startswith("demo_")]
target_characters = [c for c in characters if c["name"].startswith("デモ：")]

print(f"削除対象の顧客: {len(target_customers)} 件")
for c in target_customers:
    print(f"   - id={c['id']} username={c['username']}")
print(f"削除対象のキャラクター: {len(target_characters)} 件")
for c in target_characters:
    print(f"   - id={c['id']} name={c['name']}")

if not CONFIRM:
    print("\n--yes を付けて再実行すると削除を実行します。")
    print("注意: Customer/Article/Message 間に ON DELETE CASCADE は設定されていないため、")
    print("      DM(messages)が残っている顧客は外部キー制約で削除に失敗する可能性があります。")
    print("      その場合は管理画面でスレッド内容を確認のうえ、開発者に依頼して")
    print("      DB側で該当 messages レコードを削除してもらってください。")
    print("      （例: DELETE FROM messages WHERE customer_id IN (...対象id...);）")
    print("      ※ このスクリプトは安全のため messages の削除は自動では行いません。")
    sys.exit(0)

# 記事は管理APIで削除できるので先に削除しておく(顧客削除時のFK制約回避)
all_articles = s.get(f"{API_BASE}/articles/admin/all").json()
target_cust_ids = {c["id"] for c in target_customers}
for a in all_articles:
    if a.get("customer_id") in target_cust_ids:
        r = s.delete(f"{API_BASE}/articles/admin/{a['id']}")
        print(f"記事削除 id={a['id']} (customer_id={a['customer_id']}): {r.status_code}")

for c in target_customers:
    r = s.delete(f"{API_BASE}/customers/{c['id']}")
    if r.status_code >= 400:
        print(f"!! 顧客削除に失敗 id={c['id']} username={c['username']}: {r.status_code} {r.text[:200]}")
        print("   -> DM(messages)が残っている可能性があります。上記の注意書きを参照してください。")
    else:
        print(f"顧客削除 id={c['id']}: {r.status_code}")

for c in target_characters:
    r = s.delete(f"{API_BASE}/characters/{c['id']}")
    if r.status_code >= 400:
        print(f"!! キャラクター削除に失敗 id={c['id']} name={c['name']}: {r.status_code} {r.text[:200]}")
        print("   -> まだ割り当てられている顧客が残っている可能性があります。")
    else:
        print(f"キャラクター削除 id={c['id']}: {r.status_code}")

print("完了しました。")
