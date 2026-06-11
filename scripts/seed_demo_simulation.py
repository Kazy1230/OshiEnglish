#!/usr/bin/env python3
"""
デモ運用シミュレーション用データ投入スクリプト
====================================================

目的:
  実運用の動作確認のため、ラベル付きの「デモ」アカウント・キャラクター・記事・
  DMスレッドを一括作成します（demo_ プレフィックス付きで、後から一括識別・削除が容易）。

★重要: このスクリプトは管理者の認証情報を一切保持しません。
  実行時に環境変数 ADMIN_USERNAME / ADMIN_PASSWORD を指定してください。
  （あなた自身の管理者アカウントでログインして実行する想定です）

使い方:
  ADMIN_USERNAME=admin ADMIN_PASSWORD=xxxxx python seed_demo_simulation.py

  --dry-run を付けると、実際にはAPIを呼ばず作成予定の内容だけを表示します:
  ADMIN_USERNAME=admin ADMIN_PASSWORD=xxxxx python seed_demo_simulation.py --dry-run

後片付け:
  username が "demo_" で始まる顧客・name が "デモ：" で始まるキャラクターを
  まとめて削除すれば、投入したデータを綺麗に取り除けます
  （cleanup_demo_simulation.py を同梱、後述）。
"""

import os
import sys
import json
import random
import requests

API_BASE = os.environ.get("API_BASE", "http://localhost/api")
DRY_RUN = "--dry-run" in sys.argv

ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")

if not DRY_RUN and (not ADMIN_USERNAME or not ADMIN_PASSWORD):
    print("ERROR: ADMIN_USERNAME / ADMIN_PASSWORD を環境変数で指定してください（--dry-run も利用できます）")
    sys.exit(1)

session = requests.Session()
TOKEN = None


def login():
    global TOKEN
    if DRY_RUN:
        return
    resp = session.post(f"{API_BASE}/auth/login", data={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD})
    resp.raise_for_status()
    TOKEN = resp.json()["access_token"]
    session.headers.update({"Authorization": f"Bearer {TOKEN}"})


def call(method, path, **kwargs):
    if DRY_RUN:
        print(f"[dry-run] {method.upper()} {path}  payload={kwargs.get('json')}")
        return {"id": random.randint(9000, 9999)}
    resp = session.request(method, f"{API_BASE}{path}", **kwargs)
    if not resp.ok:
        print(f"!! {method.upper()} {path} -> {resp.status_code}: {resp.text[:300]}")
        resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# デモキャラクター定義（5体・世界観バラバラ／カラースキームつき）
