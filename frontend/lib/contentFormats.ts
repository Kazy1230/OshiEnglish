export type Format = {
  key: string; label: string; icon: string; mediaType: "text" | "video";
  defaultVal: number; unit: string; minVal: number; maxVal: number; hint: string;
};

export const FORMATS: Format[] = [
  { key: "x", label: "X（ツイート）", icon: "𝕏", mediaType: "text", defaultVal: 140, unit: "文字", minVal: 50, maxVal: 280, hint: "短くパンチのある一言が刺さる" },
  { key: "threads", label: "Threads", icon: "ꝋ", mediaType: "text", defaultVal: 500, unit: "文字", minVal: 100, maxVal: 500, hint: "少し長めで深みのある投稿" },
  { key: "instagram_post", label: "インスタ投稿", icon: "📸", mediaType: "text", defaultVal: 1000, unit: "文字", minVal: 300, maxVal: 2000, hint: "絵文字＋ハッシュタグで拡散" },
  { key: "instagram_reel", label: "インスタReels", icon: "🎞", mediaType: "video", defaultVal: 60, unit: "秒", minVal: 15, maxVal: 90, hint: "冒頭3秒でフックが命" },
  { key: "youtube_short", label: "YouTubeショート", icon: "⚡", mediaType: "video", defaultVal: 60, unit: "秒", minVal: 15, maxVal: 60, hint: "縦型・60秒以内のテンポ重視" },
  { key: "youtube", label: "YouTube動画", icon: "▶", mediaType: "video", defaultVal: 480, unit: "秒", minVal: 120, maxVal: 1800, hint: "じっくり解説・信頼構築に最適" },
];
