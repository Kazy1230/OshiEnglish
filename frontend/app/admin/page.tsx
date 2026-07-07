"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import { AdminSkeleton } from "@/components/Skeleton";
import { useDarkMode } from "@/lib/darkMode";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import type { Tab } from "./types";
import { CreatorApplicationsTab } from "./tabs/CreatorApplicationsTab";
import { CreatorsTab } from "./tabs/CreatorsTab";
import { UsersTab } from "./tabs/UsersTab";
import { CourseModerationTab } from "./tabs/CourseModerationTab";
import { ReportsTab } from "./tabs/ReportsTab";
import { TierBOverdueTab } from "./tabs/TierBOverdueTab";
import { TextbooksTab } from "./tabs/TextbooksTab";

const tabs: { key: Tab; label: string; icon: string }[] = [
  { key: "creator_applications", label: "クリエイター審査", icon: "✦" },
  { key: "creators",             label: "クリエイター",     icon: "◈" },
  { key: "users",                label: "ユーザー",         icon: "◉" },
  { key: "course_moderation",    label: "コース",           icon: "▣" },
  { key: "reports",              label: "通報",             icon: "⚑" },
  { key: "tier_b_overdue",       label: "Tier B 監視",      icon: "◷" },
  { key: "textbooks",            label: "教材プリセット",   icon: "▤" },
];

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("creator_applications");
  const [loading, setLoading] = useState(true);
  const [mode, toggleMode] = useDarkMode();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    api.me().then(u => {
      if (u.role !== "admin") { router.replace(u.role === "creator" ? "/dashboard" : "/creators"); return; }
      setLoading(false);
    }).catch(() => { clearToken(); router.replace("/login"); });
  }, [router]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const active = document.activeElement?.tagName;
        if (active === "INPUT" || active === "TEXTAREA" || active === "SELECT") return;
        (document.activeElement as HTMLElement)?.blur();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (loading) return <AdminSkeleton />;

  const activeLabel = tabs.find(t => t.key === tab)?.label ?? "";

  return (
    <div className="admin-theme min-h-screen md:h-screen flex flex-col md:flex-row md:overflow-hidden" style={{ background: "var(--bg)" }}>

      {/* モバイルトップバー */}
      <div
        className="md:hidden flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ background: "var(--sidebar-bg)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button
          onClick={() => setMobileNavOpen(v => !v)}
          aria-label="メニュー"
          style={{ color: "var(--sidebar-text)", fontSize: "1.1rem", lineHeight: 1 }}
        >
          {mobileNavOpen ? "✕" : "☰"}
        </button>
        <span style={{ color: "var(--sidebar-text)", fontWeight: 700, letterSpacing: "0.08em", fontSize: "0.8rem" }}>
          MANAVILLAGE ADMIN
        </span>
        <DarkModeToggle mode={mode} onToggle={toggleMode} variant="onColor" />
      </div>

      {/* サイドバー */}
      <aside
        className={`${mobileNavOpen ? "flex" : "hidden"} md:flex flex-col flex-shrink-0`}
        style={{
          width: 220,
          background: "var(--sidebar-bg)",
          height: "100vh",
          position: "sticky",
          top: 0,
          overflowY: "auto",
          borderRight: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        {/* ロゴ */}
        <div className="hidden md:flex flex-col px-5 pt-6 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center justify-between mb-1">
            <span style={{ color: "#ffffff", fontWeight: 800, fontSize: "0.9rem", letterSpacing: "0.06em" }}>
              MANAVILLAGE
            </span>
            <DarkModeToggle mode={mode} onToggle={toggleMode} variant="onColor" />
          </div>
          <span style={{
            color: "var(--accent)",
            fontSize: "0.62rem",
            fontWeight: 700,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
          }}>
            Admin Console
          </span>
        </div>

        {/* ナビ */}
        <nav className="flex-1 px-2 py-4 flex flex-col gap-0.5">
          {tabs.map(t => {
            const isActive = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setMobileNavOpen(false); }}
                className="flex items-center gap-3 px-3 py-2 rounded-md text-left transition-all text-sm"
                style={{
                  background: isActive ? "var(--sidebar-active-bg)" : "transparent",
                  color: isActive ? "var(--sidebar-active-text)" : "var(--sidebar-muted)",
                  fontWeight: isActive ? 600 : 400,
                  borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "var(--sidebar-hover-bg)"; (e.currentTarget as HTMLElement).style.color = "var(--sidebar-text)"; }}
                onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--sidebar-muted)"; } }}
              >
                <span style={{ fontSize: "0.8rem", width: 16, textAlign: "center", opacity: 0.8 }}>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>

        {/* フッター */}
        <div className="px-3 pb-5 flex flex-col gap-2" style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "1rem" }}>
          <button
            onClick={() => { clearToken(); router.push("/login"); }}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-all"
            style={{ color: "var(--sidebar-muted)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#ef4444"; (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.08)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--sidebar-muted)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          >
            <span style={{ fontSize: "0.75rem" }}>⎋</span>
            <span>ログアウト</span>
          </button>
        </div>
      </aside>

      {/* メインコンテンツ */}
      <main className="flex-1 min-w-0 overflow-auto" style={{ height: "100vh" }}>
        {/* ページヘッダー */}
        <div
          className="px-6 sm:px-8 py-4 flex items-center gap-3 sticky top-0 z-10"
          style={{
            background: "var(--bg)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span style={{ color: "var(--accent)", fontSize: "0.8rem" }}>
            {tabs.find(t => t.key === tab)?.icon}
          </span>
          <h1 style={{
            color: "var(--text)",
            fontFamily: "var(--font-body)",
            fontWeight: 700,
            fontSize: "0.95rem",
            letterSpacing: "0.01em",
          }}>
            {activeLabel}
          </h1>
        </div>

        <div className="px-6 sm:px-8 py-6">
          {tab === "creator_applications" && <CreatorApplicationsTab />}
          {tab === "creators"             && <CreatorsTab />}
          {tab === "users"                && <UsersTab />}
          {tab === "course_moderation"    && <CourseModerationTab />}
          {tab === "reports"              && <ReportsTab />}
          {tab === "tier_b_overdue"       && <TierBOverdueTab />}
          {tab === "textbooks"            && <TextbooksTab />}
        </div>
      </main>
    </div>
  );
}
