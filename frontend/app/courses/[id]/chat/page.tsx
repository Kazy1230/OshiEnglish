"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/Skeleton";
import { toast } from "@/components/Toast";

type ChatQuestion = {
  id: number;
  body: string;
  status: string;
  category: string | null;
  created_at: string;
  answer: { body: string; answered_by: string; linked_content_url: string | null; is_draft: boolean } | null;
  frustration_signal?: { topic: string; count: number } | null;
};
type Character = { id: number; name: string; avatar_url?: string | null };

const QUICK_ACTIONS: { id: string; label: string; type: "report" | "emotion" | "question" }[] = [
  { id: "half_done", label: "📖 半分できた", type: "report" },
  { id: "struggled", label: "😓 今日は難しかった", type: "emotion" },
  { id: "question", label: "❓ 質問がある", type: "question" },
];

export default function CourseChatPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = Number(params.id);
  const [questions, setQuestions] = useState<ChatQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingBody, setPendingBody] = useState<string | null>(null);
  const [upgradeCta, setUpgradeCta] = useState<{ topic: string } | null>(null);
  const [character, setCharacter] = useState<Character | null>(null);
  const [tier, setTier] = useState<"A" | "B" | null>(null);
  const [completedDays, setCompletedDays] = useState(0);
  const [progressError, setProgressError] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasScrolledOnceRef = useRef(false);

  function load() {
    return api.getChatHistory(courseId).then(setQuestions);
  }

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
        await load();

        let hadProgressError = false;
        const logs = await api.listDayLogs(courseId).catch(() => { hadProgressError = true; return [] as { day_number: number; is_completed: boolean }[]; });
        const completed = logs.filter((l: { is_completed: boolean }) => l.is_completed).length;
        setCompletedDays(completed);
        setProgressError(hadProgressError);
      } catch (err: unknown) {
        toast(err instanceof Error ? err.message : "読み込みに失敗しました", "error");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [courseId, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: hasScrolledOnceRef.current ? "smooth" : "auto" });
    hasScrolledOnceRef.current = true;
  }, [questions, pendingBody]);

  async function sendMessage(body: string, restoreOnError: boolean) {
    if (!body.trim() || sending) return;
    setSending(true);
    setPendingBody(body);
    try {
      const result: ChatQuestion = await api.askChatQuestion(courseId, body);
      setQuestions(prev => [...prev, result]);
      if (result.frustration_signal) {
        setUpgradeCta({ topic: result.frustration_signal.topic });
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "送信に失敗しました", "error");
      if (restoreOnError) setDraft(body);
    } finally {
      setSending(false);
      setPendingBody(null);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    const body = draft;
    setDraft("");
    await sendMessage(body, true);
  }

  const textInputRef = useRef<HTMLInputElement>(null);

  function handleQuickAction(action: { label: string; type: "report" | "emotion" | "question" }) {
    if (action.type === "question") {
      textInputRef.current?.focus();
      return;
    }
    sendMessage(action.label, false);
  }

  if (loading) return <Skeleton className="h-screen w-full" style={{ borderRadius: 0 }} />;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-4 sm:px-6 py-4 flex-shrink-0" style={{ background: "linear-gradient(135deg, var(--primary), var(--accent))" }}>
        {character?.avatar_url ? (
          <img src={character.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover ring-2 ring-white/40" />
        ) : (
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl ring-2 ring-white/40" style={{ background: "rgba(255,255,255,0.2)" }}>🎭</div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-white">{character?.name ?? "メンター"}</p>
            {tier && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.25)", color: "white" }}>
                Tier {tier} ・ {tier === "B" ? "講師添削つき" : "AIのみ"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.3)" }}>
              <div className="h-1.5 rounded-full" style={{ background: "white", width: `${Math.round((completedDays / 30) * 100)}%` }} />
            </div>
            <span className="text-xs whitespace-nowrap text-white/90">{completedDays}/30日</span>
          </div>
        </div>
      </div>

      {progressError && (
        <p className="text-xs text-center mt-2 flex-shrink-0" style={{ color: "var(--muted)" }}>
          ⚠ 進捗の取得に失敗しました。再読み込みしてください。
        </p>
      )}

      <main className="flex-1 min-h-0 max-w-2xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4 overflow-y-auto">
        {questions.length === 0 && (
          <p className="text-sm text-center mt-10" style={{ color: "var(--muted)" }}>
            学習の相談・質問をいつでも送ってください。
          </p>
        )}
        {questions.map(q => (
          <div key={q.id} className="flex flex-col gap-2">
            <div className="self-end max-w-[85%] rounded-2xl px-4 py-2 text-sm" style={{ background: "var(--primary)", color: "white" }}>
              {q.body}
            </div>
            {q.answer ? (
              <div className="self-start max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap" style={{ background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)" }}>
                {q.answer.is_draft && (
                  <p className="text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>講師の確認中です（下書き）</p>
                )}
                {q.answer.body}
              </div>
            ) : (
              <div className="self-start text-xs" style={{ color: "var(--muted)" }}>回答待ち…</div>
            )}
          </div>
        ))}
        {pendingBody && (
          <div className="flex flex-col gap-2">
            <div className="self-end max-w-[85%] rounded-2xl px-4 py-2 text-sm" style={{ background: "var(--primary)", color: "white" }}>
              {pendingBody}
            </div>
            <div className="self-start flex items-center gap-1 rounded-2xl px-4 py-3" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              {[0, 1, 2].map(i => (
                <span key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--muted)", animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      {upgradeCta && (
        <div className="mx-4 sm:mx-6 mb-3 card flex flex-col gap-2">
          <p className="text-sm font-bold" style={{ color: "var(--text)" }}>
            「{upgradeCta.topic}」について、先生に直接聞いてみませんか？
          </p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>Tier Bなら先生が明日までに回答します。</p>
          <div className="flex gap-2">
            <Link href={`/courses/${courseId}`} className="btn-primary flex-1 text-center">先生に聞く → Tier Bを見る</Link>
            <button onClick={() => setUpgradeCta(null)} className="text-xs underline" style={{ color: "var(--muted)" }}>今はいい</button>
          </div>
        </div>
      )}

      <div className="flex gap-2 px-4 sm:px-6 pt-2 flex-shrink-0 overflow-x-auto" style={{ background: "var(--bg)" }}>
        {QUICK_ACTIONS.map(action => (
          <button
            key={action.id}
            type="button"
            onClick={() => handleQuickAction(action)}
            disabled={sending}
            className="text-xs whitespace-nowrap px-3 py-1.5 rounded-full disabled:opacity-50"
            style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            {action.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSend} className="border-t px-4 sm:px-6 py-3 flex gap-2 flex-shrink-0" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
        <input
          ref={textInputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="質問や相談を入力…"
          className="flex-1"
          disabled={sending}
        />
        <button type="submit" disabled={sending || !draft.trim()} className="btn-primary disabled:opacity-50">
          {sending ? "送信中…" : "送信"}
        </button>
      </form>
    </div>
  );
}
