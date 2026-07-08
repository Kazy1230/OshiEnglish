"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";

type CreatorApplication = { id: number; username: string | null; speciality: string | null; experience: string | null };

export function CreatorApplicationsTab() {
  const [applications, setApplications] = useState<CreatorApplication[]>([]);
  const [loading, setLoading] = useState(true);

  function reload() {
    return api.adminListCreatorApplications().then(setApplications);
  }

  useEffect(() => { reload().finally(() => setLoading(false)); }, []);

  async function handleApprove(profileId: number) {
    try {
      await api.adminApproveCreatorApplication(profileId);
      toast("承認しました", "success");
      await reload();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "失敗しました", "error");
    }
  }

  async function handleReject(profileId: number) {
    if (!confirm("この申請を却下しますか？")) return;
    try {
      await api.adminRejectCreatorApplication(profileId);
      toast("却下しました", "success");
      await reload();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "失敗しました", "error");
    }
  }

  if (loading) return <p style={{ color: "var(--muted)", fontSize: 14 }}>読み込み中…</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", margin: 0 }}>クリエイター申請</h2>
        <span className="admin-badge admin-badge-indigo">{applications.length}件</span>
      </div>

      {applications.length === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
          審査待ちの申請はありません
        </div>
      ) : (
        applications.map(a => (
          <div key={a.id} className="admin-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>{a.username}</p>
              {a.speciality && (
                <p style={{ fontSize: 12, color: "var(--muted)" }}>専門: {a.speciality}</p>
              )}
              {a.experience && (
                <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, whiteSpace: "pre-wrap" }}>{a.experience}</p>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button className="admin-action admin-badge-green" style={{ background: "rgba(16,185,129,0.1)", color: "var(--accent)", border: "1px solid rgba(16,185,129,0.3)" }} onClick={() => handleApprove(a.id)}>承認</button>
              <button className="admin-action admin-action-danger" onClick={() => handleReject(a.id)}>却下</button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
