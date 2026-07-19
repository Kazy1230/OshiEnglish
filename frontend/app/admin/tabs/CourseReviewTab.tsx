"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { CourseDetailModal } from "./CourseDetailModal";

type AdminCourse = { id: number; title: string; status: string; is_suspended: boolean; suspension_reason: string | null; character_name: string | null };

export function CourseReviewTab() {
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectReasons, setRejectReasons] = useState<Record<number, string>>({});
  const [detailId, setDetailId] = useState<number | null>(null);

  function reload() { return api.adminListAllCourses().then((all: AdminCourse[]) => setCourses(all.filter(c => c.status === "review"))); }

  useEffect(() => { reload().finally(() => setLoading(false)); }, []);

  async function handleApprove(courseId: number) {
    try { await api.adminApproveCourse(courseId); toast("公開しました", "success"); await reload(); }
    catch (err: unknown) { toast(err instanceof Error ? err.message : "失敗しました", "error"); }
  }

  async function handleReject(courseId: number) {
    try { await api.adminRejectCourse(courseId, rejectReasons[courseId]); toast("却下しました", "success"); await reload(); }
    catch (err: unknown) { toast(err instanceof Error ? err.message : "失敗しました", "error"); }
  }

  if (loading) return <p style={{ color: "var(--muted)", fontSize: 14 }}>読み込み中…</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", margin: 0 }}>審査待ちコース</h2>
        <span className="admin-badge admin-badge-gray">{courses.length}件</span>
      </div>

      {courses.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 14, padding: "24px 0" }}>審査待ちのコースはありません</p>
      ) : (
        courses.map(c => (
          <div key={c.id} className="admin-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", justifyContent: "space-between", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{c.title}</span>
                <span
                  className="admin-badge"
                  style={{ background: "rgba(245,158,11,0.12)", color: "#d97706", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}
                >
                  審査待ち
                </span>
              </div>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{c.character_name ?? "不明"}</span>
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <button className="admin-action" onClick={() => setDetailId(c.id)}>詳細を見る</button>
              <input
                placeholder="却下理由（任意）"
                value={rejectReasons[c.id] ?? ""}
                onChange={e => setRejectReasons(prev => ({ ...prev, [c.id]: e.target.value }))}
                style={{ fontSize: 12, padding: "4px 8px", width: 160 }}
              />
              <button className="admin-action admin-action-danger" onClick={() => handleReject(c.id)}>却下</button>
              <button
                className="admin-action"
                style={{ background: "rgba(16,185,129,0.1)", color: "var(--accent)", borderColor: "rgba(16,185,129,0.3)" }}
                onClick={() => handleApprove(c.id)}
              >
                承認して公開
              </button>
            </div>
          </div>
        ))
      )}

      <CourseDetailModal courseId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
