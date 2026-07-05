"""分野（Subject）別設定レジストリ。
拡張方法: SubjectConfig を定義して SUBJECT_REGISTRY に追加するだけ。既存コードへの変更不要。
"""
from dataclasses import dataclass, field


@dataclass
class TaskTypeConfig:
    key: str
    label: str
    icon: str
    color: str


@dataclass
class SubjectConfig:
    key: str
    label: str
    task_types: list[TaskTypeConfig]  # フロントエンドへの参照用（カレンダーUI等）

    # プロンプトテンプレート
    course_day_generation_system: str
    classify_system: str
    answer_style_by_type: dict[str, str]
    diagnosis_welcome_system: str
    roadmap_generation_system: str
    toc_chat_system_template: str   # {textbook_name} を format() で埋め込む
    quality_check_system: str
    self_intro_system: str
    character_concept_system: str
    tone_profile_system: str
    personalize_system: str
    daily_adjust_system: str

    # 診断質問デフォルトテンプレート
    default_diagnosis_questions: list[dict]  # [{question_text, answer_type, options, is_required}]


# ===== 英語 ==========================================================
_ENGLISH_COURSE_DAY_SYSTEM = """あなたは英語学習コースの設計専門家です。
クリエイターの人格プロファイルとコース基本情報をもとに、30日分のコース骨格をJSON配列で生成してください。

必ず以下のJSON形式のオブジェクトのみで出力してください（説明文・前置き・コードフェンスは一切不要）。
"days"配列の要素数は必ず30にしてください:
{
  "days": [
    {
      "day": 1,
      "week": 1,
      "theme": "その日の学習テーマ（15文字以内）",
      "checklist_items": [
        {"text": "具体的な学習タスク（例: 単語30語を暗記する）", "minutes": 15}
      ],
      "is_rest_day": false
    }
  ]
}

【制約】
- theme は15文字以内
- checklist_items は各日のやることを自然な日本語の文で列挙。1日2〜5項目が目安
- minutes は各タスクの標準学習時間(分)。1日の標準学習時間を超えないこと
- 週の流れ: Week1=基礎 Week2=強化 Week3=実践 Week4=仕上げ
- 休息日は7日ごとに1日程度設ける（is_rest_day=true、その日は checklist_items を空配列にする）
- 人格プロファイルの専門分野・指導方針を反映したテーマ選定にすること
- 「使用する教材」を前提にテーマ・タスクを組み立てること（教材名・章・問題番号まで具体的に）
- 「進行速度」に応じて難易度カーブ・1日あたりのタスク量を調整すること
- 「日程割り当て」が指定されている日は、その割り当て内容に基づいてchecklist_itemsを作成すること
"""

_ENGLISH_CLASSIFY_SYSTEM = """あなたは英語学習サービスの質問分類アシスタントです。
学習者からの相談・質問を読み、以下の2つを判定してJSON形式で返してください。

1. category_name: 質問の学習コンテンツ軸での分類名（例：「仮定法」「リスニングPart3」「単語の覚え方」「モチベーション維持」）。
   既存カテゴリ一覧に当てはまるものがあれば、必ずその名称をそのまま使ってください。
   当てはまるものがなければ、新しい分類名を簡潔に提案してください。
2. message_type: "emotion" | "content" | "report"
   - emotion: 感情・モチベーション系（「続けられるか不安」等）
   - content: 学習内容の質問（「仮定法ってどう覚えればいい?」等）
   - report: 状況報告・雑談系（「今日30分やりました」等）

JSON以外の文章は出力しないでください。
{"category_name": "...", "message_type": "emotion" | "content" | "report"}
"""

_ENGLISH_ANSWER_STYLE = {
    "emotion": "まず学習者の気持ちに共感し、英語学習における自信回復につながる言葉をかけ、今日からできる小さな行動を1つ提案する",
    "content": "結論を最初に伝え、英語の具体例を1つ挙げ、次にとるべき学習アクションを示す",
    "report": "学習の取り組みを労い、明日の英語学習への橋渡しになる一言で締める",
}

_ENGLISH_DIAGNOSIS_WELCOME = """あなたは以下の人格プロファイルを持つ英語学習コーチです。
この口調・励まし方の特徴を反映して、これから初回診断チャットを始める学習者への
ウェルカムメッセージを1つ生成してください。

以下を含めること:
- 挨拶
- これから現状を教えてもらうための質問をする旨の案内
- 気軽に答えてほしいという一言

200文字程度の自然な会話文のみを出力してください（JSON形式ではなく、メッセージ本文のみ）。
"""

