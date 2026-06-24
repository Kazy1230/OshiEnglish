"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useDarkMode } from "@/lib/darkMode";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { LogoutButton } from "@/components/LogoutButton";
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
type TodayDay = { day: number; theme?: string | null; tasks?: string[] | null; is_rest_day: boolean };

export default function CourseChatPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = Number(params.id);
  const [mode, toggleMode] = useDarkMode();
  const [questions, setQuestions] = useState<ChatQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingBody, setPendingBody] = useState<string | null>(null);
  const [upgradeCta, setUpgradeCta] = useState<{ topic: string } | null>(null);
  const [character, setCharacter] = useState<Character | null>(null);
  const [completedDays, setCompletedDays] = useState(0);
  const [today, setToday] = useState<TodayDay | null>(null);
  const [reportedToday, setReportedToday] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [progressError, setProgressError] = useState(false);
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
        setCharacter(detail.character ?? null);
        await load();

        let hadProgressError = false;
        const logs = await api.listDayLogs(courseId).catch(() => { hadProgressError = true; return [] as { day_number: number; is_completed: boolean }[]; });
        const completed = logs.filter((l: { is_completed: boolean }) => l.is_completed).length;
        const currentDay = Math.min(completed + 1, 90);
        setCompletedDays(completed);
        setReportedToday(logs.some((l: { day_number: number; is_completed: boolean }) => l.day_number === currentDay && l.is_completed));

        const days = await api.listCourseDays(courseId).catch(() => { hadProgressError = true; return [] as TodayDay[]; });
        const todayDay = days.find((d: TodayDay) => d.day === currentDay) ?? null;
        setToday(todayDay);
        setProgressError(hadProgressError);
      } catch (err: unknown) {
        toast(err instanceof Error ? err.message : "読み込みに失敗しました", "error");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [courseId, router]);

  async function handleReportToday() {
    if (!today || reporting || reportedToday) return;
    setReporting(true);
    try {
      await api.completeDayLog(courseId, today.day);
      setReportedToday(true);
      setCompletedDays(prev => prev + 1);
      toast("今日の学習を報告しました！", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "報告に失敗しました", "error");
    } finally {
      setReporting(false);
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [questions, pendingBody]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    const body = draft;
    setDraft("");
    setPendingBody(body);
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
      setPendingBody(null);
    }
  }

  if (loading) return <Skeleton className="h-screen w-full" style={{ borderRadius: 0 }} />;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <header className="flex flex-col gap-3 px-4 sm:px-6 py-4" style={{ background: "var(--primary)" }}>
        <div className="flex items-center justify-between">
          <Link href={`/courses/${courseId}`} className="text-white/80 text-sm">← コースページ</Link>
          <div className="flex items-center gap-3 flex-wrap">
            <Link href={`/courses/${courseId}/schedule`} className="text-white/80 text-sm hover:text-white">90日スケジュール</Link>
            <Link href={`/courses/${courseId}/reviews`} className="text-white/80 text-sm hover:text-white">週次・月次レビュー</Link>
            <DarkModeToggle mode={mode} onToggle={toggleMode} variant="onColor" />
            <LogoutButton variant="onColor" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          {character?.avatar_url ? (
            <img src={character.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg" style={{ background: "rgba(255,255,255,0.18)" }}>🎭</div>
          )}
          <div className="flex-1">
            <p className="text-white font-bold text-sm">{character?.name ?? "メンター"}</p>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.25)" }}>
                <div className="h-1.5 rounded-full" style={{ background: "white", width: `${Math.round((completedDays / 90) * 100)}%` }} />
              </div>
              <span className="text-white/80 text-xs whitespace-nowrap">{completedDays}/90日</span>
            </div>
          </div>
        </div>
      </header>

      {progressError && (
        <p className="text-xs text-center mt-2" style={{ color: "var(--muted)" }}>
          ⚠ 進捗・今日のタスクの取得に失敗しました。再読み込みしてください。
        </p>
      )}

      {today && !today.is_rest_day && (
        <div className="mx-4 sm:mx-6 mt-4 card flex flex-col gap-2">
          <p className="text-xs font-bold" style={{ color: "var(--muted)" }}>Day {today.day} の今日のタスク{today.theme ? `：${today.theme}` : ""}</p>
          {today.tasks && today.tasks.length > 0 && (
            <ul className="text-sm list-disc pl-5" style={{ color: "var(--text)" }}>
              {today.tasks.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          )}
          <button
            onClick={handleReportToday}
            disabled={reporting || reportedToday}
            className="btn-primary self-start disabled:opacity-50"
          >
            {reportedToday ? "✅ 今日の学習を報告済み" : reporting ? "報告中…" : "今日の学習を報告する"}
          </button>
        </div>
      )}

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

      <form onSubmit={handleSend} className="border-t px-4 sm:px-6 py-4 flex gap-2" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
        <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="質問や相談を入力…" className="flex-1" disabled={sending} />
        <button type="submit" disabled={sending || !draft.trim()} className="btn-primary disabled:opacity-50">
          {sending ? "送信中…" : "送信"}
        </button>
      </form>
    </div>
  );
}
