"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { AppHeader } from "@/components/AppHeader";

type TextbookSearchResult = { id: number; name: string; publisher: string | null; type: string; target: string | null; toc: { item: string }[] | null };
type DayAssignment = { toc_item: string; day_number: number | null };
type CourseTextbookEntry = {
  id: number;
  course_id: number;
  textbook_id: number | null;
  name: string;
  type: string;
  daily_words: number | null;
  review_words: number | null;
  target_laps: number;
  day_assignments: DayAssignment[];
};

function buildStudyMaterialsSummary(textbooks: CourseTextbookEntry[]): string {
  return textbooks.map(t => {
    const total = t.day_assignments.length;
    const assignedCount = t.day_assignments.filter(a => a.day_number != null).length;
    let line = `「${t.name}」（${t.type === "vocabulary" ? "単語帳" : "教材"}）`;
    if (t.type === "vocabulary" && (t.daily_words || t.review_words)) {
      line += ` 1日あたり新規${t.daily_words ?? "?"}語・復習${t.review_words ?? "?"}語`;
    }
    if (total > 0) {
      line += `／全${total}項目のうち${assignedCount}項目を30日間に配分`;
    }
    return line;
  }).join("\n");
}

export default function CourseTextbooksPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = Number(params.id);
  const { loading } = useRoleGuard(["creator", "admin"]);

  const [textbooks, setTextbooks] = useState<CourseTextbookEntry[]>([]);
  const [fetching, setFetching] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<TextbookSearchResult[]>([]);

  const [customMode, setCustomMode] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customToc, setCustomToc] = useState("");
  const [customType, setCustomType] = useState("textbook");

  const [adding, setAdding] = useState(false);
  const [proceeding, setProceeding] = useState(false);

  function reload() {
    return api.listCourseTextbooks(courseId).then(setTextbooks).catch(() => {});
  }

  useEffect(() => {
    if (loading) return;
    reload().finally(() => setFetching(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    try {
      setResults(await api.searchTextbooks(query));
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "検索に失敗しました", "error");
    } finally {
      setSearching(false);
    }
  }

  async function handleAddPreset(t: TextbookSearchResult) {
    setAdding(true);
    try {
      const added = await api.addCourseTextbook(courseId, { textbook_id: t.id, type: t.type });
      setTextbooks(prev => [...prev, added]);
      toast(`「${t.name}」を追加しました`, "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "追加に失敗しました", "error");
    } finally {
      setAdding(false);
    }
  }

  async function handleAddCustom(e: React.FormEvent) {
    e.preventDefault();
    const items = customToc.split("\n").map(s => s.trim()).filter(Boolean);
    if (!customName.trim() || items.length === 0) {
      toast("教材名と目次（1行1項目）を入力してください", "error");
      return;
    }
    setAdding(true);
    try {
      const added = await api.addCourseTextbook(courseId, {
        custom_name: customName.trim(),
        custom_toc: items.map(item => ({ item })),
        type: customType,
      });
      setTextbooks(prev => [...prev, added]);
      setCustomName("");
      setCustomToc("");
      setCustomMode(false);
      toast(`「${added.name}」を追加しました`, "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "追加に失敗しました", "error");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("この教材をコースから削除しますか？")) return;
    try {
      await api.deleteCourseTextbook(id);
      setTextbooks(prev => prev.filter(t => t.id !== id));
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "削除に失敗しました", "error");
    }
  }

  async function handleSaveAssignments(t: CourseTextbookEntry, assignments: DayAssignment[]) {
    try {
      const updated = await api.setTextbookDayAssignments(t.id, assignments);
      setTextbooks(prev => prev.map(x => x.id === t.id ? updated : x));
      toast("日程の割り当てを保存しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "error");
    }
  }

  async function handleSaveSettings(t: CourseTextbookEntry, dailyWords: number | null, reviewWords: number | null, targetLaps: number) {
    try {
      const updated = await api.updateCourseTextbook(t.id, { daily_words: dailyWords, review_words: reviewWords, target_laps: targetLaps });
      setTextbooks(prev => prev.map(x => x.id === t.id ? { ...updated, day_assignments: x.day_assignments } : x));
      toast("設定を保存しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "error");
    }
  }

  async function handleProceed() {
    setProceeding(true);
    try {
      await api.updateCourse(courseId, { study_materials: buildStudyMaterialsSummary(textbooks) });
      router.push(`/creator/courses/${courseId}/calendar`);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "error");
    } finally {
      setProceeding(false);
    }
  }

  if (loading || fetching) return <Skeleton />;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" backHref="/creator/courses" backLabel="作成したコース" title="使用する教材を設定" />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          このコースで使う教材を選び、各章・項目をいつ（何日目に）やるかを設定してください。AIはこの情報を前提に30日分のコースを生成します。
        </p>

        <div className="card flex flex-col gap-3">
          <p className="font-bold text-sm" style={{ color: "var(--primary)" }}>① プリセット教材を検索</p>
          <form onSubmit={handleSearch} className="flex gap-2">
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="書籍名で検索（例：TOEFL ITP）" className="flex-1" />
            <button type="submit" className="btn-ghost px-4" disabled={searching}>{searching ? "検索中…" : "検索"}</button>
          </form>
          {results.length > 0 && (
            <div className="flex flex-col gap-2">
              {results.map(t => (
                <div key={t.id} className="flex items-center justify-between gap-2 text-sm p-2 rounded-lg" style={{ background: "var(--example-bg, #eee)" }}>
                  <div>
                    <p className="font-bold" style={{ color: "var(--primary)" }}>{t.name}</p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>{t.publisher} ・ {t.target} ・ 全{t.toc?.length ?? 0}項目</p>
                  </div>
                  <button className="btn-primary text-xs flex-shrink-0" disabled={adding} onClick={() => handleAddPreset(t)}>追加</button>
                </div>
              ))}
            </div>
          )}

          <button type="button" className="text-xs underline self-start" style={{ color: "var(--accent)" }} onClick={() => setCustomMode(v => !v)}>
            {customMode ? "手入力をやめる" : "プリセットにない教材を手入力で追加する"}
          </button>
          {customMode && (
            <form onSubmit={handleAddCustom} className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
              <input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="教材名" required />
              <select value={customType} onChange={e => setCustomType(e.target.value)}>
                <option value="textbook">教材（参考書・問題集など）</option>
                <option value="vocabulary">単語帳</option>
              </select>
              <textarea
                rows={4}
                value={customToc}
                onChange={e => setCustomToc(e.target.value)}
                placeholder={"目次を1行に1項目ずつ入力してください\n例：\nUnit 1 現在形\nUnit 2 過去形"}
              />
              <button type="submit" className="btn-primary self-start" disabled={adding}>{adding ? "追加中…" : "追加する"}</button>
            </form>
          )}
        </div>

        <div>
          <p className="font-bold text-sm mb-2" style={{ color: "var(--primary)" }}>② 追加済みの教材と日程割り当て</p>
          {textbooks.length === 0 ? (
            <div className="card">
              <p className="text-sm" style={{ color: "var(--muted)" }}>まだ教材が追加されていません。</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {textbooks.map(t => (
                <CourseTextbookCard
                  key={t.id}
                  textbook={t}
                  expanded={expandedId === t.id}
                  onToggle={() => setExpandedId(prev => prev === t.id ? null : t.id)}
                  onDelete={() => handleDelete(t.id)}
                  onSaveAssignments={assignments => handleSaveAssignments(t, assignments)}
                  onSaveSettings={(d, r, laps) => handleSaveSettings(t, d, r, laps)}
                />
              ))}
            </div>
          )}
        </div>

        <button className="btn-cta text-center" disabled={proceeding} onClick={handleProceed}>
          {proceeding ? "保存中…" : "コース生成へ進む →"}
        </button>
      </main>
    </div>
  );
}

function CourseTextbookCard({
  textbook, expanded, onToggle, onDelete, onSaveAssignments, onSaveSettings,
}: {
  textbook: CourseTextbookEntry;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onSaveAssignments: (assignments: DayAssignment[]) => void;
  onSaveSettings: (dailyWords: number | null, reviewWords: number | null, targetLaps: number) => void;
}) {
  const [assignments, setAssignments] = useState<DayAssignment[]>(textbook.day_assignments);
  const [dailyWords, setDailyWords] = useState<string>(textbook.daily_words?.toString() ?? "");
  const [reviewWords, setReviewWords] = useState<string>(textbook.review_words?.toString() ?? "");
  const [targetLaps, setTargetLaps] = useState<string>(textbook.target_laps?.toString() ?? "1");

  function updateDay(tocItem: string, value: string) {
    const day_number = value === "" ? null : Number(value);
    setAssignments(prev => prev.map(a => a.toc_item === tocItem ? { ...a, day_number } : a));
  }

  function handleAutoAssign() {
    const total = assignments.length;
    if (total === 0) return;
    setAssignments(prev => prev.map((a, i) => ({
      ...a,
      day_number: Math.min(30, Math.floor((i * 30) / total) + 1),
    })));
    toast("AIが項目数に応じて30日に均等割り当てしました。内容を確認し、必要に応じて調整してください。", "success");
  }

  const assignedCount = assignments.filter(a => a.day_number != null).length;

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <button className="text-left flex-1" onClick={onToggle}>
          <p className="font-bold" style={{ color: "var(--primary)" }}>{textbook.name}</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {textbook.type === "vocabulary" ? "単語帳" : "教材"} ・ 全{assignments.length}項目中{assignedCount}項目を配分済み
          </p>
        </button>
        <button className="text-xs" style={{ color: "#c0392b" }} onClick={onDelete}>削除</button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-3 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
          <div className="flex gap-2 items-end flex-wrap">
            {textbook.type === "vocabulary" && (
              <>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>1日あたり新規語数</label>
                  <input type="number" min={1} value={dailyWords} onChange={e => setDailyWords(e.target.value)} className="w-24" />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>復習語数</label>
                  <input type="number" min={0} value={reviewWords} onChange={e => setReviewWords(e.target.value)} className="w-24" />
                </div>
              </>
            )}
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>完了条件：目標周回数</label>
              <input type="number" min={1} value={targetLaps} onChange={e => setTargetLaps(e.target.value)} className="w-24" />
            </div>
            <button
              className="btn-ghost text-xs"
              onClick={() => onSaveSettings(dailyWords ? Number(dailyWords) : null, reviewWords ? Number(reviewWords) : null, Number(targetLaps) || 1)}
            >
              設定を保存
            </button>
          </div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            目標周回数は、学習者が申し込み時の診断で「今どのくらい進んでいるか」を答える際の完了条件になります。
          </p>

          {assignments.length > 0 && (
            <button type="button" className="btn-ghost text-xs self-start" onClick={handleAutoAssign}>
              🤖 AIに自動割り当てしてもらう（全{assignments.length}項目を30日に均等配分）
            </button>
          )}
          {assignments.length > 0 && (
            <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
              {assignments.map(a => (
                <div key={a.toc_item} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex-1" style={{ color: "var(--text)" }}>{a.toc_item}</span>
                  <select
                    value={a.day_number ?? ""}
                    onChange={e => updateDay(a.toc_item, e.target.value)}
                    className="w-28 text-xs"
                  >
                    <option value="">やらない</option>
                    {Array.from({ length: 30 }, (_, i) => i + 1).map(d => (
                      <option key={d} value={d}>{d}日目</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
          <button className="btn-primary self-start text-xs" onClick={() => onSaveAssignments(assignments)}>日程を保存</button>
        </div>
      )}
    </div>
  );
}