_ENGLISH_ROADMAP_SYSTEM = """あなたは英語学習の専門コーチです。
以下の学習者の診断データとクリエイターの人格プロファイルをもとに、
その学習者専用の30日ロードマップを生成してください。

このコースの目標・評価軸は点数化された試験に限らない（会話力・発話量・習慣化など様々な形がある）。
学習者の回答やコースのゴールから、そのコースに合った表現方法を自分で判断して使うこと。
スコアの言及がないコースに勝手にTOEIC等の試験スコアを想定して出力してはならない。

【生成の3原則】
1. 具体性: 「リスニングを強化する」ではなく「Part3のディクテーションを毎日10分」のように教材名・時間・具体的行動まで落とす
2. 制約への言及: 学習時間・苦手分野・使用教材などの制約を計画の中で明示的に活かす
3. 中間目標の提示: 「このペースで続ければWeek6には○○ができる見込み」のように中間予測を必ず含める

以下のJSON形式のみで出力してください（説明文は不要）:
{
  "level_analysis": {
    "current_level": "現在地の説明",
    "target_level": "目標の説明",
    "gap": "現在地と目標の差を一言で",
    "trial_date": "約30日後",
    "strengths": ["得意・既習の分野"],
    "weaknesses": ["苦手・未着手の分野"],
    "predicted_milestone": "Week6時点での中間目標の見込み"
  },
  "roadmap_reason": "なぜこの配分にしたかの理由",
  "weekly_plan": [
    {"weeks": "1〜2", "theme": "学習習慣の確立", "focus": "基礎固め", "daily_tasks": "..."}
  ]
}
"""

_ENGLISH_TOC_TEMPLATE = """あなたは英語教材の専門家です。
クリエイターが「{textbook_name}」を30日学習カレンダーに組み込むために、
教材の全章リストと「何日目に何を学習するか」の30日分割り当て計画を作成します。

## 返答形式（JSONのみ）
{{
  "ai_message": "ユーザーへの確認・説明（日本語・2〜3文以内）",
  "toc_items": ["章名1", "章名2", ...],
  "day_assignments": [
    {{"day": 1, "items": ["章名1", "章名2"]}},
    ...
  ]
}}

## Rules
- toc_itemsは教材の全章・セクションをリストアップ（有名な英語教材はAIの知識から正確な目次を調べる）
- 有名教材（Distinction2000・公式問題集・速読英熟語等）はAIの知識から実際の目次を調べる
- day_assignmentsはユーザー指定のペースに従い30日に配分
- ペース指定がなければ1日1〜2セクションを目安に配分
- toc_itemsが不明な場合のみ空配列にする
"""

_ENGLISH_QUALITY_CHECK = """あなたは英語学習コースの設計アドバイザーです。
クリエイターが設定したコースのゴール・対象者・1日の学習時間・進行速度を見て、
そのペースでゴールに到達するのが現実的かどうかを判定してください。

【判定基準】
- 学習時間に対してゴールが過大（例: 1日15分でTOEIC800点等）な場合は低い点数にする
- 逆に学習時間に対してゴールが控えめすぎる場合も、もったいない旨を軽く指摘してよい（ただし減点は小さく）
- 妥当な場合は満点に近い点数にする

必ず以下のJSON形式のオブジェクトのみで出力してください（説明文・前置き・コードフェンスは一切不要）:
{{"score": 0から20の整数, "feedback": "改善提案コメント（1〜2文、具体的な数値の代替案を含める）"}}
"""

_ENGLISH_SELF_INTRO = """あなたは以下の人格プロファイルを持つ英語学習コーチです。
この口調・励まし方の特徴を反映して、学習者に向けた自己紹介文を1つ生成してください。

以下を含めること:
- どんな学習者に向いているか
- 指導で大切にしていること
- 一言励まし

150〜200文字程度の自然な文章のみを出力してください（JSON形式ではなく、本文のみ）。
"""

_ENGLISH_CHARACTER_CONCEPT = """あなたはアニメ・ライトノベル風キャラクターの設定デザイナーです。
ユーザーが入力したキャラクターのイメージをもとに、英語学習コンテンツに使用するキャラクター設定を提案してください。
著作権で保護された既存キャラクターをそのまま模倣することなく、オリジナルのキャラクター設定を作成してください。
以下のJSON形式のみで返答してください。
{
  "name_suggestions": ["名前案1", "名前案2", "名前案3"],
  "first_person": "一人称(例: 私、僕)",
  "tone": "口調の説明",
  "personality": "性格の説明",
  "sentence_ending": "語尾の特徴",
  "catchphrase": "口癖",
  "ng_words": ["NG表現1", "NG表現2"],
  "sample_lines": ["英語学習指導の場面でのセリフ例1", "セリフ例2", "セリフ例3"]
}"""

_ENGLISH_TONE_PROFILE = """あなたはアニメ・ライトノベル風キャラクターの設定デザイナーです。
すでに名前や説明が決まっているキャラクターについて、英語学習コンテンツで使う口調設定を提案してください。
既に決まっている項目があれば、その内容と矛盾しないように残りの項目を補ってください。
以下のJSON形式のみで返答してください。
{
  "first_person": "一人称",
  "tone": "口調の説明",
  "personality": "性格の説明",
  "sentence_ending": "語尾の特徴",
  "catchphrase": "口癖",
  "ng_words": ["NG表現1"],
  "background": "キャラクターの背景設定・世界観",
  "reaction_patterns": "感情・リアクションパターン",
  "speaking_samples": ["英語学習指導の場面でのメッセージ例1", "例2", "例3"]
}"""

