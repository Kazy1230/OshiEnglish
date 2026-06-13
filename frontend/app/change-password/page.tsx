"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useDarkMode } from "@/lib/darkMode";
import { DarkModeToggle } from "@/components/DarkModeToggle";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, toggleMode] = useDarkMode();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (next !== confirm) { setError("新しいパスワードが一致しません"); return; }
    if (next.length < 8) { setError("パスワードは8文字以上にしてください"); return; }
    setLoading(true);
    try {
      await api.changePassword(current, next);
      const me = await api.me();
      router.push(me.is_admin ? "/admin" : "/shelf");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "変更に失敗しました");
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
        </div>

        <div className="card shadow-sm">
          <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: "#fff8e1", color: "#b45309" }}>
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

            {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg p-2 text-center">{error}</p>}

            <button type="submit" className="btn-primary w-full text-center mt-1" disabled={loading}>
              {loading ? "変更中…" : "パスワードを変更する"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
