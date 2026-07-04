"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";
import { SectionHeading } from "@/components/SectionHeading";

type CharacterSummary = { id: number; name: string; description?: string | null; image_url?: string | null; tone_profile?: Record<string, unknown> | null };
type PurchasedCourse = { course_id: number; title: string; total_lessons: number; completed_count: number };

const TONE_FIELDS = ["first_person", "speech_style", "personality", "catchphrase", "ng_expressions", "background", "reaction_patterns", "speaking_samples"] as const;

function toneCompleteness(tone?: Record<string, unknown> | null): number {
  if (!tone) return 0;
  const filled = TONE_FIELDS.filter(k => {
    const v = tone[k];
    if (Array.isArray(v)) return v.length > 0;
    return !!v && String(v).trim().length > 0;
  }).length;
  return Math.round((filled / TONE_FIELDS.length) * 100);
}

export default function DashboardPage() {
  const { me, loading } = useRoleGuard(["creator", "admin"]);
  const [character, setCharacter] = useState<CharacterSummary | null>(null);
  const [loadingChars, setLoadingChars] = useState(true);
  const [purchasedCourses, setPurchasedCourses] = useState<PurchasedCourse[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [reviewCourseCount, setReviewCourseCount] = useState(0);

  useEffect(() => {
    if (loading) return;
    api.listMyCharacters().then(list => setCharacter(list[0] ?? null)).catch(() => {}).finally(() => setLoadingChars(false));
    api.getMyPurchasedCourses().then(setPurchasedCourses).catch(() => {});
    api.getPendingOverdueCount().then(r => setOverdueCount(r.overdue_count)).catch(() => {});
    if (me?.role !== "admin") {
      api.getMyCreatorProfile().then(p => setProfileStatus(p.status)).catch(() => {});
    }
    api.getMyCreatedCourses().then(list => setReviewCourseCount(list.filter((c: { status: string }) => c.status === "review").length)).catch(() => {});
  }, [loading, me]);

  const isApproved = me?.role === "admin" || profileStatus === "active";

  if (loading) return <Skeleton />;

  const completeness = toneCompleteness(character?.tone_profile);

  const tiles: { href: string; icon: string; label: string; locked?: boolean }[] = [
    { href: "/creator/courses/new", icon: "📅", label: "30日伴走コースを作る", locked: !isApproved },
    { href: "/studio", icon: "🎬", label: "AIコンテンツ生成スタジオ", locked: !isApproved },
    ...(character ? [] : [{ href: "/creator/interview", icon: "🧠", label: "AIインタビュー" }]),
    { href: "/creator/analytics", icon: "📊", label: "質問分析ダッシュボード", locked: !isApproved },
    { href: "/creator/revenue", icon: "💰", label: "収益" },
  ];

  return (
    <div className="creator-theme min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" title="クリエイターダッシュボード" overdueCount={overdueCount} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">
        {/* ヒーロー領域：キャラクター中心 */}
        <div className="card flex flex-col sm:flex-row gap-5 sm:items-center" style={{ background: "linear-gradient(135deg, var(--primary), var(--accent))" }}>
          {loadingChars ? (
            <p className="text-white/80 text-sm">読み込み中…</p>
          ) : !character ? (
            <div className="flex flex-col gap-3 w-full">
              <p className="text-white text-sm font-bold">
                {me?.display_name || me?.username} さん、ようこそ。
              </p>
              <p className="text-white/80 text-sm">
                まだキャラクター(人格)が作成されていません。AIインタビューを完了すると自動的に作成されます。
              </p>
              <Link href="/creator/interview" className="self-start px-4 py-2 rounded-full text-sm font-bold" style={{ background: "white", color: "var(--primary)" }}>
                🧠 AIインタビューを始める
              </Link>
            </div>
          ) : (
            <>
              {character.image_url ? (
                <img src={character.image_url} alt="" className="w-24 h-24 rounded-full object-cover ring-4 ring-white/40 flex-shrink-0" />
              ) : (
                <div className="w-24 h-24 rounded-full flex items-center justify-center text-4xl ring-4 ring-white/40 flex-shrink-0" style={{ background: "rgba(255,255,255,0.2)" }}>🎭</div>
              )}
              <div className="flex-1 flex flex-col gap-2">
                <div>
                  <p className="text-xs text-white/70">{me?.display_name || me?.username} さんの人格</p>
                  <Link href={`/dashboard/characters/${character.id}`} className="text-xl font-black text-white hover:underline">
                    {character.name}
                  </Link>
                  {character.description && <p className="text-xs text-white/80 mt-0.5 line-clamp-2">{character.description}</p>}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full max-w-[200px]" style={{ background: "rgba(255,255,255,0.3)" }}>
                      <div className="h-1.5 rounded-full" style={{ background: "white", width: `${completeness}%` }} />
                    </div>
                    <span className="text-xs text-white/90 whitespace-nowrap">プロフィール完成度 {completeness}%</span>
                  </div>
                  {completeness < 100 && (
                    <Link href={character ? `/dashboard/characters/${character.id}` : "/creator/interview"} className="text-xs text-white underline mt-1 inline-block">人格プロファイルを充実させる →</Link>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* 今すぐ対応リング */}
        {(overdueCount > 0 || (!isApproved && profileStatus) || reviewCourseCount > 0) && (
          <div className="flex flex-wrap gap-3">
            {overdueCount > 0 && (
              <Link href="/creator/inbox" className="card flex items-center gap-2 flex-1 min-w-[200px]" style={{ borderColor: "#e53e3e" }}>
                <span className="text-xl">⚠</span>
                <p className="text-sm font-bold" style={{ color: "#e53e3e" }}>未対応のTier B質問 {overdueCount}件</p>
              </Link>
            )}
            {!isApproved && profileStatus && (
              <div className="card flex items-center gap-2 flex-1 min-w-[200px]" style={{ borderColor: "#f5a623" }}>
                <span className="text-xl">⏳</span>
                <p className="text-sm font-bold" style={{ color: "#b8770f" }}>クリエイター申請審査中</p>
              </div>
            )}
            {reviewCourseCount > 0 && (
              <Link href="/creator/courses" className="card flex items-center gap-2 flex-1 min-w-[200px]" style={{ borderColor: "var(--accent)" }}>
                <span className="text-xl">📝</span>
                <p className="text-sm font-bold" style={{ color: "var(--accent)" }}>運営確認中のコース {reviewCourseCount}件</p>
              </Link>
            )}
          </div>
        )}

        {/* 機能タイル */}
        <div>
          <SectionHeading>機能</SectionHeading>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {tiles.map(t => (
              t.locked ? (
                <span key={t.href} className="card flex flex-col items-center gap-1 py-5 text-center opacity-50 cursor-not-allowed" title="承認後に利用できます">
                  <span className="text-2xl">{t.icon}</span>
                  <span className="text-xs font-bold" style={{ color: "var(--text)" }}>{t.label}</span>
                </span>
              ) : (
                <Link key={t.href} href={t.href} className="card flex flex-col items-center gap-1 py-5 text-center hover-lift">
                  <span className="text-2xl">{t.icon}</span>
                  <span className="text-xs font-bold" style={{ color: "var(--text)" }}>{t.label}</span>
                </Link>
              )
            ))}
          </div>
        </div>

        {purchasedCourses.length > 0 && (
          <div>
            <SectionHeading>学習中コース</SectionHeading>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {purchasedCourses.map(c => (
                <Link key={c.course_id} href={`/courses/${c.course_id}`} className="card flex flex-col gap-2 hover-lift">
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