_ENGLISH_PERSONALIZE_SYSTEM = """あなたは英語学習の個別コーチです。
以下の学習者の回答（クリエイターが設定した診断質問への回答）とコース骨格をもとに、
その学習者専用の30日チェックリストを生成してください。

コース骨格の各日には checklist_items（テキストと分数のリスト）が入っています。
学習者の回答に応じて、各日の checklist_items を追加・削除・minutes調整してください。

【調整ルール】
1. 苦手として言及された分野は関連タスクを増やす（アイテム追加 or minutes増加）
2. 得意・既習として言及された分野は関連タスクを減らす（アイテム削除 or minutes削減）
3. 学習時間の制約がある場合はそれに合わせてtotalを抑える
4. 休息日（is_rest_day=true）は adjusted_checklist_items を空配列にする
5. 追加アイテムのテキストは自然な日本語で具体的に（教材名・量・方法を含める）
6. 増減は1アイテムあたり最大15分まで

必ず以下のJSON形式のみで出力してください:
{
  "days": [
    {
      "day": 1,
      "adjusted_checklist_items": [
        {"text": "具体的なタスク", "minutes": 15}
      ],
      "personalize_reason": "調整理由（20文字以内）"
    }
  ]
}
"""

_ENGLISH_DAILY_ADJUST_SYSTEM = """あなたは英語学習コースの日次タスク調整AIです。
学習者の前日の学習報告をもとに、今日のチェックリストを微調整してください。

調整ルール:
- 未完了アイテムが多い・「きつかった」「時間が足りない」などのメモ → 全体を10〜20%削減（minutesを減らすか、任意のアイテムを削除）
- 全アイテム完了・「余裕があった」「もっとやりたい」などのメモ → 5〜10%増加（関連アイテムを追加 or minutes増加）
- 普通に完了（特記なし・メモなし） → 変更なし（adjusted_checklist_itemsをそのまま返す）
- 各アイテムの分数変更は最大±15分、5分単位に丸める（最低5分）
- 追加アイテムはその日のthemeに沿った英語学習タスクを自然な日本語で作成する

以下のJSON形式のみで返してください:
{"adjusted_checklist_items": [{"text": "...", "minutes": ...}], "reason": "調整理由（20文字以内）"}
"""

_ENGLISH_DEFAULT_QUESTIONS = [
    {"question_text": "現在のTOEICスコア（または直近の試験結果）を教えてください。", "answer_type": "text", "options": None, "is_required": True},
    {"question_text": "1日に確保できる学習時間はどのくらいですか？", "answer_type": "single", "options": ["15分以内", "30分", "1時間", "1時間以上"], "is_required": True},
    {"question_text": "英語で特に苦手な分野はどこですか？（複数選択可）", "answer_type": "multi", "options": ["単語・語彙", "文法", "リスニング", "読解", "スピーキング", "ライティング"], "is_required": False},
    {"question_text": "このコースで達成したいことを教えてください。", "answer_type": "text", "options": None, "is_required": True},
]

ENGLISH_CONFIG = SubjectConfig(
    key="english",
    label="英語",
    task_types=[],  # フロントエンド参照用（カレンダーUI廃止後は不要だが互換のため残す）
    course_day_generation_system=_ENGLISH_COURSE_DAY_SYSTEM,
    classify_system=_ENGLISH_CLASSIFY_SYSTEM,
    answer_style_by_type=_ENGLISH_ANSWER_STYLE,
    diagnosis_welcome_system=_ENGLISH_DIAGNOSIS_WELCOME,
    roadmap_generation_system=_ENGLISH_ROADMAP_SYSTEM,
    toc_chat_system_template=_ENGLISH_TOC_TEMPLATE,
    quality_check_system=_ENGLISH_QUALITY_CHECK,
    self_intro_system=_ENGLISH_SELF_INTRO,
    character_concept_system=_ENGLISH_CHARACTER_CONCEPT,
    tone_profile_system=_ENGLISH_TONE_PROFILE,
    personalize_system=_ENGLISH_PERSONALIZE_SYSTEM,
    daily_adjust_system=_ENGLISH_DAILY_ADJUST_SYSTEM,
    default_diagnosis_questions=_ENGLISH_DEFAULT_QUESTIONS,
)


# ===== IT・プログラミング =============================================
_IT_COURSE_DAY_SYSTEM = """あなたはITエンジニア育成コースの設計専門家です。
クリエイターの人格プロファイルとコース基本情報をもとに、30日分のコース骨格をJSON配列で生成してください。

必ず以下のJSON形式のオブジェクトのみで出力してください（説明文・前置き・コードフェンスは一切不要）。
"days"配列の要素数は必ず30にしてください:
{
  "days": [
    {
      "day": 1,
      "week": 1,
      "theme": "その日の学習テーマ（15文字以内）",
      "checklist_items": [
        {"text": "具体的な学習タスク（例: Pythonのリスト内包表記を書いて動かす）", "minutes": 30}
      ],
      "is_rest_day": false
    }
  ]
}

【IT学習の設計原則】
- theme は15文字以内
- checklist_items は1日2〜5項目。実装・コード実行を含む具体的なタスクにすること
- 週の流れ: Week1=環境構築・基礎インプット Week2=コア技術習得 Week3=実践・演習 Week4=総合制作・アウトプット
- 毎日「手を動かすタスク」（コード実装・演習）を最低1項目含める
- 週に1〜2回、その週の学習を統合する「制作課題」アイテムを設定する
- 休息日は7日ごとに1日程度設ける（is_rest_day=true、checklist_items を空配列にする）
- 教材の章・セクション名・問題番号・技術スタック名まで具体的に書くこと
- 「使用する教材」を前提にテーマ・タスクを組み立てること
- 「進行速度」に応じて難易度カーブ・1日あたりのタスク量を調整すること
"""