# 名前は「デモ：」プレフィックスで一覧上すぐ判別できるようにする
# ---------------------------------------------------------------------------
CHARACTERS = [
    {
        "name": "デモ：レトロ喫茶のマスター・ヒューゴ",
        "description": "昭和レトロな喫茶店のマスター。落ち着いた渋い口調で、コーヒーの蘊蓄を交えながら文法を教える。",
        "greetings": [
            "いらっしゃい。今日はどんな一杯（文法）にしましょうか。",
            "コーヒーが落ちるまでの数分、文法の話でもしましょうか。",
        ],
        "tone_profile": {"speech_style": "渋い・丁寧", "first_person": "わたし", "catchphrase": "ゆっくりいきましょう"},
        "color_scheme": {"primary": "#5b3a29", "accent": "#caa472", "bg": "#faf6f0", "text": "#3a2a1d",
                         "card": "#ffffff", "border": "#e7dcc9", "example_bg": "#f4ece1", "tips_bg": "#efe6d8"},
        "font_style": "serif",
        "reward_progress_template": "公開記事 {published} 冊、淹れ終えました。あと {remaining} 冊で「{character}」特製のご褒美をお出ししますよ。",
        "chat_footer_note": "※ 一杯一杯、丁寧にお返事しますので、少々お待ちを。",
    },
    {
        "name": "デモ：アイドル研究生ましろ",
        "description": "元気いっぱいの新人アイドル。テンション高めの口調でファン（生徒）を励ましながら教える。",
        "greetings": [
            "ましろ、今日も全力で英語レッスンするよ〜！💪",
            "やっほー！今日も一緒に頑張ろうね！",
        ],
        "tone_profile": {"speech_style": "ハイテンション・friendly", "first_person": "ましろ", "catchphrase": "ましろと一緒にがんばろう！"},
        "color_scheme": {"primary": "#e0457b", "accent": "#ffd166", "bg": "#fff5f8", "text": "#3a2330",
                         "card": "#ffffff", "border": "#ffd9e6", "example_bg": "#fff0f5", "tips_bg": "#fff8e8"},
        "font_style": "rounded",
        "reward_progress_template": "やったね！公開記事 {published} 冊達成🎤 あと {remaining} 冊で「{character}」からスペシャルなご褒美が届くよ！",
        "chat_footer_note": "※ ライブやレッスンの合間にお返事するから、ちょっと待っててね！",
    },
    {
        "name": "デモ：図書館の主・カイ先輩",
        "description": "物静かな大学図書館司書。クールだが面倒見がよく、的確に・簡潔に解説する。",
        "greetings": [
            "……静かにしてくれるなら、いくらでも教える。",
            "今日も来たのか。質問はまとめておくと早い。",
        ],
        "tone_profile": {"speech_style": "クール・簡潔", "first_person": "俺", "catchphrase": "結論から言う"},
        "color_scheme": {"primary": "#2b3a55", "accent": "#6f9bd1", "bg": "#f3f6fb", "text": "#1f2937",
                         "card": "#ffffff", "border": "#dbe4f0", "example_bg": "#eaf1fa", "tips_bg": "#e7eef7"},
        "font_style": "monospace",
        "reward_progress_template": "公開記事 {published} 冊。あと {remaining} 冊で次の資料（ご褒美）を渡す。",
        "chat_footer_note": "※ 返答は早いとは限らない。気長に待て。",
    },
    {
        "name": "デモ：商店街のたこ焼き屋台主・タコ政",
        "description": "下町のたこ焼き屋台のおやじ。江戸っ子気質で威勢がよく、例え話に食べ物がよく出る。",
        "greetings": [
            "よぉ、来たか！熱いうちに英語も食っていきな！",
            "今日もパリッと焼いていくぜ、文法もな！",
        ],
        "tone_profile": {"speech_style": "江戸っ子・威勢がいい", "first_person": "俺", "catchphrase": "熱いうちに覚えな！"},
        "color_scheme": {"primary": "#c1440e", "accent": "#f2a541", "bg": "#fff8f1", "text": "#3a2415",
                         "card": "#ffffff", "border": "#f4ddc2", "example_bg": "#fdeedd", "tips_bg": "#fbe6cf"},
        "font_style": "rounded",
        "reward_progress_template": "おっ、{published}冊も焼き上がったか！あと{remaining}冊で「{character}」特製のご褒美をお出しするぜ！",
        "chat_footer_note": "※ 屋台が混んでる時は返事が遅れるが、ちゃんと読んでるから待ってな。",
    },
    {
        "name": "デモ：宇宙船AI・ノクス",
        "description": "旧型の宇宙船に搭載されたAI。理論的だが、たまに人間味のあるユーモアを見せる。",
        "greetings": [
            "起動完了。本日の学習プランを提案します。",
            "おかえりなさい、航海士。続きを始めますか？",
        ],
        "tone_profile": {"speech_style": "理知的・ややユーモラス", "first_person": "私", "catchphrase": "演算完了——では始めましょう"},
        "color_scheme": {"primary": "#1f3a5f", "accent": "#34d1bf", "bg": "#0f1b2b", "text": "#e6f1f5",
                         "card": "#16263b", "border": "#274463", "example_bg": "#16313f", "tips_bg": "#163a3a"},
        "font_style": "monospace",
        "reward_progress_template": "公開記事 {published} 件を確認。あと {remaining} 件で報酬データの送信条件を満たします。",
        "chat_footer_note": "※ 通信遅延のため、応答にお時間をいただく場合があります。",
    },
]

# ---------------------------------------------------------------------------
# デモ顧客（4キャラに対し各5名 = 20名。残り1キャラは予備で割当なし→後で割当例として使用）
# ---------------------------------------------------------------------------
CUSTOMER_NAMES = [
    "yamada", "suzuki", "tanaka", "sato", "kobayashi",
    "ito", "watanabe", "yamamoto", "nakamura", "kimura",
    "saito", "matsumoto", "inoue", "kato", "yoshida",
    "yamaguchi", "sasaki", "shimizu", "hayashi", "abe",
]

