# Day1初回診断チャット・30日ロードマップ生成のプロンプト設計。
# 設計書: docs/第2版/ManaVillage_Day1_初回診断フロー詳細仕様_v1.1.md
#         docs/第2版/ManaVillage_詳細設計書_v1.1.md セクション2.2（事業検証ポイント②）
#
# Day1診断の質問は固定7問を廃止し、クリエイターがコース作成時に設定するカスタム質問のみで構成する。
import json


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
その学習者専用の30日ロードマップを生成してください。

このコースの目標・評価軸は、点数化された試験（TOEIC等）に限らない（会話力・発話量・習慣化など様々な形がある）。
学習者の回答やコースのゴールから、そのコースに合った現在地・目標の表現方法を自分で判断して使うこと。
スコアの言及が無いコースに対して、勝手にTOEIC等の試験スコアを想定して出力してはならない。

【生成の3原則】
1. 具体性: 「リスニングを強化する」ではなく「Part 3のディクテーションを毎日10分」のように
           教材名・時間・具体的な行動まで落とす
2. 制約への言及: 学習時間・苦手分野・使用教材などの制約を計画の中で明示的に活かす
3. 中間目標の提示: 「このペースで続ければWeek6には○○ができるようになる見込み」のように、
                  そのコースの評価軸に合った中間予測を必ず含める（数値スコアに限らず、
                  「○分間の会話ができる」「○周完了」など、コースの性質に合った表現でよい）

以下のJSON形式のみで出力してください（説明文は不要）:
{
  "level_analysis": {
    "current_level": "現在地の説明（このコースの評価軸に合った表現。例: TOEIC580点 / 日常会話で詰まらず話せるレベル / 単語帳1周目）",
    "target_level": "目標の説明（同上の評価軸で）",
    "gap": "現在地と目標の差を一言で（例: +220点 / あと3段階 / 残り2周）",
    "trial_date": "約30日後",
    "strengths": ["得意・既習の分野"],
    "weaknesses": ["苦手・未着手の分野"],
    "predicted_milestone": "Week6時点での中間目標の見込み（このコースの評価軸で）"
  },
  "roadmap_reason": "なぜこの配分にしたかの理由（学習者の回答の制約を踏まえて）",
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

weekly_planは既存の30日コース構造（週単位テーマ）の週数・テーマ構成にできるだけ沿わせつつ、
学習者の診断結果に応じてfocus_reason（強調ポイント）をパーソナライズしてください
（カリキュラム自体の大枠は変更せず、声かけと優先順位だけを変える）。
"""


def build_roadmap_generation_messages(
    custom_qa: list[str],
    personality_profile: dict,
    course_week_themes: list[dict],
) -> list[dict]:
    qa_text = "\n".join(custom_qa) if custom_qa else "（クリエイターが診断質問を設定していないため、回答データはありません。人格プロファイルとコース構造から一般的なプランを作成してください）"
    content = (
        f"【学習者の回答（クリエイターが設定した質問への回答）】\n{qa_text}\n\n"
        f"【クリエイターの人格プロファイル】\n{json.dumps(personality_profile, ensure_ascii=False, indent=2)}\n\n"
        f"【既存の30日コース構造（週単位テーマ）】\n{json.dumps(course_week_themes, ensure_ascii=False, indent=2)}\n\n"
        f"上記の学習者の回答から、現在地・目標・制約（学習時間など）を読み取れる範囲で解釈し、"
        f"level_analysisやroadmap_reasonに反映してください。回答に明記されていない項目は、"
        f"人格プロファイルとコース構造から妥当な前提を補って構いません。"
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
今月の振り返りに加え、当初の目標（30日ロードマップ）との差分を確認し、
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
        f"【当初の30日ロードマップ】\n"
        f"レベル分析: {json.dumps(level_analysis, ensure_ascii=False) if level_analysis else '不明'}\n"
        f"計画の理由: {roadmap_reason or '不明'}\n\n"
        f"【クリエイターの人格プロファイル】\n{json.dumps(personality_profile, ensure_ascii=False, indent=2)}"
    )
    return [{"role": "user", "content": content}]
