# クリエイター紹介ページ用：人格プロファイルの口調を反映した自己紹介文の生成プロンプト。
# 1回生成して保存する方式（都度生成はしない）。
import json

def build_self_intro_messages(personality_profile: dict, speciality: str | None, experience: str | None, subject: str = "english") -> list[dict]:
    from app.core.subject_config import get_subject_config
    config = get_subject_config(subject)
    content = (
        f"【人格プロファイル】\n{json.dumps(personality_profile, ensure_ascii=False, indent=2)}\n\n"
        f"【専門分野】{speciality or '特に指定なし'}\n"
        f"【指導実績】{experience or '特に指定なし'}"
    )
    return [
        {"role": "system", "content": config.self_intro_system},
        {"role": "user", "content": content},
    ]


def coaching_tags_from_profile(personality_profile: dict) -> list[str]:
    """人格プロファイルのcoaching_styleから、指導の「スタンス（性格・方針）」を表す説明文を1つ組み立てる
    （追加のLLM呼び出しは不要）。クリエイター紹介ページではskill_tags_from_profileと対で表示する。
    戻り値は要素数1の配列（フロントエンドの型を変えずに済むよう、表示は1項目にまとめている）。
    """
    coaching = (personality_profile or {}).get("coaching_style", {})
    parts = [
        coaching.get("strictness"),
        coaching.get("encouragement"),
        coaching.get("feedback_method"),
    ]
    combined = "。".join(p for p in parts if p)
    return [combined] if combined else []


def skill_tags_from_profile(personality_profile: dict) -> list[str]:
    """人格プロファイルのlearning_philosophy/thinking_styleから、指導の「スキル・特徴」を表す説明文を1つ組み立てる。
    coaching_tags_from_profile（スタンス）と対になる、技術・専門性側の説明（追加のLLM呼び出しは不要）。
    戻り値は要素数1の配列（フロントエンドの型を変えずに済むよう、表示は1項目にまとめている）。
    """
    philosophy = (personality_profile or {}).get("learning_philosophy", {})
    thinking = (personality_profile or {}).get("thinking_style", {})
    parts = [
        philosophy.get("core_value"),
        thinking.get("explanation_method"),
        thinking.get("analogy_tendency"),
    ]
    combined = "。".join(p for p in parts if p)
    return [combined] if combined else []
