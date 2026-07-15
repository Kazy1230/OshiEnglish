"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";

type Card = {
  id: number;
  order: number;
  card_type: string;
  title: string | null;
  body: string | null;
  youtube_url: string | null;
  is_preview: boolean;
};

type Chapter = {
  id: number;
  order: number;
  title: string;
  goal: string | null;
  assessment_criteria: string[] | null;
  cards: Card[];
};

type CourseMeta = {
  id: number;
  title: string;
  description: string | null;
  subject: string | null;
  status: string;
  curriculum_purpose: string | null;
  curriculum_target_audience: string | null;
  is_free: boolean;
  tier_a_price: number | null;
  tier_b_price: number | null;
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

export default function CoursePreviewPage() {
  const { loading } = useRoleGuard(["creator", "admin"]);
  const params = useParams();
  const courseId = Number(params.id);

  const [meta, setMeta] = useState<CourseMeta | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [fetching, setFetching] = useState(true);
  const [openChapter, setOpenChapter] = useState<number | null>(null);

  useEffect(() => {
    if (loading) return;
    Promise.all([api.getCurriculumMeta(courseId), api.listChapters(courseId)])
      .then(([m, chs]) => {
        setMeta(m);
        setChapters(chs);
        if (chs.length > 0) setOpenChapter(chs[0].id);
      })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [loading, courseId]);

  if (loading || fetching) return <Skeleton />;
  if (!meta) return null;

  const totalCards = chapters.reduce((s, ch) => s + ch.cards.length, 0);
  const previewCards = chapters.reduce((s, ch) => s + ch.cards.filter(c => c.is_preview).length, 0);

  return (
    <div className="creator-theme min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" title="コースプレビュー" />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* 戻るリンク */}
        <div className="mb-6 flex items-center justify-between">
          <Link href={`/creator/courses/${courseId}/curriculum`}>
            <button className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--card, #fff)", color: "var(--muted)", border: "1px solid var(--border, #e5e7eb)" }}>
              ← カリキュラムに戻る
            </button>
          </Link>
          <Link href={`/creator/courses/${courseId}/publish`}>
            <button className="btn-primary text-sm">公開設定へ</button>
          </Link>
        </div>

        {/* コース概要 */}
        <div className="card mb-6" style={{ padding: "1.5rem" }}>
          <div className="flex items-start gap-4">
            <div className="flex-1">
              {meta.subject && (
                <span className="text-xs px-2 py-0.5 rounded-full mb-2 inline-block" style={{ background: "var(--bg)", color: "var(--muted)", border: "1px solid var(--border, #e5e7eb)" }}>
                  {meta.subject}
                </span>
              )}
              <h1 className="font-bold text-2xl mt-1" style={{ color: "var(--text)" }}>{meta.title}</h1>
              {meta.description && (
                <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>{meta.description}</p>
              )}
              {meta.curriculum_purpose && (
                <p className="text-sm mt-2" style={{ color: "var(--text)" }}>🎯 {meta.curriculum_purpose}</p>
              )}
              {meta.curriculum_target_audience && (
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>対象: {meta.curriculum_target_audience}</p>
              )}
            </div>
          </div>

          <div className="flex gap-4 mt-4 pt-4 border-t flex-wrap" style={{ borderColor: "var(--border, #e5e7eb)" }}>
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color: "var(--primary)" }}>{chapters.length}</p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>章</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color: "var(--primary)" }}>{totalCards}</p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>カード</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color: "var(--accent)" }}>{previewCards}</p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>無料公開</p>
            </div>
            {!meta.is_free && meta.tier_a_price && (
              <div className="text-center">
                <p className="text-2xl font-bold" style={{ color: "var(--text)" }}>¥{meta.tier_a_price.toLocaleString()}</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>Tier A/月</p>
              </div>
            )}
          </div>
        </div>

        {/* 章・カード一覧 */}
        <h2 className="font-bold text-base mb-4" style={{ color: "var(--text)" }}>カリキュラム</h2>
        <div className="flex flex-col gap-3">
          {chapters.map((ch, i) => (
            <div key={ch.id} className="card overflow-hidden">
              <button
                className="w-full flex items-center gap-3 p-4 text-left transition"
                onClick={() => setOpenChapter(openChapter === ch.id ? null : ch.id)}
                style={{ background: "transparent" }}
              >
                <span
                  className="text-xs font-bold px-2 py-1 rounded-full flex-shrink-0"
                  style={{ background: "var(--primary)", color: "#fff" }}
                >
                  第{i + 1}章
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm" style={{ color: "var(--text)" }}>{ch.title}</p>
                  {ch.goal && <p className="text-xs truncate" style={{ color: "var(--muted)" }}>{ch.goal}</p>}
                </div>
                <span className="text-xs flex-shrink-0" style={{ color: "var(--muted)" }}>{ch.cards.length}カード</span>
                <span style={{ color: "var(--muted)" }}>{openChapter === ch.id ? "▲" : "▼"}</span>
              </button>

              {openChapter === ch.id && (
                <div className="border-t" style={{ borderColor: "var(--border, #e5e7eb)" }}>
                  {ch.cards.length === 0 ? (
                    <p className="text-xs text-center py-4" style={{ color: "var(--muted)" }}>カードがありません</p>
                  ) : (
                    ch.cards.map((card, j) => (
                      <div
                        key={card.id}
                        className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0"
                        style={{ borderColor: "var(--border, #e5e7eb)" }}
                      >
                        <span className="text-xs w-5 text-center flex-shrink-0" style={{ color: "var(--muted)" }}>{j + 1}</span>
                        <span className="text-sm">{CARD_TYPE_ICON[card.card_type] || "📄"}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate" style={{ color: "var(--text)" }}>
                            {card.title || CARD_TYPE_LABEL[card.card_type] || card.card_type}
                          </p>
                          {card.card_type === "video" && card.youtube_url && (
                            <p className="text-xs truncate" style={{ color: "var(--muted)" }}>{card.youtube_url}</p>
                          )}
                        </div>
                        {card.is_preview && (
                          <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "rgba(59,130,246,0.16)", color: "#60a5fa" }}>無料</span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {chapters.length === 0 && (
          <div className="card text-center py-12">
            <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>章がまだありません</p>
            <Link href={`/creator/courses/${courseId}/chapters`}>
              <button className="btn-primary">章立てを入力する</button>
            </Link>
          </div>
        )}

        <div className="flex gap-3 mt-8">
          <Link href={`/creator/courses/${courseId}/curriculum`} className="flex-1">
            <button className="btn-secondary w-full">編集に戻る</button>
          </Link>
          <Link href={`/creator/courses/${courseId}/publish`} className="flex-1">
            <button className="btn-primary w-full">公開設定へ進む</button>
          </Link>
        </div>
      </main>
    </div>
  );
}
