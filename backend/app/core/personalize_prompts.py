# Layer2: 学習者の診断結果でLayer1骨格のタスク配分を個人化するプロンプト設計。
import json
import re


PERSONALIZE_SYSTEM = """あなたは英語学習の個別コーチです。
以下の学習者の回答（クリエイターが設定した診断質問への回答）とコース骨格をもとに、その学習者専用の30日タスク配分を生成してください。

【調整ルール】
1. 回答内に1日の学習時間や弱点分野の言及があれば、それを優先的に反映する（言及がなければコース骨格の標準時間を使う）
2. 苦手・弱点として言及された分野のタスク種別は配分を増やす
3. 得意・既習として言及された分野は配分を減らして苦手に回す
4. 増減は1タスクあたり最大15分まで
5. 休息日（is_rest_day=true）はadjusted_tasksを空配列にする
6. 「教材ごとの残りタスク量」が指定されている場合、すでに進んでいる教材のタスクは減らし、
   残りが多い教材のタスクを優先的に増やす（既にやり終えた範囲を重複して課さない）

必ず以下のJSON形式のオブジェクトのみで出力してください（説明文・前置き・コードフェンスは一切不要）。
"days"配列の要素数はコース骨格と同じ日数にしてください:
{
  "days": [
    {
      "day": 1,
      "adjusted_tasks": [
        {"type": "vocabulary", "minutes": 15}
      ],
      "personalize_reason": "リスニング弱点のため+10分"
    }
  ]
}
"""


def build_personalize_messages(
    custom_qa: list[str],
    personality_profile: dict,
    course_days: list[dict],
    textbook_progress_summary: list[str] | None = None,
) -> list[dict]:
    progress_text = "\n".join(textbook_progress_summary) if textbook_progress_summary else "指定なし"
    qa_text = "\n".join(custom_qa) if custom_qa else "（クリエイターが診断質問を設定していないため、回答データはありません）"
    content = (
        f"【学習者の回答（クリエイターが設定した質問への回答）】\n{qa_text}\n\n"
        f"【教材ごとの残りタスク量】\n{progress_text}\n\n"
        f"【コース骨格(Layer1)】\n{json.dumps(course_days, ensure_ascii=False, indent=2)}\n\n"
        f"上記の情報で30日分のパーソナライズ配分を生成してください。"
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
