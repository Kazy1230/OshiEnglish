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

  // グローバルEscキーハンドラー（フォーム入力中は発火しない）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const active = document.activeElement?.tagName;
        if (active === "INPUT" || active === "TEXTAREA" || active === "SELECT") return;
        // ブラウザの戻るナビゲーションではなくフォーカスをBodyに戻す
        (document.activeElement as HTMLElement)?.blur();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (loading) return <AdminSkeleton />;

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "creator_applications", label: "クリエイター審査", icon: "🧑‍🏫" },
    { key: "creators", label: "クリエイター一覧", icon: "🎭" },
    { key: "users", label: "ユーザー一覧", icon: "👤" },
    { key: "course_moderation", label: "コース一覧", icon: "📚" },
    { key: "reports", label: "通報管理", icon: "🚨" },
    { key: "tier_b_overdue", label: "Tier B監視", icon: "⏰" },
  ];

  return (
    <div className="min-h-screen md:h-screen flex flex-col md:flex-row md:overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* モバイル用トップバー */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 shadow-md flex-shrink-0" style={{ background: "var(--primary)" }}>
        <button onClick={() => setMobileNavOpen(v => !v)} aria-label="メニューを開閉"
          className="text-white text-xl px-1">☰</button>
        <h1 className="text-base font-black text-white">ManaVillage 管理者画面</h1>
        <DarkModeToggle mode={mode} onToggle={toggleMode} variant="onColor" />
      </div>

      {/* サイドバー */}
      <aside className={`${mobileNavOpen ? "flex" : "hidden"} md:flex w-full md:w-56 flex-shrink-0 flex-col shadow-md md:h-screen md:sticky md:top-0 md:overflow-y-auto`} style={{ background: "var(--primary)" }}>
        <div className="hidden md:flex px-5 py-5 border-b border-white/10 items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-white">ManaVillage</h1>
            <p className="text-xs text-white/50 mt-0.5">管理者画面</p>
          </div>
          <DarkModeToggle mode={mode} onToggle={toggleMode} variant="onColor" />
        </div>
        <nav className="flex-1 py-4 flex flex-col gap-1 px-3">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setMobileNavOpen(false); }}
              className={`relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-left transition-all
                ${tab === t.key ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"}`}
            >
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </nav>
        <div className="px-3 pb-4">
          <button onClick={() => { clearToken(); router.push("/login"); }}
            className="w-full text-xs text-white/40 hover:text-white/70 transition-colors py-2">
            ログアウト
          </button>
        </div>
      </aside>

      {/* メインコンテンツ */}
      <main className="flex-1 overflow-auto p-4 sm:p-6 md:p-8 min-w-0 md:h-screen">
        {tab === "creator_applications" && <CreatorApplicationsTab />}
        {tab === "creators" && <CreatorsTab />}
        {tab === "users" && <UsersTab />}
        {tab === "course_moderation" && <CourseModerationTab />}
        {tab === "reports" && <ReportsTab />}
        {tab === "tier_b_overdue" && <TierBOverdueTab />}
      </main>
    </div>
  );
}
