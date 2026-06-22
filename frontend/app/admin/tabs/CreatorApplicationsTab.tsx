"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";

type CreatorApplication = { id: number; username: string | null; speciality: string | null; experience: string | null };

/** G-01: クリエイター申請の審査・承認/却下 */
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

  if (loading) return <p style={{ color: "var(--muted)" }}>読み込み中…</p>;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-black" style={{ color: "var(--primary)" }}>🧑‍🏫 クリエイター申請の審査</h2>
      {applications.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>審査待ちの申請はありません。</p>
      ) : (
        <div className="flex flex-col gap-2">
          {applications.map(a => (
            <div key={a.id} className="card flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{a.username}</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>{a.speciality}</p>
                {a.experience && <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{a.experience}</p>}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => handleApprove(a.id)} className="btn-primary text-sm">承認</button>
                <button onClick={() => handleReject(a.id)} className="text-xs underline" style={{ color: "var(--muted)" }}>却下</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
