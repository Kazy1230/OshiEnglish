"use client";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";

type PendingQuestion = {
  id: number;
  body: string;
  category: string | null;
  created_at: string;
  is_overdue: boolean;
  ai_draft: string | null;
};

export function InboxPanel({ onOverdueCountChange }: { onOverdueCountChange?: (count: number) => void }) {
  const [questions, setQuestions] = useState<PendingQuestion[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [submittingId, setSubmittingId] = useState<number | null>(null);

  function load() {
    return api.listPendingQuestions().then((qs: PendingQuestion[]) => {
      setQuestions(qs);
      onOverdueCountChange?.(qs.filter(q => q.is_overdue).length);
    });
  }

  useEffect(() => {
    load().finally(() => setLoadingData(false));
  }, []);

  async function handleApprove(questionId: number, useEdit: boolean) {
    setSubmittingId(questionId);
    try {
      await api.respondToQuestion(questionId, useEdit ? edits[questionId] : undefined);
      toast("回答を送信しました", "success");
      await load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "送信に失敗しました", "error");
    } finally {
      setSubmittingId(null);
    }
  }

  if (loadingData) return <Skeleton />;

  const overdueCount = questions.filter(q => q.is_overdue).length;

  return (
    <div className="flex flex-col gap-4">
      {overdueCount > 0 && (
        <div className="card" style={{ borderColor: "#e53e3e" }}>
          <p className="text-sm font-bold" style={{ color: "#e53e3e" }}>
            ⚠ {overdueCount}件が24時間以上未対応です。優先的にご対応ください（下のリストの先頭に表示されています）。
          </p>
        </div>
      )}
      {questions.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>未回答の質問はありません。</p>
      ) : (
        questions.map(q => (
          <div key={q.id} className="card flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--surface)", color: "var(--accent)" }}>
                {q.category || "未分類"}
              </span>
              {q.is_overdue && (
                <span className="text-xs font-bold" style={{ color: "#e53e3e" }}>⚠ 24時間以上未対応</span>
              )}
            </div>
            <p className="text-sm" style={{ color: "var(--text)" }}>{q.body}</p>

            <p className="text-xs font-bold" style={{ color: "var(--primary)" }}>下書き</p>
            <textarea
              value={edits[q.id] ?? q.ai_draft ?? ""}
              onChange={e => setEdits(prev => ({ ...prev, [q.id]: e.target.value }))}
              className="min-h-[100px] text-sm"
            />

            <div className="flex gap-2">
              <button onClick={() => handleApprove(q.id, false)} disabled={submittingId === q.id} className="btn-primary flex-1 disabled:opacity-50">
                {submittingId === q.id ? "送信中…" : "下書きのまま承認"}
              </button>
              <button onClick={() => handleApprove(q.id, true)} disabled={submittingId === q.id} className="btn-ghost flex-1 disabled:opacity-50">
                編集して送信
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
