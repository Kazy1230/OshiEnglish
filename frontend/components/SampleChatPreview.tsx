export function SampleChatPreview({
  characterName,
  avatarUrl,
  sampleReply,
  compact = false,
}: {
  characterName: string;
  avatarUrl?: string | null;
  sampleReply?: string | null;
  compact?: boolean;
}) {
  if (!sampleReply) return null;

  return (
    <div className={compact ? "flex flex-col gap-3" : "card shadow-soft flex flex-col gap-3"}>
      {!compact && <p className="text-xs font-bold" style={{ color: "var(--primary)" }}>💬 チャットのサンプル</p>}
      <div className="flex flex-col gap-3 p-4 rounded-xl" style={{ background: "var(--bg)" }}>
        <div className="self-end max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed" style={{ background: "var(--ink)", color: "white" }}>
          最近やる気が出なくて、続けられるか不安です…
        </div>
        <div className="flex items-start gap-2 max-w-[85%] self-start">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
          ) : (
            <span className="w-8 h-8 rounded-full flex items-center justify-center text-base flex-shrink-0" style={{ background: "var(--example-bg, #eee)" }}>🎭</span>
          )}
          <div className="rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap" style={{ background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)" }}>
            {sampleReply}
          </div>
        </div>
      </div>
      {!compact && <p className="text-xs" style={{ color: "var(--muted)" }}>※ サンプルです。実際の会話はコース購入後にご利用いただけます。</p>}
    </div>
  );
}
