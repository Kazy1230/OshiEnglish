"use client";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
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
  const [code, setCode] = useState("");
  const [requires2FA, setRequires2FA] = useState(false);
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

  async function afterAuthenticated(data: { access_token: string; is_password_reset_required: boolean }) {
    setToken(data.access_token);
    const returnTo = searchParams.get("returnTo");
    if (data.is_password_reset_required) {
      router.push("/change-password");
    } else if (returnTo) {
      router.push(returnTo);
    } else {
      const me = await api.me();
      router.push(me.role === "admin" ? "/admin" : me.role === "creator" ? "/dashboard" : "/");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const data = await api.login(username, password);
      if (data.requires_2fa) {
        setRequires2FA(true);
      } else {
        await afterAuthenticated(data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify2FA(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api.verify2FA(username, code);
      await afterAuthenticated(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "認証コードの確認に失敗しました");
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
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>30日間、好きなクリエイターと目標達成へ</p>
        </div>

        <div className="card shadow-sm">
          <h2 className="text-lg font-bold mb-5" style={{ color: "var(--primary)" }}>ログイン</h2>

          {success && (
            <div className="mb-4 p-3 rounded-lg text-sm text-center" style={{ background: "#e8fdf0", color: "#16a34a" }}>
              ✅ {success}
            </div>
          )}

          {requires2FA ? (
            <form onSubmit={handleVerify2FA} className="flex flex-col gap-4" noValidate>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                登録済みのメールアドレスに認証コードを送信しました。6桁のコードを入力してください。
              </p>
              <div>
                <label htmlFor="code" className="text-sm font-medium block mb-1" style={{ color: "var(--muted)" }}>認証コード</label>
                <input id="code" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                  value={code} onChange={e => setCode(e.target.value)}
                  required autoFocus placeholder="123456" autoComplete="one-time-code" />
              </div>

              {error && (
                <p role="alert" className="text-sm text-red-500 bg-red-50 rounded-lg p-2 text-center">{error}</p>
              )}

              <button type="submit" className="btn-primary text-center w-full mt-1" disabled={loading}
                aria-busy={loading}>
                {loading ? "確認中…" : "認証して進む"}
              </button>
              <button type="button" onClick={() => { setRequires2FA(false); setCode(""); setError(""); }}
                className="text-xs font-medium text-center transition-colors" style={{ color: "var(--accent)" }}>
                ログイン画面に戻る
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
              <div>
                <label htmlFor="username" className="text-sm font-medium block mb-1" style={{ color: "var(--muted)" }}>メールアドレス</label>
                <input id="username" type="email" value={username} onChange={e => setUsername(e.target.value)}
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
          )}
        </div>

        <p className="text-center text-xs mt-6">
          <Link href={searchParams.get("returnTo") ? `/signup?returnTo=${encodeURIComponent(searchParams.get("returnTo")!)}` : "/signup"}
            className="font-bold transition-colors" style={{ color: "var(--accent)" }}>
            アカウントをお持ちでない方はこちら（新規登録）
          </Link>
        </p>
        <p className="text-center text-xs mt-2">
          <Link href="/" className="font-medium transition-colors" style={{ color: "var(--muted)" }}>
            コースを探す
          </Link>
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
