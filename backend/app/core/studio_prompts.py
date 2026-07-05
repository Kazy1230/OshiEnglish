# AIコンテンツ生成スタジオ（二段階生成エンジン）のプロンプト構築ヘルパー。
# 詳細設計書 Section 3.2 のプロンプト設計に準拠する。

def build_character_concept_messages(character_concept: str, subject: str = "english") -> list[dict]:
    from app.core.subject_config import get_subject_config
    config = get_subject_config(subject)
    return [
        {"role": "system", "content": config.character_concept_system},
        {"role": "user", "content": f"キャラクターのイメージ: {character_concept}"},
    ]


def build_tone_profile_messages(name: str, description: str, tone_profile: dict, subject: str = "english") -> list[dict]:
    from app.core.character_voice import render_tone_profile
    from app.core.subject_config import get_subject_config
    config = get_subject_config(subject)

    lines = [f"名前: {name}"]
    if description.strip():
        lines.append(f"説明: {description}")
    tone_block = render_tone_profile(tone_profile)
    if tone_block:
        lines.append(f"既存の口調設定:\n{tone_block}")
    return [
        {"role": "system", "content": config.tone_profile_system},
        {"role": "user", "content": "\n".join(lines)},
    ]


CONSULT_SYSTEM = """あなたは英語教育コンテンツの企画アドバイザーです。
講師が入力したテーマをもとに、英語学習者向けコンテンツの企画案を提案してください。
以下のJSON形式のみで返答してください。

{
  "titles": ["タイトル案1", "タイトル案2", "タイトル案3"],
  "structure": ["セクション1", "セクション2", "セクション3"],
  "target_level": "初級 | 中級 | 上級",
  "target_audience": "想定学習者の説明"
}"""


def build_consult_messages(theme: str) -> list[dict]:
    return [{"role": "user", "content": f"テーマ: {theme}"}]


# ── 新スタジオ: アイデア提案 ─────────────────────────────────────

_IDEAS_SYSTEM_TEMPLATE = """あなたは{subject_label}コンテンツの企画・ネタ提案専門家です。
クリエイターの口調・人格プロファイルと選択したコンテンツフォーマットをもとに、
今すぐ作れる{subject_label}ネタを6個提案してください。

条件:
- {subject_label}を学ぶ人が「これ悩んでた」「これ知りたかった」と感じる具体的テーマ
- クリエイターの個性・強みが自然に出る切り口
- 指定フォーマットの尺・文字数で完結できるスコープ

JSON形式のみで返してください:
{{"ideas": [{{"title": "ネタタイトル（20文字以内）", "hook": "冒頭の掴み文（40文字以内）", "why": "なぜ刺さるか（25文字以内）"}}]}}"""

_SUBJECT_LABELS = {
    "english": "英語学習",
    "it": "IT・プログラミング学習",
    "music": "音楽学習",
    "japanese": "日本語学習",
}


def build_ideas_system(subject: str = "english") -> str:
    label = _SUBJECT_LABELS.get(subject, f"{subject}学習")
    return _IDEAS_SYSTEM_TEMPLATE.format(subject_label=label)


def build_ideas_messages(format_label: str, format_constraint: str, tone_block: str) -> list[dict]:
    content = (
        f"コンテンツフォーマット: {format_label}\n"
        f"制約: {format_constraint}\n\n"
        f"クリエイターの口調・人格:\n{tone_block}"
    )
    return [{"role": "user", "content": content}]


# ── 新スタジオ: 切り口提案 ───────────────────────────────────────

ANGLES_SYSTEM = """選んだネタに対して、3つの異なる「切り口（角度）」を提案してください。
同じテーマでも、誰に向けるか・どんな感情を引き出すか・どこから入るかで全く別のコンテンツになります。

JSON形式のみで返してください:
{"angles": [{"label": "切り口ラベル（15文字以内）", "hook": "この切り口での冒頭フック文（50文字以内）", "why": "なぜ効くか（25文字以内）"}]}"""


def build_angles_messages(idea_title: str, idea_hook: str, format_label: str) -> list[dict]:
    return [{"role": "user", "content": f"ネタ: {idea_title}\n初期フック: {idea_hook}\nフォーマット: {format_label}"}]


# ── 新スタジオ: フォーマット別コンテンツ生成 ─────────────────────

_FORMAT_CONSTRAINTS: dict[str, str] = {
    "x": "140文字以内（厳守）。改行は1〜2回。ハッシュタグは入れない。",
    "threads": "500文字程度。段落分けして読みやすく。",
    "instagram_post": "1000〜1500文字。ハッシュタグは末尾に5〜8個。絵文字を適度に使用。",
    "instagram_reel": "話し言葉で{duration}秒分。冒頭3秒でフック→本題→まとめの構成。",
    "youtube_short": "話し言葉で{duration}秒以内。冒頭で結論から入る→理由→まとめ。",
    "youtube": "{duration}分の動画台本。イントロ（30秒）→本編→まとめ→CTA構成。",
}