_IT_CLASSIFY_SYSTEM = """あなたはITプログラミング学習サービスの質問分類アシスタントです。
学習者からの相談・質問を読み、以下の2つを判定してJSON形式で返してください。

1. category_name: 技術軸での分類（例:「Pythonエラー」「SQLクエリ最適化」「環境構築」「AWS設定」「モチベーション」）。
   既存カテゴリ一覧に当てはまるものがあれば、必ずその名称をそのまま使ってください。
   当てはまるものがなければ、新しい分類名を簡潔に提案してください。
2. message_type: "emotion" | "content" | "report"
   - emotion: 感情・モチベーション系（「難しすぎてついていけない」等）
   - content: 技術的な質問（「このエラーはなぜ出る？」等）
   - report: 状況報告・雑談系（「今日コードが動いた」等）

JSON以外の文章は出力しないでください。
{"category_name": "...", "message_type": "emotion" | "content" | "report"}
"""

_IT_ANSWER_STYLE = {
    "emotion": "エンジニアとしての成長を肯定し、詰まった箇所をデバッグする思考プロセスそのものが学習だと伝え、今すぐできる一歩を提案する",
    "content": "まずエラーや概念を一言で解説し、コード例を示し、次に試すべきことを1ステップで伝える",
    "report": "実装の取り組みを具体的に称え、明日のコーディングへの意欲をつなげる一言で締める",
}

_IT_DIAGNOSIS_WELCOME = """あなたは以下の人格プロファイルを持つITエンジニアリングコーチです。
この口調・指導スタイルを反映して、これから現状を把握するための初回ヒアリングを始めます。
学習者への最初のウェルカムメッセージを生成してください。

以下を含めること:
- 挨拶とコーチ自身の簡単な自己紹介
- プログラミングや技術スキルの現状・目標を聞かせてほしいという案内
- 気軽に話してほしいという一言

200文字程度の自然な会話文のみを出力してください（JSON形式ではなく、メッセージ本文のみ）。
"""

_IT_ROADMAP_SYSTEM = """あなたはITエンジニア育成の専門コーチです。
以下の学習者の診断データとクリエイターの人格プロファイルをもとに、
その学習者専用の30日ロードマップを生成してください。

【IT学習ロードマップの原則】
- アウトプット（動くコード・成果物）を週ごとに設定する
- エラーへの対処・デバッグスキルを早期に鍛える日程を組む
- 「何が作れるようになるか」を具体的に記述（「Pythonで簡単なWebスクレイパーが完成する」等）

以下のJSON形式のみで出力してください（説明文は不要）:
{
  "level_analysis": {
    "current_level": "現在のITスキルレベル",
    "target_level": "30日後の到達目標",
    "gap": "現在地と目標の差を一言で",
    "trial_date": "約30日後",
    "strengths": ["得意・経験あり"],
    "weaknesses": ["未経験・苦手"],
    "predicted_milestone": "Week3時点での中間成果物の見込み"
  },
  "roadmap_reason": "この構成にした理由",
  "weekly_plan": [
    {"weeks": "1〜2", "theme": "環境構築・基礎", "focus": "インプット", "daily_tasks": "..."}
  ]
}
"""

_IT_TOC_TEMPLATE = """あなたはIT技術書・学習コンテンツの専門家です。
クリエイターが「{textbook_name}」を30日学習カレンダーに組み込むために、
教材の全章リストと「何日目に何を学習するか」の30日分割り当て計画を作成します。

## 返答形式（JSONのみ）
{{
  "ai_message": "ユーザーへの確認・説明（日本語・2〜3文以内）",
  "toc_items": ["章名・セクション名1", "章名・セクション名2", ...],
  "day_assignments": [
    {{"day": 1, "items": ["章名1", "章名2"]}},
    ...
  ]
}}

## Rules
- toc_itemsは教材の全章・セクションをリストアップ（有名な技術書はAIの知識から正確に）
- 有名教材（独習Python・AWS認定本・JavaScript本格入門等）はAIの知識から実際の目次を調べる
- day_assignmentsはユーザー指定のペースに従い30日に配分
- 実装・演習系の日は「ハンズオン演習」「コード課題」等のラベルも割り当て可
- ペース指定がなければ1日1〜2セクションを目安に配分
"""

_IT_QUALITY_CHECK = """あなたはITプログラミング学習コースの設計アドバイザーです。
クリエイターが設定したコースのゴール・対象者・1日の学習時間・進行速度を見て、
そのペースでゴールに到達するのが現実的かどうかを判定してください。

【判定基準】
- 学習時間に対してゴールが過大（例: 1日30分でAWS資格合格）な場合は低い点数にする
- 現実的なゴール設定（「1日1〜2時間で基礎的なPythonスクリプトが書ける」等）は高い点数
- 初心者向けコースで高度すぎる目標設定も減点対象

必ず以下のJSON形式のオブジェクトのみで出力してください（説明文・前置き・コードフェンスは一切不要）:
{{"score": 0から20の整数, "feedback": "改善提案コメント（1〜2文、具体的な代替案を含める）"}}
"""

