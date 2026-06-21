# 90日伴走コース自動生成のプロンプト設計。
# 設計書: docs/第2版/ManaVillage_コース生成ワークフロー詳細仕様.md セクション5
#
# 90日を13週（1〜12週=各7日、13週=6日、合計90日）に分割し、週ごとにAIへ生成依頼する。
# 1回のAPI呼び出しで90日分を生成すると出力トークン量・JSON崩れのリスクが大きいため、
# 週単位（最大7日分）で生成することで安定性を優先する設計とした
# （詳細設計書が想定する「30〜60秒の一括生成」は、フロントエンド側で
#  13週分の生成をプログレスバー付きで順次実行することで体感的に再現する）。
import json
import re

WEEK_PHASES = [
    (1, 2, "基礎固め期"),
    (3, 8, "実力養成期"),
    (9, 12, "実戦演習期"),
    (13, 13, "仕上げ・本番準備期"),
]


def phase_label_for_week(week_number: int) -> str:
    for start, end, label in WEEK_PHASES:
        if start <= week_number <= end:
            return label
    return "学習期"


def days_in_week(week_number: int) -> int:
    """週ごとの日数。1〜12週は7日、13週のみ6日（合計90日）。"""
    return 6 if week_number == 13 else 7


COURSE_DAY_GENERATION_SYSTEM = """あなたは英語学習の専門コーチです。
クリエイターの人格プロファイルとコース基本情報をもとに、90日伴走コースの指定された週の
日単位コンテンツを生成してください。

以下のJSON形式の配列のみで出力してください（説明文は不要）。配列の要素数は指定された日数と必ず一致させてください:
[
  {
    "day": 1,
    "theme": "その日の学習テーマ（短く具体的に）",
    "tasks": ["タスク1", "タスク2", "タスク3"],
    "ai_message": {
      "morning": "朝に届く声かけメッセージ（人格プロファイルの口調で）",
      "evening_reminder": "夜に届くリマインドメッセージ",
      "completion": "学習報告完了時に届く労いメッセージ"
    },
    "is_rest_day": false
  }
]

注意:
- ai_messageの3項目は必ず人格プロファイルの口調・語尾・口癖を反映すること
- 週の学習フェーズ（基礎固め/実力養成/実戦演習/仕上げ）に沿った難易度・内容にすること
- 学習強度（1日あたりの学習時間目安）を超えない量のタスクにすること
- 適度に休息日（is_rest_day=true）を含めてよいが、週6〜7日のうち1日程度に留めること
"""


def build_course_day_generation_messages(
    personality_profile: dict,
    course_title: str,
    goal: str,
    target_learner: str,
    intensity: str,
    week_number: int,
    day_start: int,
    day_count: int,
) -> list[dict]:
    phase = phase_label_for_week(week_number)
    content = (
        f"【人格プロファイル】\n{json.dumps(personality_profile, ensure_ascii=False, indent=2)}\n\n"
        f"【コース基本情報】\n"
        f"コース名: {course_title}\n"
        f"ゴール: {goal}\n"
        f"対象者: {target_learner}\n"
        f"学習強度: {intensity}\n\n"
        f"【生成対象】\n"
        f"第{week_number}週（{phase}）, Day{day_start}〜Day{day_start + day_count - 1} の{day_count}日分を生成してください。"
    )
    return [{"role": "user", "content": content}]


def extract_json_array(text: str) -> list:
    """AI応答からJSON配列を取り出す（```json フェンス除去→[ ]の最外周を抜き出して解析）。"""
    from app.core.llm import LLMError

    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.MULTILINE).strip()
    start = cleaned.find("[")
    end = cleaned.rfind("]")
    if start == -1 or end == -1 or end <= start:
        raise LLMError("AIの応答からJSON配列を見つけられませんでした")
    try:
        return json.loads(cleaned[start:end + 1])
    except json.JSONDecodeError as e:
        raise LLMError(f"AIの応答をJSONとして解析できませんでした: {e}") from e
