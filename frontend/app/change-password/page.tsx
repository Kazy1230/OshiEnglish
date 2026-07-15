"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (next !== confirm) { setError("新しいパスワードが一致しません"); return; }
    if (next.length < 8) { setError("パスワードは8文字以上にしてください"); return; }
    setLoading(true);
    try {
      await api.changePassword(current, next);
      const me = await api.me();
      router.push(me.role === "admin" ? "/admin" : me.role === "creator" ? "/dashboard" : "/creators");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "変更に失敗しました");
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
          <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: "rgba(245,158,11,0.16)", color: "#fbbf24" }}>
            🔑 初回ログインです。セキュリティのため、パスワードを変更してください。
          </div>
          <h2 className="text-lg font-bold mb-5" style={{ color: "var(--primary)" }}>パスワードの変更</h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-medium block mb-1" style={{ color: "var(--muted)" }}>現在のパスワード</label>
              <input type="password" value={current} onChange={e => setCurrent(e.target.value)} required placeholder="••••••••" />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1" style={{ color: "var(--muted)" }}>新しいパスワード（8文字以上）</label>
              <input type="password" value={next} onChange={e => setNext(e.target.value)} required placeholder="••••••••" />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1" style={{ color: "var(--muted)" }}>新しいパスワード（確認）</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required placeholder="••••••••" />
            </div>

            {error && <p className="text-sm rounded-lg p-2 text-center" style={{ background: "rgba(239,68,68,0.14)", color: "#f87171" }}>{error}</p>}

            <button type="submit" className="btn-primary w-full text-center mt-1" disabled={loading}>
              {loading ? "変更中…" : "パスワードを変更する"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
