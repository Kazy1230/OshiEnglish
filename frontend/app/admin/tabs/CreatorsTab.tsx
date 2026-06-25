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

const STATUS_LABEL: Record<string, string> = {
  pending: "審査待ち",
  active: "稼働中",
  suspended: "停止中",
};

/** 全クリエイター一覧（承認済み・停止済みも含む）の管理 */
export function CreatorsTab() {
  const [creators, setCreators] = useState<AdminCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  function reload() {
    return api.adminListAllCreators().then(setCreators);
  }

  useEffect(() => { reload().finally(() => setLoading(false)); }, []);

  async function handleSuspend(id: number) {
    if (!confirm("このクリエイターを停止しますか？新規コース作成・コンテンツ生成ができなくなります。")) return;
    try {
      await api.adminSuspendCreator(id);
      toast("クリエイターを停止しました", "success");
      await reload();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "失敗しました", "error");
    }
  }

  async function handleReactivate(id: number) {
    try {
      await api.adminReactivateCreator(id);
      toast("クリエイターを再開しました", "success");
      await reload();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "失敗しました", "error");
    }
  }

  if (loading) return <p style={{ color: "var(--muted)" }}>読み込み中…</p>;

  const filtered = creators.filter(c =>
    !query.trim() || (c.username ?? "").toLowerCase().includes(query.toLowerCase()) || (c.email ?? "").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-black" style={{ color: "var(--primary)" }}>🧑‍🏫 クリエイター一覧</h2>
      <input
        placeholder="ユーザー名・メールアドレスで検索"
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="max-w-sm"
      />
      {filtered.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>該当するクリエイターがいません。</p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(c => (
            <div key={c.id} className="card flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{c.username}</p>
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{
                      background: c.status === "active" ? "var(--accent)" : c.status === "suspended" ? "#e53e3e" : "var(--example-bg, #eee)",
                      color: c.status === "active" || c.status === "suspended" ? "white" : "var(--muted)",
                    }}
                  >
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                  {c.email} ・ {c.character_name ?? "人格未作成"} ・ コース{c.course_count}件
                </p>
                {c.speciality && <p className="text-xs" style={{ color: "var(--muted)" }}>専門分野: {c.speciality}</p>}
              </div>
              <div className="flex-shrink-0">
                {c.status === "active" && (
                  <button onClick={() => handleSuspend(c.id)} className="text-xs underline" style={{ color: "#e53e3e" }}>停止する</button>
                )}
                {c.status === "suspended" && (
                  <button onClick={() => handleReactivate(c.id)} className="btn-primary text-sm">再開する</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
