def build_daily_adjust_messages(
    completed_indices: list[int] | None,
    all_items: list[dict],
    memo: str | None,
    tomorrow_items: list[dict],
    subject: str = "english",
) -> list[dict]:
    from app.core.subject_config import get_subject_config
    config = get_subject_config(subject)

    if completed_indices is None:
        completion_line = "報告: 全アイテム完了"
    else:
        completed_texts = [all_items[i]["text"] for i in completed_indices if i < len(all_items)]
        skipped_texts = [item["text"] for i, item in enumerate(all_items) if i not in completed_indices]
        completion_line = f"完了アイテム: {completed_texts}, 未完了アイテム: {skipped_texts}"

    lines = [completion_line]
    if memo:
        lines.append(f"学習者のメモ: {memo}")
    lines.append(f"\n今日の現在のチェックリスト計画:\n{tomorrow_items}")

    return [
        {"role": "system", "content": config.daily_adjust_system},
        {"role": "user", "content": "\n".join(lines)},
    ]
