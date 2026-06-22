# Day1初回診断チャット・90日ロードマップ生成のプロンプト設計。
# 設計書: docs/第2版/ManaVillage_Day1_初回診断フロー詳細仕様_v1.1.md
#         docs/第2版/ManaVillage_詳細設計書_v1.1.md セクション2.2（事業検証ポイント②）
import json

# 各質問のkeyはLearnerProfileのカラム名と一致させている
FIXED_QUESTIONS = [
    {
        "key": "current_score",
        "question": "現在のTOEICスコアを教えてください。",
        "type": "number_or_unattempted",  # 数値入力 + 「未受験」チェックボックス
    },
    {
        "key": "target_score",
        "question": "目標スコアはいくつですか？",
        "type": "number",
    },
    {
        "key": "exam_date",
        "question": "試験を受ける予定の時期を教えてください。",
        "type": "choice",
        "options": ["1ヶ月以内", "2〜3ヶ月後", "4〜6ヶ月後", "半年以上先", "まだ決めていない"],
    },
    {
        "key": "daily_study_time",
        "question": "1日に英語学習に使える時間はどのくらいですか？",
        "type": "choice",
        "options": ["15分程度", "30分程度", "1時間程度", "2時間以上"],
    },
    {
        "key": "weak_areas",
        "question": "英語で一番苦手だと感じる分野はどれですか？（複数選択可）",
        "type": "multi_choice",
        "options": ["リスニング", "文法", "語彙・単語", "読解", "全体的に苦手"],
    },
    {
        "key": "study_history",
        "question": "これまで英語学習でどんなことをしてきましたか？",
        "type": "text",
    },
    {
        "key": "materials",
        "question": "今使っている（または使う予定の）教材があれば教えてください。",
        "type": "text",
        "required": False,
    },
]


WELCOME_MESSAGE_SYSTEM = """あなたは以下の人格プロファイルを持つ英語学習コーチです。
この口調・励まし方の特徴を反映して、これから初回診断チャットを始める学習者への
ウェルカムメッセージを1つ生成してください。

以下を含めること:
- 挨拶
- これから現状を教えてもらうための質問をする旨の案内
- 気軽に答えてほしいという一言

200文字程度の自然な会話文のみを出力してください（JSON形式ではなく、メッセージ本文のみ）。
"""


def build_welcome_message_messages(personality_profile: dict) -> list[dict]:
    return [{
        "role": "user",
        "content": f"【人格プロファイル】\n{json.dumps(personality_profile, ensure_ascii=False, indent=2)}",
    }]


ROADMAP_GENERATION_SYSTEM = """あなたは英語学習の専門コーチです。
以下の学習者の診断データとクリエイターの人格プロファイルをもとに、
その学習者専用の90日ロードマップを生成してください。

【生成の3原則】
1. 具体性: 「リスニングを強化する」ではなく「Part 3のディクテーションを毎日10分」のように
           教材名・時間・具体的な行動まで落とす
2. 制約への言及: 学習時間・苦手分野・使用教材などの制約を計画の中で明示的に活かす
3. 予測スコアの提示: 「このペースで続ければWeek6に○○点ライン突破の見込み」という
                    中間予測を必ず含める

以下のJSON形式のみで出力してください（説明文は不要）:
{
  "level_analysis": {
    "current_score": "580点",
    "target_score": "800点",
    "gap": "+220点",
    "trial_date": "約90日後",
    "strengths": ["読解"],
    "weaknesses": ["リスニング", "語彙"],
    "predicted_milestone": "Week6時点で推定650点突破の見込み"
  },
  "roadmap_reason": "読解はすでに得意なため、スコア伸長余地の大きいリスニングと語彙に重点配分しています。学習時間30分/日という制約のもと、無理なく継続できる量に調整しました。",
  "weekly_plan": [
    {
      "weeks": "1〜2",
      "theme": "学習習慣の確立・現状把握",
      "milestone": "毎日30分の継続",
      "focus_reason": "まず継続を最優先。量より習慣を作る期間"
    }
  ],
  "day1_tasks": [
    "診断チャットへの回答(完了済み)",
    "{使用教材名}のPart 1 Set 1を解く",
    "単語アプリで20語学習"
  ],
  "creator_message": "人格プロファイルを適用したメッセージ"
}

weekly_planは既存の90日コース構造（週単位テーマ）の週数・テーマ構成にできるだけ沿わせつつ、
学習者の診断結果に応じてfocus_reason（強調ポイント）をパーソナライズしてください
（カリキュラム自体の大枠は変更せず、声かけと優先順位だけを変える）。
"""


