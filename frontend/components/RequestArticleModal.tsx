"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { resolveTheme } from "@/lib/theme";

export const TOPIC_SUGGESTIONS = [
  "TOEIC Part5", "TOEIC Part7", "仮定法", "関係代名詞", "現在完了形",
  "ライティング添削", "スピーキング添削",
];

export const TOPIC_PRICES: Record<string, string> = {
  "TOEIC Part5": "¥500",
  "TOEIC Part7": "¥500",
  "仮定法": "¥500",
  "関係代名詞": "¥500",
  "現在完了形": "¥500",
  "ライティング添削": "¥1,000",
  "スピーキング添削": "¥1,000",
};

export function RequestArticleModal({ theme: t, onClose, onSent, onRequestCorrection }: {
  theme: ReturnType<typeof resolveTheme>;
  onClose: () => void;
  onSent?: () => void;
  /** 「ライティング添削」「スピーキング添削」を選択した場合に呼ばれる。
   * お題不要の添削提出モーダル（CorrectionSubmissionModal）へ誘導するため。 */
  onRequestCorrection?: (type: "writing" | "speaking") => void;
}) {
  const [topic, setTopic] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit() {
    if (!topic.trim() || sending) return;

    // 「ライティング添削」「スピーキング添削」はお題不要の添削提出フローへ誘導する
    if (topic === "ライティング添削" || topic === "スピーキング添削") {
      onClose();
      onRequestCorrection?.(topic === "ライティング添削" ? "writing" : "speaking");
      return;
    }

    setSending(true);
    try {
      const content = message.trim()
        ? `新しい記事・問題・添削をリクエストしました！\n\n${message.trim()}`
        : "新しい記事・問題・添削をリクエストしました！";
      await api.sendMyMessage({ content, grammar_topic: topic.trim() });
      toast("記事をリクエストしました", "success");
      onSent?.();
      onClose();
    } catch {
      toast("リクエストの送信に失敗しました", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.4)" }}>
      <div className="rounded-2xl p-5 max-w-sm w-full shadow-xl" style={{ background: t.card, border: `1px solid ${t.border}` }}>
        <p className="font-black mb-3" style={{ color: t.primary, fontFamily: t.fontFamily }}>
          📋 次の記事・問題・添削をリクエスト
        </p>

        <label className="text-xs font-bold block mb-1" style={{ color: t.accent }}>テーマ</label>
        <input
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="例：仮定法過去"
          className="w-full text-sm rounded-xl px-3 py-2 outline-none mb-2"
          style={{ background: t.bg, border: `1px solid ${t.border}`, color: t.text, fontFamily: t.fontFamily }}
        />
        <div className="flex flex-wrap gap-1.5 mb-1">
          {TOPIC_SUGGESTIONS.map(s => (
            <button key={s} type="button" onClick={() => setTopic(s)}
              className="text-xs px-2.5 py-1 rounded-full font-bold transition-all"
              style={topic === s
                ? { background: t.accent, color: "white" }
                : { background: t.card, color: t.accent, border: `1px solid ${t.border}` }}>
              {s}（{TOPIC_PRICES[s]}）
            </button>
          ))}
        </div>
        <p className="text-[11px] mb-3" style={{ color: t.accent }}>
          ※ 記事・問題は1項目¥500、ライティング・スピーキングの添削は¥1,000です。テーマを直接入力した場合も同様の料金が目安です。
        </p>

        <label className="text-xs font-bold block mb-1" style={{ color: t.accent }}>メッセージ（任意）</label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="伝えたいことがあれば添えてね"
          rows={3}
          className="w-full text-sm rounded-xl px-3 py-2 outline-none resize-none mb-1"
          style={{ background: t.bg, border: `1px solid ${t.border}`, color: t.text, fontFamily: t.fontFamily }}
        />

        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose}
            className="text-sm px-4 py-2 rounded-xl font-bold transition-all"
            style={{ border: `1px solid ${t.border}`, color: t.text }}>
            キャンセル
          </button>
          <button type="button" onClick={handleSubmit} disabled={!topic.trim() || sending}
            className="text-sm px-4 py-2 rounded-xl font-bold text-white transition-all disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.accent})` }}>
            {sending ? "送信中..." : "依頼する"}
          </button>
        </div>
      </div>
    </div>
  );
}
