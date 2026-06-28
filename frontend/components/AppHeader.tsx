"use client";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { useDarkMode } from "@/lib/darkMode";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Role = "learner" | "creator";

const NAV_ITEMS: Record<Role, { href: string; label: string; badgeKey?: "overdueCount" }[]> = {
  learner: [
    { href: "/mypage", label: "マイページ" },
    { href: "/", label: "コースを探す" },
    { href: "/creators", label: "クリエイターを探す" },
  ],
  creator: [
    { href: "/dashboard", label: "ダッシュボード" },
    { href: "/creator/courses", label: "作成したコース" },
    { href: "/creator/inbox", label: "受講者対応", badgeKey: "overdueCount" },
    { href: "/creator/revenue", label: "収益" },
  ],
};

export function AppHeader({
  role,
  backHref,
  backLabel,
  title,
  overdueCount = 0,
}: {
  role?: Role;
  backHref?: string;
  backLabel?: string;
  title?: string;
  overdueCount?: number;
}) {
  const pathname = usePathname();
  const [mode, toggleMode] = useDarkMode();
  const homeHref = role === "creator" ? "/dashboard" : "/";

  return (
    <header className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 flex-wrap" style={{ background: "var(--primary)" }}>
      <div className="flex items-center gap-4 flex-wrap">
        <Link href={homeHref} className="text-white font-black text-lg tracking-tight whitespace-nowrap">
          Mana<span style={{ color: "var(--accent)", filter: "brightness(1.6)" }}>Village</span>
        </Link>
        {backHref && (
          <Link href={backHref} className="text-white/80 text-sm hover:text-white whitespace-nowrap">← {backLabel}</Link>
        )}
        {role && (
          <nav className="flex items-center gap-3 flex-wrap">
            {NAV_ITEMS[role].map(item => {
              const active = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));
              const badge = item.badgeKey === "overdueCount" ? overdueCount : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm whitespace-nowrap relative px-3 py-1 rounded-full"
                  style={{
                    color: "white",
                    fontWeight: active ? 700 : 400,
                    background: active ? "#a855f7" : "transparent",
                  }}
                >
                  {item.label}
                  {badge > 0 && (
                    <span className="absolute -top-2 -right-3 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-black text-white" style={{ background: "#e53e3e" }}>
                      {badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        )}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {role && <NotificationBell />}
        <DarkModeToggle mode={mode} onToggle={toggleMode} variant="onColor" />
        <LogoutButton variant="onColor" />
      </div>
    </header>
  );
}
