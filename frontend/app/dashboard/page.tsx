"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";

type CharacterSummary = { id: number; name: string; description?: string | null; image_url?: string | null };
type PurchasedCourse = { course_id: number; title: string; total_lessons: number; completed_count: number };

export default function DashboardPage() {
  const { me, loading } = useRoleGuard(["creator", "admin"]);
  const [character, setCharacter] = useState<CharacterSummary | null>(null);
  const [loadingChars, setLoadingChars] = useState(true);
  const [purchasedCourses, setPurchasedCourses] = useState<PurchasedCourse[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);

  useEffect(() => {
    if (loading) return;
    api.listMyCharacters().then(list => setCharacter(list[0] ?? null)).catch(() => {}).finally(() => setLoadingChars(false));
    api.getMyPurchasedCourses().then(setPurchasedCourses).catch(() => {});
    api.getPendingOverdueCount().then(r => setOverdueCount(r.overdue_count)).catch(() => {});
  }, [loading]);

  if (loading) return <Skeleton />;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" title="クリエイターダッシュボード" overdueCount={overdueCount} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {me?.display_name || me?.username} さん、ようこそ。
        </p>

        {overdueCount > 0 && (
          <Link href="/creator/inbox" className="card flex items-center gap-3" style={{ borderColor: "#e53e3e" }}>
            <span className="text-xl">⚠</span>
            <p className="text-sm font-bold" style={{ color: "#e53e3e" }}>
              未対応のTier B質問が{overdueCount}件あります（ヘッダーの「受講者対応」から確認できます）
            </p>
          </Link>
        )}

        <div className="flex flex-wrap gap-3">
          <Link href="/creator/courses/new" className="btn-primary">📅 90日伴走コースを作る</Link>
          <Link href="/studio" className="btn-primary">🎬 AIコンテンツ生成スタジオへ</Link>
          <Link href="/creator/interview" className="btn-ghost">🧠 AIインタビュー（人格プロファイル）</Link>
          <Link href="/creator/profile" className="btn-ghost">👤 人格プロファイルを確認</Link>
          <Link href="/creator/analytics" className="btn-ghost">📊 質問分析ダッシュボード</Link>
        </div>

        <div>
          <h2 className="font-bold mb-3" style={{ color: "var(--primary)" }}>あなたのキャラクター（人格）</h2>
          {loadingChars ? (
            <p style={{ color: "var(--muted)" }}>読み込み中…</p>
          ) : !character ? (
            <div className="card flex flex-col gap-2">
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                まだキャラクター(人格)が作成されていません。AIインタビューを完了すると自動的に作成されます。
              </p>
              <Link href="/creator/interview" className="btn-primary self-start">🧠 AIインタビューを始める</Link>
            </div>
          ) : (
            <Link href={`/dashboard/characters/${character.id}`} className="card flex items-center gap-3 hover:shadow-md transition-shadow max-w-sm">
              {character.image_url ? (
                <img src={character.image_url} alt="" className="w-12 h-12 rounded-full object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl" style={{ background: "var(--example-bg, #eee)" }}>🎭</div>
              )}
              <div>
                <p className="font-bold" style={{ color: "var(--primary)" }}>{character.name}</p>
                {character.description && <p className="text-xs line-clamp-2" style={{ color: "var(--muted)" }}>{character.description}</p>}
                <p className="text-xs mt-1" style={{ color: "var(--accent)" }}>編集する →</p>
              </div>
            </Link>
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