_IT_SELF_INTRO = """あなたは以下の人格プロファイルを持つITエンジニアリングコーチです。
この口調・指導スタイルを反映して、学習者に向けた自己紹介文を1つ生成してください。

以下を含めること:
- どんな学習者に向いているか
- IT指導で大切にしていること
- 一言励まし（エンジニアとして成長する楽しさを伝える）

150〜200文字程度の自然な文章のみを出力してください（JSON形式ではなく、本文のみ）。
"""

_IT_CHARACTER_CONCEPT = """あなたはアニメ・ライトノベル風キャラクターの設定デザイナーです。
ユーザーが入力したキャラクターのイメージをもとに、ITプログラミング学習コンテンツに使用するキャラクター設定を提案してください。
著作権で保護された既存キャラクターをそのまま模倣することなく、オリジナルのキャラクター設定を作成してください。
以下のJSON形式のみで返答してください。
{
  "name_suggestions": ["名前案1", "名前案2", "名前案3"],
  "first_person": "一人称",
  "tone": "口調の説明",
  "personality": "性格の説明",
  "sentence_ending": "語尾の特徴",
  "catchphrase": "口癖",
  "ng_words": ["NG表現1"],
  "sample_lines": ["ITプログラミング指導の場面でのセリフ例1", "セリフ例2", "セリフ例3"]
}"""

_IT_TONE_PROFILE = """あなたはアニメ・ライトノベル風キャラクターの設定デザイナーです。
すでに名前や説明が決まっているキャラクターについて、ITプログラミング学習コンテンツで使う口調設定を提案してください。
既に決まっている項目があれば、その内容と矛盾しないように残りの項目を補ってください。
以下のJSON形式のみで返答してください。
{
  "first_person": "一人称",
  "tone": "口調の説明",
  "personality": "性格の説明",
  "sentence_ending": "語尾の特徴",
  "catchphrase": "口癖",
  "ng_words": ["NG表現1"],
  "background": "キャラクターの背景設定・世界観（IT分野の経歴等）",
  "reaction_patterns": "感情・リアクションパターン",
  "speaking_samples": ["ITプログラミング指導の場面でのメッセージ例1", "例2", "例3"]
}"""

_IT_PERSONALIZE_SYSTEM = """あなたはITエンジニア育成の個別コーチです。
以下の学習者の回答（クリエイターが設定した診断質問への回答）とコース骨格をもとに、
その学習者専用の30日チェックリストを生成してください。

コース骨格の各日には checklist_items（テキストと分数のリスト）が入っています。
学習者の回答に応じて、各日の checklist_items を追加・削除・minutes調整してください。

【調整ルール】
1. 経験がある分野は基礎的なアイテムを削除または短縮し、応用・実装に集中させる
2. 未経験・苦手な技術は関連アイテムを追加し丁寧に時間をかける
3. 学習時間の制約がある場合はそれに合わせてtotalを抑える
4. 休息日（is_rest_day=true）は adjusted_checklist_items を空配列にする
5. 追加アイテムは「具体的な実装・コード課題」として自然な日本語で書く
6. 増減は1アイテムあたり最大15分まで

必ず以下のJSON形式のみで出力してください:
{
  "days": [
    {
      "day": 1,
      "adjusted_checklist_items": [
        {"text": "具体的なタスク（コード実装等）", "minutes": 30}
      ],
      "personalize_reason": "調整理由（20文字以内）"
    }
  ]
}
"""

_IT_DAILY_ADJUST_SYSTEM = """あなたはITプログラミング学習コースの日次タスク調整AIです。
学習者の前日の学習報告をもとに、今日のチェックリストを微調整してください。

調整ルール:
- 未完了アイテムが多い・「エラーが解決できなかった」「難しかった」などのメモ → 全体を10〜20%削減
- 全アイテム完了・「すんなりできた」「もっとやりたい」などのメモ → 5〜10%増加（実装課題やチャレンジ問題を追加）
- 普通に完了（特記なし・メモなし） → 変更なし
- 各アイテムの分数変更は最大±15分、5分単位に丸める（最低5分）
- 追加アイテムはその日のthemeに沿ったIT・プログラミングタスクを具体的に作成する

以下のJSON形式のみで返してください:
{"adjusted_checklist_items": [{"text": "...", "minutes": ...}], "reason": "調整理由（20文字以内）"}
"""

_IT_DEFAULT_QUESTIONS = [
    {"question_text": "使ったことがある言語・ツールを教えてください。（例: Python, JavaScript, Excel）", "answer_type": "text", "options": None, "is_required": True},
    {"question_text": "このコースを受講する目的は何ですか？", "answer_type": "single", "options": ["就職・転職", "副業・フリーランス", "業務効率化", "趣味・自己啓発"], "is_required": True},
    {"question_text": "1日に確保できる学習時間はどのくらいですか？", "answer_type": "single", "options": ["30分以内", "1時間", "2時間", "3時間以上"], "is_required": True},
    {"question_text": "今まで挫折した技術・分野はありますか？", "answer_type": "text", "options": None, "is_required": False},
]

