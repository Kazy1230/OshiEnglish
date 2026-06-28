"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { CourseCheckoutModal } from "@/components/CourseCheckoutModal";
import { Skeleton } from "@/components/Skeleton";
import { toast } from "@/components/Toast";

type Lesson = {
  id: number; order: number; title: string; content_type: "text" | "video";
  body?: string | null; youtube_url?: string | null; is_preview: boolean;
};
type CourseDetail = {
  id: number; title: string; description?: string | null; thumbnail_url?: string | null;
  category?: string | null; status: string; price: number; is_free: boolean;
  tier_a_price?: number | null; tier_b_price?: number | null;
  character: { id: number; name: string; avatar_url?: string | null; creator_id: number | null };
  lessons: Lesson[];
  is_purchased: boolean;
  has_days: boolean;
  has_diagnosis: boolean;
  is_suspended?: boolean;
  suspension_reason?: string | null;
  my_subscription?: { id: number; tier: "A" | "B"; status: string } | null;
};

type AdjustedTask = { type: string; minutes: number; carryover?: boolean };
type Day = { day: number; week_number: number; theme: string | null; is_rest_day: boolean };
type LearnerDay = { day: number; adjusted_tasks?: AdjustedTask[] | null; carryover_tasks?: AdjustedTask[] | null };
type DayLog = { day_number: number; is_completed: boolean; completed_at: string | null; memo: string | null };

const TASK_TYPE_LABEL: Record<string, string> = {
  vocabulary: "単語学習", listening: "リスニング練習", grammar: "文法確認", reading: "リーディング", shadowing: "シャドーイング", practice: "演習",
};

const TASK_TYPE_ICON: Record<string, string> = {
  vocabulary: "📖", listening: "🎧", grammar: "📐", reading: "📰", shadowing: "🗣️", practice: "✏️",
};

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

