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
  "TOEIC": "各¥500",
  "IELTS": "¥500〜¥1,000",
  "英検": "¥500〜¥1,000",
  "TOEFL": "¥500〜¥1,000",
  "文法": "¥500",
  "ライティング添削": "¥1,000",
  "スピーキング添削": "¥1,000",
};

// 料金プランページ（/pricing）の価格表に基づくパート別ラインナップ
const PART_OPTIONS: Record<string, { label: string; price: string }[]> = {
  "TOEIC": [
    { label: "Part 1（写真描写）", price: "¥500" },
    { label: "Part 2（応答問題）", price: "¥500" },
    { label: "Part 3（会話問題）", price: "¥500" },
    { label: "Part 4（説明文問題）", price: "¥500" },
    { label: "Part 5（短文穴埋め）", price: "¥500" },
    { label: "Part 6（長文穴埋め）", price: "¥500" },
    { label: "Part 7（長文読解）", price: "¥500" },
  ],
  "IELTS": [
    { label: "Reading（Academic / General）", price: "¥500" },
    { label: "Listening（Section 1〜4）", price: "¥500" },
    { label: "Writing Task 1", price: "¥500" },
    { label: "Writing Task 2", price: "¥1,000" },
    { label: "Speaking Part 1〜3", price: "¥1,000" },
  ],
  "英検": [
    { label: "リーディング（短文穴埋め）", price: "¥500" },
    { label: "リーディング（長文穴埋め）", price: "¥500" },
    { label: "リーディング（長文読解）", price: "¥500" },
    { label: "リスニング", price: "¥500" },
    { label: "ライティング", price: "¥1,000" },
    { label: "スピーキング", price: "¥1,000" },
  ],
  "TOEFL": [
    { label: "Reading", price: "¥500" },
    { label: "Listening", price: "¥500" },
    { label: "Writing Integrated Task", price: "¥1,000" },
    { label: "Writing Academic Discussion", price: "¥500" },
    { label: "Speaking Task 1〜4", price: "¥1,000" },
  ],
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
  const [part, setPart] = useState<{ label: string; price: string } | null>(null);
  const [grammarDetail, setGrammarDetail] = useState("");
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

  function reset() {
    setCategory(null);
    setPart(null);
    setGrammarDetail("");
  }

  // 「文法」は ¥500 固定・トピック自由入力。それ以外はパート選択で価格が決まる
  const selectedPrice = category === "文法" ? "¥500" : part?.price ?? null;
  const canSubmit = category === "文法" ? grammarDetail.trim().length > 0 : !!part;

  async function handleSubmit() {
    if (!category || !canSubmit || sending) return;
    setSending(true);
    try {
      const topic = category === "文法" ? `文法：${grammarDetail.trim()}` : `${category}：${part!.label}`;
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
            ※ 価格は料金プランページの価格表に基づきます。詳細は次の画面で選択できます。
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

  // ── ステップ2（TOEIC/IELTS/英検/TOEFL）：パート選択 ────────────────────────
  if (category !== "文法" && !part) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.4)" }}>
        <div className="rounded-2xl p-5 max-w-sm w-full shadow-xl" style={{ background: t.card, border: `1px solid ${t.border}` }}>
          <p className="font-black mb-1" style={{ color: t.primary, fontFamily: t.fontFamily }}>
            📋 {category}：パートを選んでください
          </p>
          <p className="text-[11px] mb-3" style={{ color: t.accent }}>
            料金プランページの価格表に基づく価格を表示しています
          </p>

          <div className="flex flex-col gap-1.5 mb-1">
            {(PART_OPTIONS[category] ?? []).map(p => (
              <button key={p.label} type="button" onClick={() => setPart(p)}
                className="text-sm px-3 py-2 rounded-xl font-bold transition-all flex items-center justify-between"
                style={{ background: t.card, color: t.text, border: `1px solid ${t.border}` }}>
                <span>{p.label}</span>
                <span style={{ color: t.accent }}>{p.price}</span>
              </button>
            ))}
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={reset}
              className="text-sm px-4 py-2 rounded-xl font-bold transition-all"
              style={{ border: `1px solid ${t.border}`, color: t.text }}>
              戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── ステップ3：確認・メッセージ入力 ─────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.4)" }}>
      <div className="rounded-2xl p-5 max-w-sm w-full shadow-xl" style={{ background: t.card, border: `1px solid ${t.border}` }}>
        <p className="font-black mb-1" style={{ color: t.primary, fontFamily: t.fontFamily }}>
          📋 {category}の記事・問題をリクエスト
        </p>
        <p className="text-[11px] mb-3" style={{ color: t.accent }}>
          {category === "文法" ? "文法" : `${category}：${part?.label}`}（{selectedPrice}）
        </p>

        {category === "文法" && (
          <>
            <label className="text-xs font-bold block mb-1" style={{ color: t.accent }}>文法トピック</label>
            <input
              value={grammarDetail}
              onChange={e => setGrammarDetail(e.target.value)}
              placeholder="例：仮定法、関係代名詞、現在完了形 など"
              className="w-full text-sm rounded-xl px-3 py-2 outline-none mb-3"
              style={{ background: t.bg, border: `1px solid ${t.border}`, color: t.text, fontFamily: t.fontFamily }}
            />
          </>
        )}

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
          <button type="button" onClick={() => (category === "文法" ? reset() : setPart(null))}
            className="text-sm px-4 py-2 rounded-xl font-bold transition-all"
            style={{ border: `1px solid ${t.border}`, color: t.text }}>
            戻る
          </button>
          <button type="button" onClick={handleSubmit} disabled={!canSubmit || sending}
            className="text-sm px-4 py-2 rounded-xl font-bold text-white transition-all disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.accent})` }}>
            {sending ? "送信中..." : "依頼する"}
          </button>
        </div>
      </div>
    </div>
  );
}
