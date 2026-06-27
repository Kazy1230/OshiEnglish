"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { AppHeader } from "@/components/AppHeader";

type TaskType = { type: string; label: string; base_minutes: number };
type Day = {
  id: number;
  day: number;
  week_number: number;
  theme: string | null;
  task_types: TaskType[] | null;
  is_rest_day: boolean;
  is_edited_by_creator: boolean;
};

const TASK_TYPE_OPTIONS = [
  { type: "vocabulary", label: "単語学習" },
  { type: "listening", label: "リスニング練習" },
  { type: "grammar", label: "文法確認" },
  { type: "reading", label: "リーディング" },
  { type: "shadowing", label: "シャドーイング" },
  { type: "practice", label: "演習" },
];

type Material = { id: number; type: string; title: string; file_url: string };
type QualityCheckItem = { key: string; label: string; score: number; max: number; level: "good" | "warning" | "critical"; feedback: string };
type QualityCheckResult = { score: number; max_score: number; recommendation: "publish" | "review"; items: QualityCheckItem[] };
type DiagnosisQuestion = { id: number; question_text: string; answer_type: "text" | "number" | "single" | "multi"; options: string[] | null; is_required: boolean };

const ANSWER_TYPE_LABEL: Record<string, string> = { text: "テキスト入力", number: "数値入力", single: "単一選択", multi: "複数選択" };

