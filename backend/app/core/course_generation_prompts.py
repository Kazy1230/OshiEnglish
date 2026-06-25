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

以下のJSON形式の配列のみで出力してください（説明文は不要）。配列の要素数は必ず30にしてください:
[
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

【制約】
- themeは15文字以内
- task_typesのtypeはvocabulary/listening/grammar/reading/shadowing/practiceから選ぶ
- base_minutesは各タスクの標準学習時間(分)。1日の標準学習時間を超えないこと
- 週の流れ: Week1=基礎 Week2=強化 Week3=実践 Week4=仕上げ
- 休息日は7日ごとに1日程度設ける（is_rest_day=true、その日はtask_typesを空配列にする）
- 必ず人格プロファイルの方向性（指導方針・専門分野）を反映したテーマ選定にすること
"""


def build_course_day_generation_messages(
    personality_profile: dict,
    course_title: str,
    goal: str,
    target_learner: str,
    intensity: str,
) -> list[dict]:
    content = (
        f"【人格プロファイル】\n{json.dumps(personality_profile, ensure_ascii=False, indent=2)}\n\n"
        f"【コース情報】\n"
        f"コース名: {course_title}\n"
        f"ゴール: {goal}\n"
        f"対象者: {target_learner}\n"
        f"1日の標準学習時間: {intensity}\n\n"
        f"上記のコース情報で30日分のコース骨格を生成してください。"
    )
    return [{"role": "user", "content": content}]


def extract_json_array(text: str) -> list:
    """AI応答からJSON配列を取り出す（```json フェンス除去→[ ]の最外周を抜き出して解析）。"""
    from app.core.llm import LLMError

    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.MULTILINE).strip()
    start = cleaned.find("[")
    end = cleaned.rfind("]")
    if start == -1 or end == -1 or end <= start:
        raise LLMError("AIの応答からJSON配列を見つけられませんでした")
    try:
        return json.loads(cleaned[start:end + 1])
    except json.JSONDecodeError as e:
        raise LLMError(f"AIの応答をJSONとして解析できませんでした: {e}") from e
