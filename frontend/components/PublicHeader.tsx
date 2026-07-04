"use client";
import Link from "next/link";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { useDarkMode } from "@/lib/darkMode";
import { getToken } from "@/lib/auth";
import { useEffect, useState } from "react";

export function PublicHeader() {
  const [mode, toggleMode] = useDarkMode();
  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => { setLoggedIn(!!getToken()); }, []);

  return (
    <header className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3"
      style={{
        background: "color-mix(in srgb, var(--card) 85%, transparent)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid var(--border)",
        position: "sticky",
        top: 0,
        zIndex: 20,
      }}>
      <Link href="/" className="font-black text-xl tracking-tight" style={{ color: "var(--primary)" }}>
        Mana<span style={{ color: "var(--accent)" }}>Village</span>
      </Link>
      <div className="flex items-center gap-3">
        <Link href="/creators" className="text-sm font-bold hidden sm:block" style={{ color: "var(--muted)" }}>クリエイター</Link>
        <Link href="/pricing" className="text-sm font-bold hidden sm:block" style={{ color: "var(--muted)" }}>料金</Link>
        {loggedIn ? (
          <Link href="/mypage" className="btn-primary text-sm py-1.5 px-4">マイページ</Link>
        ) : (
          <div className="flex items-center gap-2">
            <Link href="/login" className="text-sm font-bold" style={{ color: "var(--muted)" }}>ログイン</Link>
            <Link href="/signup" className="btn-primary text-sm py-1.5 px-4">はじめる</Link>
          </div>
        )}
        <DarkModeToggle mode={mode} onToggle={toggleMode} variant="onSurface" />
      </div>
    </header>
  );
}
