"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

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
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black" style={{ color: "var(--primary)" }}>ManaVillage</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>30日間、好きなクリエイターと目標達成へ</p>
        </div>

        <div className="card shadow-sm">
          <h2 className="text-lg font-bold mb-5" style={{ color: "var(--primary)" }}>パスワードの再設定</h2>

          {success && (
            <div className="mb-4 p-3 rounded-lg text-sm text-center" style={{ background: "rgba(34,197,94,0.14)", color: "#4ade80" }}>
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
                  <p role="alert" className="text-sm rounded-lg p-2 text-center" style={{ background: "rgba(239,68,68,0.14)", color: "#f87171" }}>{error}</p>
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
