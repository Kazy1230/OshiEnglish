"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { AppHeader } from "@/components/AppHeader";

type ChecklistItem = { text: string; minutes: number };
type Day = {
  id: number;
  day: number;
  week_number: number;
  theme: string | null;
  checklist_items: ChecklistItem[] | null;
  is_rest_day: boolean;
  is_edited_by_creator: boolean;
};

type Material = { id: number; type: string; title: string; file_url: string };
type QualityCheckItem = { key: string; label: string; score: number; max: number; level: "good" | "warning" | "critical"; feedback: string };
type QualityCheckResult = { score: number; max_score: number; recommendation: "publish" | "review"; items: QualityCheckItem[] };
type DiagnosisQuestion = { id: number; question_text: string; answer_type: "text" | "number" | "single" | "multi"; options: string[] | null; is_required: boolean };

const ANSWER_TYPE_LABEL: Record<string, string> = { text: "テキスト入力", number: "数値入力", single: "単一選択", multi: "複数選択" };

type QuestionTemplateItem = { question_text: string; answer_type: "text" | "number" | "single" | "multi"; options?: string[]; is_required: boolean; intent?: string };
const QUESTION_TEMPLATES: Record<string, { label: string; questions: QuestionTemplateItem[] }> = {
  toefl_itp: {
    label: "TOEFL ITP推奨セット",
    questions: [
      { question_text: "現在のTOEFL ITPスコアは？（未受験なら0）", answer_type: "number", is_required: true, intent: "現在地と目標のギャップを測り、Day1個人化プランの難易度調整に使われます。" },
      { question_text: "受験予定日はいつですか？", answer_type: "text", is_required: false, intent: "30日プランの後半に模試・総仕上げを配置するタイミング調整に使われます。" },
      { question_text: "苦手なセクションは？", answer_type: "single", options: ["Section 1 リスニング", "Section 2 文法", "Section 3 リーディング"], is_required: true, intent: "苦手分野に学習時間を多めに配分する個人化（Layer2）の根拠になります。" },
      { question_text: "過去に受験経験はありますか？", answer_type: "single", options: ["あり", "なし"], is_required: true },
      { question_text: "英語学習を始めてどのくらいですか？", answer_type: "single", options: ["半年未満", "半年〜1年", "1〜3年", "3年以上"], is_required: false },
    ],
  },
  general: {
    label: "汎用推奨セット",
    questions: [
      { question_text: "この学習で達成したい目標は？", answer_type: "text", is_required: true },
      { question_text: "1日あたり確保できる学習時間は？", answer_type: "single", options: ["30分未満", "30分〜1時間", "1〜2時間", "2時間以上"], is_required: true },
    ],
  },
};
const QUESTION_INTENT_BY_TEXT: Record<string, string> = Object.fromEntries(
  Object.values(QUESTION_TEMPLATES).flatMap(t => t.questions.map(q => [q.question_text, q.intent ?? ""])).filter(([, v]) => v)
);

