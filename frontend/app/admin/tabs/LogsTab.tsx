"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function LogsTab() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [logData, setLogData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    api.adminGetCustomers().then(c => setCustomers(c.filter((cu: any) => !cu.is_admin))).finally(() => setLoading(false));
  }, []);

  async function loadLogs(id: number) {
    setSelectedId(id);
    setLogData(null);
    setLogsLoading(true);
    try {
      const data = await api.adminGetCustomerLogs(id);
      setLogData(data);
    } finally {
      setLogsLoading(false);
    }
  }

  if (loading) return <p style={{ color: "var(--muted)" }}>読み込み中…</p>;

  return (
    <div>
      <h2 className="text-xl font-black mb-6" style={{ color: "var(--primary)" }}>📊 アクセスログ</h2>
      <div className="flex flex-col md:flex-row gap-6">
        {/* 顧客一覧 */}
        <div className="w-full md:w-48 flex-shrink-0">
          <p className="text-xs font-medium mb-2" style={{ color: "var(--muted)" }}>顧客を選択</p>
          <div className="flex flex-col gap-1">
            {customers.map(c => (
              <button key={c.id} onClick={() => loadLogs(c.id)}
                className={`text-left px-3 py-2 rounded-lg text-sm transition-all ${selectedId === c.id ? "font-bold" : ""}`}
                style={{ background: selectedId === c.id ? "var(--primary)" : "var(--card)", color: selectedId === c.id ? "white" : "var(--text)", border: "1px solid var(--border)" }}>
                {c.username}
              </button>
            ))}
          </div>
        </div>

        {/* ログ詳細 */}
        <div className="flex-1">
          {selectedId === null && <p style={{ color: "var(--muted)" }}>顧客を選択してください</p>}
          {logsLoading && <p style={{ color: "var(--muted)" }}>読み込み中…</p>}
          {logData && !logsLoading && (
            <div className="flex flex-col gap-4">
              {/* サマリー */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: "依頼記事数", value: logData.total_articles },
                  { label: "閲覧済み", value: `${logData.read_count}冊` },
                  { label: "閲覧率", value: `${logData.read_rate}%` },
                ].map(s => (
                  <div key={s.label} className="card text-center">
                    <p className="text-xs" style={{ color: "var(--muted)" }}>{s.label}</p>
                    <p className="text-2xl font-black mt-1" style={{ color: "var(--primary)" }}>{s.value}</p>
                  </div>
                ))}
                {logData.total_exercises > 0 && (
                  <div className="card text-center">
                    <p className="text-xs" style={{ color: "var(--muted)" }}>演習問題 取り組み</p>
                    <p className="text-2xl font-black mt-1" style={{ color: "var(--primary)" }}>
                      {logData.exercise_accessed_count} / {logData.total_exercises}
                    </p>
                  </div>
                )}
              </div>
              {logData.last_access && (
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  最終アクセス: {new Date(logData.last_access).toLocaleString("ja-JP")}
                </p>
              )}

              {/* ログ一覧 */}
              <div className="card">
                <p className="text-xs font-medium mb-3" style={{ color: "var(--muted)" }}>閲覧履歴</p>
                {logData.logs.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--muted)" }}>まだ閲覧記録がありません</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead><tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th className="text-left py-1 font-medium text-xs" style={{ color: "var(--muted)" }}>記事</th>
                      <th className="text-left py-1 font-medium text-xs" style={{ color: "var(--muted)" }}>アクセス日時</th>
                    </tr></thead>
                    <tbody>
                      {logData.logs.map((l: any, i: number) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td className="py-1 font-medium" style={{ color: "var(--primary)" }}>{l.article_title || `#${l.article_id}`}</td>
                          <td className="py-1 text-xs" style={{ color: "var(--muted)" }}>{new Date(l.accessed_at).toLocaleString("ja-JP")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}