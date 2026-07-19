# 30日伴走コース「概念コース骨格」(Layer1)生成のプロンプト設計。
# 3層コース生成アーキテクチャ：
#   Layer1(本ファイル) = クリエイターが1回だけ生成する全学習者共通の骨格。メッセージ文は持たない。
#   Layer2 = 学習者の診断結果でタスク配分を個人化(personalize_prompts.py)。
#   Layer3 = 毎日の動的メッセージ生成(chat_prompts.py)。
#
# 旧設計（週単位13回のAI呼び出し、12〜13分）から、1回のAI呼び出しで30日分を
# まとめて生成する方式に変更し、生成時間を約15秒に短縮する。
WEEK_PHASES = [
    (1, 1, "基礎"),
    (2, 2, "強化"),
    (3, 3, "実践"),
    (4, 4, "仕上げ"),
]


def phase_label_for_week(week_number: int) -> str:
    for start, end, label in WEEK_PHASES:
        if start <= week_number <= end:
            return label
    return "学習期"


def build_calendar_chat_system(
    course_title: str,
    purpose: str,
    target_audience: str,
    topics: str,
    style: str,
    pace_unit_description: str | None,
    existing_days_text: str,
) -> str:
    """30日カレンダーの相談AIチャット用システムプロンプト。クリエイターと会話しながら、
    必要に応じて特定の日のテーマ・チェックリスト・休息日設定を提案する。
    提案はJSON形式のday_changesとして返し、クリエイターが確認・反映ボタンを押すまでは
    実際のカレンダーには反映されない（propose-onlyで、applyは別エンドポイント）。"""
    return f"""あなたは30日伴走コースの設計を手伝う優秀なアシスタントです。
クリエイターと会話しながら、各日にやるべきことを一緒に考えてください。

【コース情報】
コース名: {course_title}
講座の目的・ゴール: {purpose or '指定なし'}
対象者: {target_audience or '指定なし'}
扱いたいトピック・要素: {topics or '指定なし'}
講師としてのスタイル・こだわり: {style or '指定なし'}
1回あたりの分量の目安: {pace_unit_description or '標準'}

【現在のカレンダーの状態】
{existing_days_text}

【返答形式(JSONのみ)】
{{
  "ai_message": "クリエイターへの返答・提案の説明（自然な会話文、2〜4文程度）",
  "day_changes": [
    {{"day": 1, "theme": "その日のテーマ（15文字以内）", "checklist_items": [{{"text": "具体的なタスク", "minutes": 15}}], "is_rest_day": false}}
  ]
}}

【Rules】
- day_changesには、今回の会話で変更・提案する日だけを含めてください（全30日を毎回含める必要はありません）
- まだ聞きたいことがある場合はday_changesを空配列にして質問を返してもよい
- 雑談や質問への回答だけの場合もday_changesは空配列にしてください
- checklist_itemsは自然な日本語で具体的なタスクにする。休息日はis_rest_day=trueにしchecklist_itemsは空配列にする
- 提案は確定ではなく、クリエイターが内容を確認してから反映するという前提で話してください
"""
