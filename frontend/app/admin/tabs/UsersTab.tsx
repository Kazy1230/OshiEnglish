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
const ROLE_BADGE_CLASS: Record<string, string> = {
  learner: "admin-badge admin-badge-gray",
  creator: "admin-badge admin-badge-indigo",
  admin: "admin-badge admin-badge-green",
};

export function UsersTab() {
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  function reload() { return api.adminListCustomers().then(setCustomers); }

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
    const warning = c.role === "creator"
      ? `${c.username} を完全に削除しますか？クリエイターのコース・人格データもすべて削除されます。この操作は取り消せません。`
      : `${c.username} を完全に削除しますか？この操作は取り消せません。`;
    if (!confirm(warning)) return;
    try {
      await api.adminDeleteCustomer(c.id);
      toast("削除しました", "success");
      await reload();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "失敗しました", "error");
    }
  }

  if (loading) return <p style={{ color: "var(--muted)", fontSize: 14 }}>読み込み中…</p>;

  const filtered = customers.filter(c =>
    !query.trim() || c.username.toLowerCase().includes(query.toLowerCase()) || (c.email ?? "").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", margin: 0 }}>ユーザー一覧</h2>
        <span className="admin-badge admin-badge-gray">{filtered.length} / {customers.length}件</span>
      </div>

      <input
        placeholder="ユーザー名・メールアドレスで検索"
        value={query}
        onChange={e => setQuery(e.target.value)}
        style={{ maxWidth: 360, fontSize: 13 }}
      />

      {filtered.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 14, padding: "24px 0" }}>該当するユーザーがいません</p>
      ) : (
        filtered.map(c => (
          <div key={c.id} className="admin-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{c.username}</span>
                <span className={ROLE_BADGE_CLASS[c.role] ?? "admin-badge admin-badge-gray"}>{ROLE_LABEL[c.role] ?? c.role}</span>
                {!c.is_active && <span className="admin-badge admin-badge-red">停止中</span>}
                {c.is_password_reset_required && <span className="admin-badge" style={{ background: "rgba(245,158,11,0.12)", color: "#d97706", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>PW変更必要</span>}
              </div>
              <p style={{ fontSize: 12, color: "var(--muted)" }}>{c.email || "メール未設定"}</p>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
              <button className="admin-action" onClick={() => handleReissuePassword(c)}>PW再発行</button>
              <button
                className={`admin-action${c.is_active ? " admin-action-danger" : ""}`}
                style={!c.is_active ? { color: "var(--accent)", borderColor: "rgba(16,185,129,0.3)" } : undefined}
                onClick={() => handleToggleActive(c)}
              >
                {c.is_active ? "停止" : "有効化"}
              </button>
              {c.role !== "admin" && (
                <button className="admin-action admin-action-danger" onClick={() => handleDelete(c)}>削除</button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
