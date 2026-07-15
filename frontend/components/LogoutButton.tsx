"use client";
import { clearToken } from "@/lib/auth";

export function LogoutButton({ variant = "onColor" }: { variant?: "onColor" | "onSurface" }) {
  return (
    <button
      onClick={() => { clearToken(); window.location.href = "/"; }}
      className="text-xs font-bold whitespace-nowrap transition-opacity hover:opacity-80"
      style={{ color: variant === "onColor" ? "rgba(255,255,255,0.85)" : "var(--muted)" }}
    >
      ログアウト
    </button>
  );
}
