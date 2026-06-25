"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";

type AdminCourse = { id: number; title: string; status: string; is_suspended: boolean; suspension_reason: string | null; character_name: string | null };

const STATUS_LABEL: Record<string, string> = { draft: "下書き", review: "運営確認中", published: "公開中", unpublished: "非公開" };

/** コース一覧：公開審査・停止管理・削除をまとめて操作する */
export function CourseModerationTab() {
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
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

  async function handleDelete(c: AdminCourse) {
    if (!confirm(`「${c.title}」を完全に削除しますか？この操作は取り消せません。`)) return;
    try {
      await api.adminDeleteCourse(c.id);
      toast("コースを削除しました", "success");
      await reload();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "失敗しました", "error");
    }
  }

  if (loading) return <p style={{ color: "var(--muted)" }}>読み込み中…</p>;

  const filtered = courses.filter(c =>
    !query.trim() || c.title.toLowerCase().includes(query.toLowerCase()) || (c.character_name ?? "").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-black" style={{ color: "var(--primary)" }}>📚 コース一覧</h2>
      <input
        placeholder="コース名・クリエイター名で検索"
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="max-w-sm"
      />
      <p className="text-xs" style={{ color: "var(--muted)" }}>{filtered.length}件</p>

      {filtered.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>該当するコースがありません。</p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(c => (
            <div key={c.id} className="card flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{c.title}</p>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{
                    background: c.status === "published" ? "var(--accent)" : c.status === "review" ? "#f5a623" : "var(--example-bg, #eee)",
                    color: c.status === "published" || c.status === "review" ? "white" : "var(--muted)",
                  }}>
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                  {c.is_suspended && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#e53e3e", color: "white" }}>停止中</span>
                  )}
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{c.character_name ?? "クリエイター不明"}</p>
                {c.is_suspended && c.suspension_reason && (
                  <p className="text-xs" style={{ color: "#e53e3e" }}>停止理由: {c.suspension_reason}</p>
                )}
              </div>

              <div className="flex gap-2 flex-shrink-0 flex-wrap items-center">
                {c.status === "review" && (
                  <>
                    <input placeholder="却下理由（任意）" value={rejectReasons[c.id] ?? ""}
                      onChange={e => setRejectReasons(prev => ({ ...prev, [c.id]: e.target.value }))}
                      className="text-sm w-36" />
                    <button onClick={() => handleReject(c.id)} className="text-xs underline" style={{ color: "#e53e3e" }}>却下</button>
                    <button onClick={() => handleApprove(c.id)} className="btn-primary text-sm">承認して公開</button>
                  </>
                )}

                {c.is_suspended ? (
                  <button onClick={() => handleUnsuspend(c.id)} className="btn-primary text-sm">停止解除</button>
                ) : (
                  <>
                    <input placeholder="停止理由" value={suspendReasons[c.id] ?? ""}
                      onChange={e => setSuspendReasons(prev => ({ ...prev, [c.id]: e.target.value }))}
                      className="text-sm w-32" />
                    <button onClick={() => handleSuspend(c.id)} className="text-xs underline" style={{ color: "#e53e3e" }}>停止</button>
                  </>
                )}

                <button onClick={() => handleDelete(c)} className="text-xs underline" style={{ color: "#e53e3e" }}>削除</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
