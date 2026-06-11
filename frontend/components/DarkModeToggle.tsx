"use client";
import type { ThemeMode } from "@/lib/darkMode";

/**
 * ライト/ダークモード切り替えボタン。
 * variant="onColor"  … 色付きヘッダー（白文字背景半透明）の上に置く場合
 * variant="onSurface" … カード/サイドバーなど、CSS変数（--text等）に乗せる場合
 */
export function DarkModeToggle({ mode, onToggle, variant = "onColor", className = "" }: {
  mode: ThemeMode;
  onToggle: () => void;
  variant?: "onColor" | "onSurface";
  className?: string;
}) {
  const isDark = mode === "dark";
  const base = "text-xs px-2.5 py-1.5 rounded-full font-bold transition-all flex items-center gap-1.5 flex-shrink-0";
  const style = variant === "onColor"
    ? { background: "rgba(255,255,255,0.15)", color: "white" }
    : { background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)" };

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isDark ? "ライトモードに切り替え" : "ダークモードに切り替え"}
      title={isDark ? "ライトモードに切り替え" : "ダークモードに切り替え"}
      className={`${base} hover:shadow-md ${className}`}
      style={style}
    >
      {isDark ? "☀️ ライト" : "🌙 ダーク"}
    </button>
  );
}
