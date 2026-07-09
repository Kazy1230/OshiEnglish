"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { AppHeader } from "@/components/AppHeader";

type CourseMeta = {
  id: number;
  title: string;
  subject: string | null;
  status: string;
  is_free: boolean;
  tier_a_price: number | null;
  tier_b_price: number | null;
  completion_video_url: string | null;
};

type Chapter = { id: number; cards: unknown[] };

const STATUS_LABEL: Record<string, string> = {
  draft: "下書き",
  under_review: "審査中",
  published: "公開中",
  unpublished: "非公開",
};

export default function CoursePublishPage() {
  const { loading } = useRoleGuard(["creator", "admin"]);
  const params = useParams();
  const courseId = Number(params.id);
  const router = useRouter();

  const [meta, setMeta] = useState<CourseMeta | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [fetching, setFetching] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (loading) return;
    Promise.all([api.getCurriculumMeta(courseId), api.listChapters(courseId)])
      .then(([m, chs]) => {
        setMeta(m);
        setChapters(chs);
        if (m.status === "under_review") setSubmitted(true);
      })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [loading, courseId]);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await api.submitCurriculumForReview(courseId);
      setSubmitted(true);
      toast("審査申請しました！", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "申請に失敗しました", "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || fetching) return <Skeleton />;
  if (!meta) return null;

  const totalCards = chapters.reduce((s, ch) => s + ch.cards.length, 0);
  const checks = [
    { label: "章が1つ以上ある", ok: chapters.length > 0 },
    { label: "カードが1つ以上ある", ok: totalCards > 0 },
    { label: "すべての章にカードがある", ok: chapters.length > 0 && chapters.every(ch => ch.cards.length > 0) },
    { label: "コースタイトルが設定されている", ok: !!meta.title },
    { label: "分野が設定されている", ok: !!meta.subject },
    { label: "卒業動画が設定されている", ok: !!meta.completion_video_url },
  ];
  const allOk = checks.every(c => c.ok);

  return (
    <div className="creator-theme min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" title="公開設定" />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <Link href={`/creator/courses/${courseId}/preview`}>
            <button className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--card, #fff)", color: "var(--muted)", border: "1px solid var(--border, #e5e7eb)" }}>
              ← プレビューに戻る
            </button>
          </Link>
        </div>

        {/* コース情報 */}
        <div className="card mb-6" style={{ padding: "1.25rem" }}>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="font-bold text-xl" style={{ color: "var(--text)" }}>{meta.title}</h1>
              {meta.subject && <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{meta.subject}</p>}
            </div>
            <span
              className="text-xs font-medium px-2 py-1 rounded-full"
              style={{ background: "var(--bg)", color: "var(--muted)", border: "1px solid var(--border, #e5e7eb)" }}
            >
              {STATUS_LABEL[meta.status] ?? meta.status}
            </span>
          </div>
          <div className="flex gap-6 mt-4 pt-3 border-t" style={{ borderColor: "var(--border, #e5e7eb)" }}>
            <div>
              <p className="text-xs" style={{ color: "var(--muted)" }}>章数</p>
              <p className="font-bold" style={{ color: "var(--text)" }}>{chapters.length}</p>
            </div>
            <div>
              <p className="text-xs" style={{ color: "var(--muted)" }}>カード数</p>
              <p className="font-bold" style={{ color: "var(--text)" }}>{totalCards}</p>
            </div>
            {!meta.is_free && meta.tier_a_price && (
              <div>
                <p className="text-xs" style={{ color: "var(--muted)" }}>Tier A</p>
                <p className="font-bold" style={{ color: "var(--text)" }}>¥{meta.tier_a_price.toLocaleString()}/月</p>
              </div>
            )}
            {meta.tier_b_price && (
              <div>
                <p className="text-xs" style={{ color: "var(--muted)" }}>Tier B</p>
                <p className="font-bold" style={{ color: "var(--text)" }}>¥{meta.tier_b_price.toLocaleString()}/月</p>
              </div>
            )}
          </div>
        </div>

        {/* チェックリスト */}
        <div className="card mb-6" style={{ padding: "1.25rem" }}>
          <h2 className="font-semibold text-sm mb-4" style={{ color: "var(--text)" }}>公開前チェック</h2>
          <div className="flex flex-col gap-3">
            {checks.map((check, i) => (
              <div key={i} className="flex items-center gap-3">
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{
                    background: check.ok ? "#dcfce7" : "#fee2e2",
                    color: check.ok ? "#16a34a" : "#dc2626",
                  }}
                >
                  {check.ok ? "✓" : "✕"}
                </span>
                <span className="text-sm" style={{ color: "var(--text)" }}>{check.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 注意事項 */}
        {!submitted && (
          <div className="rounded-xl p-4 mb-6" style={{ background: "#fef9c3", color: "#713f12" }}>
            <p className="text-sm font-semibold mb-2">審査申請について</p>
            <ul className="text-xs space-y-1 list-disc list-inside">
              <li>申請後、管理者がコース内容を確認します（通常1〜3営業日）</li>
              <li>審査中はコースの編集ができなくなります</li>
              <li>審査を通過するとコースが公開されます</li>
              <li>問題がある場合は差し戻しとなり、修正後に再申請できます</li>
            </ul>
          </div>
        )}

        {submitted ? (
          <div className="card text-center py-10" style={{ padding: "2rem" }}>
            <div className="text-4xl mb-3">🎉</div>
            <h2 className="font-bold text-lg mb-2" style={{ color: "var(--text)" }}>審査申請が完了しました！</h2>
            <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
              管理者の審査が完了次第、コースが公開されます。<br />
              通常1〜3営業日で審査結果をお知らせします。
            </p>
            <Link href="/creator/courses">
              <button className="btn-primary">コース一覧に戻る</button>
            </Link>
          </div>
        ) : (
          <div className="flex gap-3">
            <Link href={`/creator/courses/${courseId}/curriculum`} className="flex-1">
              <button className="btn-secondary w-full">編集に戻る</button>
            </Link>
            <button
              onClick={handleSubmit}
              disabled={!allOk || submitting || meta.status === "under_review"}
              className="btn-primary flex-1"
            >
              {submitting ? "申請中…" : "審査に申請する"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
