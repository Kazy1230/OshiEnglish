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
  id: number; course_id: number; textbook_id: number | null; name: string; type: string;
  daily_words: number | null; review_words: number | null; target_laps: number;
  day_assignments: DayAssignment[];
};
type PlanItem = {
  course_textbook_id: number; type: string;
  daily_words?: number | null; review_words?: number | null; target_laps?: number | null;
  day_assignments?: DayAssignment[];
};
type TextbookPlanResponse = {
  needs_clarification: boolean; clarifying_questions: string[]; summary: string; plans: PlanItem[];
};
type QAEntry = { question: string; answer: string };

function buildStudyMaterialsSummary(textbooks: CourseTextbookEntry[]): string {
  return textbooks.map(t => {
    const assignedCount = t.day_assignments.filter(a => a.day_number != null).length;
    let line = `「${t.name}」（${t.type === "vocabulary" ? "単語帳" : "教材"}）`;
    if (t.type === "vocabulary" && (t.daily_words || t.review_words)) {
      line += ` 1日あたり新規${t.daily_words ?? "?"}語・復習${t.review_words ?? "?"}語`;
    }
    if (t.day_assignments.length > 0) {
      line += `／全${t.day_assignments.length}項目のうち${assignedCount}項目を30日間に配分`;
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
  const [savedSummary, setSavedSummary] = useState("");

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<TextbookSearchResult[]>([]);

  const [customMode, setCustomMode] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customType, setCustomType] = useState("textbook");
  const [tocChatHistory, setTocChatHistory] = useState<{ role: string; content: string }[]>([]);
  const [tocItems, setTocItems] = useState<string[]>([]);
  const [tocInput, setTocInput] = useState("");
  const [tocChatting, setTocChatting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [proceeding, setProceeding] = useState(false);

  const [planDescription, setPlanDescription] = useState("");
  const [qaHistory, setQaHistory] = useState<QAEntry[]>([]);
  const [qaAnswers, setQaAnswers] = useState<Record<number, string>>({});
  const [plan, setPlan] = useState<TextbookPlanResponse | null>(null);
  const [planning, setPlanning] = useState(false);
  const [applyingPlan, setApplyingPlan] = useState(false);

  function reload() {
    return api.listCourseTextbooks(courseId).then(setTextbooks).catch(() => {});
  }

  useEffect(() => {
    if (loading) return;
    Promise.all([
      reload(),
      api.getCourseDetail(courseId).then(c => setSavedSummary(c.study_materials ?? "")).catch(() => {}),
    ]).finally(() => setFetching(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    try { setResults(await api.searchTextbooks(query)); }
    catch (err: unknown) { toast(err instanceof Error ? err.message : "検索に失敗しました", "error"); }
    finally { setSearching(false); }
  }

  async function handleAddPreset(t: TextbookSearchResult) {
    setAdding(true);
    try {
      const added = await api.addCourseTextbook(courseId, { textbook_id: t.id, type: t.type });
      setTextbooks(prev => [...prev, added]);
      toast(`「${t.name}」を追加しました`, "success");
    } catch (err: unknown) { toast(err instanceof Error ? err.message : "追加に失敗しました", "error"); }
    finally { setAdding(false); }
  }

  async function handleTocChat(e: React.FormEvent) {
    e.preventDefault();
    if (!tocInput.trim() || !customName.trim()) { toast("教材名とメッセージを入力してください", "error"); return; }
    setTocChatting(true);
    const newHistory = [...tocChatHistory, { role: "user", content: tocInput }];
    setTocChatHistory(newHistory);
    setTocInput("");
    try {
      const res = await api.parseTocChat(courseId, customName, tocInput, tocChatHistory);
      setTocChatHistory([...newHistory, { role: "assistant", content: res.ai_message }]);
      if (res.toc_items?.length > 0) setTocItems(res.toc_items);
    } catch (err: unknown) { toast(err instanceof Error ? err.message : "AIとの通信に失敗しました", "error"); }
    finally { setTocChatting(false); }
  }

  async function handleAddCustom(e: React.FormEvent) {
    e.preventDefault();
    if (!customName.trim() || tocItems.length === 0) { toast("教材名と目次項目が必要です", "error"); return; }
    setAdding(true);
    try {
      const added = await api.addCourseTextbook(courseId, {
        custom_name: customName.trim(), custom_toc: tocItems.map(item => ({ item })), type: customType,
      });
      setTextbooks(prev => [...prev, added]);
      setCustomName(""); setTocItems([]); setTocChatHistory([]); setTocInput(""); setCustomMode(false);
      toast(`「${added.name}」を追加しました`, "success");
    } catch (err: unknown) { toast(err instanceof Error ? err.message : "追加に失敗しました", "error"); }
    finally { setAdding(false); }
  }

  async function handleDelete(id: number) {
    if (!confirm("この教材をコースから削除しますか？")) return;
    try {
      await api.deleteCourseTextbook(id);
      setTextbooks(prev => prev.filter(t => t.id !== id));
    } catch (err: unknown) { toast(err instanceof Error ? err.message : "削除に失敗しました", "error"); }
  }

  async function handlePlan(history: QAEntry[]) {
    if (!planDescription.trim()) { toast("教材の使い方を入力してください", "error"); return; }
    setPlanning(true);
    try {
      const result = await api.planCourseTextbooks(courseId, planDescription, history);
      setPlan(result); setQaHistory(history); setQaAnswers({});
    } catch (err: unknown) { toast(err instanceof Error ? err.message : "AIへの相談に失敗しました", "error"); }
    finally { setPlanning(false); }
  }

  async function handleAnswerClarification() {
    if (!plan) return;
    const newHistory = [
      ...qaHistory,
      ...plan.clarifying_questions.map((q, i) => ({ question: q, answer: qaAnswers[i]?.trim() || "（特に指定なし）" })),
    ];
    await handlePlan(newHistory);
  }

  async function handleApplyPlan() {
    if (!plan) return;
    setApplyingPlan(true);
    try {
      const updated = await api.applyCourseTextbookPlan(courseId, plan.plans);
      setTextbooks(updated);
      const summary = buildStudyMaterialsSummary(updated);
      await api.updateCourse(courseId, { study_materials: summary });
      setSavedSummary(summary);
      setPlan(null); setPlanDescription(""); setQaHistory([]);
      toast("AIのプランをコースに反映しました ✅", "success");
    } catch (err: unknown) { toast(err instanceof Error ? err.message : "反映に失敗しました", "error"); }
    finally { setApplyingPlan(false); }
  }

  async function handleProceed() {
    setProceeding(true);
    try {
      const summary = buildStudyMaterialsSummary(textbooks);
      await api.updateCourse(courseId, { study_materials: summary });
      setSavedSummary(summary);
      router.push(`/creator/courses/${courseId}/calendar`);
    } catch (err: unknown) { toast(err instanceof Error ? err.message : "保存に失敗しました", "error"); }
    finally { setProceeding(false); }
  }

  if (loading || fetching) return <Skeleton />;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" title="使用する教材を設定" />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          このコースで使う教材を選び、AIに「いつ・どのくらい使うか」を相談してください。AIが30日分の配分を自動で作ります。
        </p>

        {/* ① 教材を追加 */}
        <div className="card flex flex-col gap-3">
          <p className="font-bold text-sm" style={{ color: "var(--primary)" }}>① 使う教材を追加する</p>
          <form onSubmit={handleSearch} className="flex gap-2">
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="書籍名で検索（例：TOEFL ITP）" className="flex-1" />
            <button type="submit" className="btn-ghost px-4" disabled={searching}>{searching ? "検索中…" : "検索"}</button>
          </form>
          {results.length > 0 && (
            <div className="flex flex-col gap-2">
              {results.map(t => {
                const alreadyAdded = textbooks.some(tb => tb.textbook_id === t.id);
                return (
                  <div key={t.id} className="flex items-center justify-between gap-2 text-sm p-3 rounded-xl" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                    <div>
                      <p className="font-bold" style={{ color: "var(--primary)" }}>{t.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{t.publisher} · {t.target} · 全{t.toc?.length ?? 0}項目</p>
                    </div>
                    {alreadyAdded
                      ? <span className="text-xs font-bold px-2 py-1 rounded-full flex-shrink-0" style={{ background: "var(--accent)", color: "white" }}>追加済み</span>
                      : <button className="btn-primary text-xs flex-shrink-0" disabled={adding} onClick={() => handleAddPreset(t)}>追加</button>}
                  </div>
                );
              })}
            </div>
          )}

          <button type="button" className="text-xs underline self-start" style={{ color: "var(--accent)" }} onClick={() => setCustomMode(v => !v)}>
            {customMode ? "手入力をやめる" : "プリセットにない教材を手入力で追加する"}
          </button>
          {customMode && (
            <div className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
              <input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="教材名（例：DUO3.0）" />
              <select value={customType} onChange={e => setCustomType(e.target.value)}>
                <option value="textbook">教材（参考書・問題集など）</option>
                <option value="vocabulary">単語帳</option>
              </select>
              {tocChatHistory.length > 0 && (
                <div className="flex flex-col gap-2 max-h-56 overflow-y-auto p-2 rounded-xl" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                  {tocChatHistory.map((m, i) => (
                    <div key={i} className={`text-xs p-2 rounded-lg max-w-[90%] ${m.role === "user" ? "self-end" : "self-start"}`}
                      style={{ background: m.role === "user" ? "var(--primary)" : "var(--card)", color: m.role === "user" ? "white" : "var(--text)", border: "1px solid var(--border)" }}>
                      {m.content}
                    </div>
                  ))}
                  {tocChatting && <div className="text-xs self-start p-2 rounded-lg" style={{ background: "var(--card)", color: "var(--muted)" }}>考え中…</div>}
                </div>
              )}
              {tocItems.length > 0 && (
                <div className="text-xs p-2 rounded-lg" style={{ background: "var(--bg)", color: "var(--muted)" }}>
                  <span className="font-bold" style={{ color: "var(--accent)" }}>確定した目次（{tocItems.length}項目）</span>
                  <div className="mt-1 max-h-24 overflow-y-auto flex flex-col gap-0.5">{tocItems.map((item, i) => <span key={i}>{item}</span>)}</div>
                </div>
              )}
              <form onSubmit={handleTocChat} className="flex gap-2">
                <input value={tocInput} onChange={e => setTocInput(e.target.value)}
                  placeholder={tocChatHistory.length === 0 ? "例：560例文で構成。40例文ずつ区切りたい" : "返信する…"}
                  disabled={tocChatting} className="flex-1 text-sm" />
                <button type="submit" className="btn-ghost px-3 text-sm" disabled={tocChatting || !tocInput.trim()}>送信</button>
              </form>
              <button type="button" className="btn-primary self-start text-sm" disabled={adding || tocItems.length === 0} onClick={handleAddCustom}>
                {adding ? "追加中…" : `完了（${tocItems.length}項目で追加）`}
              </button>
            </div>
          )}

          {/* 追加済み教材リスト */}
          {textbooks.length > 0 && (
            <div className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
              <p className="text-xs font-bold" style={{ color: "var(--muted)" }}>追加済みの教材</p>
              {textbooks.map(t => {
                const assignedCount = t.day_assignments.filter(a => a.day_number != null).length;
                const total = t.day_assignments.length;
                return (
                  <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: t.type === "vocabulary" ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "color-mix(in srgb, var(--primary) 12%, transparent)", color: t.type === "vocabulary" ? "var(--accent)" : "var(--primary)" }}>
                      {t.type === "vocabulary" ? "単語帳" : "教材"}
                    </span>
                    <span className="flex-1 text-sm font-bold" style={{ color: "var(--text)" }}>{t.name}</span>
                    {total > 0 && (
                      <span className="text-xs flex-shrink-0" style={{ color: assignedCount === total ? "var(--accent)" : "var(--muted)" }}>
                        {assignedCount === total ? "✓ 配分済み" : `${assignedCount}/${total}項目`}
                      </span>
                    )}
                    <button onClick={() => handleDelete(t.id)} className="text-xs flex-shrink-0" style={{ color: "var(--muted)" }}>削除</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ② AIに教材の使い方を相談する */}
        {textbooks.length > 0 && (
          <div className="card flex flex-col gap-3" style={{ borderColor: "var(--accent)" }}>
            <p className="font-bold text-sm" style={{ color: "var(--primary)" }}>② AIに教材の使い方を相談する</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              いつ・どのくらい・どの順番で使うかを文章で説明してください。AIが30日分の配分を自動で作ります。
            </p>
            <textarea rows={4} value={planDescription} onChange={e => setPlanDescription(e.target.value)}
              placeholder="例：Duo3.0を1日40例文進め2週間で1周。公式問題集は後半2週間でテスト形式で解く"
              disabled={planning || !!plan} />
            {!plan && (
              <button type="button" className="btn-primary self-start text-sm" disabled={planning} onClick={() => handlePlan([])}>
                {planning ? "AIが考えています…" : "🤖 AIに相談する"}
              </button>
            )}

            {plan && (
              <div className="flex flex-col gap-3 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                <div className="p-3 rounded-xl text-sm" style={{ background: "color-mix(in srgb, var(--accent) 8%, var(--bg))", border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)" }}>
                  <p className="font-bold text-xs mb-1" style={{ color: "var(--accent)" }}>AIによる計画の要約</p>
                  {plan.summary}
                </div>

                {plan.needs_clarification && plan.clarifying_questions.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-bold" style={{ color: "var(--primary)" }}>🤔 AIから確認したいこと</p>
                    {plan.clarifying_questions.map((q, i) => (
                      <label key={i} className="flex flex-col gap-1 text-sm" style={{ color: "var(--text)" }}>
                        {q}
                        <input value={qaAnswers[i] ?? ""} onChange={e => setQaAnswers(prev => ({ ...prev, [i]: e.target.value }))} placeholder="回答を入力" />
                      </label>
                    ))}
                    <button type="button" className="btn-ghost text-sm self-start" disabled={planning} onClick={handleAnswerClarification}>
                      {planning ? "AIが考えています…" : "回答して認識を合わせる"}
                    </button>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-bold" style={{ color: "var(--muted)" }}>プラン内容</p>
                  {plan.plans.map(p => {
                    const tb = textbooks.find(t => t.id === p.course_textbook_id);
                    const assignedCount = p.day_assignments?.filter(a => a.day_number != null).length ?? 0;
                    return (
                      <div key={p.course_textbook_id} className="text-sm px-3 py-2 rounded-xl flex items-center gap-2" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                        <span className="font-bold" style={{ color: "var(--text)" }}>{tb?.name ?? `教材#${p.course_textbook_id}`}</span>
                        <span className="text-xs" style={{ color: "var(--muted)" }}>
                          {p.type === "vocabulary"
                            ? `1日新規${p.daily_words ?? "?"}語・復習${p.review_words ?? "?"}語・目標${p.target_laps ?? "?"}周`
                            : `${p.day_assignments?.length ?? 0}項目中${assignedCount}項目を配分`}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-2 flex-wrap">
                  {!plan.needs_clarification && (
                    <button type="button" className="btn-primary text-sm" disabled={applyingPlan} onClick={handleApplyPlan}>
                      {applyingPlan ? "反映中…" : "✅ この内容でコースに反映する"}
                    </button>
                  )}
                  <button type="button" className="btn-ghost text-sm" onClick={() => { setPlan(null); setQaHistory([]); setQaAnswers({}); }}>
                    やり直す
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {textbooks.length === 0
          ? <p className="text-xs text-center" style={{ color: "#c0392b" }}>教材を1つ以上追加してから進んでください。</p>
          : buildStudyMaterialsSummary(textbooks) !== savedSummary && (
            <p className="text-xs text-center" style={{ color: "var(--accent)" }}>⚠ 教材の設定に未保存の変更があります。「進む」を押すと保存されます。</p>
          )
        }
        <button className="btn-cta text-center disabled:opacity-50" disabled={proceeding || textbooks.length === 0} onClick={handleProceed}>
          {proceeding ? "保存中…" : "コース生成へ進む →"}
        </button>
      </main>
    </div>
  );
}
