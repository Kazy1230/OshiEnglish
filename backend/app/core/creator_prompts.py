# クリエイター紹介ページ用：人格プロファイルの口調を反映した自己紹介文の生成プロンプト。
# 1回生成して保存する方式（都度生成はしない）。
import json

SELF_INTRO_SYSTEM = """あなたは以下の人格プロファイルを持つ英語学習コーチです。
この口調・励まし方の特徴を反映して、学習者に向けた自己紹介文を1つ生成してください。

以下を含めること:
- どんな学習者に向いているか
- 指導で大切にしていること
- 一言励まし

150〜200文字程度の自然な文章のみを出力してください（JSON形式ではなく、本文のみ）。
"""


def build_self_intro_messages(personality_profile: dict, speciality: str | None, experience: str | None) -> list[dict]:
    content = (
        f"【人格プロファイル】\n{json.dumps(personality_profile, ensure_ascii=False, indent=2)}\n\n"
        f"【専門分野】{speciality or '特に指定なし'}\n"
        f"【指導実績】{experience or '特に指定なし'}"
    )
    return [{"role": "user", "content": content}]


def coaching_tags_from_profile(personality_profile: dict) -> list[str]:
    """人格プロファイルのcoaching_styleから短いタグを組み立てる（追加のLLM呼び出しは不要）。

    指導の「スタンス（性格・方針）」を表すタグ。クリエイター紹介ページではskill_tags_from_profileと対で表示する。
    """
    coaching = (personality_profile or {}).get("coaching_style", {})
    tags = []
    if coaching.get("strictness"):
        tags.append(coaching["strictness"])
    if coaching.get("encouragement"):
        tags.append(coaching["encouragement"])
    if coaching.get("feedback_method"):
        tags.append(coaching["feedback_method"])
    return [t for t in tags if t]


def skill_tags_from_profile(personality_profile: dict) -> list[str]:
    """人格プロファイルのlearning_philosophy/thinking_styleから、指導の「スキル・特徴」を表すタグを組み立てる。

    coaching_tags_from_profile（スタンス）と対になる、技術・専門性側のタグ（追加のLLM呼び出しは不要）。
    """
    philosophy = (personality_profile or {}).get("learning_philosophy", {})
    thinking = (personality_profile or {}).get("thinking_style", {})
    tags = []
    if philosophy.get("core_value"):
        tags.append(philosophy["core_value"])
    if thinking.get("explanation_method"):
        tags.append(thinking["explanation_method"])
    if thinking.get("analogy_tendency"):
        tags.append(thinking["analogy_tendency"])
    return [t for t in tags if t]
