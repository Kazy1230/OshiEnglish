"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/Skeleton";
import { toast } from "@/components/Toast";

type AdjustedTask = { text: string; minutes: number };
type Day = {
  day: number;
  week_number: number;
  theme: string | null;
  is_rest_day: boolean;
};
type LearnerDay = { day: number; adjusted_tasks?: AdjustedTask[] | null };
type DayLog = { day_number: number; is_completed: boolean; completed_at: string | null; memo: string | null };

const REST_DAY_TIPS = [
  "お気に入りの音楽を聴いてリラックス！",
  "今日学んだことを声に出して振り返ってみよう。",
  "しっかり休んで、明日また気持ちよく再開しよう。",
  "散歩や軽い運動で気分転換するのもおすすめです。",
  "好きな海外ドラマや動画を字幕付きで観てみよう。",
];

function restDayTip(day: number): string {
  return REST_DAY_TIPS[day % REST_DAY_TIPS.length];
}

export default function CourseSchedulePage() {
  const params = useParams();
  const router = useRouter();
  const courseId = Number(params.id);

  const [days, setDays] = useState<Day[]>([]);
  const [learnerTasksByDay, setLearnerTasksByDay] = useState<Record<number, AdjustedTask[]>>({});
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
        const [d, l, learnerDays] = await Promise.all([
          api.listCourseDays(courseId).catch(() => [] as Day[]),
          api.listDayLogs(courseId).catch(() => [] as DayLog[]),
          api.listLearnerCourseDays(courseId).catch(() => [] as LearnerDay[]),
        ]);
        setDays(d);
        const byDay: Record<number, DayLog> = {};
        for (const log of l) byDay[log.day_number] = log;
        setLogs(byDay);
        const tasksByDay: Record<number, AdjustedTask[]> = {};
        for (const ld of learnerDays) tasksByDay[ld.day] = ld.adjusted_tasks ?? [];
        setLearnerTasksByDay(tasksByDay);
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
  const currentDay = Math.min(completedCount + 1, 30);
  const today = days.find(d => d.day === currentDay) ?? null;
  const todayTasks = learnerTasksByDay[currentDay] ?? [];
  const todayLog = logs[currentDay] ?? null;

  // ペース表示：completed_atの実績のみから算出する（架空の判定はしない）
  const completedWithDates = Object.values(logs).filter(l => l.is_completed && l.completed_at);
  let paceBadge: { text: string; tone: "good" | "neutral" } | null = null;
  if (completedWithDates.length >= 2) {
    const firstAt = new Date(Math.min(...completedWithDates.map(l => new Date(l.completed_at!).getTime())));
    const daysSinceFirst = Math.max(1, (Date.now() - firstAt.getTime()) / 86400000);
    const avgPace = daysSinceFirst / completedCount;
    if (avgPace <= 1.1) {
      paceBadge = { text: "🔥 いいペースで進んでいます！", tone: "good" };
    } else if (avgPace >= 1.6) {
      paceBadge = { text: "ゆっくりペースです。今日から少しずつ取り戻しましょう", tone: "neutral" };
    }
  }

  // 7日ごとの週に分割（最終週は残り日数のみ）
  const weeks: Day[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <div>
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        {days.length === 0 ? (
          <div className="card">
            <p className="text-sm" style={{ color: "var(--muted)" }}>このコースのスケジュールはまだ準備中です。</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 rounded-full" style={{ background: "var(--example-bg, #eee)" }}>
                <div className="h-2 rounded-full" style={{ background: "var(--accent)", width: `${Math.round((completedCount / 30) * 100)}%` }} />
              </div>
              <span className="text-sm font-bold whitespace-nowrap" style={{ color: "var(--primary)" }}>{completedCount}/30日 完了</span>
            </div>

            {paceBadge && (
              <p
                className="text-xs font-bold px-3 py-2 rounded-lg self-start"
                style={{
                  background: paceBadge.tone === "good" ? "var(--accent)" : "var(--example-bg, #eee)",
                  color: paceBadge.tone === "good" ? "white" : "var(--muted)",
                }}
              >
                {paceBadge.text}
              </p>
            )}

            <p className="text-xs" style={{ color: "var(--muted)" }}>
              凡例：<span style={{ color: "var(--accent)" }}>■</span> 完了済み
              <span style={{ color: "var(--primary)" }}>■</span> 本日
              <span style={{ color: "var(--muted)" }}>■</span> 休息日
              <span style={{ background: "var(--card)", border: "1px solid var(--border)" }}>　</span> 未到達
            </p>

            <div className="flex flex-col gap-4">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-1.5">
                  <p className="text-[11px] font-bold" style={{ color: "var(--muted)" }}>第{wi + 1}週</p>
                  <div className="grid grid-cols-7 gap-2">
                    {week.map(d => {
                      const log = logs[d.day];
                      const isCompleted = !!log?.is_completed;
                      const isToday = d.day === currentDay;
                      return (
                        <button
                          key={d.day}
                          onClick={() => setSelectedDay(d)}
                          className="aspect-square flex flex-col items-center justify-center text-xs font-bold transition-all hover:shadow-md"
                          style={{
                            borderRadius: isCompleted ? "999px" : "10px",
                            background: isCompleted
                              ? "var(--accent)"
                              : isToday
                              ? "var(--ink)"
                              : d.is_rest_day
                              ? "var(--example-bg, #eee)"
                              : "var(--card)",
                            color: isCompleted || isToday ? "white" : d.is_rest_day ? "var(--muted)" : "var(--text)",
                            border: isCompleted || isToday || d.is_rest_day ? "none" : "1px solid var(--border)",
                            boxShadow: isCompleted ? "0 2px 8px rgba(0,0,0,0.18)" : undefined,
                            transform: isCompleted ? "scale(1.04)" : undefined,
                          }}
                        >
                          {isCompleted ? <span className="text-base leading-none">✓</span> : <span>Day{d.day}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* 今日がDay何で、何をするべきかを即座に表示 */}
            {today && (
              <div className="card border-2" style={{ borderColor: "var(--accent)" }}>
                <p className="text-xs font-bold mb-3" style={{ color: "var(--accent)" }}>🔥 今日のタスク（Day {currentDay}）</p>
                {today.is_rest_day ? (
                  <p className="text-sm" style={{ color: "var(--text)" }}>今日は休息日です。{restDayTip(currentDay)}</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {today.theme && <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{today.theme}</p>}
                    {todayTasks.length > 0 ? (
                      todayTasks.map((t, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span style={{ color: "var(--text)" }}>{t.text}</span>
                          <span style={{ color: "var(--muted)" }}>{t.minutes}分</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm" style={{ color: "var(--muted)" }}>今日のタスクはありません。復習をしましょう！</p>
                    )}
                  </div>
                )}
                {!today.is_rest_day && !todayLog?.is_completed && (
                  <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
                    <Link href={`/courses/${courseId}/chat`} className="btn-primary w-full text-center">伴走チャットで報告する →</Link>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {selectedDay && (
        <DayDetailPanel
          courseId={courseId}
          day={selectedDay}
          tasks={learnerTasksByDay[selectedDay.day] ?? []}
          log={logs[selectedDay.day] ?? null}
          isToday={selectedDay.day === currentDay}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}

function DayDetailPanel({ courseId, day, tasks, log, isToday, onClose }: { courseId: number; day: Day; tasks: AdjustedTask[]; log: DayLog | null; isToday: boolean; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="card max-w-lg w-full max-h-[90vh] overflow-y-auto flex flex-col gap-3" style={{ background: "var(--card-bg, #fff)" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-black text-lg" style={{ color: "var(--primary)" }}>Day{day.day}（第{day.week_number}週）</h3>
          {log?.is_completed && (
            <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: "var(--accent)", color: "white" }}>完了済み</span>
          )}
          {isToday && !log?.is_completed && (
            <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: "var(--ink)", color: "white" }}>本日</span>
          )}
        </div>
        {day.is_rest_day ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm" style={{ color: "var(--text)" }}>🌿 今日はチャージの日です。明日からまた頑張りましょう！</p>
            <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "var(--example-bg, #eee)", color: "var(--muted)" }}>
              💡 {restDayTip(day.day)}
            </p>
          </div>
        ) : (
          <>
            {day.theme && <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{day.theme}</p>}
            {tasks.length > 0 && (
              <ul className="text-sm list-disc pl-5" style={{ color: "var(--text)" }}>
                {tasks.map((t, i) => <li key={i}>{t.text}（{t.minutes}分）</li>)}
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
        <div className="flex gap-2 justify-end">
          {isToday && !log?.is_completed && !day.is_rest_day && (
            <Link href={`/courses/${courseId}/chat`} className="btn-primary">チャットで報告する →</Link>
          )}
          <button className="btn-ghost" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}
