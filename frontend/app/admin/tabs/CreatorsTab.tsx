"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";

type AdminCreator = {
  id: number;
  username: string | null;
  email: string | null;
  status: string;
  speciality: string | null;
  character_name: string | null;
  course_count: number;
};

const STATUS_LABEL: Record<string, string> = { pending: "審査待ち", active: "稼働中", suspended: "停止中" };
const STATUS_BADGE_CLASS: Record<string, string> = {
  active: "admin-badge admin-badge-green",
  suspended: "admin-badge admin-badge-red",
  pending: "admin-badge admin-badge-gray",
};

export function CreatorsTab() {
  const [creators, setCreators] = useState<AdminCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  function reload() { return api.adminListAllCreators().then(setCreators); }

  useEffect(() => { reload().finally(() => setLoading(false)); }, []);

  async function handleSuspend(id: number) {
    if (!confirm("このクリエイターを停止しますか？")) return;
    try {
      await api.adminSuspendCreator(id);
      toast("停止しました", "success");
      await reload();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "失敗しました", "error");
    }
  }

  async function handleReactivate(id: number) {
    try {
      await api.adminReactivateCreator(id);
      toast("再開しました", "success");
      await reload();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "失敗しました", "error");
    }
  }

  if (loading) return <p style={{ color: "var(--muted)", fontSize: 14 }}>読み込み中…</p>;

  const filtered = creators.filter(c =>
    !query.trim() || (c.username ?? "").toLowerCase().includes(query.toLowerCase()) || (c.email ?? "").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", margin: 0 }}>クリエイター一覧</h2>
        <span className="admin-badge admin-badge-gray">{filtered.length} / {creators.length}件</span>
      </div>

      <input
        placeholder="ユーザー名・メールアドレスで検索"
        value={query}
        onChange={e => setQuery(e.target.value)}
        style={{ maxWidth: 360, fontSize: 13 }}
      />

      {filtered.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 14, padding: "24px 0" }}>該当するクリエイターがいません</p>
      ) : (
        filtered.map(c => (
          <div key={c.id} className="admin-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{c.username}</span>
                <span className={STATUS_BADGE_CLASS[c.status] ?? "admin-badge admin-badge-gray"}>
                  {STATUS_LABEL[c.status] ?? c.status}
                </span>
              </div>
              <p style={{ fontSize: 12, color: "var(--muted)" }}>
                {c.email} ・ {c.character_name ?? "人格未作成"} ・ コース {c.course_count} 件
              </p>
              {c.speciality && (
                <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>専門: {c.speciality}</p>
              )}
            </div>
            <div style={{ flexShrink: 0 }}>
              {c.status === "active" && (
                <button className="admin-action admin-action-danger" onClick={() => handleSuspend(c.id)}>停止</button>
              )}
              {c.status === "suspended" && (
                <button className="admin-action" style={{ color: "var(--accent)", borderColor: "rgba(16,185,129,0.3)" }} onClick={() => handleReactivate(c.id)}>再開</button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
