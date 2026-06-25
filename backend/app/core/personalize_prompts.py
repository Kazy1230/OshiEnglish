# Layer2: 学習者の診断結果でLayer1骨格のタスク配分を個人化するプロンプト設計。
import json
import re


PERSONALIZE_SYSTEM = """あなたは英語学習の個別コーチです。
以下の学習者の診断結果とコース骨格をもとに、その学習者専用の30日タスク配分を生成してください。

【調整ルール】
1. 合計学習時間は診断の「1日の学習時間」を超えない
2. 弱点スコアが低いタスク種別ほど配分を増やす
3. 得意分野は配分を減らして苦手に回す
4. 増減は1タスクあたり最大15分まで
5. 休息日（is_rest_day=true）はadjusted_tasksを空配列にする

以下のJSON形式の配列のみで出力してください（説明文は不要）。配列の要素数はコース骨格と同じ日数にしてください:
[
  {
    "day": 1,
    "adjusted_tasks": [
      {"type": "vocabulary", "minutes": 15}
    ],
    "personalize_reason": "リスニング弱点のため+10分"
  }
]
"""


def build_personalize_messages(learner_profile, personality_profile: dict, course_days: list[dict]) -> list[dict]:
    content = (
        f"【学習者の診断結果】\n"
        f"現在スコア: {learner_profile.current_score}\n"
        f"目標スコア: {learner_profile.target_score}\n"
        f"1日の学習時間: {learner_profile.daily_study_time}\n"
        f"苦手分野: {', '.join(learner_profile.weak_areas or [])}\n\n"
        f"【コース骨格(Layer1)】\n{json.dumps(course_days, ensure_ascii=False, indent=2)}\n\n"
        f"上記の情報で30日分のパーソナライズ配分を生成してください。"
    )
    return [{"role": "user", "content": content}]


def extract_json_array(text: str) -> list:
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