export default function CourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = Number(params.id);
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [checkout, setCheckout] = useState<{ clientSecret: string; isSubscription: boolean } | null>(null);
  const [activeLessonId, setActiveLessonId] = useState<number | null>(null);
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<number>>(new Set());
  const [completing, setCompleting] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [changingTier, setChangingTier] = useState(false);
  const [showContractDetail, setShowContractDetail] = useState(false);
  const [showLessonDrawer, setShowLessonDrawer] = useState(false);

  // 30日コース用：今日のタスク・カレンダー
  const [days, setDays] = useState<Day[]>([]);
  const [learnerTasksByDay, setLearnerTasksByDay] = useState<Record<number, AdjustedTask[]>>({});
  const [logs, setLogs] = useState<Record<number, DayLog>>({});
  const [selectedDay, setSelectedDay] = useState<Day | null>(null);
  const [checkedTaskTypes, setCheckedTaskTypes] = useState<Set<string>>(new Set());
  const [reporting, setReporting] = useState(false);

  function load() {
    return api.getCourseDetail(courseId).then(async (c: CourseDetail) => {
      setCourse(c);
      if (c.lessons.length > 0) setActiveLessonId(c.lessons[0].id);
      const unlocked = c.is_purchased || c.is_free;
      if (unlocked) {
        api.getCourseProgress(courseId).then(p => {
          setCompletedLessonIds(new Set(p.lessons.filter((l: { is_completed: boolean }) => l.is_completed).map((l: { lesson_id: number }) => l.lesson_id)));
        }).catch(() => {});
      }
      if (unlocked && c.has_days) {
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
        for (const ld of learnerDays) {
          const carryover = (ld.carryover_tasks ?? []).map((t: AdjustedTask) => ({ ...t, carryover: true }));
          tasksByDay[ld.day] = [...(ld.adjusted_tasks ?? []), ...carryover];
        }
        setLearnerTasksByDay(tasksByDay);
      }
    });
  }

  useEffect(() => { load().finally(() => setLoading(false)); }, [courseId]);

  async function handleCompleteLesson(lessonId: number) {
    setCompleting(true);
    try {
      await api.completeLesson(lessonId);
      setCompletedLessonIds(prev => new Set(prev).add(lessonId));
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "完了の記録に失敗しました", "error");
    } finally {
      setCompleting(false);
    }
  }

  async function handlePurchase() {
    if (!getToken()) { window.location.href = "/login"; return; }
    setPurchasing(true);
    try {
      const res = await api.checkoutCourse(courseId);
      if (!res.client_secret) {
        router.push(`/purchase-complete?course_id=${courseId}`);
        return;
      }
      setCheckout({ clientSecret: res.client_secret, isSubscription: false });
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "決済の開始に失敗しました", "error");
    } finally {
      setPurchasing(false);
    }
  }

  async function handleCancelSubscription(subscriptionId: number) {
    if (!confirm("このサブスクリプションを解約しますか？解約後は即時利用できなくなります。")) return;
    setCanceling(true);
    try {
      await api.cancelSubscription(subscriptionId);
      toast("解約しました", "success");
      await load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "解約に失敗しました", "error");
    } finally {
      setCanceling(false);
    }
  }

  async function handleChangeTier(subscriptionId: number, tier: "A" | "B") {
    if (!confirm(`Tier ${tier}に変更しますか？次回請求から新しい料金が適用されます。`)) return;
    setChangingTier(true);
    try {
      await api.changeSubscriptionTier(subscriptionId, tier);
      toast(`Tier ${tier}に変更しました`, "success");
      await load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Tier変更に失敗しました", "error");
    } finally {
      setChangingTier(false);
    }
  }

  async function handleSubscribe(tier: "A" | "B") {
    if (!getToken()) { window.location.href = "/login"; return; }
    setPurchasing(true);
    try {
      const res = await api.subscribeToCourse(courseId, tier);
      if (!res.client_secret) {
        router.push(`/purchase-complete?course_id=${courseId}`);
        return;
      }
      setCheckout({ clientSecret: res.client_secret, isSubscription: true });
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "決済の開始に失敗しました", "error");
    } finally {
      setPurchasing(false);
    }
  }

  async function handleReport() {
    if (!getToken()) { window.location.href = "/login"; return; }
    const reason = prompt("通報理由を入力してください");
    if (!reason) return;
    try {
      await api.submitReport({ target_type: "course", target_id: courseId, reason });
      toast("通報を受け付けました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "通報に失敗しました", "error");
    }
  }

  function toggleTaskType(type: string) {
    setCheckedTaskTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  async function handleReportToday(currentDay: number) {
    if (reporting) return;
    setReporting(true);
    try {
      await api.completeDayLog(courseId, currentDay, undefined, Array.from(checkedTaskTypes));
      setLogs(prev => ({ ...prev, [currentDay]: { day_number: currentDay, is_completed: true, completed_at: new Date().toISOString(), memo: null } }));
      toast("今日の学習を報告しました！", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "報告に失敗しました", "error");
    } finally {
      setReporting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen px-4 sm:px-6 py-8 max-w-4xl mx-auto flex flex-col gap-4" style={{ background: "var(--bg)" }}>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!course) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--bg)" }}>
        <div className="card max-w-sm text-center flex flex-col gap-3">
          <p className="text-3xl">🔍</p>
          <p className="text-sm font-bold" style={{ color: "var(--text)" }}>コースが見つかりません</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>削除された、または非公開になった可能性があります。</p>
          <Link href="/" className="btn-primary self-center">コースを探す</Link>
        </div>
      </div>
    );
  }

  const activeLesson = course.lessons.find(l => l.id === activeLessonId) ?? course.lessons[0];
  const unlocked = course.is_purchased;
  const completedLessonCount = course.lessons.filter(l => completedLessonIds.has(l.id)).length;

  const completedCount = Object.values(logs).filter(l => l.is_completed).length;
  const currentDay = Math.min(completedCount + 1, 30);
  const today = days.find(d => d.day === currentDay) ?? null;
  const todayTasks = learnerTasksByDay[currentDay] ?? [];
  const todayLog = logs[currentDay] ?? null;

  const completedWithDates = Object.values(logs).filter(l => l.is_completed && l.completed_at);
  let paceBadge: { text: string; tone: "good" | "neutral" } | null = null;
  if (completedWithDates.length >= 2) {
    const firstAt = new Date(Math.min(...completedWithDates.map(l => new Date(l.completed_at!).getTime())));
    const daysSinceFirst = Math.max(1, (Date.now() - firstAt.getTime()) / 86400000);
    const avgPace = daysSinceFirst / completedCount;
    if (avgPace <= 1.1) paceBadge = { text: "🔥 いいペースで進んでいます！", tone: "good" };
    else if (avgPace >= 1.6) paceBadge = { text: "ゆっくりペースです。今日から少しずつ取り戻しましょう", tone: "neutral" };
  }

  const weeks: Day[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const contractCard = (course.tier_a_price || course.tier_b_price) ? (
    <div className="card flex flex-col gap-3">
      {unlocked ? (
        <>
          <button onClick={() => setShowContractDetail(v => !v)} className="flex items-center justify-between gap-2 w-full text-left">
            <span className="text-sm font-bold" style={{ color: "var(--accent)" }}>
              ✅ {course.my_subscription ? `Tier ${course.my_subscription.tier} 契約中` : "購入済み"}
            </span>
            <span className="text-xs" style={{ color: "var(--muted)" }}>{showContractDetail ? "契約情報を閉じる ▲" : "契約情報を見る ▼"}</span>
          </button>
          {showContractDetail && (
            <div className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
              {course.my_subscription && (() => {
                const otherTier = course.my_subscription.tier === "A" ? "B" : "A";
                const otherTierPrice = otherTier === "A" ? course.tier_a_price : course.tier_b_price;
                return otherTierPrice ? (
                  <button onClick={() => handleChangeTier(course.my_subscription!.id, otherTier)} disabled={changingTier}
                    className="text-xs underline self-start disabled:opacity-50" style={{ color: "var(--accent)" }}>
                    Tier {otherTier}に変更する
                  </button>
                ) : null;
              })()}
              {course.my_subscription && (
                <button onClick={() => handleCancelSubscription(course.my_subscription!.id)} disabled={canceling}
                  className="text-xs underline self-start disabled:opacity-50" style={{ color: "var(--muted)" }}>
                  解約する
                </button>
              )}
            </div>
          )}
        </>
      ) : course.my_subscription?.status === "incomplete" ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm" style={{ color: "var(--muted)" }}>決済処理中です。少し時間をおいて再度ご確認ください。</p>
          <button onClick={() => handleCancelSubscription(course.my_subscription!.id)} disabled={canceling}
            className="text-xs underline self-start disabled:opacity-50" style={{ color: "var(--muted)" }}>
            {canceling ? "処理中…" : "キャンセルしてやり直す"}
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>月額プランを選択してください</p>
          <div className="flex flex-col gap-3">
            {course.tier_a_price && (
              <div className="border rounded-lg p-3 flex flex-col gap-2" style={{ borderColor: "var(--border)" }}>
                <p className="text-xs font-bold" style={{ color: "var(--text)" }}>Tier A（AIのみ）</p>
                <p className="font-black" style={{ color: "var(--accent)" }}>¥{course.tier_a_price.toLocaleString()}/月</p>
                <button onClick={() => handleSubscribe("A")} disabled={purchasing} className="btn-primary disabled:opacity-50">
                  {purchasing ? "準備中…" : "Tier Aで始める"}
                </button>
              </div>
            )}
            {course.tier_b_price && (
              <div className="border rounded-lg p-3 flex flex-col gap-2" style={{ borderColor: "var(--border)" }}>
                <p className="text-xs font-bold" style={{ color: "var(--text)" }}>Tier B（AI＋クリエイター添削）</p>
                <p className="font-black" style={{ color: "var(--accent)" }}>¥{course.tier_b_price.toLocaleString()}/月</p>
                <button onClick={() => handleSubscribe("B")} disabled={purchasing} className="btn-primary disabled:opacity-50">
                  {purchasing ? "準備中…" : "Tier Bで始める"}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  ) : (
    <div className="card flex flex-col gap-2">
      <p className="font-black text-lg" style={{ color: "var(--accent)" }}>
        {course.is_free ? "無料" : `¥${course.price.toLocaleString()}`}
      </p>
      {unlocked ? (
        <span className="text-sm font-bold" style={{ color: "var(--accent)" }}>✅ 購入済み</span>
      ) : course.is_free ? (
        <span className="text-sm" style={{ color: "var(--muted)" }}>無料で閲覧できます</span>
      ) : (
        <button onClick={handlePurchase} disabled={purchasing} className="btn-primary disabled:opacity-50">
          {purchasing ? "準備中…" : "購入する"}
        </button>
      )}
    </div>
  );

  const infoCard = (
    <div className="card flex flex-col gap-3">
      <div className="flex items-start gap-3">
        {course.character.avatar_url ? (
          <img src={course.character.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl flex-shrink-0" style={{ background: "var(--example-bg, #eee)" }}>🎭</div>
        )}
        <div className="flex-1">
          {course.category && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--example-bg, #eee)", color: "var(--accent)" }}>{course.category}</span>}
          <h1 className="text-xl font-black mt-2" style={{ color: "var(--primary)" }}>{course.title}</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>{course.character.name}</p>
          {course.character.creator_id && (
            <Link href={`/creators/${course.character.creator_id}`} className="text-xs underline" style={{ color: "var(--accent)" }}>クリエイターページへ</Link>
          )}
        </div>
      </div>
      {course.description && <p className="text-sm" style={{ color: "var(--text)" }}>{course.description}</p>}
      {(unlocked || course.is_free) && (
        <div className="flex gap-2 flex-wrap pt-2 border-t" style={{ borderColor: "var(--border)" }}>
          <Link href={`/courses/${courseId}/chat`} className="btn-ghost text-xs">💬 チャット</Link>
          <Link href={`/courses/${courseId}/reviews`} className="btn-ghost text-xs">📈 レビュー</Link>
        </div>
      )}
      <button onClick={handleReport} className="text-xs underline self-start" style={{ color: "var(--muted)" }}>このコースを通報する</button>
    </div>
  );

  return (
    <div>
      {course.thumbnail_url && (
        <div className="w-full max-h-64 overflow-hidden">
          <img src={course.thumbnail_url} alt="" className="w-full h-64 object-cover" />
        </div>
      )}

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        {course.is_suspended && (
          <div className="card border-2 flex flex-col gap-1" style={{ borderColor: "#e53e3e", background: "color-mix(in srgb, #e53e3e 8%, var(--card))" }}>
            <p className="text-sm font-bold" style={{ color: "#e53e3e" }}>⚠️ このコースは現在停止されています</p>
            <p className="text-sm" style={{ color: "var(--text)" }}>
              {course.suspension_reason || "運営により一時的に停止されています。詳しくはサポートにお問い合わせください。"}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:items-start">
          <div className="sm:col-span-2">{infoCard}</div>
          <div className="sm:col-span-1">{contractCard}</div>
        </div>

        {unlocked && course.lessons.length > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full" style={{ background: "var(--example-bg, #eee)" }}>
              <div className="h-2 rounded-full" style={{ background: "var(--accent)", width: `${Math.round((completedLessonCount / course.lessons.length) * 100)}%` }} />
            </div>
            <span className="text-xs font-bold whitespace-nowrap" style={{ color: "var(--primary)" }}>{completedLessonCount}/{course.lessons.length} レッスン完了</span>
          </div>
        )}

        {/* 30日コース：今日のタスク＋カレンダー */}
        {(unlocked || course.is_free) && course.has_days && (
          <>
            {!course.has_diagnosis ? (
              <div className="card border-2 flex flex-col gap-3" style={{ borderColor: "var(--accent)" }}>
                <p className="text-sm font-bold" style={{ color: "var(--accent)" }}>🚀 まずはDay1診断から始めましょう</p>
                <p className="text-sm" style={{ color: "var(--text)" }}>診断に答えると、あなた専用の30日プランが作られます。</p>
                <Link href={`/courses/${courseId}/diagnosis`} className="btn-primary self-start">Day1診断を始める</Link>
              </div>
            ) : (
              <>
                {today && (
                  <div className="card shadow-soft overflow-hidden p-0" style={{ borderColor: "var(--accent)" }}>
                    <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ background: "linear-gradient(135deg, var(--primary), var(--accent))" }}>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🔥</span>
                        <p className="text-sm font-black text-white">今日のタスク</p>
                      </div>
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.22)", color: "white" }}>
                        Day {currentDay}
                      </span>
                    </div>

                    <div className="flex flex-col gap-4 p-5">
                      {today.is_rest_day ? (
                        <div className="flex items-center gap-3 py-2">
                          <span className="text-2xl">🌿</span>
                          <div>
                            <p className="text-sm font-bold" style={{ color: "var(--text)" }}>今日は休息日です</p>
                            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{restDayTip(currentDay)}</p>
                          </div>
                        </div>
                      ) : (
                        <>
                          {todayTasks.length > 0 ? (
                            <ul className="flex flex-col gap-2">
                              {(() => {
                                // テーマ文字列「単語Ch1-4+模試2大5」のように複数項目が+で連結されている場合、
                                // 各タスクに対応する項目をインデックスで割り当てる（件数が一致しない場合は全体をそのまま使う）
                                const themeParts = today.theme ? today.theme.split("+").map(s => s.trim()) : [];
                                const useThemeParts = themeParts.length === todayTasks.length;
                                return todayTasks.map((t, i) => {
                                  const isChecked = checkedTaskTypes.has(t.type);
                                  const label = useThemeParts
                                    ? themeParts[i]
                                    : (today.theme || TASK_TYPE_LABEL[t.type] || t.type);
                                  return (
                                    <li key={i}>
                                      <label
                                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors"
                                        style={{
                                          background: isChecked ? "color-mix(in srgb, var(--accent) 12%, var(--card))" : "var(--bg)",
                                          border: `1px solid ${isChecked ? "var(--accent)" : "var(--border)"}`,
                                        }}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={() => toggleTaskType(t.type)}
                                          disabled={!!todayLog?.is_completed}
                                          className="flex-shrink-0"
                                          style={{ width: "1rem", height: "1rem" }}
                                        />
                                        <span className="flex-1 text-sm font-bold" style={{ color: "var(--text)" }}>
                                          📌 {label}
                                        </span>
                                        {t.carryover && (
                                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "var(--accent)", color: "white" }}>繰越</span>
                                        )}
                                        <span className="text-xs font-bold px-2 py-1 rounded-full flex-shrink-0" style={{ background: "var(--example-bg, #eee)", color: "var(--muted)" }}>
                                          {t.minutes}分
                                        </span>
                                      </label>
                                    </li>
                                  );
                                });
                              })()}
                            </ul>
                          ) : (
                            <p className="text-sm" style={{ color: "var(--muted)" }}>今日のタスクはありません。復習をしましょう！</p>
                          )}
                        </>
                      )}

                      {!today.is_rest_day && currentDay === 30 && (
                        <p className="text-xs" style={{ color: "var(--muted)" }}>
                          最終日のため、未完了タスクは翌日に繰り越せません。今日中の完了を目指しましょう。
                        </p>
                      )}

                      {!today.is_rest_day && (
                        <div className="pt-3 flex flex-wrap items-center justify-between gap-3" style={{ borderTop: "1px solid var(--border)" }}>
                          <button
                            onClick={() => handleReportToday(currentDay)}
                            disabled={reporting || !!todayLog?.is_completed}
                            className="btn-primary disabled:opacity-50"
                          >
                            {todayLog?.is_completed ? "✅ 報告済み" : reporting ? "報告中…" : "今日の学習を報告する"}
                          </button>
                          <Link href={`/courses/${courseId}/chat`} className="text-xs font-bold underline" style={{ color: "var(--accent)" }}>チャットで相談する →</Link>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {days.length > 0 && (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 rounded-full" style={{ background: "var(--example-bg, #eee)" }}>
                        <div className="h-2 rounded-full" style={{ background: "var(--accent)", width: `${Math.round((completedCount / 30) * 100)}%` }} />
                      </div>
                      <span className="text-sm font-bold whitespace-nowrap" style={{ color: "var(--primary)" }}>{completedCount}/30日 完了</span>
                    </div>

                    {paceBadge && (
                      <p className="text-xs font-bold px-3 py-2 rounded-lg self-start" style={{
                        background: paceBadge.tone === "good" ? "var(--accent)" : "var(--example-bg, #eee)",
                        color: paceBadge.tone === "good" ? "white" : "var(--muted)",
                      }}>
                        {paceBadge.text}
                      </p>
                    )}

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
                                  background: isCompleted ? "var(--accent)" : isToday ? "var(--primary)" : d.is_rest_day ? "var(--example-bg, #eee)" : "var(--card)",
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
                )}
              </>
            )}
          </>
        )}

        {/* 30日コースでない場合：従来のレッスン閲覧UI */}
        {!course.has_days && (
          <>
            {course.lessons.length > 0 && (
              <button onClick={() => setShowLessonDrawer(true)} className="sm:hidden btn-ghost text-sm flex items-center justify-between">
                <span>📚 レッスン一覧（{course.lessons.length}）</span>
                <span>▼</span>
              </button>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="hidden sm:flex sm:col-span-1 flex-col gap-2">
                <LessonList
                  lessons={course.lessons}
                  activeLessonId={activeLessonId}
                  completedLessonIds={completedLessonIds}
                  unlocked={unlocked}
                  isFree={course.is_free}
                  onSelect={setActiveLessonId}
                />
              </div>

              <div className="sm:col-span-2 card flex flex-col gap-4">
                {!activeLesson ? (
                  <p className="text-sm" style={{ color: "var(--muted)" }}>レッスンがまだありません。</p>
                ) : (activeLesson.body == null && activeLesson.youtube_url == null) ? (
                  <div className="text-center py-10">
                    <p className="text-4xl mb-3">🔒</p>
                    <p className="text-sm" style={{ color: "var(--muted)" }}>このレッスンは購入後に閲覧できます。</p>
                  </div>
                ) : (
                  <>
                    {activeLesson.content_type === "video" && activeLesson.youtube_url ? (
                      <div className="aspect-video">
                        <iframe src={activeLesson.youtube_url} className="w-full h-full rounded-lg" allowFullScreen />
                      </div>
                    ) : (
                      <article className="prose whitespace-pre-wrap text-sm" style={{ color: "var(--text)" }}>{activeLesson.body}</article>
                    )}
                    {(unlocked || course.is_free) && (
                      completedLessonIds.has(activeLesson.id) ? (
                        <span className="self-start text-sm font-bold" style={{ color: "var(--accent)" }}>✅ 完了済み</span>
                      ) : (
                        <button onClick={() => handleCompleteLesson(activeLesson.id)} disabled={completing} className="btn-primary self-start disabled:opacity-50">
                          このレッスンを完了にする
                        </button>
                      )
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {checkout && (
        <CourseCheckoutModal courseId={courseId} clientSecret={checkout.clientSecret} isSubscription={checkout.isSubscription} onClose={() => setCheckout(null)} />
      )}

      {showLessonDrawer && (
        <div className="sm:hidden fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setShowLessonDrawer(false)}>
          <div
            className="w-full max-h-[80vh] overflow-y-auto rounded-t-2xl p-4 flex flex-col gap-2"
            style={{ background: "var(--card)" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="font-bold text-sm" style={{ color: "var(--primary)" }}>レッスン一覧</p>
              <button onClick={() => setShowLessonDrawer(false)} className="text-sm" style={{ color: "var(--muted)" }}>閉じる ✕</button>
            </div>
            <LessonList
              lessons={course.lessons}
              activeLessonId={activeLessonId}
              completedLessonIds={completedLessonIds}
              unlocked={unlocked}
              isFree={course.is_free}
              onSelect={id => { setActiveLessonId(id); setShowLessonDrawer(false); }}
            />
          </div>
        </div>
      )}

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

function LessonList({
  lessons, activeLessonId, completedLessonIds, unlocked, isFree, onSelect,
}: {
  lessons: Lesson[];
  activeLessonId: number | null;
  completedLessonIds: Set<number>;
  unlocked: boolean;
  isFree: boolean;
  onSelect: (id: number) => void;
}) {
  return (
    <>
      {lessons.map(l => {
        const isLocked = !unlocked && !l.is_preview && !isFree;
        const isActive = activeLessonId === l.id;
        const isDone = completedLessonIds.has(l.id);
        return (
          <button key={l.id} onClick={() => onSelect(l.id)}
            className="text-left text-sm px-3 py-2 rounded-lg transition-colors flex items-center gap-2"
            style={{
              background: isActive ? "var(--primary)" : "var(--card)",
              color: isActive ? "white" : isLocked ? "var(--muted)" : "var(--text)",
              border: "1px solid var(--border)",
              opacity: isLocked ? 0.55 : 1,
            }}>
            <span className="flex-shrink-0">
              {isDone ? "✅" : isActive ? "▶️" : isLocked ? "🔒" : "○"}
            </span>
            <span className="flex-1">
              {l.order}. {l.title} {l.is_preview && <span className="text-xs">（無料公開）</span>}
            </span>
            {isActive && !isDone && <span className="text-[10px] font-bold flex-shrink-0">進行中</span>}
          </button>
        );
      })}
    </>
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
            <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: "var(--primary)", color: "white" }}>本日</span>
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
                {tasks.map((t, i) => <li key={i}>{TASK_TYPE_LABEL[t.type] ?? t.type}（{t.minutes}分）</li>)}
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