def build_roadmap_generation_messages(
    learner_profile,
    personality_profile: dict,
    course_week_themes: list[dict],
) -> list[dict]:
    current_score = f"{learner_profile.current_score}点" if learner_profile.current_score is not None else "未受験"
    content = (
        f"【診断データ】\n"
        f"現在スコア: {current_score}\n"
        f"目標スコア: {learner_profile.target_score}点\n"
        f"試験予定: {learner_profile.exam_date}\n"
        f"1日の学習時間: {learner_profile.daily_study_time}\n"
        f"苦手分野: {', '.join(learner_profile.weak_areas)}\n"
        f"学習歴: {learner_profile.study_history or '特になし'}\n"
        f"使用教材: {learner_profile.materials or '特になし（指定の教材があれば必ずタスクに組み込む）'}\n\n"
        f"【クリエイターの人格プロファイル】\n{json.dumps(personality_profile, ensure_ascii=False, indent=2)}\n\n"
        f"【既存の90日コース構造（週単位テーマ）】\n{json.dumps(course_week_themes, ensure_ascii=False, indent=2)}"
    )
    return [{"role": "user", "content": content}]


# 週次レビュー生成プロンプト（要件定義書5.5、詳細設計書2.6）
WEEKLY_REVIEW_SYSTEM = """以下の学習ログをもとに、学習者への週次フィードバックを生成してください。
クリエイターの人格プロファイルの口調で返してください。

以下のJSON形式のみで出力してください（説明文は不要）:
{
  "weekly_summary": "今週の振り返り文（クリエイター口調）",
  "achievement": "良かった点を具体的に",
  "challenge": "来週の課題を1点に絞る",
  "next_week_focus": "来週のテーマと重点タスク",
  "encouragement": "クリエイター口調の励ましメッセージ"
}
"""


def build_weekly_review_messages(
    personality_profile: dict,
    week_number: int,
    completed_days: int,
    completed_tasks: int,
    incomplete_tasks: int,
    question_categories: list[str],
    top_weakness: str | None,
) -> list[dict]:
    content = (
        f"【分析データ】\n"
        f"対象週: 第{week_number}週\n"
        f"今週の学習日数: {completed_days} / 7日\n"
        f"完了タスク数: {completed_tasks}\n"
        f"未完了タスク数: {incomplete_tasks}\n"
        f"チャットでの質問カテゴリ: {', '.join(question_categories) if question_categories else 'なし'}\n"
        f"最も苦手な分野（質問頻度）: {top_weakness or '特に目立った傾向はなし'}\n\n"
        f"【クリエイターの人格プロファイル】\n{json.dumps(personality_profile, ensure_ascii=False, indent=2)}"
    )
    return [{"role": "user", "content": content}]


# 月次レビュー生成プロンプト（要件定義書5.5: 目標との差分確認・学習計画修正）
MONTHLY_REVIEW_SYSTEM = """以下の学習ログをもとに、学習者への月次レビューを生成してください。
クリエイターの人格プロファイルの口調で返してください。
今月の振り返りに加え、当初の目標（90日ロードマップ）との差分を確認し、
必要であれば残り期間の学習計画の修正案を提示してください。

以下のJSON形式のみで出力してください（説明文は不要）:
{
  "monthly_summary": "今月の振り返り文（クリエイター口調）",
  "progress_vs_goal": "当初目標との差分（順調/遅れ/超過などの評価と理由）",
  "achievement": "今月の良かった点を具体的に",
  "challenge": "来月に向けた課題",
  "plan_adjustment": "残り期間の学習計画の修正案（変更不要な場合はその旨）",
  "encouragement": "クリエイター口調の励ましメッセージ"
}
"""


def build_monthly_review_messages(
    personality_profile: dict,
    month_number: int,
    roadmap_reason: str | None,
    level_analysis: dict | None,
    completed_days: int,
    total_days: int,
    completed_tasks: int,
    incomplete_tasks: int,
    question_categories: list[str],
) -> list[dict]:
    content = (
        f"【分析データ】\n"
        f"対象月: 第{month_number}ヶ月\n"
        f"今月の学習日数: {completed_days} / {total_days}日\n"
        f"完了タスク数: {completed_tasks}\n"
        f"未完了タスク数: {incomplete_tasks}\n"
        f"チャットでの質問カテゴリ: {', '.join(question_categories) if question_categories else 'なし'}\n\n"
        f"【当初の90日ロードマップ】\n"
        f"レベル分析: {json.dumps(level_analysis, ensure_ascii=False) if level_analysis else '不明'}\n"
        f"計画の理由: {roadmap_reason or '不明'}\n\n"
        f"【クリエイターの人格プロファイル】\n{json.dumps(personality_profile, ensure_ascii=False, indent=2)}"
    )
    return [{"role": "user", "content": content}]