FORMAT_LABELS: dict[str, str] = {
    "x": "X（ツイート）",
    "threads": "Threads",
    "instagram_post": "インスタ投稿",
    "instagram_reel": "インスタReels",
    "youtube_short": "YouTubeショート",
    "youtube": "YouTube動画",
}


def get_format_constraint(format_key: str, duration_sec: int | None, char_limit: int | None) -> str:
    template = _FORMAT_CONSTRAINTS.get(format_key, "")
    if "{duration}" in template:
        if format_key == "youtube":
            val = f"{(duration_sec or 480) // 60}"
        else:
            val = str(duration_sec or 60)
        return template.replace("{duration}", val)
    if char_limit:
        template = template.replace("140", str(char_limit)).replace("500", str(char_limit)).replace("1000〜1500", f"{char_limit}")
    return template


_SUBJECT_EXPERT_LABELS = {
    "english": "英語教育",
    "it": "IT・プログラミング教育",
    "music": "音楽教育",
    "japanese": "日本語教育",
}


def build_format_content_system(format_key: str, duration_sec: int | None, char_limit: int | None, subject: str = "english") -> str:
    constraint = get_format_constraint(format_key, duration_sec, char_limit)
    expert_label = _SUBJECT_EXPERT_LABELS.get(subject, "学習")
    return (
        f"あなたは{expert_label}の専門家です。口調・キャラクター性は一切加えず、"
        f"事実と解説のみをプレーンな文章で書いてください。\n\n"
        f"出力フォーマット: {FORMAT_LABELS.get(format_key, format_key)}\n"
        f"制約: {constraint}"
    )


RAW_CONTENT_SYSTEM = """あなたは英語教育の専門家です。
与えられたテーマと構成に従い、正確でわかりやすい英語学習教材を作成してください。
口調・キャラクター性は一切加えず、事実と解説のみをプレーンな文章で書いてください。"""


def build_raw_content_messages(theme: str, structure: list[str], target_level: str | None) -> list[dict]:
    lines = [f"テーマ: {theme}", f"構成: {'、'.join(structure)}"]
    if target_level:
        lines.append(f"対象レベル: {target_level}")
    return [{"role": "user", "content": "\n".join(lines)}]


VOICED_CONTENT_SYSTEM_TEMPLATE = """あなたはキャラクターの口調変換専門家です。
以下のキャラクター設定に厳密に従い、入力されたテキストをそのキャラクターが話すように書き直してください。
内容・情報の正確性は必ず保持してください。変えるのは口調・表現のみです。

【キャラクター設定】
名前: {name}
{tone_block}"""


def build_voiced_content_system(character) -> str:
    from app.core.character_voice import render_tone_profile

    tone_block = render_tone_profile(character.tone_profile) or "(口調設定は未登録)"
    return VOICED_CONTENT_SYSTEM_TEMPLATE.format(name=character.name, tone_block=tone_block)


def build_voiced_content_messages(raw_content: str) -> list[dict]:
    return [{"role": "user", "content": f"以下のテキストを上記キャラクターの口調に変換してください:\n\n{raw_content}"}]


SCRIPT_SYSTEM = """あなたはYouTube動画の台本作成専門家です。
与えられたコンテンツをYouTube動画用の台本形式に変換してください。
以下の構成で出力してください:

【イントロ】(視聴者への挨拶、動画の内容紹介、30秒程度)
【本編】(コンテンツの内容をそのまま台本化)
【アウトロ】(まとめ、チャンネル登録・いいねへの誘導、20秒程度)

キャラクターの口調は維持してください。"""


def build_script_messages(voiced_content: str) -> list[dict]:
    return [{"role": "user", "content": voiced_content}]


PREVIEW_SYSTEM_TEMPLATE = """あなたはキャラクターの口調変換専門家です。
以下のキャラクター設定に厳密に従い、入力された短いテキストをそのキャラクターが話すように書き直してください。
内容・情報の正確性は保持しつつ、口調・表現のみを変換してください。出力は変換後の文章のみとし、前置きや説明は不要です。

【キャラクター設定】
名前: {name}
{tone_block}"""


def build_preview_system(character) -> str:
    from app.core.character_voice import render_tone_profile

    tone_block = render_tone_profile(character.tone_profile) or "(口調設定は未登録)"
    return PREVIEW_SYSTEM_TEMPLATE.format(name=character.name, tone_block=tone_block)


def build_preview_messages(sample_text: str) -> list[dict]:
    return [{"role": "user", "content": sample_text}]
