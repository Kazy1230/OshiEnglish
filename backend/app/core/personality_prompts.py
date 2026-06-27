# AIインタビュー（人格収集）のプロンプト設計。
# 設計書: docs/第2版/ManaVillage_詳細設計書_v1.1.md セクション2.1
#
# クリエイターの指導哲学・コミュニケーションスタイル・判断基準を、固定5問＋最大3問の
# 深掘りフォローアップを通じて抽出し、人格プロファイル（JSON）として保存する。
# このプロファイルがコース生成・日次伴走チャット・Tier B AI下書き生成の
# システムプロンプトに織り込まれる、事業の中核データ。

FIXED_QUESTIONS = [
    "英語学習者が挫折しそうになったとき、どのように声をかけますか？できるだけ実際に使うセリフで教えてください。",
    "TOEIC初心者に最初の1週間で何をさせますか？その理由も教えてください。",
    "単語・文法・リスニング・読解のうち、最も重視するものはどれですか？なぜそれを最優先にするのですか？",
    "あなたの指導を受けた学習者が成果を出せないとき、原因はどこにあると思いますか？",
    "あなたの指導で一番大切にしていることを一言で表すとしたら何ですか？",
]

MAX_FOLLOW_UPS = 3

FOLLOW_UP_DECISION_SYSTEM = """あなたは優秀なコーチングデザイナーです。
英語学習コーチのクリエイターへのインタビューで、直前の質問と回答を評価します。

回答が短い・抽象的・一般論に見える場合は、その回答をさらに深掘りする質問を1つ生成してください。
回答が既に具体的（実際のセリフ・具体的な行動・理由が含まれている）なら、深掘りは不要です。

以下のJSON形式のみで出力してください（説明文は不要）:
{"action": "followup", "question": "深掘り質問の文章"}
または
{"action": "next"}
"""


def build_follow_up_decision_messages(question: str, answer: str) -> list[dict]:
    return [{
        "role": "user",
        "content": f"質問: {question}\n回答: {answer}",
    }]


PROFILE_GENERATION_SYSTEM = """あなたは優秀なコーチングデザイナーです。
英語学習コーチのクリエイターへのインタビュー全文（質問と回答のペア、深掘り含む）をもとに、
そのクリエイター固有の指導哲学・コミュニケーションスタイル・判断基準を人格プロファイルとして抽出してください。

以下のJSON形式のみで出力してください（説明文は不要）:
{
  "communication": {
    "tone": "口調の特徴",
    "first_person": "一人称",
    "sentence_ending": "語尾の特徴",
    "catchphrase": "よく使う口癖・決め台詞"
  },
  "coaching_style": {
    "strictness": "厳しさの度合いと特徴",
    "encouragement": "励まし方の特徴",
    "feedback_method": "フィードバックの方法"
  },
  "learning_philosophy": {
    "core_value": "最も重視する考え方",
    "priority": "優先順位の付け方",
    "judgment_criteria": "判断基準"
  },
  "thinking_style": {
    "analogy_tendency": "例え話の癖",
    "explanation_method": "説明方法の特徴",
    "problem_solving": "問題解決アプローチ"
  }
}

回答に書かれていない項目があっても、文体・語尾・話の運び方から推測して必ず全項目を埋めてください。
"""


BASE_TYPE_HINTS = {
    "共感型": "まず気持ちに寄り添い、一緒に考えるスタイル。coaching_styleのstrictnessは低め、encouragementは共感重視で記述すること。",
    "指導型": "正しいやり方を丁寧に、論理的に教えるスタイル。thinking_styleのexplanation_methodは体系的・論理的に記述すること。",
    "激励型": "とにかく背中を押す、ポジティブ全開のスタイル。coaching_styleのencouragementは熱量高めに記述すること。",
    "厳格型": "妥協なく高い基準を求める、本気でぶつかるスタイル。coaching_styleのstrictnessは高めに記述すること。",
}


def build_profile_generation_messages(qa_history: list[dict], base_type: str | None = None) -> list[dict]:
    transcript = "\n\n".join(
        f"Q: {item['question']}\nA: {item['answer']}" for item in qa_history
    )
    if base_type and base_type in BASE_TYPE_HINTS:
        transcript = f"【指導スタイルの初期傾向: {base_type}】{BASE_TYPE_HINTS[base_type]}\n（インタビュー回答の内容を優先しつつ、回答が薄い項目はこの傾向を反映してください）\n\n{transcript}"
    return [{"role": "user", "content": transcript}]


def build_personality_system_prompt(profile: dict) -> str:
    """人格プロファイルを、コース生成・チャット等の他機能で使うシステムプロンプト断片に変換する。

    Anthropic Prompt Cachingの対象（cache_control指定は呼び出し側で行う）。
    """
    import json
    return (
        "あなたは以下の人格プロファイルを持つ英語学習コーチです。"
        "この口調・指導スタイル・学習哲学に忠実に振る舞ってください。\n\n"
        f"【人格プロファイル】\n{json.dumps(profile, ensure_ascii=False, indent=2)}"
    )