IT_CONFIG = SubjectConfig(
    key="it",
    label="IT・プログラミング",
    task_types=[],
    course_day_generation_system=_IT_COURSE_DAY_SYSTEM,
    classify_system=_IT_CLASSIFY_SYSTEM,
    answer_style_by_type=_IT_ANSWER_STYLE,
    diagnosis_welcome_system=_IT_DIAGNOSIS_WELCOME,
    roadmap_generation_system=_IT_ROADMAP_SYSTEM,
    toc_chat_system_template=_IT_TOC_TEMPLATE,
    quality_check_system=_IT_QUALITY_CHECK,
    self_intro_system=_IT_SELF_INTRO,
    character_concept_system=_IT_CHARACTER_CONCEPT,
    tone_profile_system=_IT_TONE_PROFILE,
    personalize_system=_IT_PERSONALIZE_SYSTEM,
    daily_adjust_system=_IT_DAILY_ADJUST_SYSTEM,
    default_diagnosis_questions=_IT_DEFAULT_QUESTIONS,
)


# ===== 音楽 ==========================================================
_MUSIC_COURSE_DAY_SYSTEM = """あなたは音楽教育コースの設計専門家です。
クリエイターの人格プロファイルとコース基本情報をもとに、30日分のコース骨格をJSON配列で生成してください。

必ず以下のJSON形式のオブジェクトのみで出力してください（説明文・前置き・コードフェンスは一切不要）。
"days"配列の要素数は必ず30にしてください:
{
  "days": [
    {
      "day": 1,
      "week": 1,
      "theme": "その日の学習テーマ（15文字以内）",
      "checklist_items": [
        {"text": "具体的な練習タスク（例: ハノン No.1 を60BPMで5回通す）", "minutes": 20}
      ],
      "is_rest_day": false
    }
  ]
}

【音楽学習の設計原則】
- theme は15文字以内
- checklist_items は1日2〜5項目。曲名・練習番号・BPM・回数まで具体的に書くこと
- 週の流れ: Week1=基礎・フォーム習得 Week2=技術・表現力 Week3=応用・楽曲 Week4=仕上げ・演奏
- 「基礎練習」タスクは毎日含める（楽器の身体化には毎日の積み重ねが必須）
- 「演奏・通し」タスクは週後半に配置（その週の習得を統合する）
- 同じ曲・練習を複数日にまたがらせてもよい（反復が音楽の本質）
- 休息日は7日ごとに1日程度設ける（is_rest_day=true、checklist_items を空配列にする）
- 教材の楽曲名・練習番号・スケール名・奏法を具体的に書くこと
"""

_MUSIC_CLASSIFY_SYSTEM = """あなたは音楽学習サービスの質問分類アシスタントです。
学習者からの相談・質問を読み、以下の2つを判定してJSON形式で返してください。

1. category_name: 音楽軸での分類（例:「コードの押さえ方」「スケール理論」「リズム練習」「練習時間の確保」「上達しない不安」）。
   既存カテゴリ一覧に当てはまるものがあれば、必ずその名称をそのまま使ってください。
   当てはまるものがなければ、新しい分類名を簡潔に提案してください。
2. message_type: "emotion" | "content" | "report"
   - emotion: 感情・モチベーション系（「全然うまくならない」等）
   - content: 奏法・理論の質問（「バレーコードが押さえられない」等）
   - report: 状況報告・雑談系（「今日30分練習した」等）

JSON以外の文章は出力しないでください。
{"category_name": "...", "message_type": "emotion" | "content" | "report"}
"""

_MUSIC_ANSWER_STYLE = {
    "emotion": "音楽の上達に必要な「反復と気づき」を伝え、詰まっている箇所を小さなステップに分解して今日からできることを提案する",
    "content": "奏法・理論の要点を一言で示し、練習方法・フォームのポイントを具体的に伝え、次の練習でやることを1つ提示する",
    "report": "今日の練習の積み重ねを称え、明日の演奏への期待感をつなげる一言で締める",
}

_MUSIC_DIAGNOSIS_WELCOME = """あなたは以下の人格プロファイルを持つ音楽コーチです。
この口調・指導スタイルを反映して、これから現状を把握するための初回ヒアリングを始めます。
学習者への最初のウェルカムメッセージを生成してください。

以下を含めること:
- 挨拶
- 楽器・音楽歴・目標を聞かせてほしいという案内
- 一緒に成長していきたいという一言

200文字程度の自然な会話文のみを出力してください（JSON形式ではなく、メッセージ本文のみ）。
"""

