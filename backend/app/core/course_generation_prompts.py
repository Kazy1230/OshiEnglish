# 30日伴走コース「概念コース骨格」(Layer1)生成のプロンプト設計。
# 3層コース生成アーキテクチャ：
#   Layer1(本ファイル) = クリエイターが1回だけ生成する全学習者共通の骨格。メッセージ文は持たない。
#   Layer2 = 学習者の診断結果でタスク配分を個人化(personalize_prompts.py)。
#   Layer3 = 毎日の動的メッセージ生成(chat_prompts.py)。
#
# 旧設計（週単位13回のAI呼び出し、12〜13分）から、1回のAI呼び出しで30日分を
# まとめて生成する方式に変更し、生成時間を約15秒に短縮する。
import json
import re

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


def build_course_day_generation_messages(
    personality_profile: dict,
    course_title: str,
    purpose: str,
    target_audience: str,
    topics: str,
    style: str,
    pace_unit_description: str | None = None,
    subject: str = "english",
    day_textbook_plan: dict[int, list[dict]] | None = None,
) -> list[dict]:
    from app.core.subject_config import get_subject_config
    config = get_subject_config(subject)
    system = config.course_day_generation_system

    plan_text = "指定なし（人格プロファイルと目的に基づき自由に設計してください）"
    if day_textbook_plan:
        lines = []
        for day in sorted(day_textbook_plan):
            entries = day_textbook_plan[day]
            entry_descriptions = []
            for e in entries:
                desc = f"「{e['textbook_name']}」{e['item']}"
                if e.get("type") == "vocabulary":
                    desc += f"（新規{e.get('daily_words') or '?'}語・復習{e.get('review_words') or '?'}語）"
                entry_descriptions.append(desc)
            lines.append(f"  Day{day}: " + " / ".join(entry_descriptions))
        plan_text = "\n".join(lines)

    content = (
        f"【人格プロファイル】\n{json.dumps(personality_profile, ensure_ascii=False, indent=2)}\n\n"
        f"【コース情報】\n"
        f"コース名: {course_title}\n"
        f"講座の目的・ゴール: {purpose or '指定なし'}\n"
        f"対象者: {target_audience or '指定なし'}\n"
        f"扱いたいトピック・要素: {topics or '指定なし'}\n"
        f"講師としてのスタイル・こだわり: {style or '指定なし'}\n"
        f"1回あたりの分量の目安: {pace_unit_description or '標準'}\n\n"
        f"【日程割り当て（クリエイターが指定した、教材の各章をどの日にやるか）】\n{plan_text}\n\n"
        f"上記のコース情報で30日分のコース骨格を生成してください。"
        f"checklist_itemsは自然な日本語で具体的なタスクを書いてください。"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": content},
    ]


def build_calendar_chat_system(
    course_title: str,
    purpose: str,
    target_audience: str,
    topics: str,
    style: str,
    pace_unit_description: str | None,
    day_textbook_plan_text: str,
    existing_days_text: str,
) -> str:
    """30日カレンダーの相談AIチャット用システムプロンプト。クリエイターと会話しながら、
    必要に応じて特定の日のテーマ・チェックリスト・休息日設定を提案する。
    提案はJSON形式のday_changesとして返し、クリエイターが確認・反映ボタンを押すまでは
    実際のカレンダーには反映されない（propose-onlyで、applyは別エンドポイント）。"""
    return f"""あなたは30日伴走コースの設計を手伝う優秀なアシスタントです。
クリエイターと会話しながら、教材の配分や各日にやるべきことを一緒に考えてください。

【コース情報】
コース名: {course_title}
講座の目的・ゴール: {purpose or '指定なし'}
対象者: {target_audience or '指定なし'}
扱いたいトピック・要素: {topics or '指定なし'}
講師としてのスタイル・こだわり: {style or '指定なし'}
1回あたりの分量の目安: {pace_unit_description or '標準'}

【教材の日程割り当て(参考。未設定でも構わない)】
{day_textbook_plan_text}

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


def extract_json_array(text: str) -> list:
    """json_mode（response_format=json_object）で返る{"days": [...]}形式から配列を取り出す。"""
    from app.core.llm import LLMError

    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.MULTILINE).strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise LLMError(f"AIの応答をJSONとして解析できませんでした: {e}") from e
    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict) and isinstance(parsed.get("days"), list):
        return parsed["days"]
    raise LLMError("AIの応答からJSON配列を見つけられませんでした")
