"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";

type AdminCourse = { id: number; title: string; status: string; is_suspended: boolean; suspension_reason: string | null; character_name: string | null };

const STATUS_LABEL: Record<string, string> = { draft: "下書き", review: "審査待ち", published: "公開中", unpublished: "非公開" };
const STATUS_BADGE_CLASS: Record<string, string> = {
  published: "admin-badge admin-badge-green",
  review: "admin-badge",
  draft: "admin-badge admin-badge-gray",
  unpublished: "admin-badge admin-badge-gray",
};

export function CourseModerationTab() {
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [suspendReasons, setSuspendReasons] = useState<Record<number, string>>({});
  const [rejectReasons, setRejectReasons] = useState<Record<number, string>>({});

  function reload() { return api.adminListAllCourses().then(setCourses); }

  useEffect(() => { reload().finally(() => setLoading(false)); }, []);

  async function handleApprove(courseId: number) {
    try { await api.adminApproveCourse(courseId); toast("公開しました", "success"); await reload(); }
    catch (err: unknown) { toast(err instanceof Error ? err.message : "失敗しました", "error"); }
  }

  async function handleReject(courseId: number) {
    try { await api.adminRejectCourse(courseId, rejectReasons[courseId]); toast("却下しました", "success"); await reload(); }
    catch (err: unknown) { toast(err instanceof Error ? err.message : "失敗しました", "error"); }
  }

  async function handleSuspend(courseId: number) {
    const reason = suspendReasons[courseId];
    if (!reason) { toast("停止理由を入力してください", "error"); return; }
    try { await api.adminSuspendCourse(courseId, reason); toast("停止しました", "success"); await reload(); }
    catch (err: unknown) { toast(err instanceof Error ? err.message : "失敗しました", "error"); }
  }

  async function handleUnsuspend(courseId: number) {
    try { await api.adminUnsuspendCourse(courseId); toast("停止を解除しました", "success"); await reload(); }
    catch (err: unknown) { toast(err instanceof Error ? err.message : "失敗しました", "error"); }
  }

  async function handleDelete(c: AdminCourse) {
    if (!confirm(`「${c.title}」を完全に削除しますか？この操作は取り消せません。`)) return;
    try { await api.adminDeleteCourse(c.id); toast("削除しました", "success"); await reload(); }
    catch (err: unknown) { toast(err instanceof Error ? err.message : "失敗しました", "error"); }
  }

  if (loading) return <p style={{ color: "var(--muted)", fontSize: 14 }}>読み込み中…</p>;

  const filtered = courses.filter(c =>
    !query.trim() || c.title.toLowerCase().includes(query.toLowerCase()) || (c.character_name ?? "").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", margin: 0 }}>コース一覧</h2>
        <span className="admin-badge admin-badge-gray">{filtered.length} / {courses.length}件</span>
      </div>

      <input
        placeholder="コース名・キャラクター名で検索"
        value={query}
        onChange={e => setQuery(e.target.value)}
        style={{ maxWidth: 360, fontSize: 13 }}
      />

      {filtered.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 14, padding: "24px 0" }}>該当するコースがありません</p>
      ) : (
        filtered.map(c => (
          <div key={c.id} className="admin-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", justifyContent: "space-between", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{c.title}</span>
                <span
                  className={STATUS_BADGE_CLASS[c.status] ?? "admin-badge admin-badge-gray"}
                  style={c.status === "review" ? { background: "rgba(245,158,11,0.12)", color: "#d97706", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999 } : undefined}
                >
                  {STATUS_LABEL[c.status] ?? c.status}
                </span>
                {c.is_suspended && <span className="admin-badge admin-badge-red">停止中</span>}
              </div>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{c.character_name ?? "不明"}</span>
            </div>

            {c.is_suspended && c.suspension_reason && (
              <p style={{ fontSize: 12, color: "var(--danger, #ef4444)", margin: 0 }}>停止理由: {c.suspension_reason}</p>
            )}

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {c.status === "review" && (
                <>
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
                </>
              )}

              {c.is_suspended ? (
                <button className="admin-action" style={{ color: "var(--accent)", borderColor: "rgba(16,185,129,0.3)" }} onClick={() => handleUnsuspend(c.id)}>停止解除</button>
              ) : c.status !== "review" && (
                <>
                  <input
                    placeholder="停止理由（必須）"
                    value={suspendReasons[c.id] ?? ""}
                    onChange={e => setSuspendReasons(prev => ({ ...prev, [c.id]: e.target.value }))}
                    style={{ fontSize: 12, padding: "4px 8px", width: 150 }}
                  />
                  <button className="admin-action admin-action-danger" onClick={() => handleSuspend(c.id)}>停止</button>
                </>
              )}

              <button className="admin-action admin-action-danger" onClick={() => handleDelete(c)}>削除</button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
