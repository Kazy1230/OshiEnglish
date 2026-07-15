"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { AppHeader } from "@/components/AppHeader";
import { ContentItem, ContentEmbed } from "@/components/ContentEmbed";

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
  // 30日分割り当て: index=0がDay1。空文字 = その日は未割り当て
  const [dayEntries, setDayEntries] = useState<string[]>(Array(30).fill(""));
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

  const [addTab, setAddTab] = useState<"textbook" | "content">("textbook");
  const [myContents, setMyContents] = useState<ContentItem[]>([]);
  const [loadingContents, setLoadingContents] = useState(false);
  const [addingContent, setAddingContent] = useState(false);

  function reload() {
    return api.listCourseTextbooks(courseId).then(setTextbooks).catch(() => {});
  }

  function handleContentTabClick() {
    setAddTab("content");
    if (myContents.length === 0 && !loadingContents) {
      setLoadingContents(true);
      api.listMyContents().then(setMyContents).catch(() => {}).finally(() => setLoadingContents(false));
    }
  }

  async function handleAddContent(c: ContentItem) {
    if (textbooks.some((t) => (t as unknown as { content_id?: number }).content_id === c.id)) {
      toast("このコンテンツは既に追加されています", "error");
      return;
    }
    setAddingContent(true);
    try {
      const added = await api.addCourseTextbook(courseId, { content_id: c.id, type: "content" });
      setTextbooks((prev) => [...prev, added]);
      toast(`「${c.title}」を追加しました`, "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "追加に失敗しました", "error");
    } finally {
      setAddingContent(false);
    }
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

  async function sendTocMessage(message: string) {
    if (!customName.trim()) { toast("先に教材名を入力してください", "error"); return; }
    setTocChatting(true);
    const newHistory = [...tocChatHistory, { role: "user", content: message }];
    setTocChatHistory(newHistory);
    setTocInput("");
    try {
      const res = await api.parseTocChat(courseId, customName, message, tocChatHistory);
      setTocChatHistory([...newHistory, { role: "assistant", content: res.ai_message }]);
      if (res.toc_items?.length > 0) setTocItems(res.toc_items);
      // day_assignments を30日グリッドに反映
      if (res.day_assignments?.length > 0) {
        const entries = Array(30).fill("");
        for (const d of res.day_assignments) {
          if (d.day >= 1 && d.day <= 30 && Array.isArray(d.items)) {
            entries[d.day - 1] = d.items.join("、");
          }
        }
        setDayEntries(entries);
      }
    } catch (err: unknown) { toast(err instanceof Error ? err.message : "AIとの通信に失敗しました", "error"); }
    finally { setTocChatting(false); }
  }

  async function handleTocChat(e: React.FormEvent) {
    e.preventDefault();
    if (!tocInput.trim()) return;
    await sendTocMessage(tocInput);
  }

  async function handleTocAutoLookup() {
    if (!customName.trim()) { toast("先に教材名を入力してください", "error"); return; }
    const msg = tocInput.trim()
      ? `「${customName}」の全章・全セクション一覧を作成してください。補足：${tocInput}`
      : `「${customName}」の全章・全セクション一覧を作成してください`;
    await sendTocMessage(msg);
  }

  async function handleAddCustom(e: React.FormEvent) {
    e.preventDefault();
    if (!customName.trim() || tocItems.length === 0) { toast("教材名と目次項目が必要です", "error"); return; }
    setAdding(true);
    try {
      const added = await api.addCourseTextbook(courseId, {
        custom_name: customName.trim(), custom_toc: tocItems.map(item => ({ item })), type: customType,
      });
      // 30日グリッドの内容を day_assignments として保存
      const assignments: { toc_item: string; day_number: number | null }[] = [];
      const assignedItems = new Set<string>();
      dayEntries.forEach((content, idx) => {
        if (!content.trim()) return;
        const items = content.split(/[、,\n]/).map(s => s.trim()).filter(Boolean);
        for (const item of items) {
          assignments.push({ toc_item: item, day_number: idx + 1 });
          assignedItems.add(item);
        }
      });
      // toc_items のうち未割り当てのものは day_number: null で追加
      for (const item of tocItems) {
        if (!assignedItems.has(item)) assignments.push({ toc_item: item, day_number: null });
      }
      if (assignments.length > 0) {
        await api.setTextbookDayAssignments(added.id, assignments);
      }
      setTextbooks(prev => [...prev, { ...added, day_assignments: assignments.map(a => ({ toc_item: a.toc_item, day_number: a.day_number })) }]);
      setCustomName(""); setTocItems([]); setDayEntries(Array(30).fill(""));
      setTocChatHistory([]); setTocInput(""); setCustomMode(false);
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
    <div className="creator-theme min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" title="使用する教材を設定" />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          このコースで使う教材を選び、AIに「いつ・どのくらい使うか」を相談してください。AIが30日分の配分を自動で作ります。
        </p>

        {/* ① 教材を追加 */}
        <div className="card flex flex-col gap-3">
          <p className="font-bold text-sm" style={{ color: "var(--primary)" }}>① 使う教材を追加する</p>

          {/* タブ切り替え */}
          <div className="flex gap-2">
            {(["textbook", "content"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => { if (tab === "content") handleContentTabClick(); else setAddTab("textbook"); }}
                className="text-sm px-3 py-1.5 rounded-full font-bold transition-all"
                style={{
                  background: addTab === tab ? "var(--ink)" : "var(--bg)",
                  color: addTab === tab ? "white" : "var(--muted)",
                  border: `1.5px solid ${addTab === tab ? "var(--ink)" : "var(--border)"}`,
                }}
              >
                {tab === "textbook" ? "📚 テキスト教材" : "🗂️ コンテンツプール"}
              </button>
            ))}
          </div>

          {addTab === "content" ? (
            <div className="flex flex-col gap-3">
              {loadingContents ? (
                <p className="text-sm" style={{ color: "var(--muted)" }}>読み込み中…</p>
              ) : myContents.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  まだコンテンツプールにコンテンツがありません。
                  <a href="/creator/contents" style={{ color: "var(--accent)" }}>コンテンツプール</a>からURLを登録してください。
                </p>
              ) : (
                myContents.map((c) => {
                  const added = textbooks.some((t) => (t as unknown as { content_id?: number }).content_id === c.id);
                  return (
                    <div key={c.id} className="flex flex-col gap-2 p-3 rounded-xl" style={{ border: "1px solid var(--border)", background: "var(--bg)" }}>
                      <div className="flex items-start justify-between gap-2">
                        <div style={{ minWidth: 0 }}>
                          <p className="text-sm font-bold truncate" style={{ color: "var(--text)" }}>{c.title}</p>
                          <p className="text-xs" style={{ color: "var(--muted)" }}>{c.content_type} · {c.subject}</p>
                        </div>
                        {added
                          ? <span className="text-xs font-bold px-2 py-1 rounded-full flex-shrink-0" style={{ background: "var(--accent)", color: "white" }}>追加済み</span>
                          : <button className="btn-primary text-xs flex-shrink-0" disabled={addingContent} onClick={() => handleAddContent(c)}>追加</button>
                        }
                      </div>
                      <ContentEmbed item={c} />
                    </div>
                  );
                })
              )}
            </div>
          ) : (
          <>
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
              {/* チャット履歴 */}
              {tocChatHistory.length > 0 && (
                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto p-3 rounded-xl" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                  {tocChatHistory.map((m, i) => (
                    <div key={i} className={`text-xs p-2.5 rounded-xl max-w-[90%] leading-relaxed whitespace-pre-wrap ${m.role === "user" ? "self-end" : "self-start"}`}
                      style={{ background: m.role === "user" ? "var(--ink)" : "var(--card)", color: m.role === "user" ? "white" : "var(--text)", border: "1px solid var(--border)" }}>
                      {m.content}
                    </div>
                  ))}
                  {tocChatting && (
                    <div className="text-xs self-start px-3 py-2 rounded-xl flex items-center gap-1.5" style={{ background: "var(--card)", color: "var(--muted)" }}>
                      <span className="animate-pulse">●</span> 調べています…
                    </div>
                  )}
                </div>
              )}

              {/* 入力エリア */}
              {tocChatHistory.length === 0 ? (
                <div className="flex flex-col gap-2">
                  <input
                    value={tocInput}
                    onChange={e => setTocInput(e.target.value)}
                    placeholder="補足があれば（例：1日4チャプターで進めたい）　なければ空欄でOK"
                    disabled={tocChatting}
                    className="text-sm"
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleTocAutoLookup(); } }}
                  />
                  <button
                    type="button"
                    className="btn-primary self-start text-sm"
                    disabled={tocChatting || !customName.trim()}
                    onClick={handleTocAutoLookup}
                  >
                    {tocChatting ? "調べています…" : "🔍 AIに目次を調べてもらう"}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleTocChat} className="flex gap-2">
                  <input
                    value={tocInput}
                    onChange={e => setTocInput(e.target.value)}
                    placeholder="修正・追加を伝える…"
                    disabled={tocChatting}
                    className="flex-1 text-sm"
                  />
                  <button type="submit" className="btn-ghost px-3 text-sm" disabled={tocChatting || !tocInput.trim()}>送信</button>
                </form>
              )}

              {/* 30日グリッド */}
              {tocItems.length > 0 && (
                <div className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold" style={{ color: "var(--accent)" }}>
                      30日間の割り当て（編集できます）
                    </p>
                    <button
                      type="button"
                      className="text-[10px]"
                      style={{ color: "var(--muted)" }}
                      onClick={() => { setTocItems([]); setDayEntries(Array(30).fill("")); setTocChatHistory([]); }}
                    >
                      リセット
                    </button>
                  </div>
                  <p className="text-[10px]" style={{ color: "var(--muted)" }}>
                    各日の内容を「、」区切りで編集できます。空欄の日は休息日として扱われます。
                  </p>
                  <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto pr-1">
                    {dayEntries.map((content, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span
                          className="text-xs font-bold flex-shrink-0 w-12 text-right"
                          style={{ color: content.trim() ? "var(--primary)" : "var(--muted)" }}
                        >
                          {idx + 1}日目
                        </span>
                        <input
                          value={content}
                          onChange={e => setDayEntries(prev => prev.map((v, i) => i === idx ? e.target.value : v))}
                          placeholder="（空欄 = 休息日）"
                          className="flex-1 text-xs py-1.5 px-2.5"
                          style={{
                            borderColor: content.trim() ? "var(--accent)" : "var(--border)",
                            background: content.trim() ? "color-mix(in srgb, var(--accent) 5%, var(--bg))" : "var(--bg)",
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px]" style={{ color: "var(--muted)" }}>
                    教材全体：{tocItems.length}項目 ／ 割り当て済み：{dayEntries.filter(d => d.trim()).length}日
                  </p>
                </div>
              )}

              <button
                type="button"
                className="btn-primary self-start text-sm"
                disabled={adding || tocItems.length === 0}
                onClick={handleAddCustom}
              >
                {adding ? "追加中…" : "完了 — コースに追加する"}
              </button>
            </div>
          )}
          </>
          )}

          {/* 追加済み教材リスト */}
          {textbooks.length > 0 && (
            <div className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
              <p className="text-xs font-bold" style={{ color: "var(--muted)" }}>追加済みの教材</p>
              {textbooks.map(t => {
                const assignedCount = t.day_assignments.filter(a => a.day_number != null).length;
                const total = t.day_assignments.length;
                const typeLabel = t.type === "vocabulary" ? "単語帳" : t.type === "content" ? "コンテンツ" : "教材";
                const typeBg = t.type === "vocabulary" ? "color-mix(in srgb, var(--accent) 15%, transparent)" : t.type === "content" ? "color-mix(in srgb, #805ad5 15%, transparent)" : "color-mix(in srgb, var(--primary) 12%, transparent)";
                const typeColor = t.type === "vocabulary" ? "var(--accent)" : t.type === "content" ? "#805ad5" : "var(--primary)";
                return (
                  <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: typeBg, color: typeColor }}>
                      {typeLabel}
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
