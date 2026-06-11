"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { reportError } from "@/lib/reportError";

export function CorrectionsTab() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [draftingId, setDraftingId] = useState<number | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.adminListExerciseSubmissions();
      setItems(data);
    } catch (err: any) {
      reportError("admin:adminListExerciseSubmissions", err);
      toast(err.message || "読み込みに失敗しました", "error");
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleDraft(messageId: number) {
    setDraftingId(messageId);
    try {
      const { draft } = await api.adminDraftExerciseFeedback(messageId);
      setDrafts(prev => ({ ...prev, [messageId]: draft }));
    } catch (err: any) {
      toast(err.message || "下書きの生成に失敗しました", "error");
    } finally { setDraftingId(null); }
  }

  async function handleSend(item: any) {
    const content = (drafts[item.message.id] || "").trim();
    if (!content) { toast("添削文を入力してください", "error"); return; }
    setSendingId(item.message.id);
    try {
      await api.adminReplyMessage(item.customer_id, content);
      toast("添削を送信しました", "success");
      setDrafts(prev => { const next = { ...prev }; delete next[item.message.id]; return next; });
      setOpenId(null);
      await load();
    } catch (err: any) {
      toast(err.message || "送信に失敗しました", "error");
    } finally { setSendingId(null); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-xl font-black" style={{ color: "var(--primary)" }}>✏️ 添削</h2>
        <button className="btn-ghost text-sm" onClick={load}>🔄 更新</button>
      </div>

      {loading ? (
        <div className="card text-center py-12" style={{ color: "var(--muted)" }}>読み込み中...</div>
      ) : items.length === 0 ? (
        <div className="card text-center py-12" style={{ color: "var(--muted)" }}>
          未対応の演習提出はありません
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map(item => {
            const id = item.message.id;
            const open = openId === id;
            return (
              <div key={id} className="card">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : id)}
                  className="w-full flex items-center justify-between gap-2 text-left"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate" style={{ color: "var(--primary)" }}>
                      {item.username}
                      {item.character_name && (
                        <span className="ml-2 text-xs font-normal" style={{ color: "var(--muted)" }}>
                          → {item.character_name}
                        </span>
                      )}
                    </p>
                    <p className="text-xs truncate mt-0.5" style={{ color: "var(--muted)" }}>
                      {item.article_title || "演習問題"}
                    </p>
                  </div>
                  <span className="text-xs flex-shrink-0" style={{ color: "var(--muted)" }}>{open ? "▲" : "▼"}</span>
                </button>

                {open && (
                  <div className="mt-3 flex flex-col gap-3">
                    {item.exercise_prompt && (
                      <div className="text-sm p-3 rounded-lg" style={{ background: "var(--bg)" }}>
                        <p className="text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>お題</p>
                        <p className="whitespace-pre-wrap">{item.exercise_prompt}</p>
                      </div>
                    )}
                    <div className="text-sm p-3 rounded-lg" style={{ background: "var(--bg)" }}>
                      <p className="text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>生徒の解答</p>
                      <p className="whitespace-pre-wrap">{item.submission_text}</p>
                    </div>

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-xs font-bold" style={{ color: "var(--muted)" }}>添削チャット</p>
                      <button type="button" onClick={() => handleDraft(id)} disabled={draftingId === id}
                        className="text-xs px-2.5 py-1 rounded-lg font-bold transition-all disabled:opacity-50"
                        style={{ color: "var(--primary)", border: "1px solid var(--primary)" }}>
                        {draftingId === id ? "✨ 生成中..." : "✨ 添削下書き生成"}
                      </button>
                    </div>
                    <textarea
                      value={drafts[id] || ""}
                      onChange={e => setDrafts(prev => ({ ...prev, [id]: e.target.value }))}
                      rows={6}
                      placeholder="「添削下書き生成」で下書きを作成するか、直接入力してください"
                      className="w-full p-3 rounded-lg border text-sm"
                      style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}
                    />
                    <p className="text-xs -mt-1" style={{ color: "var(--muted)" }}>
                      ※「添削下書き生成」はAIが提案する文章です。内容を確認・編集してから送信してください。
                      送信した内容はそのまま「{item.character_name || "キャラクター"}」からのメッセージとして生徒に届きます。
                    </p>
                    <div className="flex justify-end">
                      <button type="button" onClick={() => handleSend(item)} disabled={sendingId === id}
                        className="btn-primary text-sm px-4 py-2 disabled:opacity-50">
                        {sendingId === id ? "送信中..." : "添削を送信"}
                      </button>
                    </div>
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
