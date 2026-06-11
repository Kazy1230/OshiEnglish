"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useDarkMode } from "@/lib/darkMode";
import { DarkModeToggle } from "@/components/DarkModeToggle";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, toggleMode] = useDarkMode();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const data = await api.forgotPassword(email);
      setSuccess(data.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "送信に失敗しました");
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
          <h2 className="text-lg font-bold mb-5" style={{ color: "var(--primary)" }}>パスワードの再設定</h2>

          {success && (
            <div className="mb-4 p-3 rounded-lg text-sm text-center" style={{ background: "#e8fdf0", color: "#16a34a" }}>
              ✅ {success}
            </div>
          )}

          {!success && (
            <>
              <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
                ご登録のメールアドレスを入力してください。パスワード再設定用のリンクをお送りします。
              </p>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
                <div>
                  <label htmlFor="email" className="text-sm font-medium block mb-1" style={{ color: "var(--muted)" }}>メールアドレス</label>
                  <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                    required autoFocus placeholder="you@example.com" autoComplete="email" />
                </div>

                {error && (
                  <p role="alert" className="text-sm text-red-500 bg-red-50 rounded-lg p-2 text-center">{error}</p>
                )}

                <button type="submit" className="btn-primary text-center w-full mt-1" disabled={loading}
                  aria-busy={loading}>
                  {loading ? "送信中…" : "再設定リンクを送信"}
                </button>
              </form>
            </>
          )}

          <div className="text-center mt-5">
            <button type="button" onClick={() => router.push("/login")}
              className="text-sm font-medium transition-colors" style={{ color: "var(--accent)" }}>
              ログイン画面に戻る
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