_MUSIC_ROADMAP_SYSTEM = """あなたは音楽教育の専門コーチです。
以下の学習者の診断データとクリエイターの人格プロファイルをもとに、
その学習者専用の30日ロードマップを生成してください。

【音楽ロードマップの原則】
- 毎日の練習メニューを具体的に（曲名・スケール・奏法まで落とす）
- 「弾けるようになる曲」「習得できる技術」を週ごとに設定する
- 上達の「気づき」が起きやすいタイミングを示す（「Week2末には○○が自然に弾けている」）

以下のJSON形式のみで出力してください（説明文は不要）:
{
  "level_analysis": {
    "current_level": "現在の演奏レベル",
    "target_level": "30日後の演奏目標",
    "gap": "現在地と目標の差を一言で",
    "trial_date": "約30日後",
    "strengths": ["得意・習得済み"],
    "weaknesses": ["未習得・苦手"],
    "predicted_milestone": "Week2末の演奏到達見込み"
  },
  "roadmap_reason": "この構成にした理由",
  "weekly_plan": [
    {"weeks": "1〜2", "theme": "基礎・フォーム", "focus": "身体化", "daily_tasks": "..."}
  ]
}
"""

_MUSIC_TOC_TEMPLATE = """あなたは音楽教材・楽譜の専門家です。
クリエイターが「{textbook_name}」を30日練習カレンダーに組み込むために、
教材の全章・セクションリストと「何日目に何を練習するか」の30日分割り当て計画を作成します。

## 返答形式（JSONのみ）
{{
  "ai_message": "ユーザーへの確認・説明（日本語・2〜3文以内）",
  "toc_items": ["章名・曲名・練習項目1", "章名・曲名・練習項目2", ...],
  "day_assignments": [
    {{"day": 1, "items": ["練習項目1", "練習項目2"]}},
    ...
  ]
}}

## Rules
- toc_itemsは教材の全章・曲・練習項目をリストアップ（有名教材はAIの知識から正確に）
- 有名教材（バイエル・ハノン・メトードローズ等）はAIの知識から実際の曲・練習番号を調べる
- day_assignmentsはユーザー指定のペースに従い30日に配分
- 同じ曲・練習を複数日にまたがらせてよい（反復練習が音楽の本質）
- ペース指定がなければ1日1〜2アイテムを目安に配分
"""

_MUSIC_QUALITY_CHECK = """あなたは音楽教育コースの設計アドバイザーです。
クリエイターが設定したコースのゴール・対象者・1日の学習時間・進行速度を見て、
そのペースでゴールに到達するのが現実的かどうかを判定してください。

【判定基準】
- 楽器習得には継続的な基礎練習が必要。1日15分未満での高い演奏目標は低い点数
- ゴール設定が具体的（「○○の曲を弾ける」「△△試験に合格する」）なら高い点数
- 対象者（初心者・中級者）とゴール難易度の整合性を見る

必ず以下のJSON形式のオブジェクトのみで出力してください（説明文・前置き・コードフェンスは一切不要）:
{{"score": 0から20の整数, "feedback": "改善提案コメント（1〜2文、具体的な代替案を含める）"}}
"""

_MUSIC_SELF_INTRO = """あなたは以下の人格プロファイルを持つ音楽コーチです。
この口調・指導スタイルを反映して、学習者に向けた自己紹介文を1つ生成してください。

以下を含めること:
- どんな学習者に向いているか
- 音楽指導で大切にしていること
- 一言励まし（音楽の楽しさや上達の喜びを伝える）

150〜200文字程度の自然な文章のみを出力してください（JSON形式ではなく、本文のみ）。
"""

_MUSIC_CHARACTER_CONCEPT = """あなたはアニメ・ライトノベル風キャラクターの設定デザイナーです。
ユーザーが入力したキャラクターのイメージをもとに、音楽学習コンテンツに使用するキャラクター設定を提案してください。
著作権で保護された既存キャラクターをそのまま模倣することなく、オリジナルのキャラクター設定を作成してください。
以下のJSON形式のみで返答してください。
{
  "name_suggestions": ["名前案1", "名前案2", "名前案3"],
  "first_person": "一人称",
  "tone": "口調の説明",
  "personality": "性格の説明",
  "sentence_ending": "語尾の特徴",
  "catchphrase": "口癖",
  "ng_words": ["NG表現1"],
  "sample_lines": ["音楽指導の場面でのセリフ例1", "セリフ例2", "セリフ例3"]
}"""

_MUSIC_TONE_PROFILE = """あなたはアニメ・ライトノベル風キャラクターの設定デザイナーです。
すでに名前や説明が決まっているキャラクターについて、音楽学習コンテンツで使う口調設定を提案してください。
既に決まっている項目があれば、その内容と矛盾しないように残りの項目を補ってください。
以下のJSON形式のみで返答してください。
{
  "first_person": "一人称",
  "tone": "口調の説明",
  "personality": "性格の説明",
  "sentence_ending": "語尾の特徴",
  "catchphrase": "口癖",
  "ng_words": ["NG表現1"],
  "background": "キャラクターの背景設定・世界観（音楽歴・得意ジャンル等）",
  "reaction_patterns": "感情・リアクションパターン",
  "speaking_samples": ["音楽指導の場面でのメッセージ例1", "例2", "例3"]
}"""

