"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { parseOrderCharSpec, buildCharacterPromptFromOrder } from "../lib/promptBuilders";

const emptyOrderForm = { customer_name: "", contact: "", character_name: "", grammar_topic: "", status: "new", notes: "" };

export function OrdersTab() {
  const [orders, setOrders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");
  const [filterText, setFilterText] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(emptyOrderForm);
  const [adding, setAdding] = useState(false);
  const [linkingOrderId, setLinkingOrderId] = useState<number | null>(null);
  const [promptOrderId,  setPromptOrderId]  = useState<number | null>(null);
  const [generatedPrompt, setGeneratedPrompt] = useState<string>("");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    Promise.all([api.adminGetOrders(), api.adminGetCustomers()])
      .then(([o, c]) => { setOrders(o); setCustomers(c.filter((cu: any) => !cu.is_admin)); })
      .finally(() => setLoading(false));
  }, []);

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

  async function handleAddOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm.customer_name.trim()) { toast("お客様名を入力してください", "error"); return; }
    setAdding(true);
    try {
      const created = await api.adminCreateOrder({
        customer_name: addForm.customer_name.trim(),
        contact: addForm.contact.trim() || null,
        character_name: addForm.character_name.trim() || null,
        grammar_topic: addForm.grammar_topic.trim() || null,
        status: addForm.status,
        notes: addForm.notes.trim() || null,
      });
      setOrders(prev => [created, ...prev]);
      setAddForm(emptyOrderForm);
      setShowAddForm(false);
      toast(`受注「${created.customer_name}」を追加しました`, "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "追加に失敗しました", "error");
    } finally {
      setAdding(false);
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

  // 「対応が必要な受注」：未納品、またはキャラ作成・記事依頼・添削の対応待ちが残っている受注
  function needsAttention(o: any): boolean {
    return o.status !== "delivered"
      || !!o.character_creation_pending
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

  if (loading) return <p style={{ color: "var(--muted)" }}>読み込み中…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-xl font-black" style={{ color: "var(--primary)" }}>📋 受注リスト</h2>
        <button className="btn-accent" onClick={() => setShowAddForm(v => !v)}>
          {showAddForm ? "キャンセル" : "+ 受注を追加"}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAddOrder} className="card mb-6 flex flex-col gap-3">
          <h3 className="font-bold" style={{ color: "var(--primary)" }}>受注を手動で追加</h3>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            ※ 申し込みフォーム経由以外で受けた注文（電話・対面・LINEなど）を記録するための機能です。
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>お客様名 *</label>
              <input value={addForm.customer_name} onChange={e => setAddForm({ ...addForm, customer_name: e.target.value })} required placeholder="山田 太郎" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>連絡先（SNS等）</label>
              <input value={addForm.contact} onChange={e => setAddForm({ ...addForm, contact: e.target.value })} placeholder="例: @example_account / LINE ID" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>希望キャラクター</label>
              <input value={addForm.character_name} onChange={e => setAddForm({ ...addForm, character_name: e.target.value })} placeholder="例: ヒーロー先生" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>文法トピック</label>
              <input value={addForm.grammar_topic} onChange={e => setAddForm({ ...addForm, grammar_topic: e.target.value })} placeholder="例: 仮定法過去" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>ステータス</label>
              <select value={addForm.status} onChange={e => setAddForm({ ...addForm, status: e.target.value })}>
                <option value="new">🆕 新規</option>
                <option value="in_progress">🔧 対応中</option>
                <option value="delivered">✅ 納品済</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>メモ</label>
              <textarea rows={2} value={addForm.notes} onChange={e => setAddForm({ ...addForm, notes: e.target.value })} placeholder="運営者用メモ（任意）" />
            </div>
          </div>
          <button type="submit" className="btn-primary w-full text-center" disabled={adding}>
            {adding ? "追加中…" : "受注を追加する"}
          </button>
        </form>
      )}

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

      {filtered.length > 0 && (
        <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
          🔴 対応が必要な受注: <b style={{ color: "var(--accent)" }}>{attentionCount}</b> 件
          {attentionCount < filtered.length && "（対応完了済みの受注は下部にまとめて表示しています）"}
        </p>
      )}

      {orders.length === 0 ? <p style={{ color: "var(--muted)" }}>受注はありません</p> : (
        <div className="flex flex-col gap-3">
          {sorted.map(o => {
            const attention = needsAttention(o);
            const expanded = expandedIds.has(o.id);
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
            <div key={o.id} className="card flex flex-col gap-2" style={{ background: statusColor[o.status] || "white" }}>
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
                  {(o.character_creation_pending || o.pending_corrections?.length > 0 || o.pending_article_requests?.length > 0) && (
                    <div className="flex flex-col gap-1 mt-2 pl-3" style={{ borderLeft: "2px solid var(--border)" }}>
                      {o.character_creation_pending && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium self-start" style={{ background: "#fdebe8", color: "#c0392b" }}>
                          🎨 キャラクター作成: 未対応
                        </span>
                      )}
                      {o.pending_article_requests?.map((r: any) => (
                        <span key={`req-${r.id}`} className="text-xs px-2 py-0.5 rounded-full font-medium self-start" style={{ background: "#e8f4fd", color: "#2471a3" }}>
                          📝 記事依頼: {r.grammar_topic || "未指定"}（{r.request_status === "accepted" ? "対応中" : "未対応"}）
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

              {/* ── キャラクタープロンプト生成 ──────────────────────────── */}
              <div className="pt-1 border-t" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    className="text-xs px-3 py-1 rounded-lg font-medium"
                    style={{ background: "var(--accent)", color: "#fff" }}
                    onClick={() => {
                      if (promptOrderId === o.id) {
                        setPromptOrderId(null);
                      } else {
                        setGeneratedPrompt(buildCharacterPromptFromOrder(o));
                        setPromptOrderId(o.id);
                      }
                    }}
                  >
                    🤖 {promptOrderId === o.id ? "プロンプトを閉じる" : "キャラ設計プロンプト生成"}
                  </button>
                  {/* キャラ設定の種別バッジ */}
                  {(() => {
                    const spec = parseOrderCharSpec(o);
                    const badge =
                      spec.type === "builder"  ? `🎨 ビルダー（${[spec.gender, spec.rel, spec.pers].filter(Boolean).join(" / ")}）`
                      : spec.type === "custom"  ? "✍️ オリジナル定義"
                      : spec.type === "leave_it"? "🙌 おまかせ"
                      : "📋 手動入力";
                    return (
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: "var(--bg)", color: "var(--muted)", border: "1px solid var(--border)" }}>
                        {badge}
                      </span>
                    );
                  })()}
                </div>

                {promptOrderId === o.id && (
                  <div className="mt-2 flex flex-col gap-2">
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
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}