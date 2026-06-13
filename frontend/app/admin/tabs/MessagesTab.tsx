"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { buildSuggestedQuestions, buildQuestionIdeaPrompt, buildRewardImagePrompt, type SuggestedQuestion } from "../lib/promptBuilders";

const API_ORIGIN_M = process.env.NEXT_PUBLIC_API_URL || "http://localhost/api";

const ARTICLE_REQUEST_PROMPT_TEMPLATE =
  "そろそろ次の記事はどう？気になる文法や試験パート、添削してほしいものがあったら、" +
  "📋「記事をリクエスト」ボタンから教えてね！";

export function MessagesTab() {
  const [threads, setThreads] = useState<any[]>([]);
  const [operators, setOperators] = useState<{ id: number; username: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);

  // 複数オペレーターでの分担運用のための絞り込み・並び替え
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all"); // "all" | "unassigned" | `${id}`
  const [priorityFilter, setPriorityFilter] = useState<string>("all"); // "all" | "normal" | "high"
  const [sortBy, setSortBy] = useState<string>("urgency"); // "urgency" | "priority" | "oldest_reply"

  async function loadThreads() {
    setLoading(true);
    try {
      const params: { assignedAdminId?: number | null; unassigned?: boolean; priority?: string; sort?: string } = { sort: sortBy };
      if (assigneeFilter === "unassigned") params.unassigned = true;
      else if (assigneeFilter !== "all") params.assignedAdminId = Number(assigneeFilter);
      if (priorityFilter !== "all") params.priority = priorityFilter;
      const data = await api.adminListThreads(params);
      setThreads(data);
      if (selected === null && data.length > 0) setSelected(data[0].customer_id);
    } catch (err: any) {
      toast(err.message || "読み込みに失敗しました", "error");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    api.adminListOperators().then(setOperators).catch(() => {});
  }, []);

  useEffect(() => { loadThreads(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [assigneeFilter, priorityFilter, sortBy]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-xl font-black" style={{ color: "var(--primary)" }}>💬 チャット</h2>
        <button className="btn-ghost text-sm" onClick={loadThreads}>🔄 更新</button>
      </div>

      {/* 担当者・優先度の絞り込み／並び替え（分担運用用） */}
      <div className="flex items-center gap-2 flex-wrap mb-4 text-sm">
        <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}
          className="px-2 py-1.5 rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}>
          <option value="all">担当者：すべて</option>
          <option value="unassigned">未割当のみ</option>
          {operators.map(o => <option key={o.id} value={String(o.id)}>{o.username}</option>)}
        </select>
        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
          className="px-2 py-1.5 rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}>
          <option value="all">優先度：すべて</option>
          <option value="high">🔴 優先のみ</option>
          <option value="normal">通常のみ</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          className="px-2 py-1.5 rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}>
          <option value="urgency">並び順：未対応優先</option>
          <option value="priority">並び順：優先度順</option>
          <option value="oldest_reply">並び順：返信が古い順</option>
        </select>
      </div>

      {loading ? (
        <p style={{ color: "var(--muted)" }}>読み込み中...</p>
      ) : threads.length === 0 ? (
        <div className="card text-center py-12" style={{ color: "var(--muted)" }}>該当するスレッドはありません</div>
      ) : (
        <div className="grid gap-5 grid-cols-1 lg:[grid-template-columns:280px_1fr]">
          {/* スレッド一覧 */}
          <div className="card !p-2 flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: "75vh" }}>
            {threads.map(th => {
              const badge = th.pending_requests + th.unread_from_customer + th.reward_status.pending_rewards;
              const cs = th.character_color_scheme ?? {};
              const charColor = cs.primary || cs.accent || null;
              return (
                <button key={th.customer_id}
                  onClick={() => setSelected(th.customer_id)}
                  className={`text-left px-3 py-2.5 rounded-lg transition-all flex items-start gap-2 ${selected === th.customer_id ? "shadow-sm" : "hover:bg-black/5"}`}
                  style={{
                    background: selected === th.customer_id ? "var(--bg)" : "transparent",
                    borderLeft: charColor ? `3px solid ${charColor}` : "3px solid transparent",
                  }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-bold text-sm truncate" style={{ color: charColor || "var(--primary)" }}>{th.username}</p>
                      {th.priority === "high" && <span className="text-[10px] flex-shrink-0">🔴</span>}
                      {badge > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-black text-white flex-shrink-0" style={{ background: "var(--accent)" }}>
                          {badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs truncate" style={{ color: "var(--muted)" }}>
                      {th.character_name ? `🎭 ${th.character_name}` : "未割当"}
                      {th.intimacy && <span className="ml-1.5">💗 Lv.{th.intimacy.level}（{th.intimacy.stage_label}）</span>}
                    </p>
                    <p className="text-xs truncate mt-0.5" style={{ color: "var(--muted)" }}>
                      👤 {th.assigned_admin_name || "担当未割当"}
                    </p>
                    {th.last_message && (
                      <p className="text-xs truncate mt-0.5" style={{ color: "var(--muted)" }}>
                        {th.last_message.sender === "character" ? "あなた: " : ""}
                        {th.last_message.is_reward ? "🎁 ご褒美写真を送信" : (th.last_message.content || (th.last_message.is_request ? `📋 リクエスト：${th.last_message.grammar_topic}` : ""))}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* スレッド詳細 */}
          <div>
            {selected !== null && <ThreadDetail customerId={selected} onChanged={loadThreads} operators={operators} />}
          </div>
        </div>
      )}
    </div>
  );
}

function ThreadDetail({ customerId, onChanged, operators }: { customerId: number; onChanged: () => void; operators: { id: number; username: string }[] }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [suggestCorrection, setSuggestCorrection] = useState(false);
  const [rewardMsg, setRewardMsg] = useState("");
  const [uploadingReward, setUploadingReward] = useState(false);
  const [editingMsgId, setEditingMsgId] = useState<number | null>(null);
  const [editMsgText, setEditMsgText] = useState("");
  const [msgBusyId, setMsgBusyId] = useState<number | null>(null);
  const [adjustingIntimacy, setAdjustingIntimacy] = useState(false);
  const [suggestionSeed, setSuggestionSeed] = useState(0);
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draftingReply, setDraftingReply] = useState(false);
  const [memo, setMemo] = useState("");
  const [savingMemo, setSavingMemo] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      const el = messagesContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  async function load() {
    setLoading(true);
    try {
      const d = await api.adminGetThread(customerId);
      setData(d);
      setMemo(d.customer.admin_memo || "");
      scrollToBottom();
    } catch (err: any) {
      toast(err.message || "読み込みに失敗しました", "error");
    } finally { setLoading(false); }
  }

  async function loadOlder() {
    if (loadingMore || !data || data.messages.length === 0) return;
    setLoadingMore(true);
    try {
      const d = await api.adminGetThread(customerId, { beforeId: data.messages[0].id });
      setData((prev: any) => ({ ...prev, messages: [...d.messages, ...prev.messages], has_more: d.has_more }));
    } catch (err: any) {
      toast(err.message || "読み込みに失敗しました", "error");
    } finally { setLoadingMore(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [customerId]);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim() || sending) return;
    setSending(true);
    try {
      await api.adminReplyMessage(customerId, reply.trim(), suggestCorrection ? "request_correction" : undefined);
      setReply("");
      setSuggestCorrection(false);
      await load();
      onChanged();
    } catch (err: any) {
      toast(err.message || "送信に失敗しました", "error");
    } finally { setSending(false); }
  }

  async function handleRequestStatus(messageId: number, status: string) {
    try {
      await api.adminUpdateRequestStatus(messageId, status);
      await load();
      onChanged();
      toast("リクエストの状態を更新しました", "success");
    } catch (err: any) {
      toast(err.message || "更新に失敗しました", "error");
    }
  }

  async function handleSaveMessageEdit(messageId: number) {
    if (!editMsgText.trim()) { toast("メッセージ内容を入力してください", "error"); return; }
    setMsgBusyId(messageId);
    try {
      await api.adminEditMessage(messageId, editMsgText.trim());
      setEditingMsgId(null);
      await load();
      toast("メッセージを編集しました", "success");
    } catch (err: any) {
      toast(err.message || "編集に失敗しました", "error");
    } finally { setMsgBusyId(null); }
  }

  async function handleDeleteMessage(messageId: number) {
    if (!confirm("このメッセージを削除しますか？この操作は取り消せません。")) return;
    setMsgBusyId(messageId);
    try {
      await api.adminDeleteMessage(messageId);
      await load();
      onChanged();
      toast("メッセージを削除しました", "info");
    } catch (err: any) {
      toast(err.message || "削除に失敗しました", "error");
    } finally { setMsgBusyId(null); }
  }

  async function handleIntimacyAdjust(delta: number) {
    if (adjustingIntimacy) return;
    const reasonPrompt = delta > 0
      ? "親密度を上げる理由（任意・記録用）を入力してください"
      : "親密度を下げる理由（任意・記録用）を入力してください　例：返信がそっけなかった";
    const reason = window.prompt(reasonPrompt, "") || undefined;
    setAdjustingIntimacy(true);
    try {
      await api.adminAdjustIntimacy(customerId, delta, reason);
      await load();
      onChanged();
      toast(`親密度を${delta > 0 ? "+" : ""}${delta} 調整しました`, "success");
    } catch (err: any) {
      toast(err.message || "調整に失敗しました", "error");
    } finally { setAdjustingIntimacy(false); }
  }

  async function handleDraftReply() {
    if (draftingReply) return;
    setDraftingReply(true);
    try {
      const { draft } = await api.adminDraftReply(customerId);
      setReply(draft);
    } catch (err: any) {
      toast(err.message || "下書きの生成に失敗しました", "error");
    } finally { setDraftingReply(false); }
  }

  async function handleSaveMemo() {
    setSavingMemo(true);
    try {
      await api.adminUpdateMemo(customerId, memo.trim());
      toast("メモを保存しました", "success");
    } catch (err: any) {
      toast(err.message || "保存に失敗しました", "error");
    } finally { setSavingMemo(false); }
  }

  async function handleAssignmentChange(patch: { assigned_admin_id?: number | null; priority?: string }) {
    setSavingAssignment(true);
    try {
      await api.adminUpdateAssignment(customerId, patch);
      await load();
      onChanged();
    } catch (err: any) {
      toast(err.message || "更新に失敗しました", "error");
    } finally { setSavingAssignment(false); }
  }

  async function handleRewardUpload(file: File) {
    setUploadingReward(true);
    try {
      await api.adminSendReward(customerId, file, rewardMsg.trim() || undefined);
      setRewardMsg("");
      await load();
      onChanged();
      toast("🎁 ご褒美写真を送信しました！", "success");
    } catch (err: any) {
      toast(err.message || "送信に失敗しました", "error");
    } finally { setUploadingReward(false); }
  }

  if (loading || !data) return <div className="card py-12 text-center" style={{ color: "var(--muted)" }}>読み込み中...</div>;

  const reward = data.reward_status;
  const requestStatusLabel: Record<string, string> = { pending: "⏳ 確認中", accepted: "✅ 受付済み", completed: "📚 完成して届きました" };

  // 担当キャラクターのカラースキームを反映（未設定時はサイト共通カラーにフォールバック）
  const cs = data.customer.character_color_scheme ?? {};
  const cPrimary = cs.primary || "var(--primary)";
  const cAccent = cs.accent || "var(--accent)";
  const cExampleBg = cs.example_bg || cs.bg || "var(--bg)";
  const cBorder = cs.border || "var(--border)";

  return (
    <div className="flex flex-col gap-4">
      {/* ヘッダー：顧客情報 + ご褒美状況 */}
      <div className="card flex items-center justify-between flex-wrap gap-3" style={{ borderLeft: `4px solid ${cPrimary}` }}>
        <div>
          <p className="font-black" style={{ color: cPrimary }}>{data.customer.username}</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            担当キャラクター：{data.customer.character_name || "未割当"}
          </p>
        </div>
        <div className="text-xs flex items-center gap-3">
          <span className="flex items-center gap-1.5" style={{ color: "var(--muted)" }}>
            👤 担当者
            <select
              value={data.customer.assigned_admin_id ?? ""}
              disabled={savingAssignment}
              onChange={e => handleAssignmentChange({ assigned_admin_id: e.target.value === "" ? null : Number(e.target.value) })}
              className="px-2 py-1 rounded-lg border"
              style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}>
              <option value="">未割当</option>
              {operators.map(o => <option key={o.id} value={o.id}>{o.username}</option>)}
            </select>
          </span>
          <span style={{ color: "var(--muted)" }}>
            公開記事 <span className="font-black" style={{ color: cPrimary }}>{reward.published_articles}</span> 冊 ／
            送付済みご褒美 <span className="font-black" style={{ color: cPrimary }}>{reward.sent_rewards}</span> 件
          </span>
          {reward.pending_rewards > 0 && (
            <span className="px-2 py-1 rounded-full font-black text-white" style={{ background: cAccent }}>
              🎁 ご褒美送付可能 ×{reward.pending_rewards}
            </span>
          )}
        </div>
      </div>

      {/* 重要メモ：誕生日・苦手分野への不安など、DM返信下書き生成に反映させたい情報を記録する */}
      <div className="card flex flex-col gap-2" style={{ borderLeft: `4px solid ${cBorder}` }}>
        <p className="text-xs font-bold" style={{ color: "var(--muted)" }}>
          📝 重要メモ（DM返信の下書き生成に反映されます）
        </p>
        <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={2}
          placeholder="例：誕生日は8/15。英語の発音に苦手意識がある。前回TOEICの結果について話した。"
          className="w-full p-2 rounded-lg border text-sm"
          style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }} />
        <button type="button" onClick={handleSaveMemo} disabled={savingMemo}
          className="self-end text-xs px-3 py-1.5 rounded-lg font-bold text-white disabled:opacity-50" style={{ background: cAccent }}>
          {savingMemo ? "保存中..." : "メモを保存"}
        </button>
      </div>

      {/* 親密度パネル：会話で育っていく関係性を可視化し、手動調整も行えるようにする */}
      {data.intimacy && (
        <div className="card flex flex-col gap-2" style={{ borderLeft: `4px solid ${cAccent}` }}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-base">💗</span>
              <p className="text-sm font-bold" style={{ color: cPrimary }}>
                親密度 Lv.{data.intimacy.level} － {data.intimacy.stage_label}
              </p>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                （{data.intimacy.points}pt
                {data.intimacy.next_level_threshold != null
                  ? `　次のレベルまであと ${data.intimacy.points_to_next_level}pt`
                  : "　最大レベル"}）
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" disabled={adjustingIntimacy}
                className="text-xs px-2.5 py-1 rounded-lg font-bold" style={{ color: "#c0392b", border: "1px solid var(--border)" }}
                onClick={() => handleIntimacyAdjust(-5)}>－5</button>
              <button type="button" disabled={adjustingIntimacy}
                className="text-xs px-2.5 py-1 rounded-lg font-bold" style={{ color: "#c0392b", border: "1px solid var(--border)" }}
                onClick={() => handleIntimacyAdjust(-1)}>－1</button>
              <button type="button" disabled={adjustingIntimacy}
                className="text-xs px-2.5 py-1 rounded-lg font-bold text-white" style={{ background: cAccent }}
                onClick={() => handleIntimacyAdjust(1)}>＋1</button>
              <button type="button" disabled={adjustingIntimacy}
                className="text-xs px-2.5 py-1 rounded-lg font-bold text-white" style={{ background: cAccent }}
                onClick={() => handleIntimacyAdjust(5)}>＋5</button>
            </div>
          </div>
          {/* 進捗バー（次のレベルまでの距離を視覚化） */}
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg)" }}>
            <div className="h-full rounded-full transition-all" style={{
              width: data.intimacy.next_level_threshold != null
                ? `${Math.min(100, Math.round(((data.intimacy.points - data.intimacy.current_level_threshold) / Math.max(1, data.intimacy.next_level_threshold - data.intimacy.current_level_threshold)) * 100))}%`
                : "100%",
              background: cAccent,
            }} />
          </div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            💡 返信のヒント：{data.intimacy.stage_hint}
          </p>
          <p className="text-[11px]" style={{ color: "var(--muted)" }}>
            ※ 会話のやり取り（チャットの送受信）で自動的に少しずつ蓄積されます。返信内容（そっけない／嬉しい等）に応じて、上のボタンから手動でも調整できます。
          </p>
        </div>
      )}

      {/* ご褒美送付パネル（達成時のみ強調表示） */}
      <div className="card flex flex-col gap-2" style={reward.pending_rewards > 0 ? { border: `2px solid ${cAccent}`, background: cExampleBg } : { borderLeft: `4px solid ${cAccent}` }}>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          運営者が用意した画像をアップロードすると、キャラクターからのご褒美メッセージとして顧客のチャットに届きます。
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <input value={rewardMsg} onChange={e => setRewardMsg(e.target.value)}
            placeholder="（任意）添えるメッセージ　例：5冊達成おめでとう！これからも頑張ろうね"
            className="flex-1 min-w-[240px]" />
          <label className="cursor-pointer text-sm px-4 py-2 rounded-lg font-bold text-white text-center transition-all hover:opacity-85"
            style={{ background: cAccent, opacity: uploadingReward ? 0.6 : 1 }}>
            {uploadingReward ? "送信中..." : "📤 画像を選んで送信"}
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={uploadingReward}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleRewardUpload(f); e.target.value = ""; }} />
          </label>
          <button
            type="button"
            className="text-xs px-3 py-2 rounded-lg border font-bold transition-all hover:shadow"
            style={{ borderColor: cBorder, color: cAccent }}
            onClick={() => {
              const charForPrompt = {
                name: data.customer.character_name,
                description: data.customer.character_description,
                tone_profile: data.customer.tone_profile,
              };
              navigator.clipboard.writeText(buildRewardImagePrompt(charForPrompt, data.customer));
              toast("ご褒美写真の画像生成プロンプトをコピーしました（著作権配慮・サイズ指定込み）", "success");
            }}>
            🎨 ご褒美画像プロンプトをコピー
          </button>
        </div>
      </div>

      {/* メッセージスレッド */}
      <div ref={messagesContainerRef} className="card flex flex-col gap-3 overflow-y-auto" style={{ maxHeight: "48vh" }}>
        {data.has_more && (
          <div className="text-center">
            <button onClick={loadOlder} disabled={loadingMore} className="btn-ghost text-xs disabled:opacity-50">
              {loadingMore ? "読み込み中..." : "過去のメッセージを読み込む"}
            </button>
          </div>
        )}
        {data.messages.length === 0 ? (
          <p className="text-center py-8 text-sm" style={{ color: "var(--muted)" }}>まだメッセージはありません</p>
        ) : data.messages.map((m: any) => (
          <div key={m.id} className={`flex flex-col ${m.sender === "character" ? "items-end" : "items-start"}`}>
            {m.is_reward && m.image_url && (
              <div className="mb-1 rounded-xl overflow-hidden border" style={{ borderColor: cBorder, maxWidth: "260px" }}>
                <div className="px-2 py-1 text-xs font-bold text-white" style={{ background: cAccent }}>🎁 送付したご褒美</div>
                <img src={`${API_ORIGIN_M}${m.image_url}`} alt="ご褒美" className="block max-w-full" />
              </div>
            )}
            {m.content && editingMsgId === m.id ? (
              <div className="flex flex-col gap-1.5 max-w-[80%] w-full">
                <textarea value={editMsgText} onChange={e => setEditMsgText(e.target.value)}
                  rows={2} className="flex-1 resize-none text-sm" />
                <div className="flex gap-2 justify-end">
                  <button type="button" className="text-xs px-3 py-1 rounded-lg" style={{ color: "var(--muted)", border: `1px solid ${cBorder}` }}
                    onClick={() => setEditingMsgId(null)}>キャンセル</button>
                  <button type="button" className="text-xs px-3 py-1 rounded-lg font-bold text-white"
                    style={{ background: cAccent, opacity: msgBusyId === m.id ? 0.6 : 1 }}
                    disabled={msgBusyId === m.id}
                    onClick={() => handleSaveMessageEdit(m.id)}>
                    {msgBusyId === m.id ? "保存中…" : "保存する"}
                  </button>
                </div>
              </div>
            ) : m.content && (
              <div className="group relative max-w-[80%]">
                {/* 演習問題の解答提出メッセージを視覚的に区別 */}
                {m.sender === "customer" && m.content.startsWith("【演習問題") && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#ece4ff", color: "#5d3fd3" }}>
                      🧩 演習解答提出
                    </span>
                    <span className="text-xs" style={{ color: "var(--muted)" }}>フィードバック待ち</span>
                  </div>
                )}
                {/* 記事公開自動通知チャットを視覚的に区別 */}
                {m.sender === "character" && m.content.startsWith("📚 新しい") && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#e8f4fd", color: "#1a6ea8" }}>
                      🤖 自動通知
                    </span>
                  </div>
                )}
                <div className="rounded-xl px-3 py-1.5 text-sm whitespace-pre-wrap break-words"
                  style={{
                    background: m.sender === "character" ? cPrimary : (m.content.startsWith("【演習問題") ? "#f5f0ff" : cExampleBg),
                    color: m.sender === "character" ? "white" : "var(--text)",
                    border: m.sender === "character" ? "none" : (m.content.startsWith("【演習問題") ? "1px solid #c4b0f5" : `1px solid ${cBorder}`),
                  }}>
                  {m.content}
                </div>
                {/* 管理者専用：メッセージの編集・削除（誤送信の訂正や不適切投稿の削除に使用） */}
                <div className="flex gap-2 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button type="button" className="text-[11px] px-1.5 py-0.5 rounded" style={{ color: "var(--muted)" }}
                    onClick={() => { setEditingMsgId(m.id); setEditMsgText(m.content ?? ""); }}>
                    ✏️ 編集
                  </button>
                  <button type="button" className="text-[11px] px-1.5 py-0.5 rounded" style={{ color: "#c0392b" }}
                    disabled={msgBusyId === m.id}
                    onClick={() => handleDeleteMessage(m.id)}>
                    🗑 削除
                  </button>
                </div>
              </div>
            )}
            {m.is_request && (
              <div className="mt-1 rounded-lg px-2.5 py-1.5 text-xs flex items-center gap-2 flex-wrap" style={{ background: cExampleBg, border: `1px dashed ${cBorder}` }}>
                <span>📋 記事リクエスト：<span className="font-bold">{m.grammar_topic}</span></span>
                <span className="font-bold" style={{ color: cAccent }}>{requestStatusLabel[m.request_status] || m.request_status}</span>
                <div className="flex gap-1">
                  {(["pending", "accepted", "completed"] as const).filter(s => s !== m.request_status).map(s => (
                    <button key={s} type="button" onClick={() => handleRequestStatus(m.id, s)}
                      className="text-[11px] px-1.5 py-0.5 rounded border transition-all hover:shadow"
                      style={{ borderColor: cBorder, color: "var(--muted)" }}>
                      → {requestStatusLabel[s]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="text-[10px] mt-0.5" style={{ color: "var(--muted)" }}>
              {m.sender === "character" ? "あなた（キャラクターとして）" : data.customer.username} ・ {new Date(m.created_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        ))}
      </div>

      {/* 質問サジェスト：話しかけのネタ切れを防ぐための提案パネル */}
      {(() => {
        const charForPrompt = {
          name: data.customer.character_name,
          description: data.customer.character_description,
          tone_profile: data.customer.tone_profile,
        };
        const pool = buildSuggestedQuestions(data.customer, charForPrompt);
        if (pool.length === 0) return null;
        // suggestionSeed を種に、毎回違う組み合わせを最大4件ピックアップする
        const picks: SuggestedQuestion[] = [];
        const used = new Set<number>();
        for (let i = 0; i < Math.min(4, pool.length); i++) {
          const idx = (suggestionSeed * 7 + i * 13) % pool.length;
          let j = idx;
          while (used.has(j)) j = (j + 1) % pool.length;
          used.add(j);
          picks.push(pool[j]);
        }
        return (
          <div className="card flex flex-col gap-2" style={{ borderLeft: `4px solid ${cAccent}` }}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm font-bold flex items-center gap-1.5" style={{ color: cPrimary }}>
                💡 質問サジェスト
                <span className="text-xs font-normal" style={{ color: "var(--muted)" }}>
                  （タップで返信欄に挿入できます）
                </span>
              </p>
              <div className="flex items-center gap-2">
                <button type="button" className="text-xs px-2.5 py-1 rounded-lg" style={{ color: "var(--muted)", border: "1px solid var(--border)" }}
                  onClick={() => setSuggestionSeed(s => s + 1)}>
                  🔄 別の質問にする
                </button>
                <button type="button" className="text-xs px-2.5 py-1 rounded-lg font-bold" style={{ color: cAccent, border: `1px solid ${cAccent}` }}
                  onClick={() => {
                    navigator.clipboard.writeText(buildQuestionIdeaPrompt(charForPrompt, data.customer));
                    toast("質問アイデア出し用のLLMプロンプトをコピーしました", "success");
                  }}>
                  📋 LLMに質問を考えてもらうプロンプトをコピー
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {picks.map((q, i) => (
                <button key={i} type="button" title={q.text}
                  className="text-xs rounded-full px-2.5 py-1 font-bold text-white transition-all hover:opacity-80"
                  style={{ background: cAccent }}
                  onClick={() => setReply(prev => prev ? `${prev}\n${q.text}` : q.text)}>
                  {q.icon} {q.category}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* 返信フォーム */}
      <form onSubmit={handleReply} className="card flex flex-col gap-2" style={{ borderLeft: `4px solid ${cPrimary}` }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {data.customer.character_name || "キャラクター"}になりきって返信する
          </p>
          <div className="flex items-center gap-2">
            <button type="button"
              onClick={() => setReply(prev => prev ? `${prev}\n${ARTICLE_REQUEST_PROMPT_TEMPLATE}` : ARTICLE_REQUEST_PROMPT_TEMPLATE)}
              className="text-xs px-2.5 py-1 rounded-lg font-bold transition-all"
              style={{ color: cPrimary, border: `1px solid ${cPrimary}` }}>
              📋 記事リクエストを促す
            </button>
            <button type="button" onClick={handleDraftReply} disabled={draftingReply}
              className="text-xs px-2.5 py-1 rounded-lg font-bold transition-all disabled:opacity-50"
              style={{ color: cAccent, border: `1px solid ${cAccent}` }}>
              {draftingReply ? "✨ 生成中..." : "✨ 下書き生成"}
            </button>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <textarea value={reply} onChange={e => setReply(e.target.value)}
            placeholder={`${data.customer.character_name || "キャラクター"}になりきって返信する...`}
            rows={2} className="flex-1 resize-none" />
          <button type="submit" className="text-sm px-4 py-2 rounded-lg font-bold text-white transition-all hover:opacity-85 disabled:opacity-40"
            style={{ background: cAccent }} disabled={sending || !reply.trim()}>
            {sending ? "送信中..." : "返信する"}
          </button>
        </div>
        <label className="text-xs flex items-center gap-1.5" style={{ color: "var(--muted)" }}>
          <input type="checkbox" checked={suggestCorrection} onChange={e => setSuggestCorrection(e.target.checked)} />
          📝「添削してもらう」ボタンをこのメッセージに付ける
        </label>
      </form>
      <p className="text-xs -mt-2" style={{ color: "var(--muted)" }}>
        ※「下書き生成」はAIが提案する文章です。内容を確認・編集してから送信してください。
        送信した内容はそのまま「{data.customer.character_name || "キャラクター"}」からのメッセージとして顧客に届きます。
      </p>
    </div>
  );
}