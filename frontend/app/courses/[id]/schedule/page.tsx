"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useDarkMode } from "@/lib/darkMode";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { LogoutButton } from "@/components/LogoutButton";
import { Skeleton } from "@/components/Skeleton";
import { toast } from "@/components/Toast";

type Day = {
  day: number;
  week_number: number;
  theme: string | null;
  tasks: string[] | null;
  is_rest_day: boolean;
};
type DayLog = { day_number: number; is_completed: boolean; completed_at: string | null; memo: string | null };

export default function CourseSchedulePage() {
  const params = useParams();
  const router = useRouter();
  const courseId = Number(params.id);
  const [mode, toggleMode] = useDarkMode();

  const [days, setDays] = useState<Day[]>([]);
  const [logs, setLogs] = useState<Record<number, DayLog>>({});
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<Day | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const detail = await api.getCourseDetail(courseId);
        if (!(detail.is_purchased || detail.is_free)) {
          toast("このコースを購入してからスケジュールを確認してください", "error");
          router.replace(`/courses/${courseId}`);
          return;
        }
        const [d, l] = await Promise.all([
          api.listCourseDays(courseId).catch(() => [] as Day[]),
          api.listDayLogs(courseId).catch(() => [] as DayLog[]),
        ]);
        setDays(d);
        const byDay: Record<number, DayLog> = {};
        for (const log of l) byDay[log.day_number] = log;
        setLogs(byDay);
      } catch (err: unknown) {
        toast(err instanceof Error ? err.message : "読み込みに失敗しました", "error");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [courseId, router]);

  if (loading) return <Skeleton />;

  const completedCount = Object.values(logs).filter(l => l.is_completed).length;
  const currentDay = Math.min(completedCount + 1, 90);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="flex items-center justify-between px-4 sm:px-6 py-4" style={{ background: "var(--primary)" }}>
        <div className="flex items-center gap-3">
          <Link href={`/courses/${courseId}/chat`} className="text-white/80 text-sm">← チャットへ</Link>
          <h1 className="text-white font-black text-lg">90日スケジュール</h1>
        </div>
        <div className="flex items-center gap-3">
          <DarkModeToggle mode={mode} onToggle={toggleMode} variant="onColor" />
          <LogoutButton variant="onColor" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        {days.length === 0 ? (
          <div className="card">
            <p className="text-sm" style={{ color: "var(--muted)" }}>このコースのスケジュールはまだ準備中です。</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 rounded-full" style={{ background: "var(--example-bg, #eee)" }}>
                <div className="h-2 rounded-full" style={{ background: "var(--accent)", width: `${Math.round((completedCount / 90) * 100)}%` }} />
              </div>
              <span className="text-sm font-bold whitespace-nowrap" style={{ color: "var(--primary)" }}>{completedCount}/90日 完了</span>
            </div>

            <p className="text-xs" style={{ color: "var(--muted)" }}>
              凡例：<span style={{ color: "var(--accent)" }}>■</span> 完了済み
              <span style={{ color: "var(--primary)" }}>■</span> 本日
              <span style={{ color: "var(--muted)" }}>■</span> 休息日
              <span style={{ background: "var(--card)", border: "1px solid var(--border)" }}>　</span> 未到達
            </p>

            <div className="grid grid-cols-7 gap-2">
              {days.map(d => {
                const log = logs[d.day];
                const isCompleted = !!log?.is_completed;
                const isToday = d.day === currentDay;
                return (
                  <button
                    key={d.day}
                    onClick={() => setSelectedDay(d)}
                    className="aspect-square rounded-lg flex flex-col items-center justify-center text-xs font-bold transition-shadow hover:shadow-md"
                    style={{
                      background: isCompleted
                        ? "var(--accent)"
                        : isToday
                        ? "var(--primary)"
                        : d.is_rest_day
                        ? "var(--example-bg, #eee)"
                        : "var(--card)",
                      color: isCompleted || isToday ? "white" : d.is_rest_day ? "var(--muted)" : "var(--text)",
                      border: isCompleted || isToday || d.is_rest_day ? "none" : "1px solid var(--border)",
                    }}
                  >
                    Day{d.day}
                    {isCompleted && <span className="text-[10px]">✓</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </main>

      {selectedDay && (
        <DayDetailPanel
          day={selectedDay}
          log={logs[selectedDay.day] ?? null}
          isToday={selectedDay.day === currentDay}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}

function DayDetailPanel({ day, log, isToday, onClose }: { day: Day; log: DayLog | null; isToday: boolean; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="card max-w-lg w-full max-h-[90vh] overflow-y-auto flex flex-col gap-3" style={{ background: "var(--card-bg, #fff)" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-black text-lg" style={{ color: "var(--primary)" }}>Day{day.day}（第{day.week_number}週）</h3>
          {log?.is_completed && (
            <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: "var(--accent)", color: "white" }}>完了済み</span>
          )}
          {isToday && !log?.is_completed && (
            <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: "var(--primary)", color: "white" }}>本日</span>
          )}
        </div>
        {day.is_rest_day ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>この日は休息日です。</p>
        ) : (
          <>
            {day.theme && <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{day.theme}</p>}
            {day.tasks && day.tasks.length > 0 && (
              <ul className="text-sm list-disc pl-5" style={{ color: "var(--text)" }}>
                {day.tasks.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            )}
          </>
        )}
        {log?.memo && (
          <div className="text-sm rounded-lg px-3 py-2" style={{ background: "var(--example-bg, #eee)", color: "var(--text)" }}>
            <p className="text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>あなたのメモ</p>
            {log.memo}
          </div>
        )}
        <button className="btn-ghost self-end" onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}
