import re

# 解約・クレーム等の機微な相談、または長文の質問はSonnetへエスカレーションする
NEEDS_SONNET_PATTERN = re.compile(
    r"解約|クレーム|苦情|辞めたい|やめたい|返金|サポートに電話|キャンセルしたい|訴え|弁護士",
    re.IGNORECASE,
)


def needs_escalation(question_body: str) -> bool:
    return bool(NEEDS_SONNET_PATTERN.search(question_body)) or len(question_body) > 300


def select_answer_model(message_type: str, question_body: str, haiku_model: str, sonnet_model: str) -> str:
    """モデルルーティング方針（設計書2.5節）に基づき回答生成モデルを選ぶ。

    学習内容の質問・感情系の相談は継続率に直結するためSonnet、
    状況報告・雑談系の定型応答はHaikuで十分（コスト最適化）。
    """
    if message_type == "report" and not needs_escalation(question_body):
        return haiku_model
    return sonnet_model


CLASSIFY_SYSTEM = """あなたは英語学習サービスの質問分類アシスタントです。
学習者からの相談・質問を読み、以下の2つを判定してJSON形式で返してください。

1. category_name: 質問の学習コンテンツ軸での分類名（例：「仮定法」「リスニングPart3」「単語の覚え方」「モチベーション維持」「学習時間の確保」など）。
   既存カテゴリ一覧に当てはまるものがあれば、必ずその名称をそのまま使ってください（表記揺れを避けるため）。
   当てはまるものがなければ、新しい分類名を簡潔に提案してください。

2. message_type: 以下のいずれか一つ
   - "emotion": 感情・モチベーション系の相談（「続けられるか不安」「モチベがない」等）
   - "content": 学習内容についての質問（「仮定法ってどう覚えればいい?」等）
   - "report": 状況報告・雑談系（「今日30分やりました」等）

JSON以外の文章は出力しないでください。出力形式:
{"category_name": "...", "message_type": "emotion" | "content" | "report"}
"""


def build_classify_messages(question_body: str, existing_category_names: list[str]) -> list[dict]:
    categories_text = "、".join(existing_category_names) if existing_category_names else "（まだ登録されていません）"
    return [{
        "role": "user",
        "content": f"既存カテゴリ一覧: {categories_text}\n\n質問:\n{question_body}",
    }]


ANSWER_STYLE_BY_TYPE = {
    "emotion": "まず学習者の気持ちに共感し、次に原因を一緒に整理し、最後に今日からできる小さな行動を1つ提案する",
    "content": "結論を最初に伝え、理由を説明し、具体例を1つ挙げ、最後に次にとるべきアクションを示す",
    "report": "学習者の取り組みを労い、明日への橋渡しになる一言で締める",
}


def build_answer_system(personality_profile: dict, message_type: str) -> list[dict]:
    """人格プロファイル部分（同じコースの全チャットで不変）とメッセージ種別ごとの回答スタイル（可変）を
    別々のcontent blockに分け、人格プロファイル側にcache_controlを付けてPrompt Cachingを有効化する
    （詳細設計書2.5節：システムプロンプトのキャッシュでAPIコストを削減）。"""
    comm = personality_profile.get("communication", {})
    coaching = personality_profile.get("coaching_style", {})
    style = ANSWER_STYLE_BY_TYPE.get(message_type, ANSWER_STYLE_BY_TYPE["content"])

    preamble = f"""あなたは英語学習コーチとして、以下の人格で学習者からの相談に回答してください。

【人格設定】
- 口調: {comm.get('tone', '')}（一人称「{comm.get('first_person', '')}」、文末「{comm.get('sentence_ending', '')}」）
- 指導の厳しさ: {coaching.get('strictness', '')}
- 励まし方: {coaching.get('encouragement', '')}
"""
    suffix = f"""【今回の回答スタイル】
{style}

回答は3〜5文程度の自然なチャットメッセージとして書いてください。説明文や前置きは不要です。
"""
    return [
        {"type": "text", "text": preamble, "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": suffix},
    ]


def build_answer_messages(question_body: str, linked_content_title: str | None, linked_content_url: str | None) -> list[dict]:
    content_note = ""
    if linked_content_title and linked_content_url:
        content_note = (
            f"\n\n参考: このカテゴリには既に紐付けられたコンテンツがあります。"
            f"必ず自然な形で紹介に含めてください → 「{linked_content_title}」({linked_content_url})"
        )
    return [{"role": "user", "content": f"学習者からの相談:\n{question_body}{content_note}"}]
