# 新規キャラクター作成時に使用するLLM設定生成のためのプロンプトテンプレートと、
# 出力（6ブロック形式）のパース処理。
# frontend/app/admin/lib/promptBuilders.ts の buildCharacterDesignPrompt（手動コピペ用）と
# 同じ出力フォーマット（===DESCRIPTION===など）を採用しているが、
# こちらはバックエンドからAnthropic APIを直接呼び出して自動生成するためのもの。
import json
import re

# {{character_name}} / {{character_description}} / {{user_requested_personality}} /
# {{reference_character}} は build_character_generation_prompt() で置換する。
CHARACTER_GENERATION_PROMPT_TEMPLATE = """あなたはキャラクター設計のアシスタントです。
以下のラフな構想をもとに、英語学習サービス「Oshi English」の
キャラクター設定一式を考えてください。
出力はすべて、管理画面の入力欄にそのままコピペできる形式にしてください。

==================================================
【ラフな構想】
==================================================
■ 名前（仮）: {{character_name}}
■ イメージ・説明: {{character_description}}
■ 顧客が希望するキャラクター設定（最大限尊重して設計）:
{{user_requested_personality}}

■ 参考キャラクター:
{{reference_character}}

==================================================
【参考キャラクターの活用方法】
==================================================
参考キャラクターとして指定された人物・キャラクターについて、
実際に知られている名セリフ・口調の特徴を
できる限り具体的に把握してください。
分析の過程では実際のセリフを引用して構いません。

その上で、最終的な出力（GREETINGS・TONE_PROFILE内のすべての項目）には
固有名詞や直接の引用を一切含めず、
「文の長さ」「断定的か曖昧か」「比喩の使い方」
「感情表現の強さ」「語尾のパターン」などの
"スタイルの特徴"だけを抽出してオリジナルの表現として再構築してください。

例：
参考キャラが断定的かつ短い文で淡々と話す傾向がある場合、
最終出力のreaction_examplesも同様に
「短く言い切る」「装飾語を使わない」スタイルで生成する。
ただしセリフ自体は引用せず、オリジナルの言い回しにする。

==================================================
【★★★ 最終出力に関する絶対厳守事項 ★★★】
==================================================
最終出力（GREETINGS以降の全ブロック）には
実在の人物・既存の作品・キャラクター名、および
それらの直接の引用・セリフを一切含めないでください。
スタイルの特徴のみを反映したオリジナルの表現にしてください。

==================================================
【出力フォーマット】
==================================================

===DESCRIPTION===
（顧客のバナーに表示する紹介文。1文・30〜50字程度）

===GREETINGS===
（本棚画面に表示する「キャラクターからの一言」を8個。1行1パターン。
  語尾・言い回し・記号表現にバリエーションを持たせ、
  全て異なる印象になるようにする。50字以内）

===TONE_PROFILE===
{
  "keywords": ["", "", "", "", ""],
  "personality": "",
  "speech_style": "",
  "ng_expressions": ["", "", ""],
  "reaction_examples": {
    "mistake": ["", "", "", ""],
    "question": ["", "", "", ""],
    "correct_answer": ["", "", "", ""],
    "encouragement": ["", "", "", ""]
  },
  "conversation_rules": ["", "", "", "", "", "", "", ""],
  "intimacy_variations": {
    "low": "",
    "high": ""
  },
  "article_style": ""
}

===COLOR_SCHEME===
{"primary":"#______","accent":"#______","bg":"#______","text":"#______","card":"#ffffff","border":"#______","example_bg":"#______","tips_bg":"#______"}

===FONT_STYLE===
（default / rounded / serif / handwriting / monospace から1つ）

===IMAGE_HINT===
（プロフィール画像の見た目特徴。固有名詞なし。1〜2文）

==================================================
【厳守事項まとめ】
==================================================
1. 最終出力に固有名詞・直接引用を一切含めない
2. ===GREETINGS=== は必ず8行・全て異なる語尾/言い回し/記号にする
3. ===TONE_PROFILE=== はJSON構文として正しい形で出力する
4. reaction_examplesの各カテゴリは4パターンずつ出力する
5. conversation_rulesは8個出力する
6. intimacy_variationsのlow/highで口調の違いを明確にする
7. article_styleは雑談を減らし説明に集中するトーンを記述する
8. 6つの区切りブロックを過不足なく出力し、前置き・後書きは付けない"""

