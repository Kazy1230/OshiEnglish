"use client";
import { useEffect, useRef, useState } from "react";
import { useCourseChat } from "@/lib/useCourseChat";

type Character = { name: string; avatar_url?: string | null } | null | undefined;

const QUICK_ACTIONS = [
  { id: "half_done", label: "半分できました！", icon: "📖" },
  { id: "struggled", label: "今日はきつかったです…", icon: "😓" },
  { id: "done_all", label: "全部終わりました！", icon: "✅" },
];

/** コース詳細ページに埋め込む、フルチャット画面をコンパクトにしたカード。 */
export function CompactChatCard({ courseId, character, tier }: { courseId: number; character: Character; tier?: "A" | "B" | null }) {
  const { messages, loading, sending, streamingText, sendMessage } = useCourseChat(courseId);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasScrolledOnceRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: hasScrolledOnceRef.current ? "smooth" : "auto", block: "nearest" });
    hasScrolledOnceRef.current = true;
  }, [messages, streamingText]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    const body = draft;
    setDraft("");
    await sendMessage(body);
  }

  const avatarEl = character?.avatar_url ? (
    <img src={character.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
  ) : (
    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0" style={{ background: "var(--ink)", color: "white" }}>🎭</div>
  );

  return (
    <div className="card overflow-hidden p-0 flex flex-col">
      {/* ヘッダー */}
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ background: "linear-gradient(135deg, var(--ink), var(--accent))" }}>
        {character?.avatar_url ? (
          <img src={character.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-white/40" />
        ) : (
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-base ring-2 ring-white/40" style={{ background: "rgba(255,255,255,0.2)" }}>🎭</div>
        )}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <p className="text-sm font-bold text-white truncate">{character?.name ?? "メンター"}</p>
          {tier && (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "rgba(255,255,255,0.25)", color: "white" }}>
              Tier {tier}
            </span>
          )}
        </div>
      </div>

      {/* メッセージ一覧 */}
      <div className="flex flex-col gap-2.5 px-4 py-3 overflow-y-auto" style={{ height: "min(60vh, 520px)" }}>
        {loading ? (
          <p className="text-xs text-center py-8" style={{ color: "var(--muted)" }}>読み込み中…</p>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && avatarEl}
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs whitespace-pre-wrap leading-relaxed ${
                  msg.role === "user" ? "rounded-br-md" : "rounded-bl-md"
                }`}
                style={
                  msg.role === "user"
                    ? { background: "var(--ink)", color: "white" }
                    : { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" }
                }
              >
                {msg.is_draft && (
                  <p className="text-[10px] font-bold mb-1" style={{ color: "var(--muted)" }}>講師が確認中（下書き）</p>
                )}
                {msg.body}
              </div>
            </div>
          ))
        )}

        {streamingText !== null && (
          <div className="flex gap-2 justify-start">
            {avatarEl}
            <div
              className="max-w-[80%] rounded-2xl rounded-bl-md px-3 py-2 text-xs whitespace-pre-wrap leading-relaxed"
              style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" }}
            >
              {streamingText || (
                <span className="flex items-center gap-1">
                  {[0, 1, 2].map(i => (
                    <span key={i} className="w-1 h-1 rounded-full animate-bounce inline-block" style={{ background: "var(--muted)", animationDelay: `${i * 0.15}s` }} />
                  ))}
                </span>
              )}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* クイックアクション */}
      <div className="flex gap-2 px-4 pt-1 flex-shrink-0 overflow-x-auto">
        {QUICK_ACTIONS.map(action => (
          <button
            key={action.id}
            type="button"
            onClick={() => sendMessage(action.label)}
            disabled={sending}
            className="text-[11px] whitespace-nowrap px-2.5 py-1 rounded-full disabled:opacity-40 transition-opacity"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            {action.icon} {action.label}
          </button>
        ))}
      </div>

      {/* 入力フォーム */}
      <form onSubmit={handleSend} className="flex gap-2 px-4 py-3 flex-shrink-0">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="メッセージを送る…"
          className="flex-1 text-sm"
          disabled={sending}
        />
        <button type="submit" disabled={sending || !draft.trim()} className="btn-primary text-sm disabled:opacity-40">
          送信
        </button>
      </form>
    </div>
  );
}
