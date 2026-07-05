# Layer2: 学習者の診断結果でLayer1骨格のタスク配分を個人化するプロンプト設計。
import json
import re


def build_personalize_messages(
    custom_qa: list[str],
    personality_profile: dict,
    course_days: list[dict],
    textbook_progress_summary: list[str] | None = None,
    subject: str = "english",
) -> list[dict]:
    from app.core.subject_config import get_subject_config
    config = get_subject_config(subject)
    progress_text = "\n".join(textbook_progress_summary) if textbook_progress_summary else "指定なし"
    qa_text = "\n".join(custom_qa) if custom_qa else "（クリエイターが診断質問を設定していないため、回答データはありません）"
    content = (
        f"【学習者の回答（クリエイターが設定した質問への回答）】\n{qa_text}\n\n"
        f"【教材ごとの残りタスク量】\n{progress_text}\n\n"
        f"【コース骨格(Layer1)】\n{json.dumps(course_days, ensure_ascii=False, indent=2)}\n\n"
        f"上記の情報で30日分のパーソナライズ配分を生成してください。"
        f"adjusted_checklist_itemsは自然な日本語で具体的なタスクを書いてください。"
    )
    return [
        {"role": "system", "content": config.personalize_system},
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