GRAMMAR_TOPICS = [
    "現在完了形", "仮定法過去", "関係代名詞 who/which/that",
    "不定詞と動名詞の使い分け", "受動態", "比較級・最上級",
    "助動詞 (can/may/must)", "分詞構文", "間接疑問文",
]


def make_article_payload(customer_id, character_id, grammar_master_id, char_name, topic_name, n):
    """簡易な記事ペイロードを生成（実際の本番投入では LLM 生成に差し替える想定のサンプル）"""
    title = f"『{topic_name}』を完全攻略（{char_name}と学ぶ #{n}）"
    content = (
        f"## {topic_name} の基本ルール\n"
        f"このセクションでは {topic_name} の基本構造を、{char_name} の語り口で解説します。"
        "（本番投入時はキャラクターの個性と約2000文字の解説をLLMで生成）\n\n"
        f"## 紛らわしい表現との違い\n似たような表現との違いを比較しながら整理します。\n\n"
        f"## よくある誤用とその理由\n初学者がつまずきやすいポイントを取り上げます。"
    )
    examples = [
        {"en": "This is a sample sentence for the demo article.", "ja": f"これはデモ記事用のサンプル例文です（{char_name}風に変換予定）。"},
        {"en": "Another example sentence goes here.", "ja": "もう一つの例文サンプルです。"},
    ]
    tips = [f"{char_name} ならではの覚え方のヒント（本番ではLLMが世界観に合わせて生成）"]
    return {
        "customer_id": customer_id,
        "character_id": character_id,
        "grammar_master_id": grammar_master_id,
        "title": title,
        "content": content,
        "tips": tips,
        "example_sentences": examples,
        "status": "published",
        "is_llm_drafted": True,
    }


def main():
    print(f"=== デモ運用シミュレーション投入開始 (dry_run={DRY_RUN}) ===")
    login()

    # 1. キャラクター作成
    char_ids = []
    for c in CHARACTERS:
        created = call("post", "/characters/", json=c)
        char_ids.append(created["id"])
        print(f"  + キャラクター作成: {c['name']} -> id={created['id']}")

    # 2. 顧客作成（5名ずつ4キャラへ割当、残り0名は最後のキャラへ少数追加）
    customer_ids = []
    assignments = []
    for i, uname in enumerate(CUSTOMER_NAMES):
        char_idx = i % 4  # 最初の4キャラに均等割当て（5体目は個別アサイン例として後段で利用）
        payload = {
            "username": f"demo_{uname}",
            "password": "DemoPass_2026!",
            "email": f"demo_{uname}@example.invalid",
            "character_id": char_ids[char_idx],
            "is_admin": False,
        }
        created = call("post", "/customers/", json=payload)
        customer_ids.append(created["id"])
        assignments.append((created["id"], char_ids[char_idx]))
        print(f"  + 顧客作成: demo_{uname} -> id={created['id']} (character_id={char_ids[char_idx]})")

    # 3. 記事作成（各顧客に3〜8本、ランダム）
    article_count = 0
    for (cust_id, char_id), char in zip(assignments, [CHARACTERS[i % 4] for i in range(len(assignments))]):
        n_articles = random.randint(3, 8)
        for n in range(1, n_articles + 1):
            topic = random.choice(GRAMMAR_TOPICS)
            gm_id = random.randint(1, 9)  # 既存 grammar_masters の id 範囲
            payload = make_article_payload(cust_id, char_id, gm_id, char["name"], topic, n)
            call("post", "/articles/admin/", json=payload)
            article_count += 1
        print(f"  + customer_id={cust_id} に記事 {n_articles} 本作成")

    print(f"=== 完了: キャラクター {len(char_ids)} 体 / 顧客 {len(customer_ids)} 名 / 記事 {article_count} 本 ===")
    print("DM・トラブル対応シミュレーションは別途レビューに記載した内容を参考に、管理画面から手動で実施してください。")


if __name__ == "__main__":
    main()
