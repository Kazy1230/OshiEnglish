import re

# プロンプトインジェクション対策（13.1）：学習者がシステムプロンプトの操作・漏洩を試みる典型パターンを遮断する
INJECTION_PATTERNS = [
    "以下の指示を無視", "これまでの指示を無視", "システムプロンプト", "instructions above",
    "ignore previous", "ignore all", "プロンプトを教えて", "あなたの設定を", "あなたの指示を",
    "disregard the above", "reveal your prompt",
]


def check_injection(message: str) -> bool:
    lowered = message.lower()
    return any(p.lower() in lowered for p in INJECTION_PATTERNS)


# 解約・クレーム等の機微な相談、または長文の質問はSonnetへエスカレーションする
NEEDS_SONNET_PATTERN = re.compile(
    r"解約|クレーム|苦情|辞めたい|やめたい|返金|サポートに電話|キャンセルしたい|訴え|弁護士",
    re.IGNORECASE,
)


def needs_escalation(question_body: str) -> bool:
    return bool(NEEDS_SONNET_PATTERN.search(question_body)) or len(question_body) > 300


def select_answer_model(message_type: str, question_body: str, haiku_model: str, sonnet_model: str) -> str:
    """モデルルーティング方針（設計書2.5節）に基づき回答生成モデルを選ぶ。

    学習内容の質問・感情系の相談は継続率に直結するためSonnet、
    状況報告・雑談系の定型応答はHaikuで十分（コスト最適化）。
    """
    if message_type == "report" and not needs_escalation(question_body):
        return haiku_model
    return sonnet_model


def build_classify_messages(question_body: str, existing_category_names: list[str], subject: str = "english") -> list[dict]:
    from app.core.subject_config import get_subject_config
    config = get_subject_config(subject)
    classify_system = config.classify_system
    categories_text = "、".join(existing_category_names) if existing_category_names else "（まだ登録されていません）"
    return [
        {"role": "system", "content": classify_system},
        {
            "role": "user",
            "content": f"既存カテゴリ一覧: {categories_text}\n\n質問:\n{question_body}",
        },
    ]


def build_answer_system(personality_profile: dict, message_type: str, tone_profile: dict | None = None, subject: str = "english") -> list[dict]:
    """人格プロファイル部分（同じコースの全チャットで不変）とメッセージ種別ごとの回答スタイル（可変）を
    別々のcontent blockに分け、人格プロファイル側にcache_controlを付けてPrompt Cachingを有効化する
    （詳細設計書2.5節：システムプロンプトのキャッシュでAPIコストを削減）。
    tone_profileはCharacterのtone_profile（first_person/speech_style/personality/catchphrase/ng_expressions）。
    personality_profileが空でもtone_profileから人格を組み立てられるようにする。"""
    from app.core.subject_config import get_subject_config
    config = get_subject_config(subject)
    answer_style_by_type = config.answer_style_by_type
    comm = personality_profile.get("communication", {})
    coaching = personality_profile.get("coaching_style", {})
    tp = tone_profile or {}
    style = answer_style_by_type.get(message_type, answer_style_by_type.get("content", ""))

    # tone_profileから補完（personality_profileが空の場合のフォールバック）
    first_person = comm.get("first_person") or tp.get("first_person", "")
    tone_text = comm.get("tone") or tp.get("speech_style", "")
    sentence_ending = comm.get("sentence_ending") or ""
    strictness = coaching.get("strictness", "")
    encouragement = coaching.get("encouragement", "")
    personality_text = tp.get("personality", "")
    catchphrase = tp.get("catchphrase", "")
    ng_expressions = tp.get("ng_expressions") or []

    background = tp.get("background", "")
    reaction_patterns = tp.get("reaction_patterns", "")
    speaking_samples = tp.get("speaking_samples") or []

    personality_lines = []
    if first_person:
        personality_lines.append(f"- 一人称: 「{first_person}」")
    if tone_text:
        personality_lines.append(f"- 口調・話し方: {tone_text}")
    if sentence_ending:
        personality_lines.append(f"- 文末の癖: {sentence_ending}")
    if personality_text:
        personality_lines.append(f"- 性格・特徴: {personality_text}")
    if catchphrase:
        personality_lines.append(f"- 口癖: {catchphrase}")
    if background:
        personality_lines.append(f"- 背景設定: {background}")
    if reaction_patterns:
        personality_lines.append(f"- 感情リアクション: {reaction_patterns}")
    if strictness:
        personality_lines.append(f"- 指導の厳しさ: {strictness}")
    if encouragement:
        personality_lines.append(f"- 励まし方: {encouragement}")
    if ng_expressions:
        personality_lines.append(f"- 使ってはいけない表現: {', '.join(ng_expressions)}")

    personality_block = "\n".join(personality_lines) if personality_lines else "（人格設定なし）"

    samples_block = ""
    if speaking_samples:
        samples_list = "\n".join(f'  「{s}」' for s in speaking_samples if s)
        samples_block = f"\n【このキャラクターの実際のセリフ例（この口調・雰囲気で返答すること）】\n{samples_list}"

    preamble = f"""あなたは学習コーチです。以下の人格でチャットしています。
学習者と友人のように自然に会話し、絶対に一貫した人格・口調を保ってください。
返答は短くテンポよく。前後の文脈を踏まえて会話を続けてください。

【人格設定】
{personality_block}
{samples_block}"""
    suffix = f"""【今回の回答スタイル】
{style}

回答は3〜5文程度の自然なチャットメッセージとして書いてください。前置きや説明は不要です。
"""
    return [
        {"type": "text", "text": preamble, "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": suffix},
    ]


