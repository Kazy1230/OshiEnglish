"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useDarkMode } from "@/lib/darkMode";
import { DarkModeToggle } from "@/components/DarkModeToggle";
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

export default function CourseChatPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = Number(params.id);
  const [mode, toggleMode] = useDarkMode();
  const [questions, setQuestions] = useState<ChatQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [upgradeCta, setUpgradeCta] = useState<{ topic: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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
        await load();
      } catch (err: unknown) {
        toast(err instanceof Error ? err.message : "読み込みに失敗しました", "error");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [courseId, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [questions]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    const body = draft;
    setDraft("");
    try {
      const result: ChatQuestion = await api.askChatQuestion(courseId, body);
      setQuestions(prev => [...prev, result]);
      if (result.frustration_signal) {
        setUpgradeCta({ topic: result.frustration_signal.topic });
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "送信に失敗しました", "error");
      setDraft(body);
    } finally {
      setSending(false);
    }
  }

  if (loading) return <p className="p-8" style={{ color: "var(--muted)" }}>読み込み中…</p>;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <header className="flex items-center justify-between px-4 sm:px-6 py-4" style={{ background: "var(--primary)" }}>
        <Link href={`/courses/${courseId}`} className="text-white/80 text-sm">← コースページ</Link>
        <DarkModeToggle mode={mode} onToggle={toggleMode} variant="onColor" />
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4 overflow-y-auto">
        {questions.length === 0 && (
          <p className="text-sm text-center mt-10" style={{ color: "var(--muted)" }}>
            学習の相談・質問をいつでも送ってください。1日10回までAIが回答します。
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

      <form onSubmit={handleSend} className="border-t px-4 sm:px-6 py-4 flex gap-2" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
        <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="質問や相談を入力…" className="flex-1" disabled={sending} />
        <button type="submit" disabled={sending || !draft.trim()} className="btn-primary disabled:opacity-50">
          {sending ? "送信中…" : "送信"}
        </button>
      </form>
    </div>
  );
}
