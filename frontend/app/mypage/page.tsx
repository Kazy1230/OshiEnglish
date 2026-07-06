"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";
import { SectionHeading } from "@/components/SectionHeading";


type PurchasedCourse = {
  course_id: number;
  title: string;
  total_lessons: number;
  completed_count: number;
  is_day_based?: boolean;
  subject?: string | null;
  thumbnail_url?: string | null;
  character?: { name?: string | null; avatar_url?: string | null } | null;
};

function progressPercent(c: PurchasedCourse) {
  return c.total_lessons ? Math.round((c.completed_count / c.total_lessons) * 100) : 0;
}

export default function MyPage() {
  const { me, loading } = useRoleGuard(["learner", "admin"]);
  const [courses, setCourses] = useState<PurchasedCourse[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  useEffect(() => {
    if (loading) return;
    api.getMyPurchasedCourses().then(setCourses).catch(() => {}).finally(() => setLoadingCourses(false));
  }, [loading]);

  if (loading) return <Skeleton />;

  const totalDone = courses.reduce((sum, c) => sum + c.completed_count, 0);
  const totalAll = courses.reduce((sum, c) => sum + c.total_lessons, 0);
  const overallPercent = totalAll ? Math.round((totalDone / totalAll) * 100) : 0;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="learner" title="マイページ" />

      {/* ヒーロー：挨拶＋全体進捗 */}
      <section className="gradient-hero relative overflow-hidden px-4 sm:px-6 py-10 sm:py-12">
        <div className="pointer-events-none absolute -top-12 -right-12 w-56 h-56 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} />
        <div className="relative max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div>
            <span className="pill mb-3" style={{ background: "rgba(255,255,255,0.16)", color: "white" }}>👋 ようこそ</span>
            <h2 className="text-white text-2xl sm:text-3xl font-black tracking-tight">
              {me?.display_name || me?.username} さん
            </h2>
            <p className="text-white/80 text-sm mt-1">今日も一歩、目標に近づきましょう。</p>
          </div>
          {!loadingCourses && courses.length > 0 && (
            <div className="flex items-center gap-4 shadow-soft rounded-2xl px-5 py-4" style={{ background: "rgba(255,255,255,0.12)" }}>
              <div className="text-center">
                <p className="text-white text-2xl font-black">{courses.length}</p>
                <p className="text-white/70 text-xs mt-0.5">受講中コース</p>
              </div>
              <div className="w-px h-9" style={{ background: "rgba(255,255,255,0.25)" }} />
              <div className="text-center">
                <p className="text-white text-2xl font-black">{overallPercent}%</p>
                <p className="text-white/80 text-xs mt-0.5">全体の進捗</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        <Link href="/change-password" className="btn-ghost text-xs self-end">🔒 パスワードを変更</Link>

        <div>
          <SectionHeading>学習中のコース</SectionHeading>
          {loadingCourses ? (
            <p style={{ color: "var(--muted)" }}>読み込み中…</p>
          ) : courses.length === 0 ? (
            <div className="card shadow-soft flex flex-col items-center gap-3 text-center py-10">
              <span className="text-4xl">📘</span>
              <p className="text-sm" style={{ color: "var(--muted)" }}>まだ購入したコースがありません。</p>
              <Link href="/" className="btn-cta">コースを探す →</Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {courses.map(c => {
                const percent = progressPercent(c);
                const unit = c.is_day_based ? "日" : "レッスン";
                return (
                  <div key={c.course_id} className={`card hover-lift shadow-soft flex flex-col gap-3 overflow-hidden ${percent >= 100 ? "achievement-card" : ""}`}>
                    <div className="relative -m-5 mb-0">
                      {c.thumbnail_url ? (
                        <img src={c.thumbnail_url} alt="" className="w-full h-28 object-cover" />
                      ) : (
                        <div className="w-full h-28 flex items-center justify-center text-3xl gradient-hero">📘</div>
                      )}
                      {c.character?.name && (
                        <div
                          className="absolute -bottom-3 left-4 flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full shadow-soft"
                          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                        >
                          {c.character.avatar_url ? (
                            <img src={c.character.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                          ) : (
                            <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs" style={{ background: "var(--example-bg, #eee)" }}>🎭</span>
                          )}
                          <span className="text-xs font-bold" style={{ color: "var(--primary)" }}>{c.character.name}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-3">
                      <p className="font-black" style={{ color: "var(--primary)" }}>{c.title}</p>
                      <span className="pill whitespace-nowrap" style={{ background: percent >= 100 ? "#e8b923" : "var(--accent)", color: "white" }}>
                        {percent >= 100 ? "達成🎉" : "受講中"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs" style={{ color: "var(--muted)" }}>
                      <span>{c.completed_count}/{c.total_lessons} {unit}完了</span>
                      <span className="font-bold" style={{ color: percent >= 100 ? "#e8b923" : "var(--accent)" }}>{percent}%</span>
                    </div>
                    <div className="h-2 rounded-full" style={{ background: "var(--example-bg, #eee)" }}>
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{ background: percent >= 100 ? "#e8b923" : "var(--accent)", width: `${percent}%` }}
                      />
                    </div>
                    <p className="text-xs -mt-1" style={{ color: "var(--muted)" }}>
                      {percent >= 100
                        ? "全て達成おめでとうございます！"
                        : `あと${Math.max(0, c.total_lessons - c.completed_count)}${unit}で達成！`}
                    </p>

                    <div className="flex flex-col gap-2 mt-1">
                      <Link href={`/courses/${c.course_id}/chat`} className="btn-primary w-full text-center py-3">
                        伴走チャットを再開する
                      </Link>
                      <div className="grid grid-cols-2 gap-2">
                        <Link href={`/courses/${c.course_id}/schedule`} className="btn-ghost text-xs py-2 text-center">30日スケジュール</Link>
                        <Link href={`/courses/${c.course_id}`} className="btn-ghost text-xs py-2 text-center">コース詳細</Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
