"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { AppHeader } from "@/components/AppHeader";

type Card = {
  id: number;
  order: number;
  card_type: string;
  title: string | null;
  youtube_url: string | null;
  is_preview: boolean;
  youtube_available: boolean | null;
};

type Chapter = {
  id: number;
  order: number;
  title: string;
  goal: string | null;
  cards: Card[];
};

type CourseMeta = {
  id: number;
  title: string;
  status: string;
  subject: string | null;
  curriculum_purpose: string | null;
  curriculum_target_audience: string | null;
  curriculum_topics: string | null;
  curriculum_duration: string | null;
  curriculum_style: string | null;
  curriculum_concerns: string | null;
  curriculum_existing_videos: string | null;
  completion_video_url: string | null;
};

const CARD_TYPE_ICON: Record<string, string> = {
  video: "▶",
  build_task: "🔨",
  quiz: "❓",
  message: "💬",
};

const CARD_TYPE_LABEL: Record<string, string> = {
  video: "動画",
  build_task: "課題",
  quiz: "クイズ",
  message: "メッセージ",
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft: { label: "下書き", color: "#6b7280" },
  under_review: { label: "審査中", color: "#d97706" },
  published: { label: "公開中", color: "#16a34a" },
  unpublished: { label: "非公開", color: "#6b7280" },
};

