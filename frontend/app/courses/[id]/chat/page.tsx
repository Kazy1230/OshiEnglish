"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/Skeleton";
import { toast } from "@/components/Toast";
import { useCourseChat } from "@/lib/useCourseChat";

type Character = { id: number; name: string; avatar_url?: string | null };

const QUICK_ACTIONS = [
  { id: "half_done", label: "半分できました！", icon: "📖" },
  { id: "struggled", label: "今日はきつかったです…", icon: "😓" },
  { id: "done_all", label: "全部終わりました！", icon: "✅" },
];

export default function CourseChatPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = Number(params.id);
  const [draft, setDraft] = useState("");
  const [character, setCharacter] = useState<Character | null>(null);
  const [tier, setTier] = useState<"A" | "B" | null>(null);
  const [progress, setProgress] = useState<{ completed: number; total: number; currentChapterTitle: string | null }>({
    completed: 0, total: 0, currentChapterTitle: null,
  });
  const [access, setAccess] = useState<"checking" | "granted" | "denied">("checking");
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasScrolledOnceRef = useRef(false);
  const textInputRef = useRef<HTMLInputElement>(null);

  const { messages, loading, sending, streamingText, upgradeCta, setUpgradeCta, sendMessage } = useCourseChat(courseId, { enabled: access === "granted" });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: hasScrolledOnceRef.current ? "smooth" : "auto" });
    hasScrolledOnceRef.current = true;
  }, [messages, streamingText]);

  useEffect(() => {
    async function init() {
      try {
        const detail = await api.getCourseDetail(courseId);
        if (!(detail.is_purchased || detail.is_free)) {
          toast("このコースを購入してからチャットを利用してください", "error");
          router.replace(`/courses/${courseId}`);
          setAccess("denied");
          return;
        }
        setCharacter(detail.character ?? null);
        setTier(detail.my_subscription?.tier ?? null);

        type CurriculumChapter = { title: string; is_completed: boolean };
        type Curriculum = { total_cards: number; completed_cards: number; chapters: CurriculumChapter[] };
        const curriculum = await api.getLearnerCurriculum(courseId).catch(() => null) as Curriculum | null;
        if (curriculum) {
          const currentChapter = curriculum.chapters.find(ch => !ch.is_completed);
          setProgress({
            completed: curriculum.completed_cards,
            total: curriculum.total_cards,
            currentChapterTitle: currentChapter?.title ?? null,
          });
        }
        setAccess("granted");
      } catch (err: unknown) {
        toast(err instanceof Error ? err.message : "読み込みに失敗しました", "error");
        setAccess("denied");
      }
    }
    init();
  }, [courseId, router]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    const body = draft;
    setDraft("");
    await sendMessage(body);
  }

  function handleQuickAction(label: string) {
    sendMessage(label);
  }

  if (access !== "granted" || loading) return <Skeleton className="h-screen w-full" style={{ borderRadius: 0 }} />;

  const avatarEl = character?.avatar_url ? (
    <img src={character.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
  ) : (
    <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0" style={{ background: "var(--ink)", color: "white" }}>
      🎭
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* ヘッダー */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-3 flex-shrink-0" style={{ background: "linear-gradient(135deg, var(--ink), var(--accent))" }}>
        {character?.avatar_url ? (
          <img src={character.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-white/40" />
        ) : (
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg ring-2 ring-white/40" style={{ background: "rgba(255,255,255,0.2)" }}>🎭</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-white truncate">{character?.name ?? "メンター"}</p>
            {tier && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "rgba(255,255,255,0.25)", color: "white" }}>
                Tier {tier}
              </span>
            )}
          </div>
          {progress.total > 0 && (
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.3)" }}>
                <div className="h-1 rounded-full" style={{ background: "white", width: `${Math.round((progress.completed / progress.total) * 100)}%` }} />
              </div>
              <span className="text-xs whitespace-nowrap text-white/80">{progress.completed}/{progress.total}レッスン</span>
            </div>
          )}
        </div>
      </div>

      {/* 現在地（伴走感の起点：今どこに取り組んでいるかを常に表示） */}
      {progress.currentChapterTitle && (
        <div className="flex items-center gap-2 px-4 sm:px-6 py-2 flex-shrink-0 text-xs" style={{ background: "var(--card)", borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>
          <span>📍</span>
          <span className="truncate">今取り組んでいるのは「<span className="font-bold" style={{ color: "var(--text)" }}>{progress.currentChapterTitle}</span>」だよ</span>
        </div>
      )}

      {/* メッセージ一覧 */}
      <main className="flex-1 min-h-0 max-w-2xl w-full mx-auto px-4 sm:px-6 py-4 flex flex-col gap-3 overflow-y-auto">
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && avatarEl}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                msg.role === "user" ? "rounded-br-md" : "rounded-bl-md"
              }`}
              style={
                msg.role === "user"
                  ? { background: "var(--ink)", color: "white" }
                  : { background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)" }
              }
            >
              {msg.is_draft && (
                <p className="text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>講師が確認中（下書き）</p>
              )}
              {msg.body}
            </div>
          </div>
        ))}

        {/* ストリーミング中のバブル */}
        {streamingText !== null && (
          <div className="flex gap-2 justify-start">
            {avatarEl}
            <div
              className="max-w-[80%] rounded-2xl rounded-bl-md px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed"
              style={{ background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)" }}
            >
              {streamingText || (
                <span className="flex items-center gap-1">
                  {[0, 1, 2].map(i => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full animate-bounce inline-block" style={{ background: "var(--muted)", animationDelay: `${i * 0.15}s` }} />
                  ))}
                </span>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Tier Bアップグレード提案 */}
      {upgradeCta && (
        <div className="mx-4 sm:mx-6 mb-2 card flex flex-col gap-2">
          <p className="text-sm font-bold" style={{ color: "var(--text)" }}>
            「{upgradeCta.topic}」について、先生に直接聞いてみませんか？
          </p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>Tier Bなら先生が明日までに回答します。</p>
          <div className="flex gap-2">
            <Link href={`/courses/${courseId}`} className="btn-primary flex-1 text-center">Tier Bを見る →</Link>
            <button onClick={() => setUpgradeCta(null)} className="text-xs underline" style={{ color: "var(--muted)" }}>今はいい</button>
          </div>
        </div>
      )}

      {/* クイックアクション */}
      <div className="flex gap-2 px-4 sm:px-6 pt-1 flex-shrink-0 overflow-x-auto" style={{ background: "var(--bg)" }}>
        {QUICK_ACTIONS.map(action => (
          <button
            key={action.id}
            type="button"
            onClick={() => handleQuickAction(action.label)}
            disabled={sending}
            className="text-xs whitespace-nowrap px-3 py-1.5 rounded-full disabled:opacity-40 transition-opacity"
            style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            {action.icon} {action.label}
          </button>
        ))}
      </div>

      {/* 入力フォーム */}
      <form onSubmit={handleSend} className="border-t px-4 sm:px-6 py-3 flex gap-2 flex-shrink-0" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
        <input
          ref={textInputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="メッセージを送る…"
          className="flex-1"
          disabled={sending}
        />
        <button type="submit" disabled={sending || !draft.trim()} className="btn-primary disabled:opacity-40">
          送信
        </button>
      </form>
    </div>
  );
}
