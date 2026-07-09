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

# AIのJSON応答がプロンプトの指示（文字列を期待している）通りに返らず、ネストしたdict/listで
# 返ってくることがあるフィールド。フロントのcontrolled inputにそのまま渡すと「[object Object]」
# と表示されるため、保存前・表示前に必ずこの関数を通して文字列へ矯正する。
_LIST_FIELDS = {"ng_expressions", "ng_words", "speaking_samples", "keywords", "sample_lines", "name_suggestions"}


def _flatten_to_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "、".join(_flatten_to_text(v) for v in value if v not in (None, ""))
    if isinstance(value, dict):
        return "。".join(_flatten_to_text(v) for v in value.values() if v not in (None, "", []))
    return str(value)


def sanitize_tone_profile_fields(data: dict | None) -> dict:
    """tone_profile系のAI応答・保存データを、表示・保存に安全な型に矯正する。
    speaking_samples/ng_expressions等の一覧フィールドは文字列のリストに、
    それ以外（reaction_patterns/background等）はネストしていても1本の文字列に変換する。"""
    if not isinstance(data, dict):
        return {}
    sanitized: dict = {}
    for key, value in data.items():
        if key in _LIST_FIELDS:
            if isinstance(value, list):
                sanitized[key] = [_flatten_to_text(v) for v in value if v not in (None, "")]
            elif value:
                sanitized[key] = [_flatten_to_text(value)]
            else:
                sanitized[key] = []
        elif isinstance(value, (dict, list)):
            sanitized[key] = _flatten_to_text(value)
        else:
            sanitized[key] = value
    return sanitized


def render_tone_profile(tone_profile: dict | None) -> str:
    if not isinstance(tone_profile, dict) or not tone_profile:
        return ""
    lines = []
    for key, template in _PROSE_TEMPLATES.items():
        val = tone_profile.get(key)
        if val in (None, "", []):
            continue
        text = _flatten_to_text(val)
        if text.strip():
            lines.append(template(text))
    for key, val in tone_profile.items():
        if key in _PROSE_TEMPLATES or key in _STRUCTURED_KEYS or val in (None, "", []):
            continue
        text = _flatten_to_text(val)
        if text.strip():
            lines.append(f"{key}は次の通りにしてください: {text}")
    speaking_samples = tone_profile.get("speaking_samples")
    if isinstance(speaking_samples, list) and speaking_samples:
        samples_text = "\n".join(f"「{_flatten_to_text(s)}」" for s in speaking_samples if s)
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
