/** 演習問題データに音声（リスニング）が含まれているかを判定する。
 * audio_url / questions[].audio_url、または instructions・questions[].prompt内の
 * [[audio:...]] プレースホルダーのいずれかがあれば「リスニング問題」とみなす。 */
export function hasListeningAudio(data: any): boolean {
  if (!data || typeof data !== "object") return false;
  if (data.audio_url) return true;
  const texts: string[] = [String(data.instructions ?? "")];
  const questions: any[] = Array.isArray(data.questions) ? data.questions : [];
  for (const q of questions) {
    if (q?.audio_url) return true;
    texts.push(String(q?.prompt ?? ""));
  }
  return texts.some(t => t.includes("[[audio:"));
}