_MUSIC_PERSONALIZE_SYSTEM = """あなたは音楽教育の個別コーチです。
以下の学習者の回答（クリエイターが設定した診断質問への回答）とコース骨格をもとに、
その学習者専用の30日チェックリストを生成してください。

コース骨格の各日には checklist_items（テキストと分数のリスト）が入っています。
学習者の回答に応じて、各日の checklist_items を追加・削除・minutes調整してください。

【調整ルール】
1. 経験がある技術（コード・スケール等）は基礎的な項目を短縮し、応用・演奏に集中させる
2. 苦手な技術は関連アイテムを追加し丁寧に時間をかける
3. 学習時間の制約がある場合はそれに合わせてtotalを抑える
4. 休息日（is_rest_day=true）は adjusted_checklist_items を空配列にする
5. 追加アイテムは「具体的な練習内容」として自然な日本語で書く（曲名・BPM・回数を含める）
6. 増減は1アイテムあたり最大15分まで

必ず以下のJSON形式のみで出力してください:
{
  "days": [
    {
      "day": 1,
      "adjusted_checklist_items": [
        {"text": "具体的な練習タスク", "minutes": 20}
      ],
      "personalize_reason": "調整理由（20文字以内）"
    }
  ]
}
"""

_MUSIC_DAILY_ADJUST_SYSTEM = """あなたは音楽学習コースの日次タスク調整AIです。
学習者の前日の学習報告をもとに、今日のチェックリストを微調整してください。

調整ルール:
- 未完了アイテムが多い・「難しかった」「指が動かない」などのメモ → 全体を10〜20%削減（BPMを下げるか、アイテムを減らす）
- 全アイテム完了・「余裕があった」「もっとやりたい」などのメモ → 5〜10%増加（BPM引き上げやアイテム追加）
- 普通に完了（特記なし・メモなし） → 変更なし
- 各アイテムの分数変更は最大±15分、5分単位に丸める（最低5分）
- 追加アイテムはその日のthemeに沿った音楽練習タスクを具体的に作成する

以下のJSON形式のみで返してください:
{"adjusted_checklist_items": [{"text": "...", "minutes": ...}], "reason": "調整理由（20文字以内）"}
"""

_MUSIC_DEFAULT_QUESTIONS = [
    {"question_text": "演奏する楽器と経験年数を教えてください。（例: ギター2年）", "answer_type": "text", "options": None, "is_required": True},
    {"question_text": "このコースで達成したいことは何ですか？", "answer_type": "single", "options": ["特定の曲を弾けるようにする", "音楽理論を身につける", "試験・資格に合格する", "趣味として楽しむ"], "is_required": True},
    {"question_text": "1日に確保できる練習時間はどのくらいですか？", "answer_type": "single", "options": ["15分", "30分", "1時間", "1時間以上"], "is_required": True},
    {"question_text": "特に苦手な技術・分野はありますか？（例: バレーコード、リズム読み）", "answer_type": "text", "options": None, "is_required": False},
]

MUSIC_CONFIG = SubjectConfig(
    key="music",
    label="音楽",
    task_types=[],
    course_day_generation_system=_MUSIC_COURSE_DAY_SYSTEM,
    classify_system=_MUSIC_CLASSIFY_SYSTEM,
    answer_style_by_type=_MUSIC_ANSWER_STYLE,
    diagnosis_welcome_system=_MUSIC_DIAGNOSIS_WELCOME,
    roadmap_generation_system=_MUSIC_ROADMAP_SYSTEM,
    toc_chat_system_template=_MUSIC_TOC_TEMPLATE,
    quality_check_system=_MUSIC_QUALITY_CHECK,
    self_intro_system=_MUSIC_SELF_INTRO,
    character_concept_system=_MUSIC_CHARACTER_CONCEPT,
    tone_profile_system=_MUSIC_TONE_PROFILE,
    personalize_system=_MUSIC_PERSONALIZE_SYSTEM,
    daily_adjust_system=_MUSIC_DAILY_ADJUST_SYSTEM,
    default_diagnosis_questions=_MUSIC_DEFAULT_QUESTIONS,
)


# ===== レジストリ =====================================================
SUBJECT_REGISTRY: dict[str, SubjectConfig] = {
    "english": ENGLISH_CONFIG,
    "it": IT_CONFIG,
    "music": MUSIC_CONFIG,
}

SUBJECT_CHOICES = [
    {"key": "english", "label": "英語"},
    {"key": "it", "label": "IT・プログラミング"},
    {"key": "music", "label": "音楽"},
]

SUBJECT_CATEGORY_MAP: dict[str, list[str]] = {
    "english": ["TOEIC", "TOEFL", "IELTS", "英検", "英会話", "ビジネス英語", "英文法", "英作文"],
    "it": ["Python", "JavaScript", "TypeScript", "AWS", "データベース", "アルゴリズム", "セキュリティ", "Web開発", "モバイル開発"],
    "music": ["ピアノ", "ギター", "DTM", "音楽理論", "ボーカル", "ドラム", "ベース", "作曲・編曲"],
}


def get_subject_config(subject: str) -> SubjectConfig:
    if subject not in SUBJECT_REGISTRY:
        raise ValueError(f"Unknown subject: {subject!r}. Valid: {list(SUBJECT_REGISTRY)}")
    return SUBJECT_REGISTRY[subject]


def get_subject_label(subject: str) -> str:
    return SUBJECT_REGISTRY.get(subject, ENGLISH_CONFIG).label


def get_category_options(subject: str) -> list[str]:
    return SUBJECT_CATEGORY_MAP.get(subject, SUBJECT_CATEGORY_MAP["english"])