type QuestionTemplateItem = { question_text: string; answer_type: "text" | "number" | "single" | "multi"; options?: string[]; is_required: boolean };
const QUESTION_TEMPLATES: Record<string, { label: string; questions: QuestionTemplateItem[] }> = {
  toefl_itp: {
    label: "TOEFL ITP推奨質問セット",
    questions: [
      { question_text: "現在のTOEFL ITPスコアは？（未受験なら0）", answer_type: "number", is_required: true },
      { question_text: "受験予定日はいつですか？", answer_type: "text", is_required: false },
      { question_text: "苦手なセクションは？", answer_type: "single", options: ["Section 1 リスニング", "Section 2 文法", "Section 3 リーディング"], is_required: true },
      { question_text: "過去に受験経験はありますか？", answer_type: "single", options: ["あり", "なし"], is_required: true },
      { question_text: "英語学習を始めてどのくらいですか？", answer_type: "single", options: ["半年未満", "半年〜1年", "1〜3年", "3年以上"], is_required: false },
    ],
  },
  general: {
    label: "汎用推奨質問セット",
    questions: [
      { question_text: "この学習で達成したい目標は？", answer_type: "text", is_required: true },
      { question_text: "1日あたり確保できる学習時間は？", answer_type: "single", options: ["30分未満", "30分〜1時間", "1〜2時間", "2時間以上"], is_required: true },
    ],
  },
};

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
      api.getCourseDetail(courseId).then(c => setCourseStatus(c.status)).catch(() => {}),
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
      for (const q of template.questions) {
        const added = await api.addDiagnosisQuestion(courseId, q);
        setDiagnosisQuestions(prev => [...prev, added]);
      }
      toast(`「${template.label}」を追加しました`, "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "テンプレートの追加に失敗しました", "error");
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
      setNewQuestionText("");
      setNewQuestionOptions("");
      setNewQuestionType("text");
      setNewQuestionRequired(true);
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
    try {
      await api.generateCourseDays(courseId);
      pollRef.current = setInterval(async () => {
        const status = await api.getCourseGenerationStatus(courseId);
        setGenProgress(status);
        if (status.status === "completed") {
          clearInterval(pollRef.current!);
          setGenerating(false);
          await reloadDays();
          toast("30日分のコンテンツを生成しました。各日を編集するか、このままで良ければ上部の「公開申請する」から運営の審査に進めます。", "success");
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
        task_types: updated.task_types,
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
      <AppHeader role="creator" backHref="/creator/courses" backLabel="作成したコース" title="30日カレンダー編集" />

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
            <button className="btn-primary" disabled={checkingQuality || days.length === 0} onClick={handleOpenQualityCheck}>
              {checkingQuality ? "チェック中…" : "公開申請する"}
            </button>
          )}
          {courseStatus === "review" && (
            <p className="text-xs" style={{ color: "var(--muted)" }}>運営の承認をお待ちください。承認後に公開されます。</p>
          )}
        </div>
        {days.length === 0 ? (
          <div className="card flex flex-col gap-3 items-start">
            <p className="text-sm" style={{ color: "var(--text)" }}>
              まだ30日分のコンテンツが生成されていません。クリエイターの人格プロファイルとコース基本情報からAIが自動生成します（数分かかります）。
            </p>
            <button className="btn-primary" disabled={generating} onClick={handleGenerate}>
              {generating ? "生成中…" : "30日分を生成する"}
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

            <div className="card flex flex-col gap-3">
              <h2 className="font-bold" style={{ color: "var(--primary)" }}>Day1診断のカスタム質問</h2>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                学習者がコース申込み時のDay1診断で答える、このコース独自の質問です。何を聞けばいいか迷ったら、下のテンプレートから追加できます。
              </p>

              <div className="flex gap-2 flex-wrap">
                {Object.entries(QUESTION_TEMPLATES).map(([key, t]) => (
                  <button
                    key={key}
                    type="button"
                    className="btn-ghost text-xs"
                    disabled={applyingTemplate}
                    onClick={() => handleApplyTemplate(key)}
                  >
                    ＋ {t.label}を追加
                  </button>
                ))}
              </div>

              {diagnosisQuestions.length > 0 && (
                <div className="flex flex-col gap-2">
                  {diagnosisQuestions.map(q => (
                    <div key={q.id} className="flex items-start justify-between gap-2 text-sm p-2 rounded-lg" style={{ background: "var(--example-bg, #eee)" }}>
                      <div>
                        <p style={{ color: "var(--text)" }}>{q.question_text} {q.is_required && <span className="text-[10px] font-bold" style={{ color: "var(--accent)" }}>必須</span>}</p>
                        <p className="text-xs" style={{ color: "var(--muted)" }}>
                          {ANSWER_TYPE_LABEL[q.answer_type]}{q.options ? `（${q.options.join("／")}）` : ""}
                        </p>
                      </div>
                      <button className="text-xs flex-shrink-0" style={{ color: "#c0392b" }} onClick={() => handleDeleteQuestion(q.id)}>削除</button>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={handleAddQuestion} className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                <input value={newQuestionText} onChange={e => setNewQuestionText(e.target.value)} placeholder="質問文" />
                <div className="flex gap-2 flex-wrap items-center">
                  <select value={newQuestionType} onChange={e => setNewQuestionType(e.target.value as DiagnosisQuestion["answer_type"])}>
                    {Object.entries(ANSWER_TYPE_LABEL).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                  </select>
                  <label className="text-xs flex items-center gap-1" style={{ color: "var(--muted)" }}>
                    <input type="checkbox" checked={newQuestionRequired} onChange={e => setNewQuestionRequired(e.target.checked)} />
                    必須にする
                  </label>
                </div>
                {(newQuestionType === "single" || newQuestionType === "multi") && (
                  <textarea
                    rows={3}
                    value={newQuestionOptions}
                    onChange={e => setNewQuestionOptions(e.target.value)}
                    placeholder={"選択肢を1行に1つずつ入力してください"}
                  />
                )}
                <button type="submit" className="btn-primary self-start" disabled={savingQuestion}>{savingQuestion ? "追加中…" : "質問を追加する"}</button>
              </form>
            </div>
          </>
        )}
      </main>

      {selectedDay && (
        <DayEditPanel day={selectedDay} saving={saving} onClose={() => setSelectedDay(null)} onSave={handleSaveDay} />
      )}

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

const LEVEL_META: Record<QualityCheckItem["level"], { icon: string; color: string }> = {
  good: { icon: "✅", color: "#2f9e64" },
  warning: { icon: "🟡", color: "#f5a623" },
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="card max-w-lg w-full max-h-[90vh] overflow-y-auto flex flex-col gap-4" style={{ background: "var(--card-bg, #fff)" }}>
        <div>
          <p className="font-black text-lg" style={{ color: "var(--primary)" }}>📊 コース品質チェック</p>
          <p className="text-2xl font-black mt-1" style={{ color: "var(--accent)" }}>{result.score}点 / {result.max_score}点</p>
          <p className="text-xs font-bold mt-1" style={{ color: result.recommendation === "publish" ? "#2f9e64" : "#f5a623" }}>
            {result.recommendation === "publish" ? "推奨：このまま公開できます" : "推奨：いくつか改善してから公開しましょう"}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {result.items.map(item => (
            <div key={item.key}>
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: "var(--text)" }}>{LEVEL_META[item.level].icon} {item.label}</span>
                <span className="font-bold" style={{ color: "var(--muted)" }}>{item.score}/{item.max}</span>
              </div>
              <div className="h-1.5 rounded-full mt-1" style={{ background: "var(--example-bg, #eee)" }}>
                <div className="h-1.5 rounded-full" style={{ background: LEVEL_META[item.level].color, width: `${(item.score / item.max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>

        {needsImprovement.length > 0 && (
          <div className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
            <p className="text-xs font-bold" style={{ color: "var(--muted)" }}>改善提案</p>
            {needsImprovement.map(item => (
              <p key={item.key} className="text-sm" style={{ color: "var(--text)" }}>
                {LEVEL_META[item.level].icon} <span className="font-bold">{item.label}</span>：{item.feedback}
              </p>
            ))}
          </div>
        )}

        <p className="text-xs" style={{ color: "var(--muted)" }}>
          ※ この点数は目安です。コースの独自性まで評価できるものではありません。
        </p>

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

function DayEditPanel({ day, saving, onClose, onSave }: { day: Day; saving: boolean; onClose: () => void; onSave: (updated: Partial<Day>) => void }) {
  const [theme, setTheme] = useState(day.theme ?? "");
  const [taskTypes, setTaskTypes] = useState<TaskType[]>(day.task_types ?? []);
  const [isRestDay, setIsRestDay] = useState(day.is_rest_day);

  function updateMinutes(type: string, minutes: number) {
    setTaskTypes(prev => prev.map(t => t.type === type ? { ...t, base_minutes: minutes } : t));
  }

  function toggleTaskType(opt: { type: string; label: string }) {
    setTaskTypes(prev =>
      prev.some(t => t.type === opt.type)
        ? prev.filter(t => t.type !== opt.type)
        : [...prev, { type: opt.type, label: opt.label, base_minutes: 15 }]
    );
  }

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
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>日のテーマ（15文字以内）</label>
          <input value={theme} onChange={e => setTheme(e.target.value.slice(0, 15))} maxLength={15} />
        </div>
        {!isRestDay && (
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>タスク種別と標準学習時間</label>
            <div className="flex flex-col gap-2">
              {TASK_TYPE_OPTIONS.map(opt => {
                const current = taskTypes.find(t => t.type === opt.type);
                return (
                  <div key={opt.type} className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm flex-1" style={{ color: "var(--text)" }}>
                      <input type="checkbox" checked={!!current} onChange={() => toggleTaskType(opt)} />
                      {opt.label}
                    </label>
                    {current && (
                      <input
                        type="number"
                        min={5}
                        max={120}
                        value={current.base_minutes}
                        onChange={e => updateMinutes(opt.type, Number(e.target.value))}
                        className="w-20"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          ※ 学習者ごとの個別タスク配分（個人化プラン）はDay1診断完了時に自動生成されます。ここで編集できるのは全学習者共通の骨格です。
        </p>
        <div className="flex gap-3">
          <button className="btn-primary flex-1 text-center" disabled={saving} onClick={() => onSave({
            theme,
            task_types: isRestDay ? [] : taskTypes.map(({ type, label, base_minutes }) => ({ type, label, base_minutes })),
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
