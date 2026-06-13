"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { resolveTheme } from "@/lib/theme";

export const TOPIC_SUGGESTIONS = [
  "TOEIC", "IELTS", "英検", "TOEFL", "文法",
  "ライティング添削", "スピーキング添削",
];

export const TOPIC_PRICES: Record<string, string> = {
  "TOEIC": "¥500",
  "IELTS": "¥500",
  "英検": "¥500",
  "TOEFL": "¥500",
  "文法": "¥500",
  "ライティング添削": "¥1,000",
  "スピーキング添削": "¥1,000",
};

// 詳細トピック入力欄のプレースホルダー（カテゴリごとの例）
const DETAIL_PLACEHOLDERS: Record<string, string> = {
  "TOEIC": "例：Part5 文法問題、Part7 長文読解 など",
  "IELTS": "例：Writing Task2、Speaking Part1 など",
  "英検": "例：準1級 長文読解、2級 リスニング など",
  "TOEFL": "例：Reading、Listening など",
  "文法": "例：仮定法、関係代名詞、現在完了形 など",
};

export function RequestArticleModal({ theme: t, onClose, onSent, onRequestCorrection }: {
  theme: ReturnType<typeof resolveTheme>;
  onClose: () => void;
  onSent?: () => void;
  /** 「ライティング添削」「スピーキング添削」を選択した場合に呼ばれる。
   * お題不要の添削提出モーダル（CorrectionSubmissionModal）へ誘導するため。 */
  onRequestCorrection?: (type: "writing" | "speaking") => void;
}) {
  const [category, setCategory] = useState<string | null>(null);
  const [detailTopic, setDetailTopic] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  function handleSelectCategory(s: string) {
    // 「ライティング添削」「スピーキング添削」はお題不要の添削提出フローへ誘導する
    if (s === "ライティング添削" || s === "スピーキング添削") {
      onClose();
      onRequestCorrection?.(s === "ライティング添削" ? "writing" : "speaking");
      return;
    }
    setCategory(s);
  }

  async function handleSubmit() {
    if (!category || sending) return;
    setSending(true);
    try {
      const topic = detailTopic.trim() ? `${category}：${detailTopic.trim()}` : category;
      const content = message.trim()
        ? `新しい記事・問題・添削をリクエストしました！\n\n${message.trim()}`
        : "新しい記事・問題・添削をリクエストしました！";
      await api.sendMyMessage({ content, grammar_topic: topic });
      toast("記事をリクエストしました", "success");
      onSent?.();
      onClose();
    } catch {
      toast("リクエストの送信に失敗しました", "error");
    } finally {
      setSending(false);
    }
  }

  // ── ステップ1：カテゴリ選択 ──────────────────────────────────────────────
  if (!category) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.4)" }}>
        <div className="rounded-2xl p-5 max-w-sm w-full shadow-xl" style={{ background: t.card, border: `1px solid ${t.border}` }}>
          <p className="font-black mb-3" style={{ color: t.primary, fontFamily: t.fontFamily }}>
            📋 次の記事・問題・添削をリクエスト
          </p>

          <label className="text-xs font-bold block mb-2" style={{ color: t.accent }}>カテゴリを選んでください</label>
          <div className="flex flex-wrap gap-1.5 mb-1">
            {TOPIC_SUGGESTIONS.map(s => (
              <button key={s} type="button" onClick={() => handleSelectCategory(s)}
                className="text-xs px-2.5 py-1 rounded-full font-bold transition-all"
                style={{ background: t.card, color: t.accent, border: `1px solid ${t.border}` }}>
                {s}（{TOPIC_PRICES[s]}）
              </button>
            ))}
          </div>
          <p className="text-[11px] mb-3" style={{ color: t.accent }}>
            ※ 記事・問題は1項目¥500、ライティング・スピーキングの添削は¥1,000です。
          </p>

          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={onClose}
              className="text-sm px-4 py-2 rounded-xl font-bold transition-all"
              style={{ border: `1px solid ${t.border}`, color: t.text }}>
              キャンセル
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── ステップ2：詳細トピック入力 ──────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.4)" }}>
      <div className="rounded-2xl p-5 max-w-sm w-full shadow-xl" style={{ background: t.card, border: `1px solid ${t.border}` }}>
        <p className="font-black mb-1" style={{ color: t.primary, fontFamily: t.fontFamily }}>
          📋 {category}の記事・問題をリクエスト
        </p>
        <p className="text-[11px] mb-3" style={{ color: t.accent }}>
          {category}（{TOPIC_PRICES[category]}）
        </p>

        <label className="text-xs font-bold block mb-1" style={{ color: t.accent }}>詳細トピック（任意）</label>
        <input
          value={detailTopic}
          onChange={e => setDetailTopic(e.target.value)}
          placeholder={DETAIL_PLACEHOLDERS[category] ?? "例：詳しく知りたい内容があれば入力してください"}
          className="w-full text-sm rounded-xl px-3 py-2 outline-none mb-3"
          style={{ background: t.bg, border: `1px solid ${t.border}`, color: t.text, fontFamily: t.fontFamily }}
        />

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
          <button type="button" onClick={() => setCategory(null)}
            className="text-sm px-4 py-2 rounded-xl font-bold transition-all"
            style={{ border: `1px solid ${t.border}`, color: t.text }}>
            戻る
          </button>
          <button type="button" onClick={handleSubmit} disabled={sending}
            className="text-sm px-4 py-2 rounded-xl font-bold text-white transition-all disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.accent})` }}>
            {sending ? "送信中..." : "依頼する"}
          </button>
        </div>
      </div>
    </div>
  );
}