const MINUTE_OPTIONS = [5, 10, 15, 20, 25, 30, 45, 60, 90];

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
  const [courseCategory, setCourseCategory] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkingQuality, setCheckingQuality] = useState(false);
  const [qualityCheck, setQualityCheck] = useState<QualityCheckResult | null>(null);

  const [diagnosisQuestions, setDiagnosisQuestions] = useState<DiagnosisQuestion[]>([]);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [newQuestionText, setNewQuestionText] = useState("");
  const [newQuestionType, setNewQuestionType] = useState<DiagnosisQuestion["answer_type"]>("text");
  const [newQuestionOptions, setNewQuestionOptions] = useState("");
  const [newQuestionRequired, setNewQuestionRequired] = useState(true);
  const [savingQuestion, setSavingQuestion] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function reloadDays() {
    return api.listCourseDays(courseId).then(setDays).catch(() => {});
  }

  useEffect(() => {
    if (loading) return;
    Promise.all([
      reloadDays(),
      api.listCourseMaterials(courseId).then(setMaterials).catch(() => {}),
      api.getCourseDetail(courseId).then(c => { setCourseStatus(c.status); setCourseCategory(c.category ?? null); }).catch(() => {}),
      api.listDiagnosisQuestions(courseId).then(setDiagnosisQuestions).catch(() => {}),
    ]).finally(() => setFetching(false));
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  async function handleSubmitForReview() {
    setSubmitting(true);
    try {
      await api.submitCourseForReview(courseId);
      setCourseStatus("review");
      setQualityCheck(null);
      toast("公開申請しました。運営の承認後に公開されます。", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "公開申請に失敗しました", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOpenQualityCheck() {
    setCheckingQuality(true);
    try {
      setQualityCheck(await api.getCourseQualityCheck(courseId));
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "品質チェックに失敗しました", "error");
    } finally {
      setCheckingQuality(false);
    }
  }

  async function handleApplyTemplate(key: string) {
    const template = QUESTION_TEMPLATES[key];
    if (!template) return;
    setApplyingTemplate(true);
    try {
      const questions = template.questions.map(({ intent, ...q }) => { void intent; return q; });
      const added = await api.addDiagnosisQuestionsBulk(courseId, questions);
      setDiagnosisQuestions(prev => [...prev, ...added]);
      toast(`「${template.label}」を追加しました`, "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "追加に失敗しました", "error");
    } finally {
      setApplyingTemplate(false);
    }
  }

  async function handleAddQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!newQuestionText.trim()) return;
    const options = newQuestionOptions.split("\n").map(s => s.trim()).filter(Boolean);
    if ((newQuestionType === "single" || newQuestionType === "multi") && options.length === 0) {
      toast("単一選択・複数選択の場合は選択肢を入力してください", "error");
      return;
    }
    setSavingQuestion(true);
    try {
      const added = await api.addDiagnosisQuestion(courseId, {
        question_text: newQuestionText.trim(),
        answer_type: newQuestionType,
        options: options.length > 0 ? options : null,
        is_required: newQuestionRequired,
      });
      setDiagnosisQuestions(prev => [...prev, added]);
      setNewQuestionText(""); setNewQuestionOptions("");
      setNewQuestionType("text"); setNewQuestionRequired(true);
      toast("質問を追加しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "追加に失敗しました", "error");
    } finally {
      setSavingQuestion(false);
    }
  }

  async function handleDeleteQuestion(id: number) {
    if (!confirm("この質問を削除しますか？")) return;
    try {
      await api.deleteDiagnosisQuestion(id);
      setDiagnosisQuestions(prev => prev.filter(q => q.id !== id));
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "削除に失敗しました", "error");
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenProgress(null);
    try {
      await api.generateCourseDays(courseId);
      pollRef.current = setInterval(async () => {
        const s = await api.getCourseGenerationStatus(courseId);
        setGenProgress(s);
        if (s.status === "completed") {
          clearInterval(pollRef.current!);
          setGenerating(false);
          await reloadDays();
          toast("30日分のコンテンツを生成しました ✅", "success");
        } else if (s.status === "failed") {
          clearInterval(pollRef.current!);
          setGenerating(false);
          toast(s.error || "生成に失敗しました", "error");
        }
      }, 4000);
    } catch (err: unknown) {
      setGenerating(false);
      toast(err instanceof Error ? err.message : "生成の開始に失敗しました", "error");
    }
  }

  async function handleSaveDay(dayNumber: number, data: { theme: string; checklist_items: ChecklistItem[]; is_rest_day: boolean }) {
    setSaving(true);
    try {
      const res = await api.updateCourseDay(courseId, dayNumber, {
        theme: data.theme,
        checklist_items: data.checklist_items,
        is_rest_day: data.is_rest_day,
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
      setMaterialTitle(""); setMaterialUrl("");
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

  // Week grouping: days 1-7 = week1, 8-14 = week2, etc.
  const weeks: Day[][] = [];
  for (let w = 0; w < 5; w++) {
    const slice = days.filter(d => d.day > w * 7 && d.day <= (w + 1) * 7);
    if (slice.length > 0) weeks.push(slice);
  }

  const unsetDays = days.filter(d => !d.is_rest_day && (!d.checklist_items || d.checklist_items.length === 0)).length;
  const completedPct = days.length > 0 ? Math.round(((days.length - unsetDays) / days.length) * 100) : 0;

  if (loading || fetching) return <Skeleton />;

  return (
    <div className="creator-theme min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" title="30日カレンダー" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">

        {/* Status bar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <StatusBadge status={courseStatus} />
          <div className="flex items-center gap-2">
            {courseStatus === "draft" && days.length > 0 && (
              <button className="btn-ghost text-xs" disabled={generating} onClick={handleGenerate}>
                {generating ? "再生成中…" : "↻ 全日を再生成"}
              </button>
            )}
            {courseStatus === "draft" && (
              <button
                className="btn-primary text-sm"
                disabled={checkingQuality || days.length === 0}
                onClick={handleOpenQualityCheck}
              >
                {checkingQuality ? "チェック中…" : "公開申請する"}
              </button>
            )}
            {courseStatus === "review" && (
              <span className="text-xs" style={{ color: "var(--muted)" }}>運営審査中 — 承認後に公開されます</span>
            )}
          </div>
        </div>

        {/* Generate card (no days yet) */}
        {days.length === 0 && (
          <div className="card flex flex-col gap-4" style={{ borderColor: "var(--accent)", borderWidth: 1.5 }}>
            <div>
              <p className="font-black text-base" style={{ color: "var(--primary)" }}>30日カリキュラムを生成する</p>
              <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                教材プランと人格プロファイルをもとに、AIが30日分のテーマ・タスク構成を自動生成します。目安は数十秒〜数分です。
              </p>
            </div>
            {generating && genProgress && (
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-xs mb-0.5" style={{ color: "var(--muted)" }}>
                  <span>生成中… {genProgress.days_done}/{genProgress.days_total}日</span>
                  <span>{Math.round((genProgress.days_done / genProgress.days_total) * 100)}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ background: "linear-gradient(90deg, var(--accent), #38b2ac)", width: `${Math.round((genProgress.days_done / genProgress.days_total) * 100)}%` }} />
                </div>
              </div>
            )}
            <button className="btn-primary self-start" disabled={generating} onClick={handleGenerate}>
              {generating ? "生成中…" : "✨ 生成する"}
            </button>
          </div>
        )}

        {/* Calendar */}
        {days.length > 0 && (
          <>
            {/* Legend + progress */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 text-xs flex-wrap" style={{ color: "var(--muted)" }}>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "var(--primary)" }} />AI生成</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "var(--accent)" }} />編集済み</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "var(--border)" }} />休息日</span>
                {unsetDays > 0 && <span className="font-bold" style={{ color: "#e53e3e" }}>⚠ {unsetDays}日 タスク未設定</span>}
              </div>
              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
                <div className="w-28 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                  <div className="h-full rounded-full" style={{ background: "var(--accent)", width: `${completedPct}%` }} />
                </div>
                <span>{completedPct}% 設定済み</span>
              </div>
            </div>

            {/* Week rows */}
            <div className="flex flex-col gap-3">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex items-stretch gap-2">
                  <div className="flex-shrink-0 w-14 flex items-center justify-center text-xs font-bold rounded-xl"
                    style={{ background: "var(--card)", color: "var(--muted)", border: "1px solid var(--border)" }}>
                    W{wi + 1}
                  </div>
                  <div className="flex-1 grid gap-2" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
                    {Array.from({ length: 7 }, (_, di) => {
                      const d = week[di];
                      if (!d) return <div key={di} />;
                      const noTask = !d.is_rest_day && (!d.checklist_items || d.checklist_items.length === 0);
                      const totalMin = d.checklist_items?.reduce((s, item) => s + item.minutes, 0) ?? 0;
                      const bg = d.is_rest_day
                        ? "var(--border)"
                        : d.is_edited_by_creator
                          ? "var(--accent)"
                          : "var(--primary)";
                      const textColor = d.is_rest_day ? "var(--muted)" : "white";
                      return (
                        <button
                          key={d.day}
                          onClick={() => setSelectedDay(d)}
                          className="relative rounded-xl flex flex-col items-center justify-start pt-2 pb-1.5 px-1 gap-1 transition-all hover:scale-[1.04] hover:shadow-lg"
                          style={{
                            background: bg,
                            color: textColor,
                            minHeight: 72,
                            outline: noTask ? "2px solid #e53e3e" : "none",
                            outlineOffset: 2,
                          }}
                        >
                          <span className="text-[11px] font-black leading-none">{d.day}</span>
                          {d.is_rest_day
                            ? <span className="text-[10px] mt-0.5 opacity-70">休</span>
                            : (
                              <>
                                {d.checklist_items && d.checklist_items.length > 0 && (
                                  <span className="text-[9px] leading-none opacity-90">
                                    {d.checklist_items.length}項目
                                  </span>
                                )}
                                {totalMin > 0 && (
                                  <span className="text-[9px] leading-none opacity-75">{totalMin}分</span>
                                )}
                                {d.theme && (
                                  <span className="text-[9px] leading-tight opacity-80 text-center line-clamp-2 px-0.5">{d.theme}</span>
                                )}
                              </>
                            )
                          }
                          {noTask && (
                            <span className="absolute -top-1 -right-1 text-[10px] leading-none">🔴</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Day1 diagnosis questions */}
        <section className="card flex flex-col gap-3">
          <div>
            <h2 className="font-black text-sm" style={{ color: "var(--primary)" }}>Day1 診断 — カスタム質問</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              申込み時のDay1診断で学習者が答える、このコース独自の質問です。
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(QUESTION_TEMPLATES).map(([key, t]) => {
              const recommended = key === "toefl_itp" && !!courseCategory?.toUpperCase().includes("TOEFL");
              return (
                <button key={key} type="button" className="btn-ghost text-xs" disabled={applyingTemplate} onClick={() => handleApplyTemplate(key)}>
                  ＋ {t.label}{recommended ? " ⭐" : ""}
                </button>
              );
            })}
          </div>

          {diagnosisQuestions.length > 0 && (
            <div className="flex flex-col gap-2">
              {diagnosisQuestions.map((q, i) => (
                <div key={q.id} className="flex items-start justify-between gap-3 px-3 py-2.5 rounded-xl" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full" style={{ background: "color-mix(in srgb, var(--primary) 12%, transparent)", color: "var(--primary)" }}>Q{i + 1}</span>
                      {q.is_required && <span className="text-[10px] font-bold" style={{ color: "var(--accent)" }}>必須</span>}
                      <span className="text-[10px]" style={{ color: "var(--muted)" }}>{ANSWER_TYPE_LABEL[q.answer_type]}</span>
                      {QUESTION_INTENT_BY_TEXT[q.question_text] && (
                        <span className="text-[10px] cursor-help" title={QUESTION_INTENT_BY_TEXT[q.question_text]} style={{ color: "var(--muted)" }}>ℹ</span>
                      )}
                    </div>
                    <p className="text-sm mt-1" style={{ color: "var(--text)" }}>{q.question_text}</p>
                    {q.options && <p className="text-[10px] mt-0.5" style={{ color: "var(--muted)" }}>{q.options.join(" / ")}</p>}
                  </div>
                  <button className="text-xs flex-shrink-0 mt-0.5" style={{ color: "var(--muted)" }} onClick={() => handleDeleteQuestion(q.id)}>削除</button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleAddQuestion} className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
            <p className="text-xs font-bold" style={{ color: "var(--muted)" }}>質問を手動追加</p>
            <input value={newQuestionText} onChange={e => setNewQuestionText(e.target.value)} placeholder="質問文を入力" />
            <div className="flex gap-2 items-center flex-wrap">
              <select value={newQuestionType} onChange={e => setNewQuestionType(e.target.value as DiagnosisQuestion["answer_type"])} className="text-sm">
                {Object.entries(ANSWER_TYPE_LABEL).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
              <label className="text-xs flex items-center gap-1" style={{ color: "var(--muted)" }}>
                <input type="checkbox" checked={newQuestionRequired} onChange={e => setNewQuestionRequired(e.target.checked)} />
                必須
              </label>
            </div>
            {(newQuestionType === "single" || newQuestionType === "multi") && (
              <textarea rows={3} value={newQuestionOptions} onChange={e => setNewQuestionOptions(e.target.value)} placeholder={"選択肢を1行ずつ入力"} />
            )}
            <button type="submit" className="btn-primary self-start text-sm" disabled={savingQuestion}>{savingQuestion ? "追加中…" : "追加する"}</button>
          </form>
        </section>

        {/* Reference materials */}
        <section className="card flex flex-col gap-3">
          <h2 className="font-black text-sm" style={{ color: "var(--primary)" }}>参考資料</h2>
          {materials.length === 0
            ? <p className="text-xs" style={{ color: "var(--muted)" }}>参考資料はまだありません。</p>
            : (
              <div className="flex flex-col gap-2">
                {materials.map(m => (
                  <div key={m.id} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                    <a href={m.file_url} target="_blank" rel="noopener noreferrer" className="flex-1 text-sm truncate" style={{ color: "var(--accent)" }}>{m.title}</a>
                    <button className="text-xs flex-shrink-0" style={{ color: "var(--muted)" }} onClick={() => handleDeleteMaterial(m.id)}>削除</button>
                  </div>
                ))}
              </div>
            )
          }
          <form onSubmit={handleAddMaterial} className="flex gap-2 flex-wrap pt-1">
            <input value={materialTitle} onChange={e => setMaterialTitle(e.target.value)} placeholder="資料名" className="flex-1 min-w-[7rem] text-sm" />
            <input value={materialUrl} onChange={e => setMaterialUrl(e.target.value)} placeholder="https://..." className="flex-1 min-w-[10rem] text-sm" />
            <button type="submit" className="btn-ghost px-4 text-sm">追加</button>
          </form>
        </section>
      </main>

      {/* Day drawer */}
      <DayDrawer
        day={selectedDay}
        saving={saving}
        onClose={() => setSelectedDay(null)}
        onSave={handleSaveDay}
      />

      {/* Quality check modal */}
      {qualityCheck && (
        <QualityCheckModal
          result={qualityCheck}
          submitting={submitting}
          onPublishAnyway={handleSubmitForReview}
          onImprove={() => setQualityCheck(null)}
        />
      )}
    </div>
  );
}

/* ── Status badge ─────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    draft:       { label: "下書き",     bg: "var(--border)",  color: "var(--muted)" },
    review:      { label: "運営確認中", bg: "#f5a623",        color: "white" },
    published:   { label: "公開中",     bg: "var(--accent)",  color: "white" },
    unpublished: { label: "非公開",     bg: "var(--border)",  color: "var(--muted)" },
  };
  const m = map[status] ?? map.draft;
  return (
    <span className="text-xs font-black px-3 py-1.5 rounded-full" style={{ background: m.bg, color: m.color }}>{m.label}</span>
  );
}

/* ── Day Drawer (right-side slide panel) ──────────────── */
function DayDrawer({
  day, saving, onClose, onSave,
}: {
  day: Day | null;
  saving: boolean;
  onClose: () => void;
  onSave: (dayNumber: number, data: { theme: string; checklist_items: ChecklistItem[]; is_rest_day: boolean }) => void;
}) {
  const [theme, setTheme] = useState("");
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [isRestDay, setIsRestDay] = useState(false);
  const [newItemText, setNewItemText] = useState("");
  const [newItemMinutes, setNewItemMinutes] = useState(30);

  useEffect(() => {
    if (day) {
      setTheme(day.theme ?? "");
      setChecklistItems(day.checklist_items ?? []);
      setIsRestDay(day.is_rest_day);
      setNewItemText("");
      setNewItemMinutes(30);
    }
  }, [day]);

  if (!day) return null;

  function addItem() {
    if (!newItemText.trim()) return;
    setChecklistItems(prev => [...prev, { text: newItemText.trim(), minutes: newItemMinutes }]);
    setNewItemText("");
    setNewItemMinutes(30);
  }

  function removeItem(index: number) {
    setChecklistItems(prev => prev.filter((_, i) => i !== index));
  }

  const totalMin = checklistItems.reduce((s, item) => s + item.minutes, 0);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />
      {/* Drawer */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 flex flex-col"
        style={{
          width: "min(440px, 100vw)",
          background: "var(--card)",
          borderLeft: "1px solid var(--border)",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.15)",
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <p className="text-xs font-bold" style={{ color: "var(--muted)" }}>第{day.week_number}週</p>
            <h3 className="text-2xl font-black" style={{ color: "var(--primary)" }}>Day {day.day}</h3>
          </div>
          <button onClick={onClose} className="text-xl leading-none mt-1" style={{ color: "var(--muted)" }}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          {/* Rest day toggle */}
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm font-bold" style={{ color: "var(--text)" }}>休息日にする</span>
            <button
              type="button"
              role="switch"
              aria-checked={isRestDay}
              onClick={() => setIsRestDay(v => !v)}
              className="relative w-11 h-6 rounded-full transition-colors"
              style={{ background: isRestDay ? "var(--accent)" : "var(--border)" }}
            >
              <span
                className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform"
                style={{ transform: isRestDay ? "translateX(20px)" : "translateX(0)" }}
              />
            </button>
          </label>

          {!isRestDay && (
            <>
              {/* Theme */}
              <div>
                <label className="text-xs font-bold block mb-1.5" style={{ color: "var(--muted)" }}>
                  今日のテーマ <span className="font-normal">（15文字以内）</span>
                </label>
                <input
                  value={theme}
                  onChange={e => setTheme(e.target.value.slice(0, 15))}
                  maxLength={15}
                  placeholder="例：リスニング強化日"
                />
                <p className="text-right text-[10px] mt-0.5" style={{ color: "var(--muted)" }}>{theme.length}/15</p>
              </div>

              {/* Checklist items */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold" style={{ color: "var(--muted)" }}>
                    今日のチェックリスト
                    {totalMin > 0 && (
                      <span className="ml-2 font-normal" style={{ color: totalMin > 90 ? "#e53e3e" : "var(--accent)" }}>
                        合計 {totalMin}分{totalMin > 90 ? " — 負荷高め" : ""}
                      </span>
                    )}
                  </p>
                </div>

                {/* Add new item */}
                <div className="flex gap-2 flex-wrap items-center">
                  <input
                    value={newItemText}
                    onChange={e => setNewItemText(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
                    placeholder="タスクを入力"
                    className="flex-1 min-w-0 text-sm"
                    style={{ minWidth: 120 }}
                  />
                  <select
                    value={newItemMinutes}
                    onChange={e => setNewItemMinutes(Number(e.target.value))}
                    className="text-sm w-24 flex-shrink-0"
                  >
                    {MINUTE_OPTIONS.map(m => (
                      <option key={m} value={m}>{m}分</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={addItem}
                    disabled={!newItemText.trim()}
                    className="btn-primary text-sm px-4 flex-shrink-0 disabled:opacity-40"
                  >
                    ＋追加
                  </button>
                </div>

                {/* Item list */}
                {checklistItems.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {checklistItems.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                        style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
                      >
                        <span className="text-xs flex-shrink-0" style={{ color: "var(--muted)" }}>・</span>
                        <span className="flex-1 text-sm" style={{ color: "var(--text)" }}>{item.text}</span>
                        <span className="text-xs font-bold flex-shrink-0 px-2 py-0.5 rounded-full" style={{ background: "var(--border)", color: "var(--muted)" }}>{item.minutes}分</span>
                        <button
                          type="button"
                          onClick={() => removeItem(i)}
                          className="flex-shrink-0 text-sm font-bold leading-none px-1"
                          style={{ color: "var(--muted)" }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs" style={{ color: "var(--muted)" }}>チェックリスト項目がありません。上のフォームから追加してください。</p>
                )}
              </div>
            </>
          )}

          <p className="text-xs" style={{ color: "var(--muted)" }}>
            ※ 学習者ごとの個別配分はDay1診断完了時に自動生成されます。ここで編集するのは全員共通の骨格です。
          </p>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-5" style={{ borderTop: "1px solid var(--border)" }}>
          <button className="btn-ghost flex-1" onClick={onClose}>キャンセル</button>
          <button
            className="btn-primary flex-1"
            disabled={saving}
            onClick={() => onSave(day.day, {
              theme,
              checklist_items: isRestDay ? [] : checklistItems,
              is_rest_day: isRestDay,
            })}
          >
            {saving ? "保存中…" : "保存する"}
          </button>
        </div>
      </div>
    </>
  );
}

/* ── Quality check modal ──────────────────────────────── */
const LEVEL_META: Record<QualityCheckItem["level"], { icon: string; color: string }> = {
  good:     { icon: "✅", color: "#2f9e64" },
  warning:  { icon: "🟡", color: "#f5a623" },
  critical: { icon: "🔴", color: "#e53e3e" },
};

function QualityCheckModal({
  result, submitting, onPublishAnyway, onImprove,
}: {
  result: QualityCheckResult;
  submitting: boolean;
  onPublishAnyway: () => void;
  onImprove: () => void;
}) {
  const needsImprovement = result.items.filter(i => i.level !== "good");
  const scorePct = Math.round((result.score / result.max_score) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}>
      <div className="max-w-md w-full max-h-[90vh] overflow-y-auto flex flex-col gap-5 rounded-2xl p-6" style={{ background: "var(--card)", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        {/* Score hero */}
        <div className="flex items-center gap-5">
          <div className="relative w-20 h-20 flex-shrink-0">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.9" fill="none"
                stroke={scorePct >= 80 ? "#2f9e64" : scorePct >= 60 ? "#f5a623" : "#e53e3e"}
                strokeWidth="3"
                strokeDasharray={`${scorePct} ${100 - scorePct}`}
                strokeDashoffset="0"
                strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-black leading-none" style={{ color: "var(--primary)" }}>{result.score}</span>
              <span className="text-[9px] font-bold" style={{ color: "var(--muted)" }}>/{result.max_score}</span>
            </div>
          </div>
          <div>
            <p className="font-black text-base" style={{ color: "var(--primary)" }}>コース品質チェック</p>
            <p className="text-sm mt-0.5 font-bold" style={{ color: result.recommendation === "publish" ? "#2f9e64" : "#f5a623" }}>
              {result.recommendation === "publish" ? "✅ このまま公開できます" : "🟡 いくつか改善すると◎"}
            </p>
          </div>
        </div>

        {/* Item bars */}
        <div className="flex flex-col gap-3">
          {result.items.map(item => (
            <div key={item.key}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-bold" style={{ color: "var(--text)" }}>{LEVEL_META[item.level].icon} {item.label}</span>
                <span style={{ color: "var(--muted)" }}>{item.score}/{item.max}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                <div className="h-full rounded-full transition-all" style={{ background: LEVEL_META[item.level].color, width: `${(item.score / item.max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Feedback */}
        {needsImprovement.length > 0 && (
          <div className="flex flex-col gap-2 p-4 rounded-xl" style={{ background: "var(--bg)" }}>
            <p className="text-xs font-black" style={{ color: "var(--muted)" }}>改善ポイント</p>
            {needsImprovement.map(item => (
              <p key={item.key} className="text-xs" style={{ color: "var(--text)" }}>
                {LEVEL_META[item.level].icon} <span className="font-bold">{item.label}</span>：{item.feedback}
              </p>
            ))}
          </div>
        )}

        <p className="text-[10px]" style={{ color: "var(--muted)" }}>※ この点数はシステム的な基準で、コースの独自性・価値は評価対象外です。</p>

        <div className="flex gap-3">
          <button className="btn-ghost flex-1" onClick={onImprove}>改善する</button>
          <button className="btn-primary flex-1" disabled={submitting} onClick={onPublishAnyway}>
            {submitting ? "申請中…" : "このまま公開する"}
          </button>
        </div>
      </div>
    </div>
  );
}
