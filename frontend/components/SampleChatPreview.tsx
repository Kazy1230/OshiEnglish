export function SampleChatPreview({ characterName, tags, compact = false }: { characterName: string; tags: string[]; compact?: boolean }) {
  const styleHint = tags[0] ? `（${tags[0]}）` : "";
  return (
    <div className={compact ? "flex flex-col gap-2" : "card flex flex-col gap-3"}>
      <p className="text-xs font-bold" style={{ color: "var(--primary)" }}>チャットのサンプル{styleHint}</p>
      <div className="flex flex-col gap-2">
        <div className="self-end max-w-[85%] rounded-2xl px-3 py-1.5 text-xs" style={{ background: "var(--primary)", color: "white" }}>
          最近やる気が出なくて、続けられるか不安です…
        </div>
        <div className="self-start max-w-[85%] rounded-2xl px-3 py-1.5 text-xs" style={{ background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)" }}>
          そう感じる時もありますよね。{characterName}が伴走するので、無理せず今日できる小さな一歩から一緒に進めていきましょう。
        </div>
      </div>
      {!compact && <p className="text-xs" style={{ color: "var(--muted)" }}>※ サンプルです。実際の会話はコース購入後にご利用いただけます。</p>}
    </div>
  );
}
