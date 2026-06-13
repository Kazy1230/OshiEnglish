# DM返信の下書き生成のため、キャラクターの口調・性格・背景をシステムプロンプトに
# 組み込むためのヘルパー。フロントエンド（admin/lib/promptBuilders.ts）の
# renderToneProfile / buildIntimacyBlock と同様の考え方を、DM返信用に簡略化したもの。

_TONE_LABELS = {
    "speech_style": "口調・話し方",
    "keywords": "口癖・キーワード",
    "personality": "性格・特徴",
    "example_prefix": "例文の書き出しイメージ",
}


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
        if key in _TONE_LABELS or val in (None, "", []):
            continue
        text = "、".join(val) if isinstance(val, list) else str(val)
        if text.strip():
            lines.append(f"■ {key}: {text}")
    return "\n".join(lines)


def render_level_tone(tone_profile: dict | None, level: int) -> str:
    """tone_profile.level_tones（親密度レベル別の口調・態度の変化）から、
    現在のレベルに対応する指示文を取り出す。

    tone_profile例: {"level_tones": {"1": "よそよそしい敬語...", "2": "...", ...}}
    レベル0（会話なし）または該当レベルの記述が無い場合は空文字を返す。
    """
    if not isinstance(tone_profile, dict) or not tone_profile:
        return ""
    level_tones = tone_profile.get("level_tones")
    if not isinstance(level_tones, dict):
        return ""
    text = level_tones.get(str(level))
    if not text or not str(text).strip():
        return ""
    return str(text).strip()


def build_dm_reply_system_prompt(character, customer, intimacy: dict) -> str:
    """指定キャラクター・生徒に対するDM返信下書き生成用のシステムプロンプトを組み立てる。"""
    mem = customer.character_memory or {}
    favorites = mem.get("favorites") or []
    episodes = mem.get("episodes") or []
    birthday = mem.get("birthday")
    admin_memo = (customer.admin_memo or "").strip()

    tone_block = render_tone_profile(character.tone_profile if character else None)

    lines = [
        f"あなたは英語学習サービスのキャラクター「{character.name if character else 'キャラクター'}」になりきって、"
        "生徒とのDM（チャット）に返信する運営者をサポートするアシスタントです。",
        "以下の設定・会話履歴を踏まえ、このキャラクターらしい返信の「下書き」を1案だけ作成してください。",
        "",
        "==================================================",
        "【キャラクター設定】",
        "==================================================",
        f"■ 名前: {character.name if character else ''}",
        f"■ 説明: {character.description or '' if character else ''}",
    ]
    if tone_block:
        lines.append(tone_block)

    lines += [
        "",
        "==================================================",
        "【相手の生徒について】",
        "==================================================",
        f"■ 名前: {customer.username}",
        f"■ 関係性の段階: Lv.{intimacy['level']}（{intimacy['stage_label']}） — {intimacy['stage_hint']}",
    ]
    level_tone = render_level_tone(character.tone_profile if character else None, intimacy["level"])
    if level_tone:
        lines.append(f"■ この親密度レベルでの口調・態度: {level_tone}")
    if birthday:
        lines.append(f"■ 誕生日: {birthday}")
    if favorites:
        lines.append(f"■ 好きなもの: {'、'.join(favorites)}")
    if episodes:
        lines.append(f"■ これまでのエピソード: {' / '.join(episodes)}")
    if admin_memo:
        lines.append(f"■ 運営からの引き継ぎメモ（重要・必ず踏まえること）: {admin_memo}")

    lines += [
        "",
        "==================================================",
        "【出力形式】",
        "==================================================",
        "・実際にDMとしてそのまま送信できる本文のみを出力してください。",
        "・前置き、説明、見出し、引用符（「」など）は不要です。",
        "・関係性の段階に合った呼び方・距離感の口調にしてください。",
        "・直近の会話の流れに自然につながる、1〜3文程度の短い返信にしてください。",
    ]
    return "\n".join(lines)


def build_dm_reply_messages(messages, limit: int = 5) -> list[dict]:
    """Message一覧（古い→新しい順）から、Anthropic Messages API用の会話履歴を組み立てる。

    customer→user, character→assistant にマッピングし、
    連続する同じroleのメッセージは1つにまとめ、先頭がuserになるよう調整する
    （Anthropic APIはuserから始まりrole交互の構造を要求するため）。
    """
    recent = [m for m in messages if (m.content or "").strip()][-limit:]

    merged: list[dict] = []
    for m in recent:
        role = "user" if m.sender == "customer" else "assistant"
        if merged and merged[-1]["role"] == role:
            merged[-1]["content"] += "\n" + m.content
        else:
            merged.append({"role": role, "content": m.content})

    # 先頭がassistant（character）の場合は取り除き、userから始まるようにする
    while merged and merged[0]["role"] == "assistant":
        merged.pop(0)

    if not merged:
        merged = [{"role": "user", "content": "（まだ会話がありません。最初の挨拶を考えてください）"}]

    return merged
