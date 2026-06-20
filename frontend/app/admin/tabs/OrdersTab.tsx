"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { parseOrderCharSpec, buildCharacterGenerationPromptFromOrder } from "../lib/promptBuilders";

function inferExerciseCategoryFromTopic(topic: string | null | undefined): string {
  if (!topic) return "request";
  const t = topic.toLowerCase();
  if (t.includes("リスニング") || t.includes("listening")) return "stock_listening";
  if (t.includes("スピーキング") || t.includes("speaking")) return "exercise_speaking";
  if (t.includes("ライティング") || t.includes("writing")) return "exercise_writing";
  if (t.includes("リーディング") || t.includes("reading")) return "stock_reading";
  return "request";
}

export function OrdersTab({ onCreateArticleFromRequest, onNavigateToRewards, onNavigateToWelcomePage, onNavigateToMessages }: {
  onCreateArticleFromRequest?: (order: any, request: any, targetCategory?: string) => void;
  onNavigateToRewards?: (characterId: number) => void;
  onNavigateToWelcomePage?: (characterId: number) => void;
  onNavigateToMessages?: (customerId: number) => void;
} = {}) {
  const [orders, setOrders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");
  const [filterText, setFilterText] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [linkingOrderId, setLinkingOrderId] = useState<number | null>(null);
  const [promptOrderId,  setPromptOrderId]  = useState<number | null>(null);
  const [generatedPrompt, setGeneratedPrompt] = useState<string>("");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  function loadData() {
    setLoading(true);
    Promise.all([api.adminGetOrders(), api.adminGetCustomers()])
      .then(([o, c]) => { setOrders(o); setCustomers(c.filter((cu: any) => cu.role !== "admin")); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadData(); }, []);

  async function handleLinkCustomer(orderId: number, customerId: number | null) {
    try {
      const updated = await api.adminLinkOrderToCustomer(orderId, customerId);
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, customer_id: updated.customer_id, customer_username: updated.customer_username } : o));
      toast(customerId ? `顧客「${updated.customer_username}」に紐づけました` : "顧客との紐づけを解除しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "紐づけに失敗しました", "error");
    } finally {
      setLinkingOrderId(null);
    }
  }

  const statusLabel: Record<string, string> = { new: "🆕 新規", in_progress: "🔧 対応中", delivered: "✅ 納品済" };
  const statusColor: Record<string, string> = { new: "#fff8e1", in_progress: "#e8f4fd", delivered: "#e8fdf0" };

  async function updateStatus(id: number, status: string) {
    try {
      await api.adminUpdateOrder(id, { status });
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
      const label: Record<string,string> = { new:"新規", in_progress:"対応中", delivered:"納品済" };
      toast(`ステータスを「${label[status]}」に変更しました`, "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "更新に失敗しました", "error");
    }
  }

  async function saveNote(id: number) {
    try {
      await api.adminUpdateOrder(id, { notes: noteText });
      setOrders(prev => prev.map(o => o.id === id ? { ...o, notes: noteText } : o));
      setEditingNoteId(null);
      toast("メモを保存しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "error");
    }
  }

  // 「対応が必要な受注」：未納品、またはキャラ作成・報酬ループ・ウェルカムページ・挨拶DM・
  // 記事依頼・添削の対応待ちが残っている受注
  function needsAttention(o: any): boolean {
    return o.status !== "delivered"
      || !!o.character_creation_pending
      || !!o.reward_loop_pending
      || !!o.welcome_page_pending
      || !!o.greeting_dm_pending
      || (o.pending_article_requests?.length ?? 0) > 0
      || (o.pending_corrections?.length ?? 0) > 0;
  }

  const filtered = orders.filter(o => {
    const matchText = !filterText ||
      o.customer_name?.toLowerCase().includes(filterText.toLowerCase()) ||
      o.character_name?.toLowerCase().includes(filterText.toLowerCase()) ||
      o.grammar_topic?.toLowerCase().includes(filterText.toLowerCase()) ||
      o.contact?.toLowerCase().includes(filterText.toLowerCase());
    const matchStatus = !filterStatus || o.status === filterStatus;
    return matchText && matchStatus;
  });

  // 対応が必要な受注を先頭にまとめ、対応完了済みの受注は下部に表示する
  const sorted = [...filtered].sort((a, b) => {
    const an = needsAttention(a) ? 0 : 1;
    const bn = needsAttention(b) ? 0 : 1;
    return an - bn;
  });
  const attentionCount = filtered.filter(needsAttention).length;

  function toggleExpanded(id: number) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // 受注を展開し、該当カードまでスクロールする（やることリストからのジャンプ用）
  function focusOrder(id: number) {
    setExpandedIds(prev => new Set(prev).add(id));
    setTimeout(() => cardRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }

  // 「やることリスト」：対応が必要なタスクを顧客ごとにグループ化して一覧化する
  // orderId が無いタスク（顧客単位の日次DMリマインダーなど）は onClick を直接指定する
  // customerId が無いタスク（定期便プールの在庫不足など）は「その他」グループにまとめる
  type TaskItem = { orderId?: number; customerId?: number | null; customerName?: string; icon: string; label: string; color: string; bg: string; onClick?: () => void };
  const tasks: TaskItem[] = [];
  for (const o of filtered) {
    if (o.order_type === "template_stock") {
      if (o.status !== "delivered") {
        tasks.push({
          orderId: o.id, icon: "📦",
          label: "定期便プールの記事が不足しています。記事管理タブで「定期便プール」記事を追加してください",
          color: "#8e44ad", bg: "#f5e8fb",
        });
      }
      continue;
    }
    if (o.status === "new") {
      tasks.push({ orderId: o.id, customerId: o.customer_id, customerName: o.customer_name, icon: "🆕", label: "新規受注の対応を開始", color: "#b8860b", bg: "#fff8e1" });
    }
    if (o.character_creation_pending) {
      tasks.push({ orderId: o.id, customerId: o.customer_id, customerName: o.customer_name, icon: "🎨", label: "キャラクター作成が未対応", color: "#c0392b", bg: "#fdebe8" });
    }
    if (o.reward_loop_pending) {
      tasks.push({ orderId: o.id, customerId: o.customer_id, customerName: o.customer_name, icon: "🎁", label: "報酬・成長ループが未設定", color: "#8e44ad", bg: "#f5e8fb" });
    }
    if (o.welcome_page_pending) {
      tasks.push({ orderId: o.id, customerId: o.customer_id, customerName: o.customer_name, icon: "🏠", label: "ウェルカムページが未作成", color: "#2980b9", bg: "#e8f0fd" });
    }
    if (o.greeting_dm_pending) {
      tasks.push({ orderId: o.id, customerId: o.customer_id, customerName: o.customer_name, icon: "👋", label: "挨拶DMが未送信", color: "#16a085", bg: "#e8fdf7" });
    }
    (o.pending_article_requests ?? []).forEach((r: any) => {
      tasks.push({
        orderId: o.id, customerId: o.customer_id, customerName: o.customer_name, icon: "📝",
        label: `記事依頼「${r.grammar_topic || "未指定"}」${r.request_status === "accepted" ? "（対応中・記事作成待ち）" : "（未対応）"}`,
        color: "#2471a3", bg: "#e8f4fd",
      });
    });
    (o.pending_corrections ?? []).forEach((c: any) => {
      tasks.push({
        orderId: o.id, customerId: o.customer_id, customerName: o.customer_name, icon: "✏️",
        label: `添削（${c.correction_type === "writing" ? "ライティング" : "スピーキング"}）${c.status === "in_progress" ? "（対応中）" : "（未対応）"}`,
        color: "#a36a1f", bg: "#fdf3e8",
      });
    });
    if (o.status === "in_progress"
      && !o.character_creation_pending
      && !o.reward_loop_pending
      && !o.welcome_page_pending
      && !o.greeting_dm_pending
      && (o.pending_article_requests?.length ?? 0) === 0
      && (o.pending_corrections?.length ?? 0) === 0) {
      tasks.push({ orderId: o.id, customerId: o.customer_id, customerName: o.customer_name, icon: "✅", label: "対応完了・納品処理を行ってください", color: "#1a6ea8", bg: "#e8f4fd" });
    }
  }

  // 「1日1個のメッセージをお客に送る」リマインダー：日付が変わったら全顧客分のDM送信タスクを再登録する
  const todayStr = new Date().toDateString();
  for (const cu of customers) {
    const lastAt = cu.last_character_message_at ? new Date(cu.last_character_message_at) : null;
    if (lastAt && lastAt.toDateString() === todayStr) continue;
    tasks.push({
      customerId: cu.id, customerName: cu.username, icon: "💬",
      label: "本日のDMを送信してください",
      color: "#16a085", bg: "#e8fdf7",
      onClick: () => onNavigateToMessages?.(cu.id),
    });
  }

  // 定期便プール不足リマインダー：自分専用キャラが割り当て済みの顧客で、
  // 配布できる未配布の定期便プール記事が残っていない（次回配布時に不足する）顧客を一覧化する
  for (const cu of customers) {
    if (!cu.character_id) continue;
    if ((cu.template_pool_remaining ?? 0) > 0) continue;
    tasks.push({
      customerId: cu.id, customerName: cu.username, icon: "📦",
      label: "定期便プールの記事が不足しています。記事管理タブで「定期便プール」記事を追加してください",
      color: "#8e44ad", bg: "#f5e8fb",
    });
  }

  // 顧客ごとにタスクをグループ化する（customerId が無いものは「その他」にまとめる）
  type TaskGroup = { key: string; name: string; tasks: TaskItem[] };
  const taskGroups: TaskGroup[] = [];
  const taskGroupMap = new Map<string, TaskGroup>();
  for (const t of tasks) {
    const key = t.customerId != null ? `c-${t.customerId}` : "other";
    let g = taskGroupMap.get(key);
    if (!g) {
      g = { key, name: t.customerName ?? "その他", tasks: [] };
      taskGroupMap.set(key, g);
      taskGroups.push(g);
    }
    g.tasks.push(t);
  }

  if (loading) return <p style={{ color: "var(--muted)" }}>読み込み中…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-xl font-black" style={{ color: "var(--primary)" }}>📋 受注リスト</h2>
      </div>

      {/* 検索・フィルターバー */}
      <div className="flex flex-wrap gap-2 mb-4 p-3 rounded-xl" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
        <input className="flex-1 min-w-40 text-sm py-1.5 px-3 rounded-lg" style={{ border: "1px solid var(--border)" }}
          placeholder="顧客名・キャラ・文法・連絡先で検索…"
          value={filterText} onChange={e => setFilterText(e.target.value)} />
        <select className="text-sm py-1.5 px-2 rounded-lg" style={{ border: "1px solid var(--border)", background: "white", width: "auto" }}
          value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">全ステータス</option>
          <option value="new">🆕 新規</option>
          <option value="in_progress">🔧 対応中</option>
          <option value="delivered">✅ 納品済</option>
        </select>
        {(filterText || filterStatus) && (
          <button className="text-xs px-3 py-1.5 rounded-lg" style={{ color: "var(--accent)", border: "1px solid var(--border)" }}
            onClick={() => { setFilterText(""); setFilterStatus(""); }}>クリア ✕</button>
        )}
        <span className="text-xs self-center" style={{ color: "var(--muted)" }}>{filtered.length} / {orders.length} 件</span>
      </div>

      {/* やることリスト：受注単位ではなく、タスク単位でフラットに対応事項を一覧化する */}
      {filtered.length > 0 && (
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold" style={{ color: "var(--primary)" }}>🔔 やることリスト</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                対応が必要な受注: <b style={{ color: "var(--accent)" }}>{attentionCount}</b> 件 ／ タスク: <b style={{ color: "var(--accent)" }}>{tasks.length}</b> 件
              </span>
              <button type="button" onClick={loadData} disabled={loading}
                className="text-xs px-2 py-0.5 rounded border"
                style={{ borderColor: "var(--border)", color: "var(--muted)", background: "var(--bg)" }}>
                🔄 更新
              </button>
            </div>
          </div>
          {tasks.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>🎉 現在対応が必要なタスクはありません</p>
          ) : (
            <div className="flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: "24rem" }}>
              {taskGroups.map(g => (
                <div key={g.key} className="rounded-lg p-2" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-bold text-sm" style={{ color: "var(--primary)" }}>{g.name === "その他" ? "📦 その他" : `👤 ${g.name}`}</span>
                    <span className="text-xs" style={{ color: "var(--muted)" }}>{g.tasks.length} 件</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {g.tasks.map((t, i) => (
                      <button key={i} onClick={() => t.onClick ? t.onClick() : focusOrder(t.orderId!)}
                        className="text-left text-xs px-3 py-2 rounded-lg flex items-center gap-2 transition-opacity hover:opacity-80"
                        style={{ background: t.bg, color: t.color }}>
                        <span>{t.icon}</span>
                        <span className="flex-1 font-medium">{t.label}</span>
                        <span className="flex-shrink-0" style={{ opacity: 0.7 }}>対応する ▸</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {orders.length === 0 ? <p style={{ color: "var(--muted)" }}>受注はありません</p> : (
        <div className="flex flex-col gap-3">
          {sorted.map(o => {
            const attention = needsAttention(o);
            const expanded = expandedIds.has(o.id);
            if (o.order_type === "template_stock") {
              // 定期便プールの記事不足タスク：通常の受注情報（顧客紐づけ・キャラ作成プロンプト等）は不要なので簡易表示
              return (
                <div key={o.id} ref={el => { cardRefs.current[o.id] = el; }}
                  className="card flex items-center justify-between gap-3 flex-wrap" style={{ background: statusColor[o.status] || "#f5e8fb" }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold" style={{ color: "#8e44ad" }}>📦 {o.customer_name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.08)" }}>{statusLabel[o.status]}</span>
                    </div>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>{o.notes}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {o.status === "new" && <button className="btn-accent text-xs py-1 px-3" onClick={() => updateStatus(o.id, "in_progress")}>対応開始</button>}
                    {o.status === "in_progress" && <button className="btn-primary text-xs py-1 px-3" onClick={() => updateStatus(o.id, "delivered")}>追加完了</button>}
                    {o.status === "delivered" && (
                      <button className="text-xs py-1 px-3 rounded-lg" style={{ color: "#c0392b" }}
                        onClick={async () => {
                          try {
                            await api.adminDeleteOrder(o.id);
                            setOrders(prev => prev.filter(x => x.id !== o.id));
                            toast("タスクを削除しました", "info");
                          } catch (err: unknown) {
                            toast(err instanceof Error ? err.message : "削除に失敗しました", "error");
                          }
                        }}>削除</button>
                    )}
                  </div>
                </div>
              );
            }
            if (!attention && !expanded) {
              // 対応完了済みの受注：簡易表示（クリックで詳細展開）
              return (
                <button key={o.id} onClick={() => toggleExpanded(o.id)}
                  className="card flex items-center justify-between gap-3 text-left hover:opacity-80 transition-opacity"
                  style={{ background: statusColor[o.status] || "white" }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold truncate" style={{ color: "var(--primary)" }}>{o.customer_name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "rgba(0,0,0,0.08)" }}>{statusLabel[o.status]}</span>
                    {o.customer_id && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0" style={{ background: "#e8fdf0", color: "#1a7a3c" }}>
                        🔗 {o.customer_username ?? `ID:${o.customer_id}`}
                      </span>
                    )}
                  </div>
                  <span className="text-xs flex-shrink-0" style={{ color: "var(--accent)" }}>詳細を見る ▾</span>
                </button>
              );
            }
            return (
            <div key={o.id} ref={el => { cardRefs.current[o.id] = el; }} className="card flex flex-col gap-2" style={{ background: statusColor[o.status] || "white" }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold" style={{ color: "var(--primary)" }}>{o.customer_name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.08)" }}>{statusLabel[o.status]}</span>
                  </div>
                  <p className="text-sm" style={{ color: "var(--text)" }}>
                    キャラ: <b>{o.character_name || "未指定"}</b>　文法: <b>{o.grammar_topic || "未指定"}</b>
                  </p>
                  {o.contact && <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>連絡先: {o.contact}</p>}
                  {/* 顧客アカウント紐づけ表示 */}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {o.customer_id ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#e8fdf0", color: "#1a7a3c" }}>
                        🔗 顧客: {o.customer_username ?? `ID:${o.customer_id}`}
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: "var(--muted)" }}>顧客アカウント未紐づけ</span>
                    )}
                    {linkingOrderId === o.id ? (
                      <div className="flex items-center gap-1">
                        <select className="text-xs" style={{ maxWidth: "12rem" }}
                          defaultValue=""
                          onChange={e => {
                            const val = e.target.value;
                            if (val === "__unlink__") { handleLinkCustomer(o.id, null); return; }
                            if (val) handleLinkCustomer(o.id, Number(val));
                          }}>
                          <option value="">— 選択 —</option>
                          <option value="__unlink__">🚫 紐づけ解除</option>
                          {customers.map(cu => (
                            <option key={cu.id} value={cu.id}>{cu.username}</option>
                          ))}
                        </select>
                        <button className="text-xs px-2 py-0.5 rounded" style={{ color: "var(--muted)" }}
                          onClick={() => setLinkingOrderId(null)}>×</button>
                      </div>
                    ) : (
                      <button className="text-xs px-2 py-0.5 rounded border" style={{ borderColor: "var(--border)", color: "var(--accent)" }}
                        onClick={() => setLinkingOrderId(o.id)}>
                        {o.customer_id ? "🔄 紐づけ変更" : "🔗 顧客と紐づける"}
                      </button>
                    )}
                  </div>
                  {/* 添削・記事リクエスト・キャラ作成の対応待ち事項を子要素として表示 */}
                  {(o.character_creation_pending || o.reward_loop_pending || o.welcome_page_pending || o.greeting_dm_pending || o.pending_corrections?.length > 0 || o.pending_article_requests?.length > 0) && (
                    <div className="flex flex-col gap-1 mt-2 pl-3" style={{ borderLeft: "2px solid var(--border)" }}>
                      {o.character_creation_pending && (
                        <div className="flex flex-col gap-1">
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium self-start flex items-center gap-1.5 flex-wrap" style={{ background: "#fdebe8", color: "#c0392b" }}>
                            🎨 キャラクター作成: 未対応
                            <button type="button"
                              className="text-xs px-2 py-0.5 rounded-full font-bold"
                              style={{ background: "#c0392b", color: "#fff" }}
                              onClick={() => {
                                if (promptOrderId === o.id) {
                                  setPromptOrderId(null);
                                } else {
                                  setGeneratedPrompt(buildCharacterGenerationPromptFromOrder(o));
                                  setPromptOrderId(o.id);
                                }
                              }}>
                              🤖 {promptOrderId === o.id ? "プロンプトを閉じる" : "キャラ設計プロンプト生成"}
                            </button>
                            {(() => {
                              const spec = parseOrderCharSpec(o);
                              const badge =
                                spec.type === "builder"  ? `🎨 ビルダー（${[spec.gender, spec.rel, spec.pers].filter(Boolean).join(" / ")}）`
                                : spec.type === "custom"  ? "✍️ オリジナル定義"
                                : spec.type === "leave_it"? "🙌 おまかせ"
                                : "📋 手動入力";
                              return (
                                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--card-bg, #fff)", color: "var(--muted)" }}>
                                  {badge}
                                </span>
                              );
                            })()}
                          </span>
                          {promptOrderId === o.id && (
                            <div className="flex flex-col gap-2 mt-1">
                              <p className="text-xs" style={{ color: "var(--muted)" }}>
                                以下をコピーしてChatGPT / Claudeに貼り付けると、キャラクター設計一式（説明文・一言バリエーション・tone_profile・カラースキーム・フォント・画像ヒント）が生成されます。
                              </p>
                              <textarea
                                readOnly
                                rows={8}
                                className="text-xs w-full"
                                style={{ fontFamily: "monospace", resize: "vertical", background: "var(--bg)", color: "var(--text)" }}
                                value={generatedPrompt}
                              />
                              <button
                                className="btn-accent text-xs py-1 px-4 self-start"
                                onClick={() => {
                                  navigator.clipboard.writeText(generatedPrompt)
                                    .then(() => toast("プロンプトをコピーしました", "success"))
                                    .catch(() => toast("コピーに失敗しました", "error"));
                                }}
                              >
                                📋 クリップボードにコピー
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {o.reward_loop_pending && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium self-start flex items-center gap-1.5" style={{ background: "#f5e8fb", color: "#8e44ad" }}>
                          🎁 報酬・成長ループ: 未設定
                          {onNavigateToRewards && o.customer_character_id && (
                            <button type="button"
                              className="text-xs px-2 py-0.5 rounded-full font-bold"
                              style={{ background: "#8e44ad", color: "#fff" }}
                              onClick={() => onNavigateToRewards(o.customer_character_id)}>
                              🎁 報酬・成長ループを設定 ▸
                            </button>
                          )}
                        </span>
                      )}
                      {o.welcome_page_pending && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium self-start flex items-center gap-1.5" style={{ background: "#e8f0fd", color: "#2980b9" }}>
                          🏠 ウェルカムページ: 未作成
                          {onNavigateToWelcomePage && o.customer_character_id && (
                            <button type="button"
                              className="text-xs px-2 py-0.5 rounded-full font-bold"
                              style={{ background: "#2980b9", color: "#fff" }}
                              onClick={() => onNavigateToWelcomePage(o.customer_character_id)}>
                              🏠 ウェルカムページを作成 ▸
                            </button>
                          )}
                        </span>
                      )}
                      {o.greeting_dm_pending && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium self-start flex items-center gap-1.5" style={{ background: "#e8fdf7", color: "#16a085" }}>
                          👋 挨拶DM: 未送信
                          {onNavigateToMessages && o.customer_id && (
                            <button type="button"
                              className="text-xs px-2 py-0.5 rounded-full font-bold"
                              style={{ background: "#16a085", color: "#fff" }}
                              onClick={() => onNavigateToMessages(o.customer_id)}>
                              👋 挨拶DMを送る ▸
                            </button>
                          )}
                        </span>
                      )}
                      {o.pending_article_requests?.map((r: any) => (
                        <span key={`req-${r.id}`} className="text-xs px-2 py-0.5 rounded-full font-medium self-start flex items-center gap-1.5" style={{ background: "#e8f4fd", color: "#2471a3" }}>
                          📝 記事依頼: {r.grammar_topic || "未指定"}（{r.request_status === "accepted" ? "対応中" : "未対応"}）
                          {onCreateArticleFromRequest && (
                            <button type="button"
                              className="text-xs px-2 py-0.5 rounded-full font-bold"
                              style={{ background: "#2471a3", color: "#fff" }}
                              onClick={() => onCreateArticleFromRequest(o, r, inferExerciseCategoryFromTopic(r.grammar_topic))}>
                              📝 記事を作成 ▸
                            </button>
                          )}
                        </span>
                      ))}
                      {o.pending_corrections?.map((c: any) => (
                        <span key={`cor-${c.id}`} className="text-xs px-2 py-0.5 rounded-full font-medium self-start" style={{ background: "#fdf3e8", color: "#a36a1f" }}>
                          ✏️ 添削（{c.correction_type === "writing" ? "ライティング" : "スピーキング"}）: {c.status === "in_progress" ? "対応中" : "未対応"}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {!attention && (
                    <button className="text-xs px-2 py-0.5 rounded" style={{ color: "var(--muted)" }}
                      onClick={() => toggleExpanded(o.id)}>▲ 折りたたむ</button>
                  )}
                  {o.status === "new" && <button className="btn-accent text-xs py-1 px-3" onClick={() => updateStatus(o.id, "in_progress")}>対応開始</button>}
                  {o.status === "in_progress" && <button className="btn-primary text-xs py-1 px-3" onClick={() => updateStatus(o.id, "delivered")}>納品完了</button>}
                  {o.status === "delivered" && (
                    <button className="text-xs py-1 px-3 rounded-lg" style={{ color: "#c0392b" }}
                      onClick={async () => {
                        if (!confirm("この受注を削除しますか？")) return;
                        try {
                          await api.adminDeleteOrder(o.id);
                          setOrders(prev => prev.filter(x => x.id !== o.id));
                          toast("受注を削除しました", "info");
                        } catch (err: unknown) {
                          toast(err instanceof Error ? err.message : "削除に失敗しました", "error");
                        }
                      }}>削除</button>
                  )}
                </div>
              </div>

              {/* メモ欄 */}
              {editingNoteId === o.id ? (
                <div className="flex gap-2 items-end">
                  <textarea rows={2} className="flex-1 text-sm" value={noteText}
                    onChange={e => setNoteText(e.target.value)} placeholder="メモを入力…" />
                  <div className="flex flex-col gap-1">
                    <button className="btn-accent text-xs py-1 px-3" onClick={() => saveNote(o.id)}>保存</button>
                    <button className="btn-ghost text-xs py-1 px-3" onClick={() => setEditingNoteId(null)}>閉じる</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {o.notes
                    ? <p className="text-xs flex-1" style={{ color: "var(--muted)" }}>📝 {o.notes}</p>
                    : <p className="text-xs flex-1" style={{ color: "var(--muted)", opacity: 0.5 }}>メモなし</p>
                  }
                  <button className="text-xs px-2 py-0.5 rounded" style={{ color: "var(--accent)" }}
                    onClick={() => { setEditingNoteId(o.id); setNoteText(o.notes ?? ""); }}>
                    {o.notes ? "編集" : "+ メモ"}
                  </button>
                </div>
              )}

            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}