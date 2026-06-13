"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Footer() {
  const pathname = usePathname();
  // 管理者画面にはフッターを表示しない
  if (pathname?.startsWith("/admin")) return null;

  return (
    <footer className="py-6 text-center text-xs flex items-center justify-center gap-4" style={{ color: "var(--muted)" }}>
      <Link href="/pricing" className="hover:underline">💴 料金プラン</Link>
      <Link href="/purchases" className="hover:underline">購入履歴</Link>
      <Link href="/policy" className="hover:underline">返金・解約ポリシー</Link>
      <Link href="/shelf?withdraw=1" className="hover:underline">退会する</Link>
    </footer>
  );
}
