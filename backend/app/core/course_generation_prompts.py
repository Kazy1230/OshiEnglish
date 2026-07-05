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
    goal: str,
    target_learner: str,
    intensity: str,
    subject: str = "english",
    study_materials: str | None = None,
    pace: str | None = None,
    day_textbook_plan: dict[int, list[dict]] | None = None,
) -> list[dict]:
    from app.core.subject_config import get_subject_config
    config = get_subject_config(subject)
    system = config.course_day_generation_system

    plan_text = "指定なし（人格プロファイルとゴールに基づき自由に設計してください）"
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
        f"ゴール: {goal}\n"
        f"対象者: {target_learner}\n"
        f"1日の標準学習時間: {intensity}\n"
        f"使用する教材: {study_materials or '指定なし'}\n"
        f"進行速度: {pace or '標準'}\n\n"
        f"【日程割り当て（クリエイターが指定した、教材の各章をどの日にやるか）】\n{plan_text}\n\n"
        f"上記のコース情報で30日分のコース骨格を生成してください。"
        f"checklist_itemsは自然な日本語で具体的なタスクを書いてください。"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": content},
    ]


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
