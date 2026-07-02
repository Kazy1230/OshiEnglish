# AIインタビュー（人格収集）のプロンプト設計。
# 設計書: docs/第2版/ManaVillage_詳細設計書_v1.1.md セクション2.1
#
# クリエイターの指導哲学・コミュニケーションスタイル・判断基準を、固定5問＋最大3問の
# 深掘りフォローアップを通じて抽出し、人格プロファイル（JSON）として保存する。
# このプロファイルがコース生成・日次伴走チャット・Tier B AI下書き生成の
# システムプロンプトに織り込まれる、事業の中核データ。
#
# 「あなたの指導哲学は？」のような抽象的な質問は臨場感がなく、建前の回答になりやすい。
# 代わりに学習者本人のセリフとして質問を投げかけ、実際にその場で返すであろう生のセリフを
# そのまま引き出すロールプレイ形式にしている（口調・励まし方・優先順位の付け方が自然に出る）。

FIXED_QUESTIONS = [
    "○○先生、最近全然リスニングが伸びなくて…正直心が折れそうです。",
    "英語、ほぼ初心者です。とりあえず最初の1週間、何から始めればいいですか？",
    "単語も文法もリスニングも全部中途半端で、何を優先すればいいか分かりません。先生はどう考えますか？",
    "3ヶ月続けてるのに全然伸びている気がしません…私のやり方、何か間違ってますか？",
    "先生のコースに申し込もうか迷ってるんですけど、他の先生と何が違うんですか？",
    "先生って、昔から英語得意だったんですか？どんなきっかけで教える側になったんですか？",
    "先生に「よくできました！」って褒めてもらった時、どんな感じで返してもらえると嬉しいですか？ちょっと聞いてみたくて。",
]

MAX_FOLLOW_UPS = 3

FOLLOW_UP_DECISION_SYSTEM = """あなたは優秀なコーチングデザイナーです。
英語学習コーチのクリエイターへのインタビューで、直前の質問（学習者からのセリフ）と、それに対するクリエイターの返答を評価します。

返答が短い・抽象的・建前っぽい（実際に学習者に話しかけているような臨場感がない）場合は、
さらに深掘りする質問を1つ生成してください。「もう少し具体的に」と一般論で聞くのではなく、
同じ学習者がさらに食い下がってきたセリフの形で深掘りすること（例：「それでも不安なんですけど…」）。
返答が既に具体的（実際に話しかけるような口調・具体的な行動・理由が含まれている）なら、深掘りは不要です。

以下のJSON形式のみで出力してください（説明文は不要）:
{"action": "followup", "question": "深掘り質問の文章（学習者のセリフ形式）"}
または
{"action": "next"}
"""


def build_follow_up_decision_messages(question: str, answer: str) -> list[dict]:
    return [{
        "role": "user",
        "content": f"学習者のセリフ: {question}\nクリエイターの返答: {answer}",
    }]


PROFILE_GENERATION_SYSTEM = """あなたは優秀なコーチングデザイナーです。
英語学習コーチのクリエイターへのインタビュー全文（学習者のセリフと、それに対するクリエイターの実際の返答のペア、深掘り含む）をもとに、
そのクリエイター固有の指導哲学・コミュニケーションスタイル・判断基準と、チャットAIが使うキャラクタープロファイルを同時に抽出してください。
クリエイターの返答は、実際に学習者に話しかけた生のセリフとして扱い、その口調・語尾・励まし方・リアクションをそのまま読み取ってください。

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
  },
  "sample_reply": "学習者が「最近やる気が出なくて、続けられるか不安です…」と相談してきた場合に、このクリエイターが実際に返すであろう一言（このクリエイター自身の口調・語尾・励まし方をそのまま反映した1〜3文程度の生のセリフ）",
  "tone_profile": {
    "first_person": "一人称（communication.first_personと同じ値）",
    "speech_style": "口調・話し方・語尾の特徴をまとめた説明（communication.tone + sentence_endingを統合）",
    "personality": "性格・特徴の説明（coaching_styleとthinking_styleから読み取れる人物像）",
    "catchphrase": "口癖・文末の癖（communication.catchphraseと同じ値）",
    "ng_expressions": ["使ってはいけない表現1", "使ってはいけない表現2"],
    "background": "このクリエイターの背景・英語との出会い・教えるようになった経緯（インタビュー回答から読み取れる範囲で。不明な場合も指導スタイルの一言説明を書く）",
    "reaction_patterns": "感情リアクションのパターン（褒められた時・学習者が失敗した時・頑張っている時などの反応の傾向。インタビューの返し方から読み取る）",
    "speaking_samples": ["実際にこのキャラがチャットで送るメッセージ例（インタビュー回答の口調をそのまま反映）", "サンプル2", "サンプル3（励ます場面）", "サンプル4（説明する場面）", "サンプル5（褒める場面）"]
  }
}

回答に書かれていない項目があっても、文体・語尾・話の運び方から推測して必ず全項目を埋めてください。
sample_replyとtone_profile.speaking_samplesは絶対に汎用的な定型文にせず、このクリエイター固有の口癖・語尾・距離感をはっきり反映させてください。
"""


BASE_TYPE_HINTS = {
    "共感型": "まず気持ちに寄り添い、一緒に考えるスタイル。coaching_styleのstrictnessは低め、encouragementは共感重視で記述すること。",
    "指導型": "正しいやり方を丁寧に、論理的に教えるスタイル。thinking_styleのexplanation_methodは体系的・論理的に記述すること。",
    "激励型": "とにかく背中を押す、ポジティブ全開のスタイル。coaching_styleのencouragementは熱量高めに記述すること。",
    "厳格型": "妥協なく高い基準を求める、本気でぶつかるスタイル。coaching_styleのstrictnessは高めに記述すること。",
}


GENDER_HINTS = {
    "男性": "一人称・語尾・口調は男性的な話し方として記述すること（例: 一人称は「俺」「私」、語尾は「〜だよ」「〜だぞ」など）。",
    "女性": "一人称・語尾・口調は女性的な話し方として記述すること（例: 一人称は「私」、語尾は「〜よ」「〜だね」など）。",
    "中性的": "一人称・語尾・口調は性別を感じさせないニュートラルな話し方として記述すること。",
}


def build_profile_generation_messages(qa_history: list[dict], base_type: str | None = None, gender: str | None = None) -> list[dict]:
    transcript = "\n\n".join(
        f"学習者: {item['question']}\nクリエイターの返答: {item['answer']}" for item in qa_history
    )
    if base_type and base_type in BASE_TYPE_HINTS:
        transcript = f"【指導スタイルの初期傾向: {base_type}】{BASE_TYPE_HINTS[base_type]}\n（インタビュー回答の内容を優先しつつ、回答が薄い項目はこの傾向を反映してください）\n\n{transcript}"
    if gender and gender in GENDER_HINTS:
        transcript = f"【キャラクターの性別: {gender}】{GENDER_HINTS[gender]}\n（communication.first_personとsentence_endingに必ず反映してください）\n\n{transcript}"
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