# ブロック名 → CharacterGenerateResult のキー名
BLOCK_KEYS = {
    "DESCRIPTION": "description",
    "GREETINGS": "greetings",
    "TONE_PROFILE": "tone_profile",
    "COLOR_SCHEME": "color_scheme",
    "FONT_STYLE": "font_style",
    "IMAGE_HINT": "image_hint",
}
ALL_BLOCKS = list(BLOCK_KEYS.keys())


def build_character_generation_prompt(
    character_name: str = "",
    character_description: str = "",
    user_requested_personality: str = "",
    reference_character: str = "",
    blocks: list[str] | None = None,
    existing: dict | None = None,
) -> str:
    """キャラクター設定生成用プロンプトを組み立てる。

    blocksが指定された場合（全ブロックの部分集合）、対象ブロックだけを
    再生成するよう末尾に追加指示を付与する。existingには再生成しない
    他ブロックの現在値を渡すことで、再生成結果との一貫性を保つ。
    """
    prompt = (
        CHARACTER_GENERATION_PROMPT_TEMPLATE
        .replace("{{character_name}}", character_name or "（未入力）")
        .replace("{{character_description}}", character_description or "（未入力）")
        .replace("{{user_requested_personality}}", user_requested_personality or "（特になし。お任せ）")
        .replace("{{reference_character}}", reference_character or "（指定なし）")
    )

    target_blocks = blocks if blocks else ALL_BLOCKS
    if set(target_blocks) == set(ALL_BLOCKS):
        return prompt

    target_label = "、".join(f"==={b}===" for b in target_blocks)
    lines = [
        prompt,
        "",
        "==================================================",
        "【★今回の出力対象についての追加指示（最優先で従うこと）】",
        "==================================================",
        f"今回は、上記6ブロックのうち {target_label} のみを再生成してください。",
        "他のブロックは出力しないでください。区切り線・前置き・後書きも不要です。",
    ]
    if existing:
        lines += [
            "",
            "以下は既に確定している他ブロックの内容です。キャラクター像・口調の一貫性を保つため、",
            "この内容と矛盾しない範囲で再生成してください（これらのブロック自体は出力しないこと）。",
            "",
            json.dumps(existing, ensure_ascii=False, indent=2),
        ]
    return "\n".join(lines)


def _strip_code_fence(text: str) -> str:
    text = text.strip()
    fenced = re.match(r"^```(?:json)?\s*([\s\S]*?)```\s*$", text, re.IGNORECASE)
    return fenced.group(1).strip() if fenced else text


def _parse_json_block(raw: str) -> dict:
    text = raw.strip()
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        text = text[start:end + 1]
    text = re.sub(r",(\s*[}\]])", r"\1", text)  # 末尾の余分なカンマを除去
    return json.loads(text)


def parse_character_generation_output(text: str) -> dict:
    """LLMの6ブロック出力をパースし、見つかったブロックだけを辞書で返す。

    返り値のキー: description(str) / greetings(list[str]) / tone_profile(dict) /
    color_scheme(dict) / font_style(str) / image_hint(str)
    """
    text = _strip_code_fence(text)

    # ===BLOCK_NAME=== で分割する
    pattern = r"===\s*(" + "|".join(BLOCK_KEYS.keys()) + r")\s*==="
    parts = re.split(pattern, text)
    # parts: [前置き, ブロック名1, 中身1, ブロック名2, 中身2, ...]

    result: dict = {}
    for i in range(1, len(parts) - 1, 2):
        block_name = parts[i].strip()
        content = parts[i + 1].strip()
        key = BLOCK_KEYS.get(block_name)
        if not key or not content:
            continue

        if key == "greetings":
            result[key] = [line.strip() for line in content.splitlines() if line.strip()]
        elif key in ("tone_profile", "color_scheme"):
            try:
                result[key] = _parse_json_block(content)
            except (ValueError, json.JSONDecodeError):
                continue
        else:
            result[key] = content

    return result
