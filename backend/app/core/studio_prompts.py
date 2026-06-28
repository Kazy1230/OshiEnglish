# AIコンテンツ生成スタジオ（二段階生成エンジン）のプロンプト構築ヘルパー。
# 詳細設計書 Section 3.2 のプロンプト設計に準拠する。

CHARACTER_CONCEPT_SYSTEM = """あなたはアニメ・ライトノベル風キャラクターの設定デザイナーです。
ユーザーが入力したキャラクターのイメージをもとに、英語学習コンテンツに使用するキャラクター設定を提案してください。
著作権で保護された既存キャラクターをそのまま模倣することなく、オリジナルのキャラクター設定を作成してください。
以下のJSON形式のみで返答してください。

{
  "name_suggestions": ["名前案1", "名前案2", "名前案3"],
  "first_person": "一人称(例: 私、僕、俺、あたし)",
  "tone": "口調の説明(例: 少し上から目線だが丁寧。敬語は使わない)",
  "personality": "性格の説明(例: ツンデレ。本当は親切だが素直に表現できない)",
  "sentence_ending": "語尾の特徴(例: 〜でしょ、〜じゃない、〜だけど？)",
  "catchphrase": "口癖(例: 「別に教えてあげてもいいけど」「感謝しなさいよ」)",
  "ng_words": ["使ってはいけない表現1", "使ってはいけない表現2"],
  "sample_lines": ["サンプルセリフ1", "サンプルセリフ2", "サンプルセリフ3"]
}"""


def build_character_concept_messages(character_concept: str) -> list[dict]:
    return [{"role": "user", "content": f"キャラクターのイメージ: {character_concept}"}]


TONE_PROFILE_SYSTEM = """あなたはアニメ・ライトノベル風キャラクターの設定デザイナーです。
すでに名前や説明が決まっているキャラクターについて、英語学習コンテンツで使う口調設定を提案してください。
既に決まっている項目があれば、その内容と矛盾しないように残りの項目を補ってください。
以下のJSON形式のみで返答してください。

{
  "first_person": "一人称(例: 私、僕、俺、あたし)",
  "tone": "口調の説明(例: 少し上から目線だが丁寧。敬語は使わない)",
  "personality": "性格の説明(例: ツンデレ。本当は親切だが素直に表現できない)",
  "sentence_ending": "語尾の特徴(例: 〜でしょ、〜じゃない、〜だけど？)",
  "catchphrase": "口癖(例: 「別に教えてあげてもいいけど」「感謝しなさいよ」)",
  "ng_words": ["使ってはいけない表現1", "使ってはいけない表現2"]
}"""


def build_tone_profile_messages(name: str, description: str, tone_profile: dict) -> list[dict]:
    from app.core.character_voice import render_tone_profile

    lines = [f"名前: {name}"]
    if description.strip():
        lines.append(f"説明: {description}")
    tone_block = render_tone_profile(tone_profile)
    if tone_block:
        lines.append(f"既存の口調設定:\n{tone_block}")
    return [{"role": "user", "content": "\n".join(lines)}]


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
