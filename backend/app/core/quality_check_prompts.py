# コース品質チェック（セルフレビュー機能）：ゴール×学習時間の整合性をAIに判定させるプロンプト設計。
# 数値の妥当性（例:「1日30分でTOEIC800点」が現実的か）は正規表現等のヒューリスティックでは
# 判定が難しいため、この1項目のみAI判定とする。他の3項目は機械的にチェックする（quality_check.py）。
import json
import re

GOAL_FIT_SYSTEM = """あなたは英語学習コースの設計アドバイザーです。
クリエイターが設定したコースのゴール・対象者・1日の学習時間・進行速度を見て、
そのペースでゴールに到達するのが現実的かどうかを判定してください。

【判定基準】
- 学習時間に対してゴールが過大（例: 1日15分でTOEIC800点等）な場合は低い点数にする
- 逆に学習時間に対してゴールが控えめすぎる場合も、もったいない旨を軽く指摘してよい（ただし減点は小さく）
- 妥当な場合は満点に近い点数にする

必ず以下のJSON形式のオブジェクトのみで出力してください（説明文・前置き・コードフェンスは一切不要）:
{
  "score": 0から20の整数,
  "feedback": "学習者・クリエイター向けの改善提案コメント（1〜2文、具体的な数値の代替案を含める）"
}
"""


def build_goal_fit_messages(goal: str, target_learner: str, intensity: str, pace: str | None) -> list[dict]:
    content = (
        f"ゴール: {goal}\n"
        f"対象者: {target_learner}\n"
        f"1日の学習時間: {intensity}\n"
        f"進行速度: {pace or '標準'}\n\n"
        f"上記の整合性を判定してください。"
    )
    return [{"role": "user", "content": content}]


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
