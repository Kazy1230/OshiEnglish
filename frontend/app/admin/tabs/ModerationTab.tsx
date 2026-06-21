"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";

type CreatorApplication = { id: number; username: string | null; speciality: string | null; experience: string | null };
type AdminCourse = { id: number; title: string; status: string; is_suspended: boolean; suspension_reason: string | null; character_name: string | null };
type Report = { id: number; target_type: string; target_id: number; reason: string; status: string; created_at: string };
type OverdueQuestion = { question_id: number; course_title: string; creator_username: string | null; hours_elapsed: number };

export function ModerationTab() {
  const [applications, setApplications] = useState<CreatorApplication[]>([]);
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [overdue, setOverdue] = useState<OverdueQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [suspendReasons, setSuspendReasons] = useState<Record<number, string>>({});

  function reload() {
    return Promise.all([
      api.adminListCreatorApplications(),
      api.adminListAllCourses(),
      api.adminListReports(),
      api.adminListTierBOverdue(),
    ]).then(([a, c, r, o]) => {
      setApplications(a);
      setCourses(c);
      setReports(r);
      setOverdue(o);
    });
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

  async function handleResolveReport(reportId: number) {
    try {
      await api.adminResolveReport(reportId);
      await reload();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "失敗しました", "error");
    }
  }

  if (loading) return <p style={{ color: "var(--muted)" }}>読み込み中…</p>;

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="font-bold mb-3" style={{ color: "var(--primary)" }}>クリエイター申請の審査</h2>
        {applications.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>審査待ちの申請はありません。</p>
        ) : (
          <div className="flex flex-col gap-2">
            {applications.map(a => (
              <div key={a.id} className="card flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{a.username}</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>{a.speciality}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleApprove(a.id)} className="btn-primary text-sm">承認</button>
                  <button onClick={() => handleReject(a.id)} className="text-xs underline" style={{ color: "var(--muted)" }}>却下</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-bold mb-3" style={{ color: "var(--primary)" }}>コース停止管理</h2>
        <div className="flex flex-col gap-2">
          {courses.map(c => (
            <div key={c.id} className="card flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{c.title}（{c.character_name}）</p>
                {c.is_suspended && <p className="text-xs" style={{ color: "#e53e3e" }}>停止中: {c.suspension_reason}</p>}
              </div>
              {c.is_suspended ? (
                <button onClick={() => handleUnsuspend(c.id)} className="btn-primary text-sm">解除</button>
              ) : (
                <div className="flex gap-2">
                  <input placeholder="停止理由" value={suspendReasons[c.id] ?? ""}
                    onChange={e => setSuspendReasons(prev => ({ ...prev, [c.id]: e.target.value }))}
                    className="text-sm w-40" />
                  <button onClick={() => handleSuspend(c.id)} className="text-xs underline" style={{ color: "#e53e3e" }}>停止</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-bold mb-3" style={{ color: "var(--primary)" }}>通報一覧</h2>
        {reports.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>通報はありません。</p>
        ) : (
          <div className="flex flex-col gap-2">
            {reports.map(r => (
              <div key={r.id} className="card flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm" style={{ color: "var(--text)" }}>[{r.target_type}#{r.target_id}] {r.reason}</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>{r.status === "pending" ? "未対応" : "対応済み"}</p>
                </div>
                {r.status === "pending" && (
                  <button onClick={() => handleResolveReport(r.id)} className="btn-primary text-sm">対応済みにする</button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-bold mb-3" style={{ color: "var(--primary)" }}>Tier B 24時間超未回答アラート</h2>
        {overdue.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>未回答の質問はありません。</p>
        ) : (
          <div className="flex flex-col gap-2">
            {overdue.map(o => (
              <div key={o.question_id} className="card">
                <p className="text-sm font-bold" style={{ color: "#e53e3e" }}>⚠ {o.hours_elapsed}時間経過</p>
                <p className="text-sm" style={{ color: "var(--text)" }}>{o.course_title}（{o.creator_username}）</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
