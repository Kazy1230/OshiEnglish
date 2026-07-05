# コース品質チェック（セルフレビュー機能）：ゴール×学習時間の整合性をAIに判定させるプロンプト設計。
# 数値の妥当性（例:「1日30分でTOEIC800点」が現実的か）は正規表現等のヒューリスティックでは
# 判定が難しいため、この1項目のみAI判定とする。他の3項目は機械的にチェックする（quality_check.py）。
import json
import re

def build_goal_fit_messages(goal: str, target_learner: str, intensity: str, pace: str | None, subject: str = "english") -> list[dict]:
    from app.core.subject_config import get_subject_config
    config = get_subject_config(subject)
    content = (
        f"ゴール: {goal}\n"
        f"対象者: {target_learner}\n"
        f"1日の学習時間: {intensity}\n"
        f"進行速度: {pace or '標準'}\n\n"
        f"上記の整合性を判定してください。"
    )
    return [
        {"role": "system", "content": config.quality_check_system},
        {"role": "user", "content": content},
    ]


def extract_goal_fit_result(text: str) -> dict:
    from app.core.llm import LLMError

    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.MULTILINE).strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise LLMError(f"AIの応答をJSONとして解析できませんでした: {e}") from e
    score = parsed.get("score")
    if not isinstance(score, (int, float)):
        raise LLMError("AIの応答にscoreが含まれていません")
    return {"score": max(0, min(20, round(score))), "feedback": parsed.get("feedback", "")}
