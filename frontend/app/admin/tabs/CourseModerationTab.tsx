"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";

type AdminCourse = { id: number; title: string; status: string; is_suspended: boolean; suspension_reason: string | null; character_name: string | null };

/** G-02: 違反コンテンツ・コースの停止 */
export function CourseModerationTab() {
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [suspendReasons, setSuspendReasons] = useState<Record<number, string>>({});
  const [rejectReasons, setRejectReasons] = useState<Record<number, string>>({});

  function reload() {
    return api.adminListAllCourses().then(setCourses);
  }

  useEffect(() => { reload().finally(() => setLoading(false)); }, []);

  async function handleApprove(courseId: number) {
    try {
      await api.adminApproveCourse(courseId);
      toast("コースを承認し公開しました", "success");
      await reload();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "失敗しました", "error");
    }
  }

  async function handleReject(courseId: number) {
    try {
      await api.adminRejectCourse(courseId, rejectReasons[courseId]);
      toast("コースを却下しました", "success");
      await reload();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "失敗しました", "error");
    }
  }

  async function handleSuspend(courseId: number) {
    const reason = suspendReasons[courseId];
    if (!reason) { toast("停止理由を入力してください", "error"); return; }
    try {
      await api.adminSuspendCourse(courseId, reason);
      toast("コースを停止しました", "success");
      await reload();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "失敗しました", "error");
    }
  }

  async function handleUnsuspend(courseId: number) {
    try {
      await api.adminUnsuspendCourse(courseId);
      toast("停止を解除しました", "success");
      await reload();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "失敗しました", "error");
    }
  }

  if (loading) return <p style={{ color: "var(--muted)" }}>読み込み中…</p>;

  const reviewCourses = courses.filter(c => c.status === "review");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-black" style={{ color: "var(--primary)" }}>📝 コース公開審査</h2>
        {reviewCourses.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>公開申請中のコースはありません。</p>
        ) : (
          <div className="flex flex-col gap-2">
            {reviewCourses.map(c => (
              <div key={c.id} className="card flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{c.title}（{c.character_name}）</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>状態: 運営確認中</p>
                </div>
                <div className="flex gap-2 flex-shrink-0 items-center">
                  <input placeholder="却下理由（任意）" value={rejectReasons[c.id] ?? ""}
                    onChange={e => setRejectReasons(prev => ({ ...prev, [c.id]: e.target.value }))}
                    className="text-sm w-40" />
                  <button onClick={() => handleReject(c.id)} className="text-xs underline" style={{ color: "#e53e3e" }}>却下</button>
                  <button onClick={() => handleApprove(c.id)} className="btn-primary text-sm">承認して公開</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-black" style={{ color: "var(--primary)" }}>🛑 コース停止管理</h2>
        {courses.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>コースがありません。</p>
        ) : (
          <div className="flex flex-col gap-2">
            {courses.map(c => (
              <div key={c.id} className="card flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{c.title}（{c.character_name}）</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>状態: {c.status}</p>
                  {c.is_suspended && <p className="text-xs" style={{ color: "#e53e3e" }}>停止中: {c.suspension_reason}</p>}
                </div>
                {c.is_suspended ? (
                  <button onClick={() => handleUnsuspend(c.id)} className="btn-primary text-sm flex-shrink-0">解除</button>
                ) : (
                  <div className="flex gap-2 flex-shrink-0">
                    <input placeholder="停止理由" value={suspendReasons[c.id] ?? ""}
                      onChange={e => setSuspendReasons(prev => ({ ...prev, [c.id]: e.target.value }))}
                      className="text-sm w-40" />
                    <button onClick={() => handleSuspend(c.id)} className="text-xs underline" style={{ color: "#e53e3e" }}>停止</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
