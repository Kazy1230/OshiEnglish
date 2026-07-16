"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { CourseCheckoutModal } from "@/components/CourseCheckoutModal";
import { Skeleton } from "@/components/Skeleton";
import { toast } from "@/components/Toast";
import { ChapterCurriculumPanel } from "@/components/ChapterCurriculumPanel";

type Lesson = {
  id: number; order: number; title: string; content_type: "text" | "video";
  body?: string | null; youtube_url?: string | null; is_preview: boolean;
};
type PreviewCard = { id: number; order: number; card_type: string; title: string | null; is_preview: boolean; body?: string | null; youtube_url?: string | null };
type PreviewChapter = { id: number; order: number; title: string; goal: string | null; cards: PreviewCard[] };
const CARD_TYPE_LABEL: Record<string, string> = { video: "動画", build_task: "課題", quiz: "クイズ", message: "メッセージ" };
const CARD_TYPE_ICON: Record<string, string> = { video: "▶", build_task: "✏", quiz: "📝", message: "💬" };
const CARD_TYPE_COLOR: Record<string, string> = { video: "#3b82f6", build_task: "#f59e0b", quiz: "#8b5cf6", message: "#10b981" };

type CourseDetail = {
  id: number; title: string; description?: string | null; thumbnail_url?: string | null;
  category?: string | null; status: string; price: number; is_free: boolean;
  tier_a_price?: number | null; tier_b_price?: number | null;
  course_type: "self_paced" | "pace_based";
  chapter_count?: number;
  chapters?: PreviewChapter[];
  character: { id: number; name: string; avatar_url?: string | null; creator_id: number | null };
  lessons: Lesson[];
  is_purchased: boolean;
  is_suspended?: boolean;
  suspension_reason?: string | null;
  my_subscription?: { id: number; tier: "A" | "B"; status: string } | null;
};
type AdjustedTask = { text: string; minutes: number; carryover?: boolean };
type Day = { day: number; week_number: number; theme: string | null; is_rest_day: boolean; checklist_items?: AdjustedTask[] | null };
type DayLog = { day_number: number; is_completed: boolean; completed_at: string | null; memo: string | null };

