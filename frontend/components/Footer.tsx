"use client";
import { useRouter, usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import { toast } from "@/components/Toast";

export function Footer() {
  const pathname = usePathname();
  const router = useRouter();
  // 管理者画面にはフッターを表示しない
  if (pathname?.startsWith("/admin")) return null;

  async function handleWithdraw() {
    if (!getToken()) { router.push("/login"); return; }
    if (!confirm("退会しますか？アカウント情報・学習履歴等はすべて削除され、この操作は取り消せません。")) return;
    try {
      await api.withdraw();
      clearToken();
      router.push("/login?withdrawn=1");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "退会処理に失敗しました", "error");
    }
  }

  return (
    <footer className="py-6 text-center text-xs flex items-center justify-center gap-4" style={{ color: "var(--muted)" }}>
      <button onClick={handleWithdraw} className="hover:underline">退会する</button>
    </footer>
  );
}
