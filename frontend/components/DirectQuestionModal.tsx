"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";

/** Tier B学習者が講師へ直接質問を送るための小窓（1日1回まで）。 */
export function DirectQuestionModal({ courseId, available, onClose }: { courseId: number; available: boolean; onClose: () => void }) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api.askInstructor(courseId, body.trim());
      setSent(true);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "送信に失敗しました", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50 px-4" onClick={onClose}>
      <div className="card max-w-md w-full flex flex-col gap-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold" style={{ color: "var(--primary)" }}>先生に直接質問</h3>
          <button onClick={onClose} className="text-xl leading-none" style={{ color: "var(--muted)" }}>✕</button>
        </div>

        {!available ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            もう質問できませんよ〜。直接質問は1日1回までです。また明日お試しください。
          </p>
        ) : sent ? (
          <p className="text-sm" style={{ color: "var(--text)" }}>質問を送りました。先生からの回答はこのチャットに届きます。</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <p className="text-xs" style={{ color: "var(--muted)" }}>先生に直接届く質問です（1日1回まで）。回答はこのチャットに届きます。</p>
            <textarea
              className="w-full rounded border px-3 py-2 text-sm"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)", minHeight: 100, resize: "vertical" }}
              placeholder="質問内容を入力…"
              value={body}
              onChange={e => setBody(e.target.value)}
              disabled={submitting}
            />
            <button type="submit" className="btn-primary" disabled={submitting || !body.trim()}>
              {submitting ? "送信中..." : "質問を送る"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