def _format_summaries(summaries: list[str]) -> str:
    if not summaries:
        return "（まだ記録がありません）"
    return "\n".join(s or "（不明）" for s in summaries)


def build_answer_messages(
    question_body: str,
    linked_content_title: str | None,
    linked_content_url: str | None,
    today_tasks: list[dict] | None = None,
    recent_summaries: list[str] | None = None,
    conversation_history: list[dict] | None = None,
) -> list[dict]:
    content_note = ""
    if linked_content_title and linked_content_url:
        content_note = (
            f"\n\n参考: このカテゴリには既に紐付けられたコンテンツがあります。"
            f"必ず自然な形で紹介に含めてください → 「{linked_content_title}」({linked_content_url})"
        )
    context_note = ""
    if today_tasks:
        context_note += f"\n\n【今日のタスク】\n{today_tasks}"
    if recent_summaries:
        context_note += f"\n\n【直近3日間のサマリー】\n{_format_summaries(recent_summaries)}"
    messages: list[dict] = list(conversation_history) if conversation_history else []
    messages.append({"role": "user", "content": f"{question_body}{content_note}{context_note}"})
    return messages


def build_today_message_system(personality_profile: dict, message_kind: str) -> str:
    """Layer3: 朝/夜の声かけメッセージ生成用システムプロンプト。message_kindは'morning'/'evening'。"""
    comm = personality_profile.get("communication", {})
    coaching = personality_profile.get("coaching_style", {})
    kind_label = "朝の声かけ" if message_kind == "morning" else "夜のリマインド"
    return f"""あなたは学習コーチとして、以下の人格で学習者に{kind_label}メッセージを送ってください。

【人格設定】
- 口調: {comm.get('tone', '')}（一人称「{comm.get('first_person', '')}」、文末「{comm.get('sentence_ending', '')}」）
- 指導の厳しさ: {coaching.get('strictness', '')}
- 励まし方: {coaching.get('encouragement', '')}

直近の学習状況を踏まえて、今日の{kind_label}メッセージを生成してください。
200文字以内。人格プロファイルの口調を必ず守ること。説明文や前置きは不要です。"""


def build_today_message_user(day_number: int, today_tasks: list[dict], recent_summaries: list[str]) -> list[dict]:
    content = (
        f"今日はDay {day_number}です。\n\n"
        f"【今日のタスク】\n{today_tasks}\n\n"
        f"【直近3日間のサマリー】\n{_format_summaries(recent_summaries)}\n\n"
        f"上記の文脈を踏まえ、今日のメッセージを生成してください。"
    )
    return [{"role": "user", "content": content}]


