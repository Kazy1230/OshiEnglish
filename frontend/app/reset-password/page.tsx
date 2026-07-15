"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!token) { setError("リンクが無効です。再度パスワード再設定をお試しください"); return; }
    if (next !== confirm) { setError("新しいパスワードが一致しません"); return; }
    if (next.length < 8) { setError("パスワードは8文字以上にしてください"); return; }
    setLoading(true);
    try {
      await api.resetPassword(token, next);
      router.push("/login?reset=1");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "再設定に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black" style={{ color: "var(--primary)" }}>ManaVillage</h1>
        </div>

        <div className="card shadow-sm">
          <h2 className="text-lg font-bold mb-5" style={{ color: "var(--primary)" }}>新しいパスワードの設定</h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <div>
              <label className="text-sm font-medium block mb-1" style={{ color: "var(--muted)" }}>新しいパスワード（8文字以上）</label>
              <input type="password" value={next} onChange={e => setNext(e.target.value)} required placeholder="••••••••" autoComplete="new-password" />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1" style={{ color: "var(--muted)" }}>新しいパスワード（確認）</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required placeholder="••••••••" autoComplete="new-password" />
            </div>

            {error && (
              <p role="alert" className="text-sm rounded-lg p-2 text-center" style={{ background: "rgba(239,68,68,0.14)", color: "#f87171" }}>{error}</p>
            )}

            <button type="submit" className="btn-primary text-center w-full mt-1" disabled={loading}
              aria-busy={loading}>
              {loading ? "設定中…" : "パスワードを設定する"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6">
          <button type="button" onClick={() => router.push("/login")}
            className="font-medium transition-colors" style={{ color: "var(--accent)" }}>
            ログイン画面に戻る
          </button>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
