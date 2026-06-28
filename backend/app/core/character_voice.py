# キャラクターの口調・性格プロファイル（tone_profile）をLLMプロンプトに
# 組み込むためのヘルパー。AIコンテンツ生成スタジオ（口調変換・プレビュー）で使用する。

_TONE_LABELS = {
    "speech_style": "口調・話し方",
    "first_person": "一人称",
    "catchphrase": "口癖・文末の癖",
    "keywords": "口癖・キーワード",
    "personality": "性格・特徴",
    "example_prefix": "例文の書き出しイメージ",
    "ng_expressions": "避けるべき表現（NG表現）",
    "conversation_rules": "会話の基本ルール（常に守ること）",
}

_STRUCTURED_KEYS = {"reaction_examples", "intimacy_variations", "level_tones", "article_style", "article_sample"}


def render_tone_profile(tone_profile: dict | None) -> str:
    if not isinstance(tone_profile, dict) or not tone_profile:
        return ""
    lines = []
    for key, label in _TONE_LABELS.items():
        val = tone_profile.get(key)
        if val in (None, "", []):
            continue
        text = "、".join(val) if isinstance(val, list) else str(val)
        if text.strip():
            lines.append(f"■ {label}: {text}")
    for key, val in tone_profile.items():
        if key in _TONE_LABELS or key in _STRUCTURED_KEYS or val in (None, "", []):
            continue
        text = "、".join(val) if isinstance(val, list) else str(val)
        if text.strip():
            lines.append(f"■ {key}: {text}")
    return "\n".join(lines)


def customer_display_name(customer) -> str:
    """ユーザーの表示名を返す（customers.usernameはログインIDのため、表示用の別名は未導入）。

    usernameにメールアドレスが使われているアカウントが存在するため、画面に表示してよい名前として
    そのまま返さない。メールアドレス形式の場合は@より前の部分のみを返し、フルアドレスの漏出を防ぐ。
    """
    username = customer.username
    if "@" in username:
        return username.split("@", 1)[0]
    return username
