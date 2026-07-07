# AIインタビュー（人格収集）のプロンプト設計。
# ロールプレイ形式で学習者のセリフとして質問を投げかけ、クリエイターの生の口調・指導スタイルを引き出す。
# 質問はサブジェクト（英語/IT/音楽/日本語/汎用）に応じて切り替わる。

_QUESTIONS_ENGLISH = [
    "○○先生、最近全然リスニングが伸びなくて…正直心が折れそうです。",
    "英語、ほぼ初心者です。とりあえず最初の1週間、何から始めればいいですか？",
    "単語も文法もリスニングも全部中途半端で、何を優先すればいいか分かりません。先生はどう考えますか？",
    "3ヶ月続けてるのに全然伸びている気がしません…私のやり方、何か間違ってますか？",
    "先生のコースに申し込もうか迷ってるんですけど、他の先生と何が違うんですか？",
    "先生って、昔から英語得意だったんですか？どんなきっかけで教える側になったんですか？",
    "先生に「よくできました！」って褒めてもらった時、どんな感じで返してもらえると嬉しいですか？ちょっと聞いてみたくて。",
]

_QUESTIONS_IT = [
    "○○さん、エラーが全然直せなくて…もうプログラミング向いてないのかなって思ってきました。",
    "プログラミング完全初心者です。最初の1週間、何から手をつければいいですか？",
    "Pythonも触ってるしJavaScriptも勉強してるんですけど、何から集中すればいいか分からなくて。先生どう思います？",
    "3ヶ月勉強してるのに、自分で何も作れる気がしなくて。やり方が間違ってるんでしょうか？",
    "○○さんのコースにしようか迷ってるんですけど、他のコースと何が違うんですか？",
    "○○さんって、エンジニアになったきっかけは何ですか？どんな経緯でコーチ・講師になったんですか？",
    "「よくできましたね！」って言ってもらったとき、どんな感じで返してもらえると一番うれしいですか？",
]

_QUESTIONS_MUSIC = [
    "○○先生、何ヶ月練習しても全然うまくならなくて…もう才能ないのかなって思ってます。",
    "楽器を始めたばかりです。最初の1週間、何を練習すればいいですか？",
    "基礎練習も曲の練習も中途半端で、何を優先すればいいか分かりません。先生はどうお考えですか？",
    "毎日練習しているのに、3ヶ月経っても上達している感じがしません。何か間違っていますか？",
    "先生のコースを受けようか迷っているんですが、他の先生と何が違うんですか？",
    "○○先生は、どんなきっかけで音楽を始めて、教える立場になったんですか？",
    "先生に「上手くなったね！」って言ってもらえたとき、どんなふうに返してくれると一番うれしいですか？",
]

_QUESTIONS_GENERIC = [
    "○○先生、頑張ってるのに全然成長している気がしなくて…正直心が折れそうです。",
    "完全な初心者です。最初の1週間、何から始めればいいですか？",
    "やるべきことが多すぎて、何を優先すればいいか分かりません。先生はどう考えますか？",
    "3ヶ月続けているのに全然伸びている気がしません…やり方が間違っていますか？",
    "先生のコースにしようか迷っているんですけど、他の先生と何が違うんですか？",
    "○○先生はどんなきっかけでこの分野に入って、教える立場になったんですか？",
    "先生に褒めてもらったとき、どんなふうに返してもらえると一番うれしいですか？",
]

_SUBJECT_QUESTIONS: dict[str, list[str]] = {
    "english": _QUESTIONS_ENGLISH,
    "it": _QUESTIONS_IT,
    "music": _QUESTIONS_MUSIC,
}

# デフォルト（後方互換用）
FIXED_QUESTIONS = _QUESTIONS_ENGLISH

MAX_FOLLOW_UPS = 3


def get_fixed_questions(subject: str | None) -> list[str]:
    return _SUBJECT_QUESTIONS.get(subject or "english", _QUESTIONS_GENERIC)


_SUBJECT_LABEL: dict[str, str] = {
    "english": "英語学習",
    "it": "ITプログラミング学習",
    "music": "音楽",
    "japanese": "日本語学習",
}


def _subject_label(subject: str | None) -> str:
    return _SUBJECT_LABEL.get(subject or "english", "スキル学習")


