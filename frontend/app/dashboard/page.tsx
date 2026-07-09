"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";
import { RevenuePanel } from "@/components/RevenuePanel";
import { AnalyticsPanel } from "@/components/AnalyticsPanel";
import { InboxPanel } from "@/components/InboxPanel";

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

const TILES = [
  { href: "/creator/courses", icon: "📚", label: "コース一覧", desc: "作成したコース", needsApproval: false },
  { href: "/studio", icon: "🎬", label: "スタジオ", desc: "コンテンツ生成AI", needsApproval: true },
  { href: "/creator/contents", icon: "🗂️", label: "コンテンツプール", desc: "教材URLを管理", needsApproval: true },
];

export default function DashboardPage() {
  const { me, loading } = useRoleGuard(["creator", "admin"]);
  const [character, setCharacter] = useState<CharacterSummary | null>(null);
  const [loadingChars, setLoadingChars] = useState(true);
  const [purchasedCourses, setPurchasedCourses] = useState<PurchasedCourse[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [reviewCourseCount, setReviewCourseCount] = useState(0);
  const [supportTab, setSupportTab] = useState<"analytics" | "inbox">("inbox");

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
  const completeness = toneCompleteness(character?.tone_profile);

  if (loading) return <Skeleton />;

  return (
    <div className="creator-theme min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" title="ダッシュボード" overdueCount={overdueCount} />

      {/* ヒーローバナー */}
      <section style={{ background: "linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)", padding: "28px 16px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          {/* アバター */}
          {loadingChars ? (
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(255,255,255,0.2)" }} />
          ) : character?.image_url ? (
            <img src={character.image_url} alt="" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: "3px solid rgba(255,255,255,0.5)", flexShrink: 0 }} />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, flexShrink: 0, border: "3px solid rgba(255,255,255,0.3)" }}>
              {character ? "🎭" : "👋"}
            </div>
          )}

          {/* 挨拶＋キャラクター情報 */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, margin: "0 0 2px" }}>クリエイターダッシュボード</p>
            <h1 style={{ color: "white", fontSize: 22, fontWeight: 900, margin: "0 0 4px" }}>
              {me?.display_name || me?.username}
            </h1>
            {character && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Link href={`/dashboard/characters/${character.id}`} style={{ color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                  プロフィール画面
                </Link>
                <div style={{ flex: 1, maxWidth: 120, height: 4, borderRadius: 999, background: "rgba(255,255,255,0.25)" }}>
                  <div style={{ height: 4, borderRadius: 999, background: "white", width: `${completeness}%` }} />
                </div>
                <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 11 }}>{completeness}%</span>
              </div>
            )}
            {!character && !loadingChars && (
              <Link href="/creator/interview" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 6, background: "white", color: "var(--primary)", padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
                🧠 AIインタビューを始める
              </Link>
            )}
          </div>

          {/* ステータスバッジ */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {isApproved ? (
              <span style={{ background: "rgba(255,255,255,0.2)", color: "white", padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, border: "1px solid rgba(255,255,255,0.3)" }}>
                ✓ 承認済み
              </span>
            ) : profileStatus ? (
              <span style={{ background: "rgba(255,200,0,0.3)", color: "white", padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, border: "1px solid rgba(255,200,0,0.5)" }}>
                ⏳ 審査中
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* アラートバナー */}
        {(overdueCount > 0 || reviewCourseCount > 0) && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {overdueCount > 0 && (
              <Link href="/creator/inbox" style={{ textDecoration: "none", flex: 1, minWidth: 200, display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 12, background: "#fff5f5", border: "1.5px solid #feb2b2" }}>
                <span style={{ fontSize: 22 }}>⚠️</span>
                <div>
                  <p style={{ fontWeight: 800, color: "#e53e3e", margin: 0, fontSize: 14 }}>Tier B質問 {overdueCount}件未対応</p>
                  <p style={{ color: "#c53030", fontSize: 12, margin: 0 }}>クリックして対応する</p>
                </div>
                <span style={{ marginLeft: "auto", color: "#e53e3e", fontSize: 18 }}>→</span>
              </Link>
            )}
            {reviewCourseCount > 0 && (
              <Link href="/creator/courses" style={{ textDecoration: "none", flex: 1, minWidth: 200, display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 12, background: "#fffbeb", border: "1.5px solid #f6c90e" }}>
                <span style={{ fontSize: 22 }}>📋</span>
                <div>
                  <p style={{ fontWeight: 800, color: "#92400e", margin: 0, fontSize: 14 }}>審査中コース {reviewCourseCount}件</p>
                  <p style={{ color: "#78350f", fontSize: 12, margin: 0 }}>運営が確認中です</p>
                </div>
              </Link>
            )}
          </div>
        )}

        {/* 機能タイルグリッド */}
        <div>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>機能メニュー</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
            {/* AIインタビュー（キャラなし時） */}
            {!character && !loadingChars && (
              <Link href="/creator/interview" style={{ textDecoration: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "20px 12px", borderRadius: 14, background: "var(--card)", border: "2px solid var(--primary)", cursor: "pointer", transition: "all 0.2s", boxShadow: "0 0 0 3px rgba(var(--primary-rgb, 0,100,255), 0.08)" }}>
                <span style={{ fontSize: 28 }}>🧠</span>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: "var(--primary)", margin: 0 }}>AIインタビュー</p>
                  <p style={{ fontSize: 11, color: "var(--muted)", margin: "2px 0 0" }}>人格を作成する</p>
                </div>
              </Link>
            )}

            {TILES.map(t => {
              const locked = t.needsApproval && !isApproved;
              if (locked) return (
                <div key={t.href} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "20px 12px", borderRadius: 14, background: "var(--card)", border: "1px solid var(--border)", opacity: 0.45, cursor: "not-allowed" }} title="承認後に利用できます">
                  <span style={{ fontSize: 28 }}>{t.icon}</span>
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", margin: 0 }}>{t.label}</p>
                    <p style={{ fontSize: 11, color: "var(--muted)", margin: "2px 0 0" }}>{t.desc}</p>
                  </div>
                </div>
              );
              return (
                <Link key={t.href} href={t.href} style={{ textDecoration: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "20px 12px", borderRadius: 14, background: "var(--card)", border: "1px solid var(--border)", transition: "all 0.2s", cursor: "pointer" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 24px rgba(0,0,0,0.10)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = ""; (e.currentTarget as HTMLElement).style.transform = ""; }}
                >
                  <span style={{ fontSize: 28 }}>{t.icon}</span>
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", margin: 0 }}>{t.label}</p>
                    <p style={{ fontSize: 11, color: "var(--muted)", margin: "2px 0 0" }}>{t.desc}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* 収益 */}
        {isApproved && (
          <div>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>収益</h2>
            <RevenuePanel />
          </div>
        )}

        {/* 分析＋受講者対応（統合） */}
        {isApproved && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => setSupportTab("inbox")}
                className="text-xs font-bold px-3 py-1.5 rounded-full"
                style={{
                  background: supportTab === "inbox" ? "var(--primary)" : "var(--card)",
                  color: supportTab === "inbox" ? "#fff" : "var(--muted)",
                  border: "1px solid var(--border)",
                }}
              >
                受講者対応{overdueCount > 0 && ` (${overdueCount})`}
              </button>
              <button
                onClick={() => setSupportTab("analytics")}
                className="text-xs font-bold px-3 py-1.5 rounded-full"
                style={{
                  background: supportTab === "analytics" ? "var(--primary)" : "var(--card)",
                  color: supportTab === "analytics" ? "#fff" : "var(--muted)",
                  border: "1px solid var(--border)",
                }}
              >
                分析
              </button>
            </div>
            {supportTab === "inbox" ? (
              <InboxPanel onOverdueCountChange={setOverdueCount} />
            ) : (
              <AnalyticsPanel />
            )}
          </div>
        )}

        {/* 人格プロフィール補完 */}
        {character && completeness < 100 && (
          <div style={{ padding: "16px 20px", borderRadius: 14, background: "var(--card)", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ fontSize: 28, flexShrink: 0 }}>🎭</div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: "0 0 4px" }}>人格プロフィールを充実させましょう</p>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, height: 6, borderRadius: 999, background: "var(--border)" }}>
                  <div style={{ height: 6, borderRadius: 999, background: "var(--primary)", width: `${completeness}%`, transition: "width 0.5s" }} />
                </div>
                <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>{completeness}% 完成</span>
              </div>
            </div>
            <Link href={`/dashboard/characters/${character.id}`} className="btn-primary" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
              編集する →
            </Link>
          </div>
        )}

        {/* 学習中コース */}
        {purchasedCourses.length > 0 && (
          <div>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>学習中のコース</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
              {purchasedCourses.map(c => {
                const pct = c.total_lessons ? Math.round((c.completed_count / c.total_lessons) * 100) : 0;
                return (
                  <Link key={c.course_id} href={`/courses/${c.course_id}`} style={{ textDecoration: "none", display: "flex", flexDirection: "column", gap: 8, padding: "16px", borderRadius: 14, background: "var(--card)", border: "1px solid var(--border)", transition: "all 0.2s" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = ""; (e.currentTarget as HTMLElement).style.transform = ""; }}
                  >
                    <p style={{ fontWeight: 800, color: "var(--primary)", margin: 0, fontSize: 14 }}>{c.title}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ flex: 1, height: 5, borderRadius: 999, background: "var(--border)" }}>
                        <div style={{ height: 5, borderRadius: 999, background: "var(--accent)", width: `${pct}%` }} />
                      </div>
                      <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>{pct}%</span>
                    </div>
                    <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>{c.completed_count}/{c.total_lessons} レッスン完了</p>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
