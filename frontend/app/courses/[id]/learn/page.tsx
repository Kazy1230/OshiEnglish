"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/Skeleton";
import { toast } from "@/components/Toast";

type Card = {
  id: number;
  order: number;
  card_type: "video" | "assignment" | "test" | "message";
  title: string;
  body: string | null;
  youtube_url: string | null;
  is_preview: boolean;
  youtube_available: boolean | null;
  is_completed: boolean;
};

type Chapter = {
  id: number;
  order: number;
  title: string;
  goal: string | null;
  cards: Card[];
  completed_count: number;
};

type Progress = {
  total_cards: number;
  completed_cards: number;
  is_graduated: boolean;
  target_pace: string | null;
  completion_video_url: string | null;
};

type NextCourse = {
  id: number;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  price: number;
  is_free: boolean;
  is_purchased: boolean;
};

type Review = {
  id: number;
  content_rating: number;
  coaching_rating: number;
  body: string | null;
};

const PACE_OPTIONS = [
  { value: "2weeks", label: "2週間で完走" },
  { value: "1month", label: "1ヶ月で完走" },
  { value: "3months", label: "3ヶ月で完走" },
  { value: "no_deadline", label: "マイペースで" },
];

const CARD_TYPE_ICON: Record<string, string> = {
  video: "▶",
  assignment: "✏",
  test: "📝",
  message: "💬",
};

