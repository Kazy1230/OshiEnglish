"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";

type AdminCourse = { id: number; title: string; status: string; is_suspended: boolean; suspension_reason: string | null; character_name: string | null };

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

const STATUS_LABEL: Record<string, string> = { draft: "下書き", review: "審査待ち", published: "公開中", unpublished: "非公開" };
const STATUS_BADGE_CLASS: Record<string, string> = {
  published: "admin-badge admin-badge-green",
  review: "admin-badge",
  draft: "admin-badge admin-badge-gray",
  unpublished: "admin-badge admin-badge-gray",
};

export function CourseModerationTab() {
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [suspendReasons, setSuspendReasons] = useState<Record<number, string>>({});
  const [rejectReasons, setRejectReasons] = useState<Record<number, string>>({});
  const [detail, setDetail] = useState<CourseDetailForAdmin | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  function reload() { return api.adminListAllCourses().then(setCourses); }

  useEffect(() => { reload().finally(() => setLoading(false)); }, []);

  async function handleApprove(courseId: number) {
    try { await api.adminApproveCourse(courseId); toast("公開しました", "success"); await reload(); }
    catch (err: unknown) { toast(err instanceof Error ? err.message : "失敗しました", "error"); }
  }

  async function handleReject(courseId: number) {
    try { await api.adminRejectCourse(courseId, rejectReasons[courseId]); toast("却下しました", "success"); await reload(); }
    catch (err: unknown) { toast(err instanceof Error ? err.message : "失敗しました", "error"); }
  }

  async function handleSuspend(courseId: number) {
    const reason = suspendReasons[courseId];
    if (!reason) { toast("停止理由を入力してください", "error"); return; }
    try { await api.adminSuspendCourse(courseId, reason); toast("停止しました", "success"); await reload(); }
    catch (err: unknown) { toast(err instanceof Error ? err.message : "失敗しました", "error"); }
  }

  async function handleUnsuspend(courseId: number) {
    try { await api.adminUnsuspendCourse(courseId); toast("停止を解除しました", "success"); await reload(); }
    catch (err: unknown) { toast(err instanceof Error ? err.message : "失敗しました", "error"); }
  }

  async function handleDelete(c: AdminCourse) {
    if (!confirm(`「${c.title}」を完全に削除しますか？この操作は取り消せません。`)) return;
    try { await api.adminDeleteCourse(c.id); toast("削除しました", "success"); await reload(); }
    catch (err: unknown) { toast(err instanceof Error ? err.message : "失敗しました", "error"); }
  }

  async function handleShowDetail(courseId: number) {
    setDetailLoading(true);
    try {
      const d = await api.getCourseDetail(courseId);
      setDetail(d);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "詳細の取得に失敗しました", "error");
    } finally {
      setDetailLoading(false);
    }
  }

  if (loading) return <p style={{ color: "var(--muted)", fontSize: 14 }}>読み込み中…</p>;

  const filtered = courses.filter(c =>
    !query.trim() || c.title.toLowerCase().includes(query.toLowerCase()) || (c.character_name ?? "").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", margin: 0 }}>コース一覧</h2>
        <span className="admin-badge admin-badge-gray">{filtered.length} / {courses.length}件</span>
      </div>

      <input
        placeholder="コース名・キャラクター名で検索"
        value={query}
        onChange={e => setQuery(e.target.value)}
        style={{ maxWidth: 360, fontSize: 13 }}
      />

      {filtered.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 14, padding: "24px 0" }}>該当するコースがありません</p>
      ) : (
        filtered.map(c => (
          <div key={c.id} className="admin-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", justifyContent: "space-between", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{c.title}</span>
                <span
                  className={STATUS_BADGE_CLASS[c.status] ?? "admin-badge admin-badge-gray"}
                  style={c.status === "review" ? { background: "rgba(245,158,11,0.12)", color: "#d97706", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999 } : undefined}
                >
                  {STATUS_LABEL[c.status] ?? c.status}
                </span>
                {c.is_suspended && <span className="admin-badge admin-badge-red">停止中</span>}
              </div>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{c.character_name ?? "不明"}</span>
            </div>

            {c.is_suspended && c.suspension_reason && (
              <p style={{ fontSize: 12, color: "var(--danger, #ef4444)", margin: 0 }}>停止理由: {c.suspension_reason}</p>
            )}

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <button className="admin-action" onClick={() => handleShowDetail(c.id)}>詳細を見る</button>
              {c.status === "review" && (
                <>
                  <input
                    placeholder="却下理由（任意）"
                    value={rejectReasons[c.id] ?? ""}
                    onChange={e => setRejectReasons(prev => ({ ...prev, [c.id]: e.target.value }))}
                    style={{ fontSize: 12, padding: "4px 8px", width: 160 }}
                  />
                  <button className="admin-action admin-action-danger" onClick={() => handleReject(c.id)}>却下</button>
                  <button
                    className="admin-action"
                    style={{ background: "rgba(16,185,129,0.1)", color: "var(--accent)", borderColor: "rgba(16,185,129,0.3)" }}
                    onClick={() => handleApprove(c.id)}
                  >
                    承認して公開
                  </button>
                </>
              )}

              {c.is_suspended ? (
                <button className="admin-action" style={{ color: "var(--accent)", borderColor: "rgba(16,185,129,0.3)" }} onClick={() => handleUnsuspend(c.id)}>停止解除</button>
              ) : c.status !== "review" && (
                <>
                  <input
                    placeholder="停止理由（必須）"
                    value={suspendReasons[c.id] ?? ""}
                    onChange={e => setSuspendReasons(prev => ({ ...prev, [c.id]: e.target.value }))}
                    style={{ fontSize: 12, padding: "4px 8px", width: 150 }}
                  />
                  <button className="admin-action admin-action-danger" onClick={() => handleSuspend(c.id)}>停止</button>
                </>
              )}

              <button className="admin-action admin-action-danger" onClick={() => handleDelete(c)}>削除</button>
            </div>
          </div>
        ))
      )}

      {(detail || detailLoading) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setDetail(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl p-6"
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            onClick={e => e.stopPropagation()}
          >
            {detailLoading && !detail ? (
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
                  <button onClick={() => setDetail(null)} style={{ fontSize: 20, lineHeight: 1, color: "var(--muted)" }}>✕</button>
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
      )}
    </div>
  );
}
