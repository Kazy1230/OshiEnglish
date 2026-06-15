"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { resolveTheme } from "@/lib/theme";

type PreviewExample = {
  id: number;
  example_number: number;
  user_message: string;
  character_response: string;
};

export function PreviewPopup({ theme: t, characterName, examples, onClose }: {
  theme: ReturnType<typeof resolveTheme>;
  characterName?: string | null;
  examples: PreviewExample[];
  onClose: () => void;
}) {
  const [ratings, setRatings] = useState<Record<number, "good" | "unsure" | undefined>>({});
  const [feedbacks, setFeedbacks] = useState<Record<number, string>>({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const allRated = examples.length > 0 && examples.every(e => ratings[e.id]);
  const allGood = examples.every(e => ratings[e.id] === "good");

  async function handleSubmit() {
    if (!allRated) {
      toast("すべての例文を評価してください", "error");
      return;
    }
    setSending(true);
    try {
      await api.submitMyPreview(examples.map(e => ({
        id: e.id,
        rating: ratings[e.id]!,
        feedback_text: ratings[e.id] === "unsure" ? (feedbacks[e.id] ?? "") : undefined,
      })));
      setDone(true);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "送信に失敗しました", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="rounded-2xl p-5 max-w-md w-full shadow-xl max-h-[90vh] overflow-y-auto" style={{ background: t.card, border: `1px solid ${t.border}` }}>
        {done ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <p className="text-3xl">{allGood ? "🎉" : "💌"}</p>
            <p className="font-black text-lg" style={{ color: t.primary, fontFamily: t.fontFamily }}>
              {allGood ? "素敵な先生に出会えましたね！" : "ありがとうございます！"}
            </p>
            <p className="text-sm" style={{ color: t.text }}>
              {allGood
                ? "これからのレッスンを楽しみにしていてください。"
                : "いただいたご意見は今後の改善に活かします。"}
            </p>
            <button className="mt-2 rounded-lg py-2 px-6 font-bold text-white"
              style={{ background: t.accent }} onClick={onClose}>
              閉じる
            </button>
          </div>
        ) : (
          <>
            <p className="font-black mb-1" style={{ color: t.primary, fontFamily: t.fontFamily }}>
              あなたの先生のプレビューです
            </p>
            <p className="text-xs mb-3" style={{ color: t.text }}>
              {characterName ?? "あなたの先生"}との会話例です。それぞれ評価してください。
            </p>
            <div className="flex flex-col gap-3">
              {examples.map(e => (
                <div key={e.id} className="rounded-xl p-3" style={{ background: t.bg, border: `1px solid ${t.border}` }}>
                  <p className="text-sm mb-1" style={{ color: t.text }}>
                    ユーザー：「{e.user_message}」
                  </p>
                  <p className="text-sm mb-2" style={{ color: t.text }}>
                    {characterName ?? "キャラ"}：「{e.character_response}」
                  </p>
                  <div className="flex gap-2">
                    <button
                      className="text-xs font-bold rounded-lg py-1.5 px-3"
                      style={ratings[e.id] === "good" ? { background: t.accent, color: "white" } : { border: `1px solid ${t.border}`, color: t.text }}
                      onClick={() => setRatings(prev => ({ ...prev, [e.id]: "good" }))}>
                      👍 ぴったり！
                    </button>
                    <button
                      className="text-xs font-bold rounded-lg py-1.5 px-3"
                      style={ratings[e.id] === "unsure" ? { background: t.accent, color: "white" } : { border: `1px solid ${t.border}`, color: t.text }}
                      onClick={() => setRatings(prev => ({ ...prev, [e.id]: "unsure" }))}>
                      🤔 少し違うかも
                    </button>
                  </div>
                  {ratings[e.id] === "unsure" && (
                    <div className="mt-2">
                      <label className="text-xs font-bold block mb-1" style={{ color: t.accent }}>どう直してほしいですか？</label>
                      <textarea rows={2} value={feedbacks[e.id] ?? ""}
                        onChange={ev => setFeedbacks(prev => ({ ...prev, [e.id]: ev.target.value }))}
                        className="w-full rounded-lg p-2 text-sm"
                        style={{ background: t.bg, border: `1px solid ${t.border}`, color: t.text, fontFamily: t.fontFamily }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button className="w-full mt-4 rounded-lg py-2 font-bold text-white disabled:opacity-60"
              style={{ background: t.accent }} disabled={sending || !allRated} onClick={handleSubmit}>
              {sending ? "送信中…" : "送信する"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
