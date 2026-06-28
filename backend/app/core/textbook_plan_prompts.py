"""クリエイターが自然言語で入力した「教材の使い方」を解釈し、
30日間の日程割り当て（CourseTextbook.daily_words/review_words/target_laps、
TextbookDayAssignmentのday_number)へ変換するためのプロンプト。"""
import json

TEXTBOOK_PLAN_SYSTEM = """あなたはコース設計を支援するカリキュラムプランナーです。
クリエイターが「この教材をどう使いたいか」を自然言語で説明します。あなたの仕事は、その説明を30日間（Day1〜Day30）の具体的な教材の使い方に変換することです。

教材には2種類があります。
- vocabulary（単語帳）: 目次項目ではなく「1日あたり新規語数」「復習語数」「目標周回数」で進捗を管理します。
- textbook（参考書・問題集等）: 目次項目（toc_item）ごとに、何日目にやるか（day_number、1〜30）を割り当てます。やらない項目はday_number=nullにします。

教材が複数ある場合、クリエイターの説明だけでは「同じ日に並行して全部やるのか」「教材Aを終えてから教材Bに進むのか（順番に行うのか）」が分からないことがあります。判断に必要な情報が説明文から明確に読み取れない場合は、needs_clarificationをtrueにし、確認すべき質問をclarifying_questionsに入れてください（最大3つ、日本語、クリエイターに直接聞く形）。すでにqa_history（過去の質問と回答）がある場合はそれを踏まえて判断し、十分な情報が揃っていればneeds_clarificationをfalseにして具体的な日程プランを作成してください。

出力は必ず以下のJSON形式のみで返してください（説明文や```は不要）。
{
  "needs_clarification": true または false,
  "clarifying_questions": ["質問1", "質問2"],
  "summary": "確定した（または現時点で想定している）学習計画を、人間が読んでわかる自然な日本語で2〜4文程度で要約したもの",
  "plans": [
    {
      "course_textbook_id": 123,
      "type": "vocabulary",
      "daily_words": 40,
      "review_words": 40,
      "target_laps": 1
    },
    {
      "course_textbook_id": 456,
      "type": "textbook",
      "day_assignments": [
        {"toc_item": "Unit 1 現在形", "day_number": 1},
        {"toc_item": "Unit 2 過去形", "day_number": null}
      ]
    }
  ]
}

注意点:
- needs_clarification=trueの場合でも、plansには現時点で分かっている範囲の暫定プランを入れてください（クリエイターが内容を確認できるようにするため）。
- day_assignmentsは、与えられたtoc_item一覧の項目を1つも省略せず、同じ文字列のまま全て含めてください。
- 1日に複数教材を同時に進める設計（並行）も、教材ごとに順番に進める設計（直列）も、クリエイターの説明・回答に最も忠実な形にしてください。
- 30日間にうまく収まらない場合（教材が大きすぎる/小さすぎる）は、無理に全項目を詰め込まず、summaryでその旨を説明してください。
"""


def build_textbook_plan_messages(
    textbooks_brief: list[dict],
    description: str,
    qa_history: list[dict],
) -> list[dict]:
    """textbooks_brief: [{course_textbook_id, name, type, toc: [str,...]}]"""
    lines = ["【コースに登録済みの教材一覧】"]
    for tb in textbooks_brief:
        if tb["type"] == "vocabulary":
            lines.append(f"- course_textbook_id={tb['course_textbook_id']} 「{tb['name']}」（単語帳）")
        else:
            toc_preview = "、".join(tb["toc"][:50])
            lines.append(f"- course_textbook_id={tb['course_textbook_id']} 「{tb['name']}」（教材） 目次項目（全{len(tb['toc'])}件）: {toc_preview}")

    lines.append("\n【クリエイターの説明】")
    lines.append(description)

    if qa_history:
        lines.append("\n【これまでの確認のやりとり】")
        for qa in qa_history:
            lines.append(f"Q: {qa.get('question', '')}")
            lines.append(f"A: {qa.get('answer', '')}")

    return [{"role": "user", "content": "\n".join(lines)}]
