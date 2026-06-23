"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";

type Day = {
  id: number;
  day: number;
  week_number: number;
  theme: string | null;
  tasks: string[] | null;
  ai_message: { morning: string | null; evening_reminder: string | null; completion: string | null };
  is_rest_day: boolean;
  is_edited_by_creator: boolean;
};

type Material = { id: number; type: string; title: string; file_url: string };

export default function CourseCalendarPage() {
  const params = useParams();
  const courseId = Number(params.id);
  const { loading } = useRoleGuard(["creator", "admin"]);

  const [days, setDays] = useState<Day[]>([]);
  const [fetching, setFetching] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState<{ days_done: number; days_total: number; status: string; error?: string | null } | null>(null);
  const [selectedDay, setSelectedDay] = useState<Day | null>(null);
  const [saving, setSaving] = useState(false);

  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialTitle, setMaterialTitle] = useState("");
  const [materialUrl, setMaterialUrl] = useState("");

  const [courseStatus, setCourseStatus] = useState<string>("draft");
  const [submitting, setSubmitting] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function reloadDays() {
    return api.listCourseDays(courseId).then(setDays).catch(() => {});
  }

  useEffect(() => {
    if (loading) return;
    Promise.all([
      reloadDays(),
      api.listCourseMaterials(courseId).then(setMaterials).catch(() => {}),
      api.getCourseDetail(courseId).then(c => setCourseStatus(c.status)).catch(() => {}),
    ]).finally(() => setFetching(false));
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  async function handleSubmitForReview() {
    setSubmitting(true);
    try {
      await api.submitCourseForReview(courseId);
      setCourseStatus("review");
      toast("公開申請しました。運営の承認後に公開されます。", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "公開申請に失敗しました", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      await api.generateCourseDays(courseId);
      pollRef.current = setInterval(async () => {
        const status = await api.getCourseGenerationStatus(courseId);
        setGenProgress(status);
        if (status.status === "completed") {
          clearInterval(pollRef.current!);
          setGenerating(false);
          await reloadDays();
          toast("90日分のコンテンツを生成しました", "success");
        } else if (status.status === "failed") {
          clearInterval(pollRef.current!);
          setGenerating(false);
          toast(status.error || "生成に失敗しました", "error");
        }
      }, 4000);
    } catch (err: unknown) {
      setGenerating(false);
      toast(err instanceof Error ? err.message : "生成の開始に失敗しました", "error");
    }
  }

  async function handleSaveDay(updated: Partial<Day>) {
    if (!selectedDay) return;
    setSaving(true);
    try {
      const res = await api.updateCourseDay(courseId, selectedDay.day, {
        theme: updated.theme,
        tasks: updated.tasks,
        ai_message_morning: updated.ai_message?.morning,
        ai_message_evening: updated.ai_message?.evening_reminder,
        ai_message_completion: updated.ai_message?.completion,
        is_rest_day: updated.is_rest_day,
      });
      setDays(d => d.map(x => x.day === res.day ? res : x));
      setSelectedDay(null);
      toast(`Day${res.day}を更新しました`, "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "更新に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddMaterial(e: React.FormEvent) {
    e.preventDefault();
    if (!materialTitle.trim() || !materialUrl.trim()) return;
    try {
      const m = await api.addCourseMaterial(courseId, { type: "url", title: materialTitle.trim(), file_url: materialUrl.trim() });
      setMaterials(prev => [...prev, m]);
      setMaterialTitle("");
      setMaterialUrl("");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "追加に失敗しました", "error");
    }
  }

  async function handleDeleteMaterial(id: number) {
    try {
      await api.deleteCourseMaterial(id);
      setMaterials(prev => prev.filter(m => m.id !== id));
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "削除に失敗しました", "error");
    }
  }

  if (loading || fetching) return <Skeleton />;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="px-4 sm:px-6 py-4" style={{ background: "var(--primary)" }}>
        <h1 className="text-white font-black text-lg">90日カレンダー編集</h1>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        <div className="card flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold" style={{ color: "var(--muted)" }}>公開状態：</span>
            <span className="text-sm font-bold px-3 py-1 rounded-full" style={{
              background: courseStatus === "published" ? "var(--accent)" : courseStatus === "review" ? "#f5a623" : "var(--example-bg, #eee)",
              color: courseStatus === "published" || courseStatus === "review" ? "white" : "var(--muted)",
            }}>
              {courseStatus === "draft" && "下書き"}
              {courseStatus === "review" && "運営確認中"}
              {courseStatus === "published" && "公開中"}
              {courseStatus === "unpublished" && "非公開"}
            </span>
          </div>
          {courseStatus === "draft" && (
            <button className="btn-primary" disabled={submitting || days.length === 0} onClick={handleSubmitForReview}>
              {submitting ? "申請中…" : "公開申請する"}
            </button>
          )}
          {courseStatus === "review" && (
            <p className="text-xs" style={{ color: "var(--muted)" }}>運営の承認をお待ちください。承認後に公開されます。</p>
          )}
        </div>
        {days.length === 0 ? (
          <div className="card flex flex-col gap-3 items-start">
            <p className="text-sm" style={{ color: "var(--text)" }}>
              まだ90日分のコンテンツが生成されていません。クリエイターの人格プロファイルとコース基本情報からAIが自動生成します（数分かかります）。
            </p>
            <button className="btn-primary" disabled={generating} onClick={handleGenerate}>
              {generating ? "生成中…" : "90日分を生成する"}
            </button>
            {generating && genProgress && (
              <div className="w-full">
                <div className="h-2 rounded-full" style={{ background: "var(--example-bg, #eee)" }}>
                  <div className="h-2 rounded-full transition-all" style={{ background: "var(--accent)", width: `${Math.round((genProgress.days_done / genProgress.days_total) * 100)}%` }} />
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{genProgress.days_done}/{genProgress.days_total}日 生成済み</p>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                凡例：<span style={{ color: "var(--primary)" }}>■</span> AI生成済み
                <span style={{ color: "var(--accent)" }}>■</span> クリエイター編集済み
                <span style={{ color: "var(--muted)" }}>■</span> 休息日
              </p>
              <button className="btn-ghost text-xs" disabled={generating} onClick={handleGenerate}>
                {generating ? "再生成中…" : "↻ 全日を再生成する"}
              </button>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {days.map(d => (
                <button key={d.day} onClick={() => setSelectedDay(d)}
                  className="aspect-square rounded-lg flex flex-col items-center justify-center text-xs font-bold transition-shadow hover:shadow-md"
                  style={{
                    background: d.is_rest_day ? "var(--example-bg, #eee)" : d.is_edited_by_creator ? "var(--accent)" : "var(--primary)",
                    color: d.is_rest_day ? "var(--muted)" : "white",
                  }}>
                  Day{d.day}
                </button>
              ))}
            </div>

            <div className="card flex flex-col gap-3">
              <h2 className="font-bold" style={{ color: "var(--primary)" }}>参考資料</h2>
              {materials.length === 0 && <p className="text-xs" style={{ color: "var(--muted)" }}>まだ参考資料がありません。</p>}
              {materials.map(m => (
                <div key={m.id} className="flex items-center justify-between gap-2">
                  <a href={m.file_url} target="_blank" rel="noopener noreferrer" className="text-sm truncate" style={{ color: "var(--accent)" }}>{m.title}</a>
                  <button className="text-xs" style={{ color: "#c0392b" }} onClick={() => handleDeleteMaterial(m.id)}>削除</button>
                </div>
              ))}
              <form onSubmit={handleAddMaterial} className="flex gap-2 flex-wrap">
                <input value={materialTitle} onChange={e => setMaterialTitle(e.target.value)} placeholder="資料名" className="flex-1 min-w-[8rem]" />
                <input value={materialUrl} onChange={e => setMaterialUrl(e.target.value)} placeholder="https://..." className="flex-1 min-w-[8rem]" />
                <button type="submit" className="btn-ghost px-4">追加</button>
              </form>
            </div>
          </>
        )}
      </main>

      {selectedDay && (
        <DayEditPanel day={selectedDay} saving={saving} onClose={() => setSelectedDay(null)} onSave={handleSaveDay} />
      )}
    </div>
  );
}

function DayEditPanel({ day, saving, onClose, onSave }: { day: Day; saving: boolean; onClose: () => void; onSave: (updated: Partial<Day>) => void }) {
  const [theme, setTheme] = useState(day.theme ?? "");
  const [tasks, setTasks] = useState((day.tasks ?? []).join("\n"));
  const [morning, setMorning] = useState(day.ai_message.morning ?? "");
  const [evening, setEvening] = useState(day.ai_message.evening_reminder ?? "");
  const [completion, setCompletion] = useState(day.ai_message.completion ?? "");
  const [isRestDay, setIsRestDay] = useState(day.is_rest_day);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="card max-w-lg w-full max-h-[90vh] overflow-y-auto flex flex-col gap-3" style={{ background: "var(--card-bg, #fff)" }}>
        <div className="flex items-center justify-between">
          <h3 className="font-black text-lg" style={{ color: "var(--primary)" }}>Day{day.day}（第{day.week_number}週）</h3>
          <label className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
            <input type="checkbox" checked={isRestDay} onChange={e => setIsRestDay(e.target.checked)} />
            休息日
          </label>
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>日のテーマ</label>
          <input value={theme} onChange={e => setTheme(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>タスクリスト（1行1項目）</label>
          <textarea rows={4} value={tasks} onChange={e => setTasks(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>AIメッセージ（朝）</label>
          <textarea rows={2} value={morning} onChange={e => setMorning(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>AIメッセージ（夜リマインド）</label>
          <textarea rows={2} value={evening} onChange={e => setEvening(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>AIメッセージ（完了時）</label>
          <textarea rows={2} value={completion} onChange={e => setCompletion(e.target.value)} />
        </div>
        <div className="flex gap-3">
          <button className="btn-primary flex-1 text-center" disabled={saving} onClick={() => onSave({
            theme,
            tasks: tasks.split("\n").map(s => s.trim()).filter(Boolean),
            ai_message: { morning, evening_reminder: evening, completion },
            is_rest_day: isRestDay,
          })}>
            {saving ? "保存中…" : "保存する"}
          </button>
          <button className="btn-ghost px-6" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}
