"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";

type QuizOption = { text: string; is_correct?: boolean };
type CourseCard = { id: number; order: number; card_type: string; title: string | null; is_preview: boolean; body?: string | null; youtube_url?: string | null; quiz_options?: QuizOption[] | null };
type CourseChapter = { id: number; order: number; title: string; goal: string | null; cards: CourseCard[] };
type CourseDay = { id: number; day: number; week_number: number; theme: string | null; checklist_items: { text: string; minutes: number }[] | null; is_rest_day: boolean };
type CourseDetailForAdmin = {
  id: number; title: string; description: string | null; thumbnail_url: string | null;
  category: string | null; price: number; is_free: boolean;
  tier_a_price: number | null; tier_b_price: number | null;
  course_type?: string;
  chapters?: CourseChapter[]; chapter_count?: number;
  days?: CourseDay[];
  character: { name: string } | null;
};

const CARD_TYPE_LABEL: Record<string, string> = { video: "動画", build_task: "課題", quiz: "クイズ", message: "メッセージ" };

function AdminYouTubeEmbed({ url }: { url: string }) {
  const match = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (!match) return <p style={{ fontSize: 12, color: "var(--danger, #ef4444)" }}>⚠ URLが無効です: {url}</p>;
  return (
    <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, overflow: "hidden", borderRadius: 8 }}>
      <iframe
        src={`https://www.youtube.com/embed/${match[1]}`}
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

export function CourseDetailModal({ courseId, onClose }: { courseId: number | null; onClose: () => void }) {
  const [detail, setDetail] = useState<CourseDetailForAdmin | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (courseId == null) { setDetail(null); return; }
    setLoading(true);
    api.getCourseDetail(courseId)
      .then(setDetail)
      .catch((err: unknown) => toast(err instanceof Error ? err.message : "詳細の取得に失敗しました", "error"))
      .finally(() => setLoading(false));
  }, [courseId]);

  if (courseId == null) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl p-6"
        style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        onClick={e => e.stopPropagation()}
      >
        {loading && !detail ? (
          <p style={{ color: "var(--muted)", fontSize: 14 }}>読み込み中…</p>
        ) : detail && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: 0 }}>{detail.title}</h2>
                <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                  {detail.character?.name ?? "不明"} ・ {detail.category ?? "カテゴリ未設定"}
                </p>
              </div>
              <button onClick={onClose} style={{ fontSize: 20, lineHeight: 1, color: "var(--muted)" }}>✕</button>
            </div>

            {detail.thumbnail_url && (
              <img src={detail.thumbnail_url} alt="" style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 12 }} />
            )}

            {detail.description && (
              <p style={{ fontSize: 13, color: "var(--text)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{detail.description}</p>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="admin-badge admin-badge-gray">
                {detail.is_free ? "無料コース" : `Tier A: ${detail.tier_a_price ? `¥${detail.tier_a_price}/月` : "なし"} / Tier B: ${detail.tier_b_price ? `¥${detail.tier_b_price}/月` : "なし"}`}
              </span>
              {detail.course_type === "pace_based" ? (
                <span className="admin-badge admin-badge-gray">{(detail.days ?? []).length}日分</span>
              ) : (
                <span className="admin-badge admin-badge-gray">{detail.chapter_count ?? 0}章</span>
              )}
            </div>

            {detail.course_type === "pace_based" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(detail.days ?? []).map(day => (
                  <div key={day.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", margin: 0 }}>Day {day.day}（第{day.week_number}週）</p>
                      {day.is_rest_day && <span className="admin-badge admin-badge-gray">休息日</span>}
                    </div>
                    {day.theme && <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>🎯 {day.theme}</p>}
                    {(day.checklist_items ?? []).length > 0 && (
                      <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                        {(day.checklist_items ?? []).map((item, i) => (
                          <li key={i} style={{ fontSize: 12, color: "var(--text)" }}>{item.text}（{item.minutes}分）</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
                {(detail.days ?? []).length === 0 && (
                  <p style={{ fontSize: 13, color: "var(--muted)" }}>まだ30日分のカレンダーが生成されていません。</p>
                )}
              </div>
            ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(detail.chapters ?? []).map(ch => (
                <div key={ch.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", margin: 0 }}>第{ch.order}章：{ch.title}</p>
                  {ch.goal && <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>🎯 {ch.goal}</p>}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                    {ch.cards.map(card => (
                      <div key={card.id} style={{ fontSize: 12, color: "var(--text)", background: "var(--surface)", borderRadius: 8, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                        <div>
                          <span style={{ fontWeight: 700 }}>{CARD_TYPE_LABEL[card.card_type] ?? card.card_type}</span>
                          {card.title && <span> — {card.title}</span>}
                          {card.is_preview && <span className="admin-badge admin-badge-green" style={{ marginLeft: 6 }}>無料プレビュー</span>}
                        </div>
                        {card.youtube_url && <AdminYouTubeEmbed url={card.youtube_url} />}
                        {card.body && (
                          <p style={{ fontSize: 12, color: "var(--text)", whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.5 }}>{card.body}</p>
                        )}
                        {card.quiz_options && card.quiz_options.length > 0 && (
                          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 2 }}>
                            {card.quiz_options.map((opt, i) => (
                              <li key={i} style={{ fontSize: 12, color: opt.is_correct ? "var(--accent)" : "var(--text)", fontWeight: opt.is_correct ? 700 : 400 }}>
                                {opt.text}{opt.is_correct && " ✓正解"}
                              </li>
                            ))}
                          </ul>
                        )}
                        {!card.youtube_url && !card.body && !(card.quiz_options && card.quiz_options.length > 0) && (
                          <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>本文・動画が未登録です</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {(detail.chapters ?? []).length === 0 && (
                <p style={{ fontSize: 13, color: "var(--muted)" }}>章がまだ登録されていません。</p>
              )}
            </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
