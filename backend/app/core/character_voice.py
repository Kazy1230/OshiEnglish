# キャラクターの口調・性格プロファイル（tone_profile）をLLMプロンプトに
# 組み込むためのヘルパー。AIコンテンツ生成スタジオ（口調変換・プレビュー）・日次チャット・
# 通知メッセージ生成など、キャラクターの声を再現する全箇所で使用する。
#
# JSON（key: value）のまま渡すとAIが「設定を読み上げる」ような硬い口調になりやすいため、
# 「〜にしてください」という指示文の散文で渡す。

_PROSE_TEMPLATES = {
    "first_person": lambda v: f"一人称は「{v}」にしてください。",
    "speech_style": lambda v: f"口調・話し方は次の通りにしてください: {v}",
    "personality": lambda v: f"性格・特徴は次の通りです: {v}",
    "catchphrase": lambda v: f"「{v}」という口癖・決め台詞をよく使ってください。",
    "keywords": lambda v: f"次の口癖・キーワードを自然に使ってください: {v}",
    "example_prefix": lambda v: f"例文を書き出すときのイメージは次の通りです: {v}",
    "ng_expressions": lambda v: f"次の表現は絶対に使わないでください: {v}",
    "conversation_rules": lambda v: f"会話では次のルールを常に守ってください: {v}",
    "background": lambda v: f"背景設定は次の通りです: {v}",
    "reaction_patterns": lambda v: f"感情リアクションの傾向は次の通りです: {v}",
    "reading": lambda v: f"名前の読みは「{v}」です。",
    "gender": lambda v: f"性別は{v}です。",
    "relationship": lambda v: f"学習者との関係性は「{v}」です。",
    "personality_traits": lambda v: f"性格の特徴は次の通りです: {v}",
}

_STRUCTURED_KEYS = {"reaction_examples", "intimacy_variations", "level_tones", "article_style", "article_sample", "speaking_samples"}


def render_tone_profile(tone_profile: dict | None) -> str:
    if not isinstance(tone_profile, dict) or not tone_profile:
        return ""
    lines = []
    for key, template in _PROSE_TEMPLATES.items():
        val = tone_profile.get(key)
        if val in (None, "", []):
            continue
        text = "、".join(val) if isinstance(val, list) else str(val)
        if text.strip():
            lines.append(template(text))
    for key, val in tone_profile.items():
        if key in _PROSE_TEMPLATES or key in _STRUCTURED_KEYS or val in (None, "", []):
            continue
        text = "、".join(val) if isinstance(val, list) else str(val)
        if text.strip():
            lines.append(f"{key}は次の通りにしてください: {text}")
    speaking_samples = tone_profile.get("speaking_samples")
    if isinstance(speaking_samples, list) and speaking_samples:
        samples_text = "\n".join(f"「{s}」" for s in speaking_samples if s)
        lines.append(f"実際にこのキャラクターが話すセリフの例は次の通りです。この口調・雰囲気をそのまま再現してください:\n{samples_text}")
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
