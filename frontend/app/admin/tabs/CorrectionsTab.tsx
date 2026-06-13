"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { reportError } from "@/lib/reportError";

export function CorrectionsTab({ onCreateFeedbackArticle }: { onCreateFeedbackArticle?: (item: any) => void } = {}) {
  const [items, setItems] = useState<any[]>([]);
  const [corrections, setCorrections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [submissions, correctionRequests] = await Promise.all([
        api.adminListExerciseSubmissions(),
        api.adminListCorrectionRequests(),
      ]);
      setItems(submissions);
      setCorrections(correctionRequests);
    } catch (err: any) {
      reportError("admin:adminListExerciseSubmissions", err);
      toast(err.message || "読み込みに失敗しました", "error");
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleCorrectionStatusChange(item: any, status: string) {
    setUpdatingId(item.id);
    try {
      await api.adminUpdateCorrectionStatus(item.id, status);
      await load();
    } catch (err: any) {
      toast(err.message || "更新に失敗しました", "error");
    } finally { setUpdatingId(null); }
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

      <h3 className="text-sm font-black mb-2" style={{ color: "var(--primary)" }}>📝 添削リクエスト（お題不要の自由提出）</h3>
      {loading ? (
        <div className="card text-center py-12 mb-4" style={{ color: "var(--muted)" }}>読み込み中...</div>
      ) : corrections.length === 0 ? (
        <div className="card text-center py-8 mb-4" style={{ color: "var(--muted)" }}>
          対応待ちの添削リクエストはありません
        </div>
      ) : (
        <div className="flex flex-col gap-3 mb-6">
          {corrections.map(item => (
            <div key={item.id} className="card">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate" style={{ color: "var(--primary)" }}>
                    {item.username}
                    {item.character_name && (
                      <span className="ml-2 text-xs font-normal" style={{ color: "var(--muted)" }}>
                        → {item.character_name}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "var(--bg)", color: "var(--accent)" }}>
                    {item.correction_type === "writing" ? "✍️ ライティング" : "🎤 スピーキング"}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "var(--bg)", color: "var(--muted)" }}>
                    {item.status === "pending" ? "未対応" : item.status === "in_progress" ? "対応中" : "完了"}
                  </span>
                </div>
              </div>

              {item.text_content && (
                <div className="text-sm p-3 rounded-lg mb-2" style={{ background: "var(--bg)" }}>
                  <p className="text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>
                    {item.correction_type === "writing" ? "提出された英文" : "メモ"}
                  </p>
                  <p className="whitespace-pre-wrap">{item.text_content}</p>
                </div>
              )}

              {item.media_url && (
                <div className="text-sm p-3 rounded-lg mb-2" style={{ background: "var(--bg)" }}>
                  <p className="text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>提出された音声・動画</p>
                  {item.media_type === "video" ? (
                    <video controls src={item.media_url} className="w-full rounded-lg max-h-64" />
                  ) : (
                    <audio controls src={item.media_url} className="w-full" />
                  )}
                </div>
              )}

              {item.note && (
                <div className="text-sm p-3 rounded-lg mb-2" style={{ background: "var(--bg)" }}>
                  <p className="text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>メモ</p>
                  <p className="whitespace-pre-wrap">{item.note}</p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 flex-wrap">
                {item.status === "pending" && (
                  <button type="button" onClick={() => handleCorrectionStatusChange(item, "in_progress")} disabled={updatingId === item.id}
                    className="btn-ghost text-sm px-3 py-1.5 disabled:opacity-50">
                    対応中にする
                  </button>
                )}
                <button type="button" onClick={() => onCreateFeedbackArticle?.(item)}
                  className="btn-primary text-sm px-4 py-2">
                  添削記事を作成
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 className="text-sm font-black mb-2" style={{ color: "var(--primary)" }}>📚 演習の解答提出</h3>
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
                    </div>
                    <textarea
                      value={drafts[id] || ""}
                      onChange={e => setDrafts(prev => ({ ...prev, [id]: e.target.value }))}
                      rows={6}
                      placeholder="添削内容を入力してください"
                      className="w-full p-3 rounded-lg border text-sm"
                      style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}
                    />
                    <p className="text-xs -mt-1" style={{ color: "var(--muted)" }}>
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
