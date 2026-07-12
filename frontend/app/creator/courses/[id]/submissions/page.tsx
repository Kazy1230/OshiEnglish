"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";
import { toast } from "@/components/Toast";

type Submission = {
  card_progress_id: number;
  card_id: number;
  card_title: string | null;
  learner_email: string;
  submission_text: string | null;
  submission_url: string | null;
  submitted_at: string | null;
  ai_feedback: string | null;
  creator_comment: string | null;
  creator_commented_at: string | null;
};

function CommentBox({ submission, onCommented }: { submission: Submission; onCommented: (id: number, comment: string) => void }) {
  const [comment, setComment] = useState(submission.creator_comment ?? "");
  const [editing, setEditing] = useState(!submission.creator_comment);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!comment.trim()) {
      toast("コメントを入力してください", "error");
      return;
    }
    setSaving(true);
    try {
      await api.commentOnSubmission(submission.card_progress_id, comment.trim());
      onCommented(submission.card_progress_id, comment.trim());
      setEditing(false);
      toast("コメントを送信しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "送信に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="mt-2 pt-2 flex items-start justify-between gap-2" style={{ borderTop: "1px dashed var(--border)" }}>
        <div>
          <p className="text-xs font-bold mb-1" style={{ color: "var(--accent)" }}>あなたのコメント</p>
          <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--text)" }}>{submission.creator_comment}</p>
        </div>
        <button className="text-xs underline flex-shrink-0" style={{ color: "var(--muted)" }} onClick={() => setEditing(true)}>編集</button>
      </div>
    );
  }

  return (
    <div className="mt-2 pt-2 flex flex-col gap-2" style={{ borderTop: "1px dashed var(--border)" }}>
      <textarea
        rows={2}
        className="w-full text-sm"
        placeholder="任意で一言添える（確認・コメントは必須ではありません）"
        value={comment}
        onChange={e => setComment(e.target.value)}
      />
      <button className="btn-primary text-xs self-start" style={{ padding: "4px 14px" }} onClick={handleSave} disabled={saving}>
        {saving ? "送信中…" : "コメントを送る"}
      </button>
    </div>
  );
}

export default function CourseSubmissionsPage() {
  const params = useParams();
  const courseId = Number(params.id);
  const { loading } = useRoleGuard(["creator", "admin"]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (loading) return;
    api.listCourseSubmissions(courseId)
      .then(setSubmissions)
      .catch((err: unknown) => toast(err instanceof Error ? err.message : "取得に失敗しました", "error"))
      .finally(() => setFetching(false));
  }, [loading, courseId]);

  if (loading || fetching) return <Skeleton />;

  return (
    <div className="creator-theme min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" backHref="/creator/courses" backLabel="作成したコース" title="課題の提出物" />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          提出直後にAIが一次コメントを返しています。確認・追加コメントは任意です。気が向いたときに覗いてみてください。
        </p>

        {submissions.length === 0 ? (
          <div className="card">
            <p className="text-sm" style={{ color: "var(--muted)" }}>まだ提出物がありません。</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {submissions.map(s => (
              <div key={s.card_progress_id} className="card flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="font-bold text-sm" style={{ color: "var(--primary)" }}>{s.card_title ?? "課題"}</p>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    {s.learner_email}
                    {s.submitted_at && ` ・ ${new Date(s.submitted_at).toLocaleString("ja-JP")}`}
                  </span>
                </div>

                {s.submission_text && (
                  <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--text)" }}>{s.submission_text}</p>
                )}
                {s.submission_url && (
                  s.submission_url.match(/\.(png|jpe?g|webp)$/i) ? (
                    <img src={s.submission_url} alt="提出画像" style={{ maxHeight: 240, borderRadius: 8, objectFit: "contain" }} />
                  ) : (
                    <a href={s.submission_url} target="_blank" rel="noreferrer" className="text-sm underline" style={{ color: "var(--accent)" }}>
                      {s.submission_url}
                    </a>
                  )
                )}

                {s.ai_feedback && (
                  <div className="rounded-lg p-3 mt-1" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <p className="text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>AIの一次コメント</p>
                    <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--text)" }}>{s.ai_feedback}</p>

                    <CommentBox
                      submission={s}
                      onCommented={(id, comment) => setSubmissions(prev => prev.map(x => x.card_progress_id === id ? { ...x, creator_comment: comment } : x))}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
