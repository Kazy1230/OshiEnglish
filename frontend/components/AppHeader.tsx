"use client";
import { useEffect, useState } from "react";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { AiCreditBadge } from "@/components/AiCreditBadge";
import { CreatorBreadcrumb, BreadcrumbBar, type Crumb } from "@/components/CreatorBreadcrumb";
import { getToken } from "@/lib/auth";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Role = "learner" | "creator";

const NAV_ITEMS: Record<Role, { href: string; label: string; badgeKey?: "overdueCount" }[]> = {
  learner: [
    { href: "/", label: "トップ" },
    { href: "/mypage", label: "マイページ" },
    { href: "/favorites", label: "お気に入り" },
  ],
  creator: [],
};

export function AppHeader({
  role,
  backHref,
  backLabel,
  title,
  overdueCount = 0,
  breadcrumb,
}: {
  role?: Role;
  backHref?: string;
  backLabel?: string;
  title?: string;
  overdueCount?: number;
  breadcrumb?: Crumb[];
}) {
  const pathname = usePathname();
  const homeHref = role === "creator" ? "/dashboard" : "/";
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(!!getToken());
  }, [pathname]);

  return (
    <>
      <header className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 flex-wrap" style={{ background: "var(--ink)" }}>
        <div className="flex items-center gap-4 flex-wrap">
          <Link href={homeHref} className="text-white font-black text-lg tracking-tight whitespace-nowrap">
            Mana<span style={{ color: "var(--accent)", filter: "brightness(1.6)" }}>Village</span>
          </Link>
          {backHref && (
            <Link href={backHref} className="text-white/80 text-sm hover:text-white whitespace-nowrap">← {backLabel}</Link>
          )}
          {role && loggedIn && (
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
                      background: active ? "var(--accent)" : "transparent",
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
        <div className="flex items-center gap-3 flex-shrink-0 ml-auto">
          {loggedIn ? (
            <>
              {role === "creator" && <AiCreditBadge />}
              {role && <NotificationBell />}
              <LogoutButton variant="onColor" />
            </>
          ) : (
            <Link href="/login" className="text-sm font-bold whitespace-nowrap" style={{ color: "rgba(255,255,255,0.85)" }}>
              ログイン
            </Link>
          )}
        </div>
      </header>
      {role === "creator" && loggedIn && pathname !== "/dashboard" && <CreatorBreadcrumb />}
      {breadcrumb && <BreadcrumbBar crumbs={breadcrumb} />}
    </>
  );
}