def build_reminder_message_system(personality_profile: dict, tier: int) -> str:
    """改善提案書5節: 3段階リマインドメール。tierは未開封日数に応じた1/2/3のトーン段階。"""
    comm = personality_profile.get("communication", {})
    coaching = personality_profile.get("coaching_style", {})
    tone_instruction = {
        1: "通常の声かけ。今日のタスクを確認しようと軽く促す。",
        2: "促進トーン。昨日できなかった分を一緒に取り戻そうと前向きに励ます。",
        3: "感情に寄り添うトーン。プレッシャーをかけず「少しだけでもいいから開いてみて」という温かい呼びかけにする。",
    }[tier]
    return f"""あなたは学習コーチとして、以下の人格で学習者にリマインドメッセージを送ってください。

【人格設定】
- 口調: {comm.get('tone', '')}（一人称「{comm.get('first_person', '')}」、文末「{comm.get('sentence_ending', '')}」）
- 励まし方: {coaching.get('encouragement', '')}

【今回のトーン】{tone_instruction}
100文字以内。人格プロファイルの口調を必ず守ること。説明文や前置きは不要です。"""


def build_reminder_message_user(days_inactive: int) -> list[dict]:
    return [{"role": "user", "content": f"学習者は{days_inactive}日間チャットを開いていません。リマインドメッセージを生成してください。"}]


def build_reengagement_message_system(tone_profile: dict, character_name: str) -> str:
    """好奇心ベースの呼び戻しメッセージ。罪悪感ではなく「続きが気になる」感覚を引き出す。"""
    first_person = tone_profile.get("first_person", "私")
    speech_style = tone_profile.get("speech_style", "")
    personality = tone_profile.get("personality", "")
    catchphrase = tone_profile.get("catchphrase", "")
    return f"""あなたは「{character_name}」というキャラクターです。学習者に"続きが気になる"という好奇心ベースのメッセージを送ってください。

【キャラクター設定】
- 一人称: {first_person}
- 話し方: {speech_style}
- 性格: {personality}
- 口癖: {catchphrase}

【重要なルール】
- 「何日間やっていない」「サボった」などの罪悪感を煽る表現は絶対に使わない
- 「続きを話したかった」「気になってた」など、キャラクターが学習者を待っていた・気にかけていたニュアンスで書く
- 最後に話していた内容への好奇心や「もっと聞かせて」感を出す
- 80文字以内。キャラクターの口調を必ず守る。説明文や前置きは不要。"""


def build_reengagement_message_user(last_summary: str | None, days_inactive: int) -> list[dict]:
    if last_summary:
        content = f"最後の会話の要約: 「{last_summary}」\n{days_inactive}日ぶりに学習者が戻ってきます。続きへの好奇心を引き出すメッセージを生成してください。"
    else:
        content = f"{days_inactive}日ぶりに学習者が戻ってきます。また話したかったというキャラクターらしいメッセージを生成してください。"
    return [{"role": "user", "content": content}]


DAILY_SUMMARY_SYSTEM = """以下の会話を3文以内・100トークン以内に圧縮してください。
含めるべき情報:
- 学習者が完了したタスク
- 学習者が述べた困りごと・感想
- 感情的な状態(モチベーション高/低/普通)
日本語で出力してください。説明文や前置きは不要です。"""


def build_daily_summary_messages(chat_log_text: str) -> list[dict]:
    return [{"role": "user", "content": f"【今日の会話ログ】\n{chat_log_text}"}]


# 学習者がこれらの語句を送った場合、当日の会話を圧縮してdaily_summariesに保存するトリガーとする
DAILY_CLOSE_SIGNALS = ["おやすみ", "今日終わり", "今日はおわり", "完了です", "今日完了"]


def is_daily_close_signal(message: str) -> bool:
    return any(s in message for s in DAILY_CLOSE_SIGNALS)
