"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { clearToken, getToken, hasRole, type Role } from "@/lib/auth";

/**
 * ロールベースのルートガード。
 * - 未ログイン → /login にリダイレクト
 * - ログイン済みだが許可ロールでない → redirectTo（既定: /shelf）にリダイレクト
 * - 許可ロールであれば me（/auth/me のレスポンス）を返す
 */
export function useRoleGuard(allowed: Role[], redirectTo: string = "/shelf") {
  const router = useRouter();
  const [me, setMe] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    let cancelled = false;
    (async () => {
      try {
        const user = await api.me();
        if (cancelled) return;
        if (!hasRole(user.role, allowed)) { router.replace(redirectTo); return; }
        setMe(user);
        setLoading(false);
      } catch {
        if (!cancelled) { clearToken(); router.replace("/login"); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  return { me, loading };
}
