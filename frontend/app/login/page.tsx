"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { useDarkMode } from "@/lib/darkMode";
import { DarkModeToggle } from "@/components/DarkModeToggle";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, toggleMode] = useDarkMode();

  useEffect(() => {
    if (searchParams.get("changed") === "1") {
      setSuccess("パスワードを変更しました。新しいパスワードでログインしてください。");
    } else if (searchParams.get("reset") === "1") {
      setSuccess("パスワードを再設定しました。新しいパスワードでログインしてください。");
    } else if (searchParams.get("withdrawn") === "1") {
      setSuccess("退会処理が完了しました。ご利用ありがとうございました。");
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const data = await api.login(username, password);
      setToken(data.access_token);
      if (data.is_password_reset_required) {
        router.push("/change-password");
      } else {
        const me = await api.me();
        router.push(me.is_admin ? "/admin" : "/shelf");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "ログインに失敗しました");
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
          <h1 className="text-4xl font-black" style={{ color: "var(--primary)" }}>推しEnglish</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>あなただけのキャラクター英文法解説</p>
        </div>

        <div className="card shadow-sm">
          <h2 className="text-lg font-bold mb-5" style={{ color: "var(--primary)" }}>ログイン</h2>

          {success && (
            <div className="mb-4 p-3 rounded-lg text-sm text-center" style={{ background: "#e8fdf0", color: "#16a34a" }}>
              ✅ {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <div>
              <label htmlFor="username" className="text-sm font-medium block mb-1" style={{ color: "var(--muted)" }}>ユーザー名（メールアドレス）</label>
              <input id="username" type="text" value={username} onChange={e => setUsername(e.target.value)}
                required autoFocus placeholder="example@example.com" autoComplete="username" />
            </div>
            <div>
              <label htmlFor="password" className="text-sm font-medium block mb-1" style={{ color: "var(--muted)" }}>パスワード</label>
              <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)}
                required placeholder="••••••••" autoComplete="current-password" />
              <div className="text-right mt-1">
                <button type="button" onClick={() => router.push("/forgot-password")}
                  className="text-xs font-medium transition-colors" style={{ color: "var(--accent)" }}>
                  パスワードを忘れた方はこちら
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-500 bg-red-50 rounded-lg p-2 text-center">{error}</p>
            )}

            <button type="submit" className="btn-primary text-center w-full mt-1" disabled={loading}
              aria-busy={loading}>
              {loading ? "ログイン中…" : "ログイン"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "var(--muted)" }}>
          ID・パスワードはお申し込み完了画面でお知らせします
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
