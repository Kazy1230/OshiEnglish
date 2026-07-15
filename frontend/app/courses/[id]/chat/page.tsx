"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, API_BASE } from "@/lib/api";
import { Skeleton } from "@/components/Skeleton";
import { toast } from "@/components/Toast";

type ChatMessage = {
  id: number | string;
  role: "user" | "assistant";
  body: string;
  is_draft?: boolean;
  linked_content_url?: string | null;
};

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [upgradeCta, setUpgradeCta] = useState<{ topic: string } | null>(null);
  const [character, setCharacter] = useState<Character | null>(null);
  const [tier, setTier] = useState<"A" | "B" | null>(null);
  const [progress, setProgress] = useState<{ completed: number; total: number; currentChapterTitle: string | null }>({
    completed: 0, total: 0, currentChapterTitle: null,
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasScrolledOnceRef = useRef(false);
  const textInputRef = useRef<HTMLInputElement>(null);

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
          return;
        }
        setCharacter(detail.character ?? null);
        setTier(detail.my_subscription?.tier ?? null);

        type CurriculumChapter = { title: string; is_completed: boolean };
        type Curriculum = { total_cards: number; completed_cards: number; chapters: CurriculumChapter[] };
        const [history, curriculum] = await Promise.all([
          api.getChatHistory(courseId),
          api.getLearnerCurriculum(courseId).catch(() => null) as Promise<Curriculum | null>,
        ]);
        if (curriculum) {
          const currentChapter = curriculum.chapters.find(ch => !ch.is_completed);
          setProgress({
            completed: curriculum.completed_cards,
            total: curriculum.total_cards,
            currentChapterTitle: currentChapter?.title ?? null,
          });
        }

        const converted: ChatMessage[] = [];
        for (const q of history) {
          converted.push({ id: `q-${q.id}`, role: "user", body: q.body });
          if (q.answer) {
            converted.push({
              id: `a-${q.id}`, role: "assistant", body: q.answer.body,
              is_draft: q.answer.is_draft,
              linked_content_url: q.answer.linked_content_url,
            });
          }
        }

        if (converted.length === 0) {
          // 最初の挨拶を取得して表示する。一度生成された挨拶はサーバー側で永続化されるため、
          // 何も送らずに再度開いても同じ文面が表示される（開くたびに別の文面が生成される問題への対応）
          try {
            const greet = await api.getGreeting(courseId);
            if (greet?.message) {
              converted.push({ id: "greeting", role: "assistant", body: greet.message });
            }
          } catch {
            // 挨拶取得失敗はサイレントスキップ
          }
        }

        setMessages(converted);
      } catch (err: unknown) {
        toast(err instanceof Error ? err.message : "読み込みに失敗しました", "error");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [courseId, router]);

  async function sendMessage(body: string) {
    if (!body.trim() || sending) return;
    setSending(true);
    setStreamingText("");

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", body };
    setMessages(prev => [...prev, userMsg]);

    const token = typeof window !== "undefined" ? localStorage.getItem("yt_token") : null;
    try {
      const res = await fetch(`${API_BASE}/chat/${courseId}/ask-stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ body }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "エラーが発生しました" }));
        throw new Error(err.detail || `エラー (${res.status})`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;
          try {
            const evt = JSON.parse(payload);
            if (evt.error) throw new Error(evt.error);
            if (evt.delta) {
              accumulated += evt.delta;
              setStreamingText(accumulated);
            }
            if (evt.done) {
              setStreamingText(null);
              const assistantMsg: ChatMessage = {
                id: `a-${evt.question_id}`,
                role: "assistant",
                body: evt.answer || accumulated,
              };
              setMessages(prev => [...prev, assistantMsg]);
              if (evt.frustration_signal) setUpgradeCta({ topic: evt.frustration_signal.topic });
            }
          } catch (parseErr: unknown) {
            if (parseErr instanceof Error && parseErr.message !== "Unexpected token") {
              throw parseErr;
            }
          }
        }
      }
    } catch (err: unknown) {
      setStreamingText(null);
      toast(err instanceof Error ? err.message : "送信に失敗しました", "error");
    } finally {
      setSending(false);
    }
  }

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

  if (loading) return <Skeleton className="h-screen w-full" style={{ borderRadius: 0 }} />;

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
