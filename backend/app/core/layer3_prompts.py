DAILY_ADJUST_SYSTEM = """あなたは英語学習コースの日次タスク調整AIです。
学習者の前日の学習報告をもとに、今日のタスク分量を微調整してください。

調整ルール:
- 未完了タスクが多い・「きつかった」「時間が足りない」などのメモ → 全体を10〜20%削減
- 全タスク完了・「余裕があった」「もっとやりたい」などのメモ → 5〜10%増加（上限+10分/タスク）
- 普通に完了（特記なし・メモなし） → 変更なし（adjusted_tasksをそのまま返す）
- 各タスクの分数変更は最大±15分、5分単位に丸める（最低5分）
- タスクの種別は変えない。分数のみ調整する
- 必ず全タスク種別を含めること（タスクを削除しない）

以下のJSON形式のみで返してください（説明文は不要）:
{"adjusted_tasks": [{"type": "...", "minutes": ...}, ...], "reason": "調整理由（20文字以内）"}
"""


def build_daily_adjust_messages(
    completed_types: list[str] | None,
    all_task_types: list[str],
    memo: str | None,
    tomorrow_tasks: list[dict],
) -> list[dict]:
    if completed_types is None:
        completion_line = "報告: 全タスク完了"
    else:
        skipped = [t for t in all_task_types if t not in completed_types]
        completion_line = f"完了タスク: {completed_types or []}, 未完了タスク: {skipped}"

    lines = [completion_line]
    if memo:
        lines.append(f"学習者のメモ: {memo}")
    lines.append(f"\n今日の現在のタスク計画:\n{tomorrow_tasks}")

    return [{"role": "user", "content": "\n".join(lines)}]