function YouTubeEmbed({ url }: { url: string }) {
  const match = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (!match) return <p style={{ color: "var(--muted)" }}>URLが無効です</p>;
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

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          onClick={() => onChange(n)}
          style={{ fontSize: "1.5rem", color: n <= value ? "#f59e0b" : "var(--border)", lineHeight: 1 }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export default function LearnPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = Number(params.id);

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [fetching, setFetching] = useState(true);
  const [showPaceModal, setShowPaceModal] = useState(false);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [completing, setCompleting] = useState(false);
  const [graduated, setGraduated] = useState(false);
  const [nextCourses, setNextCourses] = useState<NextCourse[]>([]);

  // レビュー
  const [myReview, setMyReview] = useState<Review | null>(null);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [contentRating, setContentRating] = useState(0);
  const [coachingRating, setCoachingRating] = useState(0);
  const [reviewBody, setReviewBody] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    if (!courseId) return;
    Promise.all([
      api.getLearnerCurriculum(courseId),
      api.getLearnerProgress(courseId),
      api.getMyReview(courseId).catch(() => null),
    ]).then(([chs, prog, review]) => {
      setChapters(chs.chapters ?? chs);
      setProgress(prog);
      if (!prog.target_pace) setShowPaceModal(true);
      if (prog.is_graduated) {
        setGraduated(true);
        // 卒業済みなら卒業APIから次コース取得
        api.graduateCourse(courseId).then(res => {
          setNextCourses(res.next_courses ?? []);
        }).catch(() => {});
      }
      if (review) {
        setMyReview(review);
        setContentRating(review.content_rating);
        setCoachingRating(review.coaching_rating);
        setReviewBody(review.body ?? "");
      }
    }).catch(() => router.push(`/courses/${courseId}`))
      .finally(() => setFetching(false));
  }, [courseId]);

  async function setPace(pace: string) {
    try {
      await api.setPace(courseId, pace);
      setProgress(p => p ? { ...p, target_pace: pace } : p);
      setShowPaceModal(false);
      toast("ペースを設定しました");
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function completeCard(card: Card) {
    if (card.is_completed || completing) return;
    setCompleting(true);
    try {
      await api.completeCard(card.id);
      setChapters(prev => prev.map(ch => ({
        ...ch,
        cards: ch.cards.map(c => c.id === card.id ? { ...c, is_completed: true } : c),
        completed_count: ch.cards.filter(c => c.id === card.id || c.is_completed).length,
      })));
      setProgress(p => {
        if (!p) return p;
        const newCompleted = p.completed_cards + 1;
        const isNowGraduated = newCompleted >= p.total_cards;
        if (isNowGraduated) {
          api.graduateCourse(courseId).then(res => {
            setNextCourses(res.next_courses ?? []);
          }).catch(() => {});
          setGraduated(true);
        }
        return { ...p, completed_cards: newCompleted, is_graduated: isNowGraduated };
      });
      setSelectedCard(null);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCompleting(false);
    }
  }

  async function submitReview() {
    if (contentRating === 0 || coachingRating === 0) {
      toast("両方の評価を選択してください");
      return;
    }
    setSubmittingReview(true);
    try {
      const res = await api.createReview(courseId, {
        content_rating: contentRating,
        coaching_rating: coachingRating,
        body: reviewBody.trim() || undefined,
      });
      setMyReview(res);
      setShowReviewForm(false);
      toast("レビューを投稿しました");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmittingReview(false);
    }
  }

  if (fetching) return <Skeleton />;

  const completionPct = progress && progress.total_cards > 0
    ? Math.round((progress.completed_cards / progress.total_cards) * 100)
    : 0;

  const canReview = graduated || completionPct >= 50;

  // 卒業画面
  if (graduated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12" style={{ background: "var(--bg)" }}>
        <div className="max-w-lg w-full flex flex-col gap-6">

          {/* 卒業メッセージ */}
          <div className="card flex flex-col gap-4 text-center">
            <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}>
              🎓 おめでとうございます！
            </h1>
            <p style={{ color: "var(--text)" }}>コースを修了しました。</p>
            {progress?.completion_video_url && (
              <YouTubeEmbed url={progress.completion_video_url} />
            )}
          </div>

          {/* レビューセクション */}
          <div className="card flex flex-col gap-4">
            <h2 className="font-bold text-sm" style={{ color: "var(--primary)" }}>感想を書く</h2>
            {myReview && !showReviewForm ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-4 text-sm" style={{ color: "var(--muted)" }}>
                  <span>講座内容: {myReview.content_rating}★</span>
                  <span>AIコーチング: {myReview.coaching_rating}★</span>
                </div>
                {myReview.body && <p className="text-sm" style={{ color: "var(--text)" }}>{myReview.body}</p>}
                <button className="text-xs self-start" style={{ color: "var(--accent)" }} onClick={() => setShowReviewForm(true)}>
                  編集する
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>講座内容</label>
                  <StarRating value={contentRating} onChange={setContentRating} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>AIコーチング</label>
                  <StarRating value={coachingRating} onChange={setCoachingRating} />
                </div>
                <textarea
                  className="w-full rounded border px-3 py-2 text-sm"
                  style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)", minHeight: 80, resize: "vertical" }}
                  placeholder="感想・コメント（任意）"
                  value={reviewBody}
                  onChange={e => setReviewBody(e.target.value)}
                />
                <div className="flex gap-2 justify-end">
                  {myReview && (
                    <button className="btn-ghost text-sm" onClick={() => setShowReviewForm(false)}>キャンセル</button>
                  )}
                  <button className="btn-primary text-sm" onClick={submitReview} disabled={submittingReview}>
                    {submittingReview ? "送信中..." : "投稿する"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ネクストコース */}
          {nextCourses.length > 0 && (
            <div className="card flex flex-col gap-3">
              <h2 className="font-bold text-sm" style={{ color: "var(--primary)" }}>次のコース</h2>
              <div className="flex flex-col gap-2">
                {nextCourses.map(c => (
                  <Link
                    key={c.id}
                    href={`/courses/${c.id}`}
                    className="flex items-center gap-3 rounded-lg p-3 transition-colors"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                  >
                    {c.thumbnail_url && (
                      <img src={c.thumbnail_url} alt={c.title} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate" style={{ color: "var(--text)" }}>{c.title}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                        {c.is_purchased ? "購入済み" : c.is_free ? "無料" : `¥${c.price.toLocaleString()}`}
                      </p>
                    </div>
                    <span style={{ color: "var(--accent)", fontSize: "0.8rem" }}>→</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <Link href="/mypage" className="btn-primary text-center">マイページへ戻る</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* ペース設定モーダル */}
      {showPaceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="card max-w-sm w-full flex flex-col gap-4">
            <h2 className="font-bold text-lg" style={{ color: "var(--primary)" }}>学習ペースを設定しましょう</h2>
            <p className="text-sm" style={{ color: "var(--muted)" }}>目標ペースを決めると、学習の継続に役立ちます。後から変更もできます。</p>
            <div className="flex flex-col gap-2">
              {PACE_OPTIONS.map(p => (
                <button
                  key={p.value}
                  className="btn-ghost text-left"
                  onClick={() => setPace(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button className="text-sm self-end" style={{ color: "var(--muted)" }} onClick={() => setShowPaceModal(false)}>
              あとで設定する
            </button>
          </div>
        </div>
      )}

      {/* カード詳細モーダル */}
      {selectedCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="card max-w-2xl w-full flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-bold" style={{ color: "var(--primary)" }}>{selectedCard.title}</h2>
              <button onClick={() => setSelectedCard(null)} style={{ color: "var(--muted)", fontSize: "1.5rem", lineHeight: 1 }}>×</button>
            </div>

            {selectedCard.youtube_url && <YouTubeEmbed url={selectedCard.youtube_url} />}
            {selectedCard.body && <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--text)" }}>{selectedCard.body}</p>}

            {!selectedCard.is_completed ? (
              <button className="btn-primary" onClick={() => completeCard(selectedCard)} disabled={completing}>
                {completing ? "記録中..." : "完了にする"}
              </button>
            ) : (
              <p className="text-sm font-medium text-center" style={{ color: "var(--accent)" }}>✓ 完了済み</p>
            )}
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        <Link href={`/courses/${courseId}`} className="text-sm" style={{ color: "var(--muted)" }}>← コース詳細へ</Link>

        {/* 進捗バー */}
        {progress && (
          <div className="card flex flex-col gap-2">
            <div className="flex justify-between text-sm">
              <span style={{ color: "var(--text)" }}>学習進捗</span>
              <span style={{ color: "var(--accent)", fontWeight: 600 }}>{completionPct}%</span>
            </div>
            <div style={{ background: "var(--border)", borderRadius: 9999, height: 8 }}>
              <div style={{ background: "var(--accent)", width: `${completionPct}%`, height: "100%", borderRadius: 9999, transition: "width 0.4s" }} />
            </div>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {progress.completed_cards} / {progress.total_cards} カード完了
              {progress.target_pace && ` · ペース: ${PACE_OPTIONS.find(p => p.value === progress.target_pace)?.label ?? progress.target_pace}`}
            </p>
          </div>
        )}

        {/* 章一覧 */}
        {chapters.map(chapter => {
          const chTotal = chapter.cards.length;
          const chDone = chapter.cards.filter(c => c.is_completed).length;
          return (
            <div key={chapter.id} className="card flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-bold" style={{ color: "var(--primary)" }}>
                  第{chapter.order}章　{chapter.title}
                </h2>
                <span className="text-xs" style={{ color: "var(--muted)" }}>{chDone}/{chTotal}</span>
              </div>
              {chapter.goal && <p className="text-sm" style={{ color: "var(--muted)" }}>{chapter.goal}</p>}

              <div className="flex flex-col gap-1">
                {chapter.cards.map(card => (
                  <button
                    key={card.id}
                    className="flex items-center gap-3 px-3 py-2 rounded text-left transition-colors"
                    style={{
                      background: card.is_completed ? "var(--surface)" : "transparent",
                      border: "1px solid var(--border)",
                      opacity: card.youtube_available === false ? 0.6 : 1,
                    }}
                    onClick={() => setSelectedCard(card)}
                  >
                    <span style={{ fontSize: "1rem", width: 20, textAlign: "center" }}>
                      {card.is_completed ? "✓" : CARD_TYPE_ICON[card.card_type]}
                    </span>
                    <span className="flex-1 text-sm" style={{ color: card.is_completed ? "var(--muted)" : "var(--text)" }}>
                      {card.title}
                    </span>
                    {card.youtube_available === false && (
                      <span className="text-xs" style={{ color: "#ef4444" }}>非公開</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {/* 進捗50%以上でレビュー促進 */}
        {canReview && !graduated && (
          <div className="card flex flex-col gap-3">
            <h2 className="font-bold text-sm" style={{ color: "var(--primary)" }}>
              {myReview ? "あなたのレビュー" : "感想を書く（任意）"}
            </h2>
            {myReview && !showReviewForm ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-4 text-sm" style={{ color: "var(--muted)" }}>
                  <span>講座内容: {myReview.content_rating}★</span>
                  <span>AIコーチング: {myReview.coaching_rating}★</span>
                </div>
                {myReview.body && <p className="text-sm" style={{ color: "var(--text)" }}>{myReview.body}</p>}
                <button className="text-xs self-start" style={{ color: "var(--accent)" }} onClick={() => setShowReviewForm(true)}>
                  編集する
                </button>
              </div>
            ) : showReviewForm || !myReview ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>講座内容</label>
                  <StarRating value={contentRating} onChange={setContentRating} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>AIコーチング</label>
                  <StarRating value={coachingRating} onChange={setCoachingRating} />
                </div>
                <textarea
                  className="w-full rounded border px-3 py-2 text-sm"
                  style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)", minHeight: 80, resize: "vertical" }}
                  placeholder="感想・コメント（任意）"
                  value={reviewBody}
                  onChange={e => setReviewBody(e.target.value)}
                />
                <div className="flex gap-2 justify-end">
                  {myReview && (
                    <button className="btn-ghost text-sm" onClick={() => setShowReviewForm(false)}>キャンセル</button>
                  )}
                  <button className="btn-primary text-sm" onClick={submitReview} disabled={submittingReview}>
                    {submittingReview ? "送信中..." : "投稿する"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
