/**
 * UI上は静かに失敗させたい（バッジが出ない等）が、運用上は気づけるようにしたいエラーを記録する。
 * 現状はconsole.errorのみだが、将来Sentry等の監視サービスに繋ぐ際はここを差し替えれば良い。
 */
export function reportError(context: string, err: unknown) {
  console.error(`[${context}]`, err);
}
