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

TASK_TYPES = ["vocabulary", "listening", "grammar", "reading", "shadowing", "practice"]

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


COURSE_DAY_GENERATION_SYSTEM = """あなたは英語学習コースの設計専門家です。
クリエイターの人格プロファイルとコース基本情報をもとに、30日分のコース骨格をJSON配列で生成してください。
メッセージ文は生成しません。タスクの「型」（種別と標準学習時間）のみを生成してください。

必ず以下のJSON形式のオブジェクトのみで出力してください（説明文・前置き・コードフェンスは一切不要）。
"days"配列の要素数は必ず30にしてください:
{
  "days": [
    {
      "day": 1,
      "week": 1,
      "theme": "その日の学習テーマ（15文字以内）",
      "task_types": [
        {"type": "vocabulary", "label": "単語学習", "base_minutes": 15}
      ],
      "is_rest_day": false
    }
  ]
}

【制約】
- themeは15文字以内
- task_typesのtypeはvocabulary/listening/grammar/reading/shadowing/practiceから選ぶ
- base_minutesは各タスクの標準学習時間(分)。1日の標準学習時間を超えないこと
- 週の流れ: Week1=基礎 Week2=強化 Week3=実践 Week4=仕上げ
- 休息日は7日ごとに1日程度設ける（is_rest_day=true、その日はtask_typesを空配列にする）
- 必ず人格プロファイルの方向性（指導方針・専門分野）を反映したテーマ選定にすること
- 指定された「使用する教材」を前提にテーマ・タスクを組み立てること（汎用的な内容にしない）
- 指定された「進行速度」に応じて難易度カーブの傾き・1日あたりのタスク量を調整すること
- 「日程割り当て」が指定されている日は、その日のthemeとtask_typesを必ずその割り当て内容に基づいて作成すること
  （割り当てられた教材の章・項目名をthemeに反映し、その項目を学習するタスクをtask_typesに含める。
   割り当てが無い日は人格プロファイル・ゴールに基づき自由に設計してよい）
- 単語帳タイプの割り当てがある日は、daily_words/review_wordsの語数に応じたvocabularyタスクを設定すること
"""


def build_course_day_generation_messages(
    personality_profile: dict,
    course_title: str,
    goal: str,
    target_learner: str,
    intensity: str,
    study_materials: str | None = None,
    pace: str | None = None,
    day_textbook_plan: dict[int, list[dict]] | None = None,
) -> list[dict]:
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
        f"日程割り当てが指定されている日は必ずその教材項目に基づいてtheme・task_typesを作成し、"
        f"指定が無い日は教材全体を使う前提で人格プロファイルとゴールに沿って自由に設計してください。"
        f"進行速度（ゆっくり/標準/速め等）を週ごとの難易度カーブと1日あたりのタスク量に反映してください。"
    )
    return [{"role": "user", "content": content}]


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
