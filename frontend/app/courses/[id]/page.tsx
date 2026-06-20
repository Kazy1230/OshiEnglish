"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useDarkMode } from "@/lib/darkMode";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { CourseCheckoutModal } from "@/components/CourseCheckoutModal";
import { NotificationBell } from "@/components/NotificationBell";
import { toast } from "@/components/Toast";

type Lesson = {
  id: number; order: number; title: string; content_type: "text" | "video";
  body?: string | null; youtube_url?: string | null; is_preview: boolean;
};
type CourseDetail = {
  id: number; title: string; description?: string | null; thumbnail_url?: string | null;
  category?: string | null; status: string; price: number; is_free: boolean;
  character: { id: number; name: string; avatar_url?: string | null };
  lessons: Lesson[];
  is_purchased: boolean;
};

export default function CourseDetailPage() {
  const params = useParams();
  const courseId = Number(params.id);
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [checkout, setCheckout] = useState<{ clientSecret: string } | null>(null);
  const [activeLessonId, setActiveLessonId] = useState<number | null>(null);
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<number>>(new Set());
  const [completing, setCompleting] = useState(false);
  const [mode, toggleMode] = useDarkMode();

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
      setCheckout({ clientSecret: res.client_secret });
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "決済の開始に失敗しました", "error");
    } finally {
      setPurchasing(false);
    }
  }

  if (loading) return <p className="p-8" style={{ color: "var(--muted)" }}>読み込み中…</p>;
  if (!course) return <p className="p-8" style={{ color: "var(--muted)" }}>コースが見つかりません</p>;

  const activeLesson = course.lessons.find(l => l.id === activeLessonId) ?? course.lessons[0];
  const unlocked = course.is_purchased;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="flex items-center justify-between px-4 sm:px-6 py-4" style={{ background: "var(--primary)" }}>
        <Link href={`/instructors/${course.character.id}`} className="text-white/80 text-sm">← 講師ページ</Link>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <DarkModeToggle mode={mode} onToggle={toggleMode} variant="onColor" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        <div>
          {course.category && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--example-bg, #eee)", color: "var(--accent)" }}>{course.category}</span>}
          <h1 className="text-2xl font-black mt-2" style={{ color: "var(--primary)" }}>{course.title}</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>{course.character.name}</p>
          {course.description && <p className="text-sm mt-3" style={{ color: "var(--text)" }}>{course.description}</p>}
        </div>

        <div className="card flex items-center justify-between gap-4 sticky top-4 z-10">
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
