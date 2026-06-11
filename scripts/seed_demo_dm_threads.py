#!/usr/bin/env python3
"""
デモDMスレッド投入スクリプト
====================================================
demo_ 顧客のうち数名分のスレッドに、実運用でありそうなやり取りを再現します。
レビューに記載した「トラブル対応シミュレーション」のうち、性的・ハラスメント的な
文面そのものは生成せず(ポリシー上の理由)、代わりに以下を再現します:
  - 通常のやり取り(挨拶・記事リクエスト・お礼)
  - 再現が難しいリクエストとその丁寧な引き取り方
  - 過剰な発注・即レス強要とそのいなし方
  - 軽い不満・誤りの指摘とその訂正対応
  - DMでの不適切発言"の兆候"が出た際の最初の一歩(エスカレーション一歩手前)の対応例

使い方:
  ADMIN_USERNAME=admin ADMIN_PASSWORD=xxxxx python seed_demo_dm_threads.py
"""
import os
import sys
import requests

API_BASE = os.environ.get("API_BASE", "http://localhost/api")
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")
if not ADMIN_USERNAME or not ADMIN_PASSWORD:
    print("ERROR: ADMIN_USERNAME / ADMIN_PASSWORD を指定してください")
    sys.exit(1)

s = requests.Session()
r = s.post(f"{API_BASE}/auth/login", data={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD})
r.raise_for_status()
s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})

customers = s.get(f"{API_BASE}/customers/").json()
demo = [c for c in customers if c["username"].startswith("demo_")]
demo_by_name = {c["username"]: c for c in demo}


def reply(cust_id, text):
    rr = s.post(f"{API_BASE}/messages/admin/{cust_id}/reply", json={"content": text})
    if not rr.ok:
        print(f"  !! reply失敗 cust={cust_id}: {rr.status_code} {rr.text[:200]}")
    return rr.ok


# 顧客からのメッセージは本来は顧客自身が送るものですが、デモ用に
# 「管理者が顧客になりすまして送る」エンドポイントは存在しないため、
# DBへ直接INSERTするのではなく、ここでは「キャラクター(管理者)からの
# 自然な語りかけ」のみを投入し、双方向の会話例はレビュー本文(チャット側)で
# テキストとして示す方針とします。
# → 実際の双方向ログを残したい場合は、各 demo_xxx でログインして手動送信するのが安全です。

SCENARIOS = [
    # (username, character_message_list)
    ("demo_yamada", [
        "やまださん、こんにちは！本棚の記事はもう読んでみてくれたかな？わからないところがあれば、遠慮なく聞いてね。",
        "『現在完了形』のリクエスト、確かに受け取ったよ。来週には記事として届けられるように準備しているから、楽しみに待っていてね。",
    ]),
    ("demo_suzuki", [
        # 再現が難しいリクエストへの引き取り例
        "リクエストありがとう！ただ、『英検準1級の二次試験で出そうな言い回しを100個』というのは、記事という形では少し難しいんだ。"
        "代わりに『面接でよく使われる定番フレーズ集』というテーマでまとめてみるのはどうかな？これなら一緒に作れそうだよ。",
    ]),
    ("demo_tanaka", [
        # 過剰な発注・即レス強要への対応例
        "たくさんリクエストしてくれて嬉しいな！でも、一つひとつ丁寧に作りたいから、まずは1つのテーマから始めてみない？"
        "じっくり取り組んだ方が、きっと記憶にも残りやすいと思うんだ。",
    ]),
    ("demo_sato", [
        # 記事内容の誤り指摘への訂正対応例
        "記事の説明、わかりにくいところを教えてくれてありがとう。確認してみたら確かに補足が必要そうだったから、説明を追加して再公開しておいたよ。"
        "前よりわかりやすくなっていたら嬉しいな。",
    ]),
    ("demo_kobayashi", [
        # 不適切発言の"兆候"レベルへの初動対応例(段階1: 軽くいなして話題を戻す)
        "ふふ、面白いことを言うね。それより、今日はどんな英語のお話をしようか？気になっている表現とかある？",
    ]),
]

count = 0
for uname, msgs in SCENARIOS:
    c = demo_by_name.get(uname)
    if not c:
        print(f"  !! {uname} が見つかりません(スキップ)")
        continue
    for m in msgs:
        if reply(c["id"], m):
            count += 1
    print(f"  + {uname} (id={c['id']}) にメッセージ {len(msgs)} 件投入")

print(f"=== 完了: {count} 件のキャラクターメッセージを投入しました ===")
print("※ 顧客からの送信側は、各 demo_xxx アカウントでログインして手動再現するのが安全です"
      "(管理者が顧客になりすまして送信するAPIは存在しないため)。")
