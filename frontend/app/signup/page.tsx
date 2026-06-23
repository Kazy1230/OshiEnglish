"use client";
import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { useDarkMode } from "@/lib/darkMode";
import { DarkModeToggle } from "@/components/DarkModeToggle";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, toggleMode] = useDarkMode();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== passwordConfirm) {
      setError("パスワードが一致しません");
      return;
    }
    setLoading(true);
    try {
      const data = await api.signup(email, password);
      setToken(data.access_token);
      router.push(returnTo || "/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "登録に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative" style={{ background: "var(--bg)" }}>
      <div className="absolute top-4 right-4">
        <DarkModeToggle mode={mode} onToggle={toggleMode} variant="onSurface" />
      </div>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black" style={{ color: "var(--primary)" }}>ManaVillage</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>90日間、好きなクリエイターと目標達成へ</p>
        </div>

        <div className="card shadow-sm">
          <h2 className="text-lg font-bold mb-5" style={{ color: "var(--primary)" }}>新規登録</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <div>
              <label htmlFor="email" className="text-sm font-medium block mb-1" style={{ color: "var(--muted)" }}>メールアドレス</label>
              <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                required autoFocus placeholder="example@example.com" autoComplete="email" />
            </div>
            <div>
              <label htmlFor="password" className="text-sm font-medium block mb-1" style={{ color: "var(--muted)" }}>パスワード（8文字以上）</label>
              <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)}
                required minLength={8} placeholder="••••••••" autoComplete="new-password" />
            </div>
            <div>
              <label htmlFor="passwordConfirm" className="text-sm font-medium block mb-1" style={{ color: "var(--muted)" }}>パスワード（確認）</label>
              <input id="passwordConfirm" type="password" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)}
                required minLength={8} placeholder="••••••••" autoComplete="new-password" />
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-500 bg-red-50 rounded-lg p-2 text-center">{error}</p>
            )}

            <button type="submit" className="btn-primary text-center w-full mt-1" disabled={loading} aria-busy={loading}>
              {loading ? "登録中…" : "登録する"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6">
          <Link href={returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login"}
            className="font-medium transition-colors" style={{ color: "var(--accent)" }}>
            すでにアカウントをお持ちの方はこちら
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
