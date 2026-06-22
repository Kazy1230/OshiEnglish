"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { useDarkMode } from "@/lib/darkMode";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { NotificationBell } from "@/components/NotificationBell";

type PurchasedCourse = { course_id: number; title: string; total_lessons: number; completed_count: number };

export default function MyPage() {
  const { me, loading } = useRoleGuard(["learner", "admin"]);
  const [courses, setCourses] = useState<PurchasedCourse[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [mode, toggleMode] = useDarkMode();

  useEffect(() => {
    if (loading) return;
    api.getMyPurchasedCourses().then(setCourses).catch(() => {}).finally(() => setLoadingCourses(false));
  }, [loading]);

  if (loading) return <Skeleton />;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="flex items-center justify-between px-4 sm:px-6 py-4" style={{ background: "var(--primary)" }}>
        <h1 className="text-white font-black text-lg">マイページ</h1>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <DarkModeToggle mode={mode} onToggle={toggleMode} variant="onColor" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {me?.display_name || me?.username} さん、ようこそ。
        </p>

        <div className="flex flex-wrap gap-3">
          <Link href="/" className="btn-ghost">🔍 コースを探す</Link>
          <Link href="/creators" className="btn-ghost">🎭 クリエイターを探す</Link>
          <Link href="/change-password" className="btn-ghost">🔒 パスワードを変更</Link>
        </div>

        <div>
          <h2 className="font-bold mb-3" style={{ color: "var(--primary)" }}>学習中のコース</h2>
          {loadingCourses ? (
            <p style={{ color: "var(--muted)" }}>読み込み中…</p>
          ) : courses.length === 0 ? (
            <div className="card flex flex-col gap-2">
              <p className="text-sm" style={{ color: "var(--muted)" }}>まだ購入したコースがありません。</p>
              <Link href="/" className="btn-primary self-start">コースを探す</Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {courses.map(c => (
                <div key={c.course_id} className="card flex flex-col gap-3">
                  <p className="font-bold" style={{ color: "var(--primary)" }}>{c.title}</p>
                  <p className="text-sm" style={{ color: "var(--accent)" }}>
                    {c.completed_count}/{c.total_lessons} レッスン完了
                  </p>
                  <div className="h-2 rounded-full" style={{ background: "var(--example-bg, #eee)" }}>
                    <div
                      className="h-2 rounded-full"
                      style={{ background: "var(--accent)", width: `${c.total_lessons ? Math.round((c.completed_count / c.total_lessons) * 100) : 0}%` }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/courses/${c.course_id}/chat`} className="btn-primary flex-1 text-center">伴走チャットへ</Link>
                    <Link href={`/courses/${c.course_id}`} className="btn-ghost flex-1 text-center">コース詳細</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
