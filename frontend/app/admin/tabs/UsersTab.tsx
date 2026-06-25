"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";

type AdminCustomer = {
  id: number;
  username: string;
  email: string | null;
  role: string;
  is_active: boolean;
  is_password_reset_required: boolean;
};

const ROLE_LABEL: Record<string, string> = { learner: "学習者", creator: "クリエイター", admin: "管理者" };

/** 全ユーザー（顧客）の一覧・検索・有効化停止・パスワード再発行・削除 */
export function UsersTab() {
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  function reload() {
    return api.adminListCustomers().then(setCustomers);
  }

  useEffect(() => { reload().finally(() => setLoading(false)); }, []);

  async function handleToggleActive(c: AdminCustomer) {
    const action = c.is_active ? "停止" : "有効化";
    if (!confirm(`このユーザーを${action}しますか？`)) return;
    try {
      await api.adminUpdateCustomer(c.id, { is_active: !c.is_active });
      toast(`${action}しました`, "success");
      await reload();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "失敗しました", "error");
    }
  }

  async function handleReissuePassword(c: AdminCustomer) {
    if (!confirm(`${c.username} の一時パスワードを再発行しますか？`)) return;
    try {
      const res = await api.adminReissuePassword(c.id);
      alert(`新しい一時パスワード: ${res.temporary_password}\n\nこの場でのみ表示されます。必ずお客様に伝えてください。`);
      await reload();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "失敗しました", "error");
    }
  }

  async function handleDelete(c: AdminCustomer) {
    if (!confirm(`${c.username} を完全に削除しますか？この操作は取り消せません。`)) return;
    try {
      await api.adminDeleteCustomer(c.id);
      toast("削除しました", "success");
      await reload();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "失敗しました", "error");
    }
  }

  if (loading) return <p style={{ color: "var(--muted)" }}>読み込み中…</p>;

  const filtered = customers.filter(c =>
    !query.trim() || c.username.toLowerCase().includes(query.toLowerCase()) || (c.email ?? "").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-black" style={{ color: "var(--primary)" }}>👤 ユーザー一覧</h2>
      <input
        placeholder="ユーザー名・メールアドレスで検索"
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="max-w-sm"
      />
      <p className="text-xs" style={{ color: "var(--muted)" }}>{filtered.length}件</p>
      {filtered.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>該当するユーザーがいません。</p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(c => (
            <div key={c.id} className="card flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{c.username}</p>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--example-bg, #eee)", color: "var(--accent)" }}>
                    {ROLE_LABEL[c.role] ?? c.role}
                  </span>
                  {!c.is_active && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#e53e3e", color: "white" }}>停止中</span>
                  )}
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{c.email || "メール未設定"}</p>
              </div>
              <div className="flex gap-2 flex-shrink-0 flex-wrap">
                <button onClick={() => handleReissuePassword(c)} className="text-xs underline" style={{ color: "var(--muted)" }}>パスワード再発行</button>
                <button onClick={() => handleToggleActive(c)} className="text-xs underline" style={{ color: c.is_active ? "#e53e3e" : "var(--accent)" }}>
                  {c.is_active ? "停止する" : "有効化する"}
                </button>
                {c.role !== "admin" && (
                  <button onClick={() => handleDelete(c)} className="text-xs underline" style={{ color: "#e53e3e" }}>削除</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