const REST_DAY_TIPS = [
  "音楽を聴いてリラックス！英語のものなら尚よし。",
  "今日学んだことを声に出して振り返ってみよう。",
  "しっかり休んで、明日また気持ちよく再開しよう。",
  "散歩しながら英語のポッドキャストを流してみよう。",
  "好きな海外ドラマを字幕付きで気楽に観てみよう。",
];
function restDayTip(day: number) { return REST_DAY_TIPS[day % REST_DAY_TIPS.length]; }

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
  const [days, setDays] = useState<Day[]>([]);
  const [logs, setLogs] = useState<Record<number, DayLog>>({});
  const [selectedDay, setSelectedDay] = useState<Day | null>(null);
  const [checkedIndices, setCheckedIndices] = useState<Set<number>>(new Set());
  const [reporting, setReporting] = useState(false);
  const [reportedDay, setReportedDay] = useState<number | null>(null);
  const [memo, setMemo] = useState("");
  const [previewCard, setPreviewCard] = useState<PreviewCard | null>(null);

  function load() {
    return api.getCourseDetail(courseId).then(async (raw: CourseDetail) => {
      const c: CourseDetail = { ...raw, lessons: raw.lessons ?? [] };
      setCourse(c);
      if (c.lessons.length > 0) setActiveLessonId(c.lessons[0].id);
      const unlocked = c.is_purchased || c.is_free;
      if (unlocked) {
        api.getCourseProgress(courseId).then(p => {
          setCompletedLessonIds(new Set(p.lessons.filter((l: { is_completed: boolean }) => l.is_completed).map((l: { lesson_id: number }) => l.lesson_id)));
        }).catch(() => {});
      }
      if (unlocked && c.course_type === "pace_based") {
        const [d, l] = await Promise.all([
          api.listCourseDays(courseId).catch(() => [] as Day[]),
          api.listDayLogs(courseId).catch(() => [] as DayLog[]),
        ]);
        setDays(d);
        const byDay: Record<number, DayLog> = {};
        for (const log of l) byDay[log.day_number] = log;
        setLogs(byDay);
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
    } finally { setCompleting(false); }
  }

  async function handlePurchase() {
    if (!getToken()) { window.location.href = "/login"; return; }
    setPurchasing(true);
    try {
      const res = await api.checkoutCourse(courseId);
      if (!res.client_secret) { router.push(`/purchase-complete?course_id=${courseId}`); return; }
      setCheckout({ clientSecret: res.client_secret, isSubscription: false });
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "決済の開始に失敗しました", "error");
    } finally { setPurchasing(false); }
  }

  async function handleCancelSubscription(subscriptionId: number) {
    if (!confirm("このサブスクリプションを解約しますか？")) return;
    setCanceling(true);
    try {
      await api.cancelSubscription(subscriptionId);
      toast("解約しました", "success");
      await load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "解約に失敗しました", "error");
    } finally { setCanceling(false); }
  }

  async function handleChangeTier(subscriptionId: number, tier: "A" | "B") {
    if (!confirm(`Tier ${tier}に変更しますか？次回請求から適用されます。`)) return;
    setChangingTier(true);
    try {
      await api.changeSubscriptionTier(subscriptionId, tier);
      toast(`Tier ${tier}に変更しました`, "success");
      await load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Tier変更に失敗しました", "error");
    } finally { setChangingTier(false); }
  }

  async function handleSubscribe(tier: "A" | "B") {
    if (!getToken()) { window.location.href = "/login"; return; }
    setPurchasing(true);
    try {
      const res = await api.subscribeToCourse(courseId, tier);
      if (!res.client_secret) { router.push(`/purchase-complete?course_id=${courseId}`); return; }
      setCheckout({ clientSecret: res.client_secret, isSubscription: true });
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "決済の開始に失敗しました", "error");
    } finally { setPurchasing(false); }
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

  function toggleIndex(index: number) {
    setCheckedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }

  async function handleReportToday(currentDay: number) {
    if (reporting) return;
    setReporting(true);
    try {
      const completed = checkedIndices.size > 0 ? Array.from(checkedIndices) : null;
      await api.completeDayLog(courseId, currentDay, memo || undefined, completed ?? undefined);
      setLogs(prev => ({ ...prev, [currentDay]: { day_number: currentDay, is_completed: true, completed_at: new Date().toISOString(), memo: memo || null } }));
      setReportedDay(currentDay);
      setMemo("");
      toast("お疲れさまでした！今日の学習を記録しました ✨", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "報告に失敗しました", "error");
    } finally { setReporting(false); }
  }

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg)" }}>
        <Skeleton className="h-72 w-full" style={{ borderRadius: 0 }} />
        <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--bg)" }}>
        <div className="card max-w-sm text-center flex flex-col gap-3">
          <p className="text-4xl">🔍</p>
          <p className="font-bold" style={{ color: "var(--text)" }}>コースが見つかりません</p>
          <p className="text-sm" style={{ color: "var(--muted)" }}>削除または非公開になった可能性があります。</p>
          <Link href="/" className="btn-primary self-center">コースを探す</Link>
        </div>
      </div>
    );
  }

  const unlocked = course.is_purchased || course.is_free;
  const completedCount = Object.values(logs).filter(l => l.is_completed).length;
  const derivedDay = Math.min(completedCount + 1, 30);
  const currentDay = reportedDay ?? derivedDay;
  const today = days.find(d => d.day === currentDay) ?? null;
  const todayTasks = today?.checklist_items ?? [];
  const todayLog = logs[currentDay] ?? null;
  const completedLessonCount = course.lessons.filter(l => completedLessonIds.has(l.id)).length;
  const progressPct = days.length > 0 ? Math.round((completedCount / 30) * 100) : 0;
  const weeks: Day[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const totalTaskMinutes = todayTasks.reduce((s, t) => s + t.minutes, 0);

  return (
    <div style={{ background: "var(--bg)" }}>
      {/* ===== HERO ===== */}
      <div className="relative overflow-hidden" style={{ minHeight: 280 }}>
        {course.thumbnail_url ? (
          <img src={course.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, var(--ink) 0%, var(--accent) 100%)" }} />
        )}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.72) 100%)" }} />

        <div className="relative max-w-2xl mx-auto px-4 sm:px-6 pt-10 pb-16 flex flex-col gap-3">
          {course.category && (
            <span className="self-start text-xs font-bold px-3 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.95)", backdropFilter: "blur(8px)" }}>
              {course.category}
            </span>
          )}
          <h1 className="text-2xl sm:text-3xl font-black text-white leading-snug" style={{ textShadow: "0 2px 12px rgba(0,0,0,0.4)" }}>
            {course.title}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            {course.character.avatar_url ? (
              <img src={course.character.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover ring-2 ring-white/60" />
            ) : (
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm ring-2 ring-white/60" style={{ background: "rgba(255,255,255,0.2)" }}>🎭</div>
            )}
            <span className="text-sm font-bold text-white/90">{course.character.name}</span>
            {course.character.creator_id && (
              <Link href={`/creators/${course.character.creator_id}`} className="text-xs text-white/60 underline">クリエイターページ</Link>
            )}
          </div>

          {/* 購入導線：Tier A/B または単価 */}
          {!unlocked && (
            <div className="mt-3">
              {(course.tier_a_price || course.tier_b_price) ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {course.tier_a_price && (
                    <div className="flex flex-col gap-2 p-4 rounded-2xl" style={{ background: "rgba(245,239,224,0.95)", backdropFilter: "blur(8px)" }}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: "color-mix(in srgb, var(--ink) 12%, transparent)", color: "var(--ink)" }}>Tier A</span>
                        <span className="text-[11px]" style={{ color: "#6b7280" }}>メンター相談つき</span>
                      </div>
                      <p className="text-xl font-black" style={{ color: "#1a1a2e" }}>¥{course.tier_a_price.toLocaleString()}<span className="text-xs font-bold" style={{ color: "#6b7280" }}>/月</span></p>
                      <ul className="text-[11px] flex flex-col gap-0.5" style={{ color: "#4b5563" }}>
                        <li>✓ 30日パーソナライズコース</li>
                        <li>✓ メンターとのチャット（無制限）</li>
                      </ul>
                      <button onClick={() => handleSubscribe("A")} disabled={purchasing} className="text-sm font-bold py-2 rounded-xl disabled:opacity-50" style={{ background: "var(--ink)", color: "white" }}>
                        {purchasing ? "準備中…" : "Tier Aで始める"}
                      </button>
                    </div>
                  )}
                  {course.tier_b_price && (
                    <div className="flex flex-col gap-2 p-4 rounded-2xl" style={{ background: "rgba(245,239,224,0.95)", backdropFilter: "blur(8px)", border: "2px solid var(--accent)" }}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}>Tier B</span>
                        <span className="text-[11px] font-bold" style={{ color: "var(--accent)" }}>おすすめ</span>
                      </div>
                      <p className="text-xl font-black" style={{ color: "#1a1a2e" }}>¥{course.tier_b_price.toLocaleString()}<span className="text-xs font-bold" style={{ color: "#6b7280" }}>/月</span></p>
                      <ul className="text-[11px] flex flex-col gap-0.5" style={{ color: "#4b5563" }}>
                        <li>✓ 30日パーソナライズコース</li>
                        <li>✓ メンターとのチャット（無制限）</li>
                        <li>✓ <strong style={{ color: "var(--accent)" }}>クリエイター直接添削（1日1回）</strong></li>
                      </ul>
                      <button onClick={() => handleSubscribe("B")} disabled={purchasing} className="text-sm font-bold py-2 rounded-xl disabled:opacity-50" style={{ background: "var(--accent)", color: "white" }}>
                        {purchasing ? "準備中…" : "Tier Bで始める"}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4 p-4 rounded-2xl" style={{ background: "rgba(245,239,224,0.95)", backdropFilter: "blur(8px)" }}>
                  <p className="text-xl font-black" style={{ color: "#1a1a2e" }}>
                    {course.is_free ? "無料" : `¥${course.price.toLocaleString()}`}
                  </p>
                  {course.is_free ? (
                    <span className="text-sm" style={{ color: "#6b7280" }}>無料で受講できます</span>
                  ) : (
                    <button onClick={handlePurchase} disabled={purchasing} className="text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50" style={{ background: "var(--ink)", color: "white" }}>
                      {purchasing ? "準備中…" : "購入して始める"}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 購入済みバッジ */}
          {unlocked && (
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {course.my_subscription ? (
                <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.18)", color: "white", backdropFilter: "blur(8px)" }}>
                  ✅ Tier {course.my_subscription.tier} 受講中
                </span>
              ) : (
                <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.18)", color: "white", backdropFilter: "blur(8px)" }}>
                  ✅ 受講中
                </span>
              )}
              <Link href={`/courses/${courseId}/chat`} className="text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5" style={{ background: "rgba(255,255,255,0.18)", color: "white", backdropFilter: "blur(8px)" }}>
                💬 メンターにチャット
              </Link>
              <Link href={`/courses/${courseId}/reviews`} className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.18)", color: "white", backdropFilter: "blur(8px)" }}>
                📊 レビュー
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ===== 停止バナー ===== */}
      {course.is_suspended && (
        <div className="mx-4 sm:mx-6 mt-4 max-w-2xl mx-auto px-4 py-3 rounded-xl border-2 flex gap-2" style={{ borderColor: "#e53e3e", background: "color-mix(in srgb, #e53e3e 8%, var(--card))" }}>
          <span>⚠️</span>
          <div>
            <p className="text-sm font-bold" style={{ color: "#e53e3e" }}>このコースは現在停止されています</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text)" }}>{course.suspension_reason || "詳しくはサポートにお問い合わせください。"}</p>
          </div>
        </div>
      )}

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">

        {/* ===== 未購入：説明 + 購入CTA ===== */}
        {!unlocked && (
          <>
            {course.description && (
              <p className="text-sm leading-relaxed" style={{ color: "var(--text)" }}>{course.description}</p>
            )}

            {course.lessons.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-bold" style={{ color: "var(--muted)" }}>カリキュラム（{course.lessons.length}レッスン）</p>
                <div className="flex flex-col gap-1.5">
                  {course.lessons.slice(0, 5).map(l => (
                    <div key={l.id} className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                      <span className="text-base">{l.is_preview ? "🔓" : "🔒"}</span>
                      <span className="text-sm flex-1" style={{ color: "var(--text)" }}>{l.order}. {l.title}</span>
                      {l.is_preview && <span className="text-xs font-bold" style={{ color: "var(--accent)" }}>無料</span>}
                    </div>
                  ))}
                  {course.lessons.length > 5 && (
                    <p className="text-xs text-center py-2" style={{ color: "var(--muted)" }}>…他 {course.lessons.length - 5} レッスン</p>
                  )}
                </div>
              </div>
            )}

            {course.course_type === "self_paced" && course.chapters && course.chapters.length > 0 && (
              <div className="flex flex-col gap-4">
                <div className="card overflow-hidden p-0">
                  <div className="px-5 sm:px-6 py-5" style={{ background: "linear-gradient(135deg, var(--ink), var(--accent))" }}>
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.75)" }}>Curriculum</p>
                    <p className="text-2xl font-black mt-1" style={{ color: "white", fontFamily: "var(--font-display)" }}>
                      {course.chapters.length}章・{course.chapters.reduce((s, ch) => s + ch.cards.length, 0)}カード
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  {course.chapters.map(ch => (
                    <div key={ch.id} className="card flex flex-col gap-4">
                      <div className="flex items-start gap-3">
                        <span
                          className="flex items-center justify-center flex-shrink-0 font-black"
                          style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--ink)", color: "white", fontSize: 14 }}
                        >
                          {ch.order}
                        </span>
                        <div className="flex-1 min-w-0">
                          <h2 className="font-bold text-base" style={{ color: "var(--text)" }}>{ch.title}</h2>
                          {ch.goal && <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>🎯 {ch.goal}</p>}
                        </div>
                      </div>
                      {ch.cards.length > 0 && (
                        <div className="flex flex-col gap-2">
                          {ch.cards.map(c => {
                            const typeColor = CARD_TYPE_COLOR[c.card_type] ?? "var(--muted)";
                            const hasTitle = !!c.title?.trim();
                            const displayTitle = hasTitle ? c.title : (CARD_TYPE_LABEL[c.card_type] ?? c.card_type);
                            return (
                              <div
                                key={c.id}
                                role={c.is_preview ? "button" : undefined}
                                tabIndex={c.is_preview ? 0 : undefined}
                                onClick={c.is_preview ? () => setPreviewCard(c) : undefined}
                                className="hover-lift flex items-center gap-3 px-3.5 py-3 rounded-xl transition-colors w-full text-left"
                                style={{ background: "var(--card)", border: "1px solid var(--border)", opacity: c.is_preview ? 1 : 0.7, cursor: c.is_preview ? "pointer" : "default" }}
                              >
                                <span
                                  className="flex items-center justify-center flex-shrink-0"
                                  style={{ width: 32, height: 32, borderRadius: "50%", background: `${typeColor}1a`, color: typeColor, fontSize: 14 }}
                                >
                                  {CARD_TYPE_ICON[c.card_type] ?? "●"}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>{displayTitle}</p>
                                  {hasTitle && (
                                    <p className="text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>{CARD_TYPE_LABEL[c.card_type] ?? c.card_type}</p>
                                  )}
                                </div>
                                {c.is_preview ? (
                                  <span className="pill flex-shrink-0" style={{ background: "var(--accent)", color: "white" }}>無料</span>
                                ) : (
                                  <span className="flex-shrink-0" style={{ color: "var(--muted)", fontSize: 16 }}>🔒</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {course.course_type === "pace_based" && (
              <div className="card flex flex-col gap-5 overflow-hidden p-0">
                <div className="px-5 sm:px-6 py-5" style={{ background: "linear-gradient(135deg, var(--ink), var(--accent))" }}>
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.75)" }}>Program</p>
                  <p className="text-2xl font-black mt-1" style={{ color: "white", fontFamily: "var(--font-display)" }}>30日間の伴走プログラム</p>
                  <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.85)" }}>毎日のタスクとメンターへのチャットで、無理なく続けられます</p>
                </div>
                <div className="px-5 sm:px-6 pb-5 flex flex-col gap-4">
                  {Array.from({ length: 5 }).map((_, wi) => {
                    const start = wi * 7 + 1;
                    const cellCount = Math.min(7, 30 - wi * 7);
                    return (
                      <div key={wi}>
                        <p className="text-[11px] font-bold mb-2" style={{ color: "var(--muted)" }}>第{wi + 1}週</p>
                        <div className="grid grid-cols-7 gap-1.5">
                          {Array.from({ length: cellCount }).map((_, di) => (
                            <div key={di} className="aspect-square flex flex-col items-center justify-center gap-0.5" style={{ borderRadius: 12, background: "var(--card)", border: "1.5px solid var(--border)" }}>
                              <span className="text-sm" style={{ color: "var(--border)" }}>🔒</span>
                              <span className="text-[10px] font-bold" style={{ color: "var(--muted)" }}>{start + di}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-xs text-center" style={{ color: "var(--muted)" }}>購入すると30日間のプログラムが始まります</p>
                </div>
              </div>
            )}
          </>
        )}

        {/* ===== 購入済み：契約管理 ===== */}
        {unlocked && course.my_subscription && (
          <div className="rounded-xl px-4 py-3 flex items-center justify-between gap-2" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
            <span className="text-sm" style={{ color: "var(--muted)" }}>Tier {course.my_subscription.tier} 受講中</span>
            <button onClick={() => setShowContractDetail(v => !v)} className="text-xs underline" style={{ color: "var(--muted)" }}>
              {showContractDetail ? "閉じる" : "契約管理"}
            </button>
            {showContractDetail && (
              <div className="absolute top-full left-0 right-0 mt-1 card flex flex-col gap-2 z-10">
                {(() => {
                  const otherTier = course.my_subscription!.tier === "A" ? "B" : "A";
                  const otherPrice = otherTier === "A" ? course.tier_a_price : course.tier_b_price;
                  return otherPrice ? (
                    <button onClick={() => handleChangeTier(course.my_subscription!.id, otherTier)} disabled={changingTier}
                      className="text-xs underline text-left disabled:opacity-50" style={{ color: "var(--accent)" }}>
                      Tier {otherTier}（¥{otherPrice.toLocaleString()}/月）に変更
                    </button>
                  ) : null;
                })()}
                <button onClick={() => handleCancelSubscription(course.my_subscription!.id)} disabled={canceling}
                  className="text-xs underline text-left disabled:opacity-50" style={{ color: "var(--muted)" }}>
                  {canceling ? "処理中…" : "解約する"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ===== 30日コース：学習UI ===== */}
        {unlocked && course.course_type === "pace_based" && today && (
          <>
            {/* 進捗バー */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold" style={{ color: "var(--text)" }}>全体の進捗</span>
                <span className="text-sm font-black" style={{ color: "var(--accent)" }}>{completedCount} / 30 日</span>
              </div>
              <div className="relative h-3 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-500" style={{ width: `${progressPct}%`, background: "linear-gradient(to right, var(--ink), var(--accent))" }} />
              </div>
              <div className="flex items-center justify-between text-xs" style={{ color: "var(--muted)" }}>
                <span>スタート</span>
                <span>{progressPct}% 完了</span>
                <span>ゴール</span>
              </div>
            </div>

            {/* 今日のタスクカード */}
            <div className="card overflow-hidden p-0 shadow-lg">
              {/* カードヘッダー */}
              <div className="relative px-5 py-4" style={{ background: "linear-gradient(135deg, var(--ink) 0%, var(--accent) 100%)" }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-white/70 uppercase tracking-wider">Today</p>
                    <p className="text-xl font-black text-white mt-0.5">Day {currentDay}</p>
                  </div>
                  {today.theme && (
                    <div className="text-right">
                      <p className="text-xs text-white/70">テーマ</p>
                      <p className="text-sm font-bold text-white mt-0.5 max-w-[140px] text-right">{today.theme}</p>
                    </div>
                  )}
                </div>
                {!today.is_rest_day && totalTaskMinutes > 0 && (
                  <div className="flex items-center gap-2 mt-3">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.18)" }}>
                      <span className="text-xs text-white">⏱</span>
                      <span className="text-xs font-bold text-white">合計 {totalTaskMinutes} 分</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-5 flex flex-col gap-4">
                {today.is_rest_day ? (
                  <div className="flex items-start gap-4 py-2">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0" style={{ background: "color-mix(in srgb, var(--accent) 12%, var(--bg))" }}>
                      🌿
                    </div>
                    <div>
                      <p className="font-bold" style={{ color: "var(--text)" }}>今日は休息日です</p>
                      <p className="text-sm mt-1 leading-relaxed" style={{ color: "var(--muted)" }}>{restDayTip(currentDay)}</p>
                    </div>
                  </div>
                ) : todayLog?.is_completed ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3 py-2 px-4 rounded-xl" style={{ background: "color-mix(in srgb, var(--accent) 10%, var(--bg))", border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)" }}>
                      <span className="text-2xl">🎉</span>
                      <div>
                        <p className="font-bold" style={{ color: "var(--accent)" }}>Day {currentDay} 完了！</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>お疲れさまでした。明日も一緒に頑張りましょう。</p>
                      </div>
                    </div>
                    {reportedDay !== null && derivedDay > currentDay && (
                      <button onClick={() => setReportedDay(null)} className="btn-ghost text-sm self-start">
                        Day {derivedDay} のタスクを見る →
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* タスクリスト */}
                    {todayTasks.length > 0 ? (
                      <ul className="flex flex-col gap-2">
                        {todayTasks.map((t, i) => {
                          const isChecked = checkedIndices.has(i);
                          return (
                            <li key={i}>
                              <label className="flex items-start gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all" style={{
                                background: isChecked ? "color-mix(in srgb, var(--accent) 10%, var(--bg))" : "var(--bg)",
                                border: `1.5px solid ${isChecked ? "var(--accent)" : "var(--border)"}`,
                              }}>
                                <input type="checkbox" checked={isChecked} onChange={() => toggleIndex(i)}
                                  className="flex-shrink-0 mt-0.5" style={{ width: "1.1rem", height: "1.1rem", accentColor: "var(--accent)" }} />
                                <span className="flex-1 text-sm font-bold" style={{ color: "var(--text)" }}>{t.text}</span>
                                {t.carryover && (
                                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "var(--accent)", color: "white" }}>繰越</span>
                                )}
                                <span className="text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0" style={{ background: "var(--border)", color: "var(--muted)" }}>{t.minutes}分</span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="text-sm" style={{ color: "var(--muted)" }}>今日のタスクはありません。</p>
                    )}

                    {/* メモ欄 */}
                    <textarea
                      value={memo}
                      onChange={e => setMemo(e.target.value)}
                      placeholder="今日の感想・メモ（任意）"
                      rows={2}
                      className="w-full text-sm px-4 py-3 rounded-xl resize-none"
                      style={{ background: "var(--bg)", border: "1.5px solid var(--border)", color: "var(--text)" }}
                    />

                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <button onClick={() => handleReportToday(currentDay)} disabled={reporting}
                        className="btn-primary flex-1 disabled:opacity-50 text-center" style={{ minWidth: 160 }}>
                        {reporting ? "記録中…" : "今日の学習を記録する ✓"}
                      </button>
                      <Link href={`/courses/${courseId}/chat`} className="text-sm font-bold underline flex-shrink-0" style={{ color: "var(--accent)" }}>
                        メンターに相談 →
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* 30日カレンダー */}
            {days.length > 0 && (
              <div className="card flex flex-col gap-5">
                <div className="flex items-center justify-between">
                  <p className="font-bold" style={{ color: "var(--text)" }}>30日カレンダー</p>
                  <span className="text-sm font-black" style={{ color: "var(--accent)" }}>{completedCount}日 完了</span>
                </div>
                {weeks.map((week, wi) => (
                  <div key={wi}>
                    <p className="text-[11px] font-bold mb-2" style={{ color: "var(--muted)" }}>第{wi + 1}週</p>
                    <div className="grid grid-cols-7 gap-1.5">
                      {week.map(d => {
                        const log = logs[d.day];
                        const isCompleted = !!log?.is_completed;
                        const isToday = d.day === currentDay;
                        const isFuture = d.day > currentDay && !isCompleted;
                        return (
                          <button key={d.day} onClick={() => setSelectedDay(d)}
                            className="aspect-square flex flex-col items-center justify-center gap-0.5 transition-all hover:scale-105"
                            style={{
                              borderRadius: 12,
                              background: isCompleted
                                ? "linear-gradient(135deg, var(--ink), var(--accent))"
                                : isToday
                                  ? "var(--ink)"
                                  : d.is_rest_day
                                    ? "var(--border)"
                                    : "var(--card)",
                              color: isCompleted || isToday ? "white" : d.is_rest_day ? "var(--muted)" : isFuture ? "var(--border)" : "var(--text)",
                              border: isToday ? "none" : isCompleted ? "none" : `1.5px solid ${isFuture ? "var(--border)" : "var(--border)"}`,
                              boxShadow: isCompleted ? "0 4px 12px rgba(0,0,0,0.2)" : isToday ? "0 4px 12px rgba(35,51,71,0.3)" : "none",
                            }}>
                            <span className="text-base leading-none">{isCompleted ? "✓" : d.is_rest_day ? "☆" : ""}</span>
                            <span className="text-[10px] font-bold">{d.day}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-4 pt-2 border-t text-xs" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded" style={{ background: "linear-gradient(135deg, var(--ink), var(--accent))", display: "inline-block" }} /> 完了
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded" style={{ background: "var(--ink)", display: "inline-block" }} /> 今日
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded" style={{ background: "var(--border)", display: "inline-block" }} /> 休息日
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {/* ===== v2.0コース：学習UI（コース詳細に統合） ===== */}
        {unlocked && course.course_type === "self_paced" && (course.chapter_count ?? 0) > 0 && (
          <ChapterCurriculumPanel courseId={courseId} />
        )}

        {/* ===== 非30日コース：レッスン閲覧 ===== */}
        {unlocked && course.course_type === "self_paced" && course.lessons.length > 0 && (
          <div className="flex flex-col gap-4">
            {/* 進捗バー */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: "var(--text)" }}>レッスン進捗</span>
                <span className="font-black" style={{ color: "var(--accent)" }}>{completedLessonCount}/{course.lessons.length}</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                <div className="h-2 rounded-full" style={{ width: `${Math.round((completedLessonCount / course.lessons.length) * 100)}%`, background: "linear-gradient(to right, var(--ink), var(--accent))" }} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1 flex flex-col gap-1.5">
                {course.lessons.map(l => {
                  const isLocked = !unlocked && !l.is_preview && !course.is_free;
                  const isActive = activeLessonId === l.id;
                  const isDone = completedLessonIds.has(l.id);
                  return (
                    <button key={l.id} onClick={() => setActiveLessonId(l.id)}
                      className="text-left text-sm px-3 py-2.5 rounded-xl flex items-center gap-2 transition-all"
                      style={{
                        background: isActive ? "var(--ink)" : isDone ? "color-mix(in srgb, var(--accent) 8%, var(--card))" : "var(--card)",
                        color: isActive ? "white" : isLocked ? "var(--muted)" : "var(--text)",
                        border: `1px solid ${isActive ? "transparent" : isDone ? "color-mix(in srgb, var(--accent) 25%, transparent)" : "var(--border)"}`,
                        opacity: isLocked ? 0.55 : 1,
                      }}>
                      <span className="flex-shrink-0 text-base">{isDone ? "✅" : isActive ? "▶" : isLocked ? "🔒" : "○"}</span>
                      <span className="flex-1 truncate">{l.order}. {l.title}</span>
                    </button>
                  );
                })}
              </div>

              <div className="sm:col-span-2">
                {(() => {
                  const activeLesson = course.lessons.find(l => l.id === activeLessonId) ?? course.lessons[0];
                  if (!activeLesson) return null;
                  if (activeLesson.body == null && activeLesson.youtube_url == null) {
                    return (
                      <div className="card flex flex-col items-center gap-3 py-12">
                        <span className="text-4xl">🔒</span>
                        <p className="text-sm font-bold" style={{ color: "var(--muted)" }}>このレッスンは購入後に閲覧できます</p>
                      </div>
                    );
                  }
                  return (
                    <div className="card flex flex-col gap-4">
                      <p className="font-bold" style={{ color: "var(--primary)" }}>{activeLesson.title}</p>
                      {activeLesson.content_type === "video" && activeLesson.youtube_url ? (
                        <div className="aspect-video rounded-xl overflow-hidden">
                          <iframe src={activeLesson.youtube_url} className="w-full h-full" allowFullScreen />
                        </div>
                      ) : (
                        <article className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text)" }}>{activeLesson.body}</article>
                      )}
                      {(unlocked || course.is_free) && (
                        completedLessonIds.has(activeLesson.id) ? (
                          <span className="text-sm font-bold" style={{ color: "var(--accent)" }}>✅ 完了済み</span>
                        ) : (
                          <button onClick={() => handleCompleteLesson(activeLesson.id)} disabled={completing} className="btn-primary self-start disabled:opacity-50">
                            {completing ? "記録中…" : "このレッスンを完了にする"}
                          </button>
                        )
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        <button onClick={handleReport} className="text-xs self-center underline" style={{ color: "var(--muted)" }}>
          このコースを通報する
        </button>
      </main>

      {checkout && (
        <CourseCheckoutModal courseId={courseId} clientSecret={checkout.clientSecret} isSubscription={checkout.isSubscription} onClose={() => setCheckout(null)} />
      )}

      {selectedDay && (
        <DayDetailPanel
          courseId={courseId}
          day={selectedDay}
          tasks={selectedDay.checklist_items ?? []}
          log={logs[selectedDay.day] ?? null}
          isToday={selectedDay.day === currentDay}
          onClose={() => setSelectedDay(null)}
        />
      )}

      {previewCard && (
        <PreviewCardModal card={previewCard} onClose={() => setPreviewCard(null)} />
      )}
    </div>
  );
}

function DayDetailPanel({ courseId, day, tasks, log, isToday, onClose }: {
  courseId: number; day: Day; tasks: AdjustedTask[]; log: DayLog | null; isToday: boolean; onClose: () => void;
}) {
  const totalMin = tasks.reduce((s, t) => s + t.minutes, 0);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="w-full sm:max-w-md max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl flex flex-col gap-0 overflow-hidden"
        style={{ background: "var(--card)" }} onClick={e => e.stopPropagation()}>
        <div className="px-5 py-5 flex flex-col gap-1" style={{ background: "linear-gradient(135deg, var(--ink), var(--accent))" }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-white/70">Week {day.week_number}</p>
              <p className="text-xl font-black text-white">Day {day.day}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              {log?.is_completed && <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.25)", color: "white" }}>完了済み ✓</span>}
              {isToday && !log?.is_completed && <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.25)", color: "white" }}>今日</span>}
              {day.is_rest_day && <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.25)", color: "white" }}>休息日 🌿</span>}
            </div>
          </div>
          {day.theme && <p className="text-sm text-white/90 mt-1">{day.theme}</p>}
          {totalMin > 0 && <p className="text-xs text-white/70 mt-0.5">⏱ 合計 {totalMin} 分</p>}
        </div>

        <div className="p-5 flex flex-col gap-4">
          {day.is_rest_day ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>🌿 今日はチャージの日。ゆっくり休みましょう。</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {tasks.map((t, i) => (
                <li key={i} className="flex items-start gap-3 px-4 py-3 rounded-xl" style={{ background: "var(--bg)", border: "1.5px solid var(--border)" }}>
                  <span className="text-base flex-shrink-0 mt-0.5">📌</span>
                  <span className="flex-1 text-sm font-bold" style={{ color: "var(--text)" }}>{t.text}</span>
                  {t.carryover && <span className="text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "var(--accent)", color: "white" }}>繰越</span>}
                  <span className="text-xs font-bold flex-shrink-0" style={{ color: "var(--muted)" }}>{t.minutes}分</span>
                </li>
              ))}
            </ul>
          )}

          {log?.memo && (
            <div className="px-4 py-3 rounded-xl" style={{ background: "var(--bg)" }}>
              <p className="text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>メモ</p>
              <p className="text-sm" style={{ color: "var(--text)" }}>{log.memo}</p>
            </div>
          )}

          <div className="flex gap-2">
            {isToday && !log?.is_completed && !day.is_rest_day && (
              <Link href={`/courses/${courseId}/chat`} className="btn-primary flex-1 text-center">メンターに相談する →</Link>
            )}
            <button onClick={onClose} className="btn-ghost flex-1">閉じる</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewCardModal({ card, onClose }: { card: PreviewCard; onClose: () => void }) {
  const displayTitle = card.title?.trim() || (CARD_TYPE_LABEL[card.card_type] ?? card.card_type);
  const youtubeMatch = card.youtube_url?.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl flex flex-col gap-4 p-5"
        style={{ background: "var(--card)" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="pill" style={{ background: "var(--accent)", color: "white" }}>無料プレビュー</span>
            <h2 className="font-bold text-lg mt-2" style={{ color: "var(--text)" }}>{displayTitle}</h2>
          </div>
          <button onClick={onClose} className="text-xl leading-none flex-shrink-0" style={{ color: "var(--muted)" }}>✕</button>
        </div>

        {card.youtube_url && youtubeMatch && (
          <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, overflow: "hidden", borderRadius: 8 }}>
            <iframe
              src={`https://www.youtube.com/embed/${youtubeMatch[1]}`}
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
        {card.body && (
          <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text)" }}>{card.body}</p>
        )}
        {!card.youtube_url && !card.body && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>このカードにはまだ内容がありません。</p>
        )}

        <button onClick={onClose} className="btn-ghost">閉じる</button>
      </div>
    </div>
  );
}
