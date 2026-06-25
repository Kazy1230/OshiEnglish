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
  is_suspended?: boolean;
  suspension_reason?: string | null;
  my_subscription?: { id: number; tier: "A" | "B"; status: string } | null;
};

export default function CourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = Number(params.id);
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [checkout, setCheckout] = useState<{ clientSecret: string } | null>(null);
  const [activeLessonId, setActiveLessonId] = useState<number | null>(null);
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<number>>(new Set());
  const [completing, setCompleting] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [changingTier, setChangingTier] = useState(false);

  function load() {
    return api.getCourseDetail(courseId).then(c => {
      setCourse(c);
      if (c.lessons.length > 0) setActiveLessonId(c.lessons[0].id);
      if (c.is_purchased || c.is_free) {
        api.getCourseProgress(courseId).then(p => {
          setCompletedLessonIds(new Set(p.lessons.filter((l: { is_completed: boolean }) => l.is_completed).map((l: { lesson_id: number }) => l.lesson_id)));
        }).catch(() => {});
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
      setCheckout({ clientSecret: res.client_secret });
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
      setCheckout({ clientSecret: res.client_secret });
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

  return (
    <div>
      {course.thumbnail_url && (
        <div className="w-full max-h-64 overflow-hidden">
          <img src={course.thumbnail_url} alt="" className="w-full h-64 object-cover" />
        </div>
      )}

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        <div className="flex items-start gap-3">
          {course.character.avatar_url ? (
            <img src={course.character.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl flex-shrink-0" style={{ background: "var(--example-bg, #eee)" }}>🎭</div>
          )}
          <div className="flex-1">
            {course.category && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--example-bg, #eee)", color: "var(--accent)" }}>{course.category}</span>}
            <h1 className="text-2xl font-black mt-2" style={{ color: "var(--primary)" }}>{course.title}</h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              {course.character.name}
              {course.character.creator_id && (
                <> ・ <Link href={`/creators/${course.character.creator_id}`} className="underline" style={{ color: "var(--accent)" }}>クリエイターページへ</Link></>
              )}
            </p>
            {course.description && <p className="text-sm mt-3" style={{ color: "var(--text)" }}>{course.description}</p>}
            <button onClick={handleReport} className="text-xs underline mt-2" style={{ color: "var(--muted)" }}>このコースを通報する</button>
          </div>
        </div>

        {unlocked && course.lessons.length > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full" style={{ background: "var(--example-bg, #eee)" }}>
              <div className="h-2 rounded-full" style={{ background: "var(--accent)", width: `${Math.round((completedLessonCount / course.lessons.length) * 100)}%` }} />
            </div>
            <span className="text-xs font-bold whitespace-nowrap" style={{ color: "var(--primary)" }}>{completedLessonCount}/{course.lessons.length} レッスン完了</span>
          </div>
        )}

        {(course.tier_a_price || course.tier_b_price) ? (
          <div className="card flex flex-col gap-4 sticky top-4 z-10">
            {unlocked ? (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-sm font-bold" style={{ color: "var(--accent)" }}>
                  ✅ {course.my_subscription ? `Tier ${course.my_subscription.tier} 契約中` : "購入済み"}
                </span>
                <div className="flex items-center gap-3 flex-wrap">
                  <Link href={`/courses/${courseId}/diagnosis`} className="btn-primary">Day1診断を始める</Link>
                  <Link href={`/courses/${courseId}/chat`} className="text-sm font-bold underline" style={{ color: "var(--accent)" }}>メンターに相談する</Link>
                  {course.has_days && (
                    <Link href={`/courses/${courseId}/schedule`} className="text-sm font-bold underline" style={{ color: "var(--accent)" }}>30日スケジュール</Link>
                  )}
                  <Link href={`/courses/${courseId}/reviews`} className="text-sm font-bold underline" style={{ color: "var(--accent)" }}>週次・月次レビュー</Link>
                  {course.my_subscription && (() => {
                    const otherTier = course.my_subscription.tier === "A" ? "B" : "A";
                    const otherTierPrice = otherTier === "A" ? course.tier_a_price : course.tier_b_price;
                    return otherTierPrice ? (
                      <button onClick={() => handleChangeTier(course.my_subscription!.id, otherTier)} disabled={changingTier}
                        className="text-xs underline disabled:opacity-50" style={{ color: "var(--accent)" }}>
                        Tier {otherTier}に変更する
                      </button>
                    ) : null;
                  })()}
                  {course.my_subscription && (
                    <button onClick={() => handleCancelSubscription(course.my_subscription!.id)} disabled={canceling}
                      className="text-xs underline disabled:opacity-50" style={{ color: "var(--muted)" }}>
                      解約する
                    </button>
                  )}
                </div>
              </div>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          <div className="card flex items-center justify-between gap-4 flex-wrap sticky top-4 z-10">
            <p className="font-black text-lg" style={{ color: "var(--accent)" }}>
              {course.is_free ? "無料" : `¥${course.price.toLocaleString()}`}
            </p>
            {unlocked ? (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-bold" style={{ color: "var(--accent)" }}>✅ 購入済み</span>
                <Link href={`/courses/${courseId}/diagnosis`} className="btn-primary">Day1診断を始める</Link>
                <Link href={`/courses/${courseId}/chat`} className="text-sm font-bold underline" style={{ color: "var(--accent)" }}>メンターに相談する</Link>
                {course.has_days && (
                  <Link href={`/courses/${courseId}/schedule`} className="text-sm font-bold underline" style={{ color: "var(--accent)" }}>30日スケジュール</Link>
                )}
              </div>
            ) : course.is_free ? (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm" style={{ color: "var(--muted)" }}>無料で閲覧できます</span>
                <Link href={`/courses/${courseId}/diagnosis`} className="btn-primary">Day1診断を始める</Link>
                <Link href={`/courses/${courseId}/chat`} className="text-sm font-bold underline" style={{ color: "var(--accent)" }}>メンターに相談する</Link>
                {course.has_days && (
                  <Link href={`/courses/${courseId}/schedule`} className="text-sm font-bold underline" style={{ color: "var(--accent)" }}>30日スケジュール</Link>
                )}
              </div>
            ) : (
              <button onClick={handlePurchase} disabled={purchasing} className="btn-primary disabled:opacity-50">
                {purchasing ? "準備中…" : "購入する"}
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-1 flex flex-col gap-2">
            {course.lessons.map(l => (
              <button key={l.id} onClick={() => setActiveLessonId(l.id)}
                className="text-left text-sm px-3 py-2 rounded-lg transition-colors"
                style={{
                  background: activeLessonId === l.id ? "var(--primary)" : "var(--card)",
                  color: activeLessonId === l.id ? "white" : "var(--text)",
                  border: "1px solid var(--border)",
                }}>
                {l.order}. {l.title} {l.is_preview && <span className="text-xs">（無料公開）</span>}
                {!unlocked && !l.is_preview && !course.is_free && " 🔒"}
                {completedLessonIds.has(l.id) && " ✅"}
              </button>
            ))}
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
      </main>

      {checkout && (
        <CourseCheckoutModal courseId={courseId} clientSecret={checkout.clientSecret} onClose={() => setCheckout(null)} />
      )}
    </div>
  );
}
