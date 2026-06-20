"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { useDarkMode } from "@/lib/darkMode";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { NotificationBell } from "@/components/NotificationBell";

type CharacterSummary = { id: number; name: string; description?: string | null; image_url?: string | null };
type PurchasedCourse = { course_id: number; title: string; total_lessons: number; completed_count: number };

export default function DashboardPage() {
  const { me, loading } = useRoleGuard(["instructor", "admin"]);
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [loadingChars, setLoadingChars] = useState(true);
  const [purchasedCourses, setPurchasedCourses] = useState<PurchasedCourse[]>([]);
  const [mode, toggleMode] = useDarkMode();

  useEffect(() => {
    if (loading) return;
    api.listMyCharacters().then(setCharacters).catch(() => {}).finally(() => setLoadingChars(false));
    api.getMyPurchasedCourses().then(setPurchasedCourses).catch(() => {});
  }, [loading]);

  if (loading) return <Skeleton />;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="flex items-center justify-between px-4 sm:px-6 py-4" style={{ background: "var(--primary)" }}>
        <h1 className="text-white font-black text-lg">講師ダッシュボード</h1>
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
          <Link href="/dashboard/characters/new" className="btn-primary">+ 新しいキャラクターを作る</Link>
          <Link href="/studio" className="btn-primary">🎬 AIコンテンツ生成スタジオへ</Link>
        </div>

        <div>
          <h2 className="font-bold mb-3" style={{ color: "var(--primary)" }}>キャラクター一覧</h2>
          {loadingChars ? (
            <p style={{ color: "var(--muted)" }}>読み込み中…</p>
          ) : characters.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>まだキャラクターがいません。「新しいキャラクターを作る」から始めましょう。</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {characters.map(c => (
                <Link key={c.id} href={`/dashboard/characters/${c.id}`} className="card flex flex-col gap-2 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3">
                    {c.image_url ? (
                      <img src={c.image_url} alt="" className="w-12 h-12 rounded-full object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl" style={{ background: "var(--example-bg, #eee)" }}>🎭</div>
                    )}
                    <p className="font-bold" style={{ color: "var(--primary)" }}>{c.name}</p>
                  </div>
                  {c.description && <p className="text-xs line-clamp-2" style={{ color: "var(--muted)" }}>{c.description}</p>}
                </Link>
              ))}
            </div>
          )}
        </div>

        {purchasedCourses.length > 0 && (
          <div>
            <h2 className="font-bold mb-3" style={{ color: "var(--primary)" }}>学習中コース</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {purchasedCourses.map(c => (
                <Link key={c.course_id} href={`/courses/${c.course_id}`} className="card flex flex-col gap-2 hover:shadow-md transition-shadow">
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
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
