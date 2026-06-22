"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";

type Report = { id: number; target_type: string; target_id: number; reason: string; status: string; created_at: string };

/** G-03: ユーザーからの通報管理 */
export function ReportsTab() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  function reload() {
    return api.adminListReports().then(setReports);
  }

  useEffect(() => { reload().finally(() => setLoading(false)); }, []);

  async function handleResolve(reportId: number) {
    try {
      await api.adminResolveReport(reportId);
      await reload();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "失敗しました", "error");
    }
  }

  if (loading) return <p style={{ color: "var(--muted)" }}>読み込み中…</p>;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-black" style={{ color: "var(--primary)" }}>🚨 通報一覧</h2>
      {reports.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>通報はありません。</p>
      ) : (
        <div className="flex flex-col gap-2">
          {reports.map(r => (
            <div key={r.id} className="card flex items-center justify-between gap-3">
              <div>
                <p className="text-sm" style={{ color: "var(--text)" }}>[{r.target_type}#{r.target_id}] {r.reason}</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  {r.status === "pending" ? "未対応" : "対応済み"} ・ {new Date(r.created_at).toLocaleString("ja-JP")}
                </p>
              </div>
              {r.status === "pending" && (
                <button onClick={() => handleResolve(r.id)} className="btn-primary text-sm flex-shrink-0">対応済みにする</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