export default function CurriculumHubPage() {
  const { loading } = useRoleGuard(["creator", "admin"]);
  const params = useParams();
  const courseId = Number(params.id);
  const router = useRouter();

  const [meta, setMeta] = useState<CourseMeta | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [fetching, setFetching] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, chs] = await Promise.all([
        api.getCurriculumMeta(courseId),
        api.listChapters(courseId),
      ]);
      setMeta(m);
      setChapters(chs);
    } catch {
      toast("読み込みに失敗しました", "error");
    } finally {
      setFetching(false);
    }
  }, [courseId]);

  useEffect(() => { if (!loading) load(); }, [loading, load]);

  async function handleLoadPrompt() {
    try {
      const res = await api.getCurriculumPrompt(courseId);
      setPrompt(res.prompt);
      setShowPrompt(true);
    } catch {
      toast("プロンプト取得に失敗しました", "error");
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleDeleteChapter(chapterId: number) {
    if (!confirm("この章を削除しますか？章内のカードもすべて削除されます。")) return;
    try {
      await api.deleteChapter(courseId, chapterId);
      setChapters(prev => prev.filter(ch => ch.id !== chapterId));
      toast("章を削除しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "削除に失敗しました", "error");
    }
  }

  async function handleSubmitForReview() {
    if (!confirm("審査に申請しますか？申請後は内容の変更ができなくなります。")) return;
    setSubmitting(true);
    try {
      await api.submitCurriculumForReview(courseId);
      toast("審査に申請しました", "success");
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "申請に失敗しました", "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || fetching) return <Skeleton />;
  if (!meta) return null;

  const totalCards = chapters.reduce((s, ch) => s + ch.cards.length, 0);
  const statusInfo = STATUS_LABEL[meta.status] ?? { label: meta.status, color: "#6b7280" };

  return (
    <div className="creator-theme min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" title="カリキュラム編集" />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* コースヘッダー */}
        <div className="card mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{ background: `${statusInfo.color}20`, color: statusInfo.color }}
                >
                  {statusInfo.label}
                </span>
                {meta.subject && (
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--bg)", color: "var(--muted)" }}>
                    {meta.subject}
                  </span>
                )}
              </div>
              <h1 className="font-bold text-xl" style={{ color: "var(--text)" }}>{meta.title}</h1>
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                {chapters.length} 章 · {totalCards} カード
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0 flex-wrap">
              <Link href={`/creator/courses/${courseId}/preview`}>
                <button className="btn-secondary text-sm">プレビュー</button>
              </Link>
              {(meta.status === "draft" || meta.status === "unpublished") && (
                <button className="btn-primary text-sm" onClick={handleSubmitForReview} disabled={submitting}>
                  {submitting ? "申請中…" : "審査申請"}
                </button>
              )}
            </div>
          </div>

          {/* プロンプトトグル */}
          <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--border, #e5e7eb)" }}>
            <button
              onClick={showPrompt ? () => setShowPrompt(false) : handleLoadPrompt}
              className="text-xs font-medium"
              style={{ color: "var(--primary)" }}
            >
              {showPrompt ? "▲ プロンプトを閉じる" : "▼ AI壁打ち用プロンプトを表示"}
            </button>
            {showPrompt && (
              <div className="mt-3 relative">
                <pre
                  className="text-xs whitespace-pre-wrap rounded-xl p-4 leading-relaxed"
                  style={{ background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border, #e5e7eb)", fontFamily: "inherit" }}
                >
                  {prompt}
                </pre>
                <button
                  onClick={handleCopy}
                  className="absolute top-3 right-3 text-xs px-3 py-1.5 rounded-lg font-medium"
                  style={{ background: copied ? "var(--accent)" : "var(--primary)", color: "#fff" }}
                >
                  {copied ? "コピーしました！" : "コピー"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* アクションバー */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-base" style={{ color: "var(--text)" }}>章一覧</h2>
          <div className="flex gap-2">
            <Link href={`/creator/courses/${courseId}/chapters`}>
              <button className="btn-secondary text-sm">章立てを編集</button>
            </Link>
          </div>
        </div>

        {/* 章カード一覧 */}
        {chapters.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>まだ章がありません</p>
            <Link href={`/creator/courses/${courseId}/chapters`}>
              <button className="btn-primary">章立てを入力する</button>
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {chapters.map((ch, i) => (
              <div key={ch.id} className="card" style={{ padding: "1.25rem" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--primary)", color: "#fff" }}>
                        第{i + 1}章
                      </span>
                      <span className="font-semibold text-sm truncate" style={{ color: "var(--text)" }}>{ch.title}</span>
                    </div>
                    {ch.goal && (
                      <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>🎯 {ch.goal}</p>
                    )}
                    {/* カードチップ */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {ch.cards.length === 0 ? (
                        <span className="text-xs" style={{ color: "var(--muted)" }}>カードがまだありません</span>
                      ) : (
                        ch.cards.map(card => (
                          <span
                            key={card.id}
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{
                              background: "var(--bg)",
                              color: "var(--text)",
                              border: "1px solid var(--border, #e5e7eb)",
                            }}
                          >
                            {CARD_TYPE_ICON[card.card_type] || "📄"} {card.title || CARD_TYPE_LABEL[card.card_type] || card.card_type}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Link href={`/creator/courses/${courseId}/chapters/${ch.id}`}>
                      <button className="btn-secondary text-xs">編集</button>
                    </Link>
                    <button
                      onClick={() => handleDeleteChapter(ch.id)}
                      className="text-xs px-2 py-1 rounded"
                      style={{ background: "#fee2e2", color: "#dc2626" }}
                    >削除</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 完了動画 */}
        <div className="card mt-6">
          <h3 className="font-semibold text-sm mb-3" style={{ color: "var(--text)" }}>卒業動画（任意）</h3>
          <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>全カード完了時に再生される動画URL</p>
          <CompletionVideoInput courseId={courseId} currentUrl={meta.completion_video_url} />
        </div>

        {/* 下部ナビ */}
        <div className="flex gap-3 mt-6">
          <Link href={`/creator/courses/${courseId}/preview`} className="flex-1">
            <button className="btn-secondary w-full">プレビュー確認</button>
          </Link>
          {(meta.status === "draft" || meta.status === "unpublished") && totalCards > 0 && (
            <button className="btn-primary flex-1" onClick={handleSubmitForReview} disabled={submitting}>
              {submitting ? "申請中…" : "審査に申請する"}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

function CompletionVideoInput({ courseId, currentUrl }: { courseId: number; currentUrl: string | null }) {
  const [url, setUrl] = useState(currentUrl || "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await api.updateCurriculumMeta(courseId, { completion_video_url: url || null });
      toast("保存しました", "success");
    } catch {
      toast("保存に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex gap-2">
      <input
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="https://youtu.be/..."
        className="flex-1"
      />
      <button onClick={handleSave} disabled={saving} className="btn-secondary text-sm flex-shrink-0">
        {saving ? "保存中" : "保存"}
      </button>
    </div>
  );
}
