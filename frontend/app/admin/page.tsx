"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import { AdminSkeleton } from "@/components/Skeleton";
import type { Tab } from "./types";
import { CreatorApplicationsTab } from "./tabs/CreatorApplicationsTab";
import { CreatorsTab } from "./tabs/CreatorsTab";
import { UsersTab } from "./tabs/UsersTab";
import { CourseReviewTab } from "./tabs/CourseReviewTab";
import { CourseManagementTab } from "./tabs/CourseManagementTab";
import { ReportsTab } from "./tabs/ReportsTab";
import { TierBOverdueTab } from "./tabs/TierBOverdueTab";

const tabs: { key: Tab; label: string; icon: string; badge?: string }[] = [
  { key: "creator_applications", label: "クリエイター審査", icon: "📋" },
  { key: "creators",             label: "クリエイター管理", icon: "🎭" },
  { key: "users",                label: "ユーザー管理",     icon: "👥" },
  { key: "course_review",        label: "コース審査",       icon: "📚" },
  { key: "course_management",    label: "コース管理",       icon: "🗂️" },
  { key: "reports",              label: "通報管理",         icon: "🚨" },
  { key: "tier_b_overdue",       label: "Tier B 滞納監視",  icon: "💳" },
];

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("creator_applications");
  const [loading, setLoading] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    api.me().then(u => {
      if (u.role !== "admin") { router.replace(u.role === "creator" ? "/dashboard" : "/creators"); return; }
      setLoading(false);
    }).catch(() => { clearToken(); router.replace("/login"); });
  }, [router]);

  if (loading) return <AdminSkeleton />;

  const activeTab = tabs.find(t => t.key === tab)!;

  return (
    <div
      className="admin-theme min-h-screen md:h-screen flex flex-col md:flex-row md:overflow-hidden"
      style={{ background: "var(--bg)" }}
    >
      {/* ── モバイルトップバー ── */}
      <div
        className="md:hidden flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ background: "var(--sidebar-bg)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <button
          onClick={() => setMobileNavOpen(v => !v)}
          style={{ color: "var(--sidebar-text)", fontSize: 20, lineHeight: 1 }}
        >
          {mobileNavOpen ? "✕" : "☰"}
        </button>
        <span style={{ color: "#e0e7ff", fontWeight: 800, fontSize: 13, letterSpacing: "0.1em" }}>
          MANAVILLAGE ADMIN
        </span>
        <span style={{ width: 20 }} />
      </div>

      {/* ── サイドバー ── */}
      <aside
        className={`${mobileNavOpen ? "flex" : "hidden"} md:flex flex-col flex-shrink-0`}
        style={{
          width: 240,
          background: "var(--sidebar-bg)",
          height: "100vh",
          position: "sticky",
          top: 0,
          overflowY: "auto",
          borderRight: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* ロゴ */}
        <div
          className="hidden md:flex flex-col gap-0.5 px-5 pt-6 pb-5"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div>
            <p style={{ color: "#ffffff", fontWeight: 800, fontSize: 15, letterSpacing: "0.04em" }}>
              ManaVillage
            </p>
            <p style={{ color: "var(--primary)", fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", marginTop: 2 }}>
              Admin Console
            </p>
          </div>
        </div>

        {/* ナビゲーション */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
          <p style={{ color: "var(--sidebar-muted)", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6, paddingLeft: 10 }}>
            管理メニュー
          </p>
          {tabs.map(t => {
            const isActive = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setMobileNavOpen(false); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left w-full transition-all text-sm"
                style={{
                  background: isActive ? "var(--sidebar-active-bg)" : "transparent",
                  color: isActive ? "var(--sidebar-active-text)" : "var(--sidebar-text)",
                  fontWeight: isActive ? 600 : 400,
                  borderLeft: isActive ? "3px solid var(--primary)" : "3px solid transparent",
                  opacity: isActive ? 1 : 0.75,
                }}
              >
                <span style={{ fontSize: 16, flexShrink: 0 }}>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>

        {/* フッター */}
        <div
          className="px-3 pb-5 pt-3 flex flex-col gap-1"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
        >
          <button
            onClick={() => { clearToken(); router.push("/login"); }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm w-full transition-all"
            style={{ color: "var(--sidebar-muted)" }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.12)";
              (e.currentTarget as HTMLElement).style.color = "#fca5a5";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "var(--sidebar-muted)";
            }}
          >
            <span style={{ fontSize: 14 }}>→</span>
            <span>ログアウト</span>
          </button>
        </div>
      </aside>

      {/* ── メインコンテンツ ── */}
      <main className="flex-1 min-w-0 overflow-auto" style={{ height: "100vh" }}>
        {/* ページヘッダー */}
        <div
          className="flex items-center gap-3 px-6 sm:px-8 sticky top-0 z-10"
          style={{
            height: 56,
            background: "var(--card)",
            borderBottom: "1px solid var(--border)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <span style={{ fontSize: 18 }}>{activeTab.icon}</span>
          <h1 style={{ fontWeight: 700, fontSize: 15, color: "var(--text)", margin: 0 }}>
            {activeTab.label}
          </h1>
        </div>

        {/* タブコンテンツ */}
        <div className="px-6 sm:px-8 py-6">
          {tab === "creator_applications" && <CreatorApplicationsTab />}
          {tab === "creators"             && <CreatorsTab />}
          {tab === "users"                && <UsersTab />}
          {tab === "course_review"        && <CourseReviewTab />}
          {tab === "course_management"    && <CourseManagementTab />}
          {tab === "reports"              && <ReportsTab />}
          {tab === "tier_b_overdue"       && <TierBOverdueTab />}
        </div>
      </main>
    </div>
  );
}