def build_follow_up_decision_system(subject: str | None) -> str:
    label = _subject_label(subject)
    return f"""あなたは優秀なコーチングデザイナーです。
{label}コーチのクリエイターへのインタビューで、直前の質問（学習者からのセリフ）と、それに対するクリエイターの返答を評価します。

返答が短い・抽象的・建前っぽい（実際に学習者に話しかけているような臨場感がない）場合は、
さらに深掘りする質問を1つ生成してください。「もう少し具体的に」と一般論で聞くのではなく、
同じ学習者がさらに食い下がってきたセリフの形で深掘りすること（例：「それでも不安なんですけど…」）。
返答が既に具体的（実際に話しかけるような口調・具体的な行動・理由が含まれている）なら、深掘りは不要です。

以下のJSON形式のみで出力してください（説明文は不要）:
{{"action": "followup", "question": "深掘り質問の文章（学習者のセリフ形式）"}}
または
{{"action": "next"}}
"""

# 後方互換
FOLLOW_UP_DECISION_SYSTEM = build_follow_up_decision_system("english")


def build_follow_up_decision_messages(question: str, answer: str) -> list[dict]:
    return [{
        "role": "user",
        "content": f"学習者のセリフ: {question}\nクリエイターの返答: {answer}",
    }]


def build_profile_generation_system(subject: str | None) -> str:
    label = _subject_label(subject)
    return f"""あなたは優秀なコーチングデザイナーです。
{label}コーチのクリエイターへのインタビュー全文（学習者のセリフと、それに対するクリエイターの実際の返答のペア、深掘り含む）をもとに、
そのクリエイター固有の指導哲学・コミュニケーションスタイル・判断基準と、チャットAIが使うキャラクタープロファイルを同時に抽出してください。
クリエイターの返答は、実際に学習者に話しかけた生のセリフとして扱い、その口調・語尾・励まし方・リアクションをそのまま読み取ってください。

以下のJSON形式のみで出力してください（説明文は不要）:
{{
  "communication": {{
    "tone": "口調の特徴",
    "first_person": "一人称",
    "sentence_ending": "語尾の特徴",
    "catchphrase": "よく使う口癖・決め台詞"
  }},
  "coaching_style": {{
    "strictness": "厳しさの度合いと特徴",
    "encouragement": "励まし方の特徴",
    "feedback_method": "フィードバックの方法"
  }},
  "learning_philosophy": {{
    "core_value": "最も重視する考え方",
    "priority": "優先順位の付け方",
    "judgment_criteria": "判断基準"
  }},
  "thinking_style": {{
    "analogy_tendency": "例え話の癖",
    "explanation_method": "説明方法の特徴",
    "problem_solving": "問題解決アプローチ"
  }},
  "sample_reply": "学習者が「最近やる気が出なくて、続けられるか不安です…」と相談してきた場合に、このクリエイターが実際に返すであろう一言（このクリエイター自身の口調・語尾・励まし方をそのまま反映した1〜3文程度の生のセリフ）",
  "tone_profile": {{
    "first_person": "一人称（communication.first_personと同じ値）",
    "speech_style": "口調・話し方・語尾の特徴をまとめた説明（communication.tone + sentence_endingを統合）",
    "personality": "性格・特徴の説明（coaching_styleとthinking_styleから読み取れる人物像）",
    "catchphrase": "口癖・文末の癖（communication.catchphraseと同じ値）",
    "ng_expressions": ["使ってはいけない表現1", "使ってはいけない表現2"],
    "background": "このクリエイターの背景・この分野との出会い・教えるようになった経緯（インタビュー回答から読み取れる範囲で）",
    "reaction_patterns": "感情リアクションのパターン（褒められた時・学習者が失敗した時・頑張っている時などの反応の傾向）",
    "speaking_samples": ["実際にこのキャラがチャットで送るメッセージ例（インタビュー回答の口調をそのまま反映）", "サンプル2", "サンプル3（励ます場面）", "サンプル4（説明する場面）", "サンプル5（褒める場面）"]
  }}
}}

回答に書かれていない項目があっても、文体・語尾・話の運び方から推測して必ず全項目を埋めてください。
sample_replyとtone_profile.speaking_samplesは絶対に汎用的な定型文にせず、このクリエイター固有の口癖・語尾・距離感をはっきり反映させてください。
"""

# 後方互換
PROFILE_GENERATION_SYSTEM = build_profile_generation_system("english")


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


def build_personality_system_prompt(profile: dict, subject: str | None = None) -> str:
    """人格プロファイルを、コース生成・チャット等の他機能で使うシステムプロンプト断片に変換する。"""
    import json
    label = _subject_label(subject)
    return (
        f"あなたは以下の人格プロファイルを持つ{label}コーチです。"
        "この口調・指導スタイル・学習哲学に忠実に振る舞ってください。\n\n"
        f"【人格プロファイル】\n{json.dumps(profile, ensure_ascii=False, indent=2)}"
    )
