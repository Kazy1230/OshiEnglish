"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/Skeleton";
import { toast } from "@/components/Toast";

type QuizOption = { text: string };

type Card = {
  id: number;
  order: number;
  card_type: "video" | "build_task" | "quiz" | "message";
  title: string;
  body: string | null;
  youtube_url: string | null;
  is_preview: boolean;
  youtube_available: boolean | null;
  is_completed: boolean;
  submission_format: "text" | "video" | "photo" | null;
  quiz_options: QuizOption[] | null;
  submission_text: string | null;
  submission_url: string | null;
  ai_feedback: string | null;
  creator_comment: string | null;
  quiz_is_correct: boolean | null;
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
  build_task: "✏",
  quiz: "📝",
  message: "💬",
};

const CARD_TYPE_LABEL: Record<string, string> = {
  video: "動画",
  build_task: "課題",
  quiz: "クイズ",
  message: "メッセージ",
};

const CARD_TYPE_COLOR: Record<string, string> = {
  video: "#3b82f6",
  build_task: "#f59e0b",
  quiz: "#8b5cf6",
  message: "#10b981",
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

/** 章/カード型（v2.0）コースの学習UI。コース詳細ページ(/courses/[id])に埋め込んで使う。 */
export function ChapterCurriculumPanel({ courseId }: { courseId: number }) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [fetching, setFetching] = useState(true);
  const [showPaceModal, setShowPaceModal] = useState(false);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [completing, setCompleting] = useState(false);
  const [graduated, setGraduated] = useState(false);
  const [nextCourses, setNextCourses] = useState<NextCourse[]>([]);
  const [completionNote, setCompletionNote] = useState<string | null>(null);
  const [courseType, setCourseType] = useState<"self_paced" | "pace_based">("self_paced");
  const chapterLabel = courseType === "pace_based" ? "Day" : "第";
  const chapterUnit = courseType === "pace_based" ? "日次セット" : "章";

  // build_task提出
  const [assignmentText, setAssignmentText] = useState("");
  const [assignmentUrl, setAssignmentUrl] = useState("");
  const [assignmentPhotoFile, setAssignmentPhotoFile] = useState<File | null>(null);
  const [submittingAssignment, setSubmittingAssignment] = useState(false);

  // quiz回答
  const [quizSelectedIndex, setQuizSelectedIndex] = useState<number | null>(null);
  const [submittingQuiz, setSubmittingQuiz] = useState(false);
  const [quizFeedback, setQuizFeedback] = useState<{ is_correct: boolean; correct_answer_text: string | null } | null>(null);

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
      if (chs.course_type) setCourseType(chs.course_type);
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
    }).catch(() => {})
      .finally(() => setFetching(false));
  }, [courseId]);

  // カードを開くたびに前回の入力状態をリセットする
  useEffect(() => {
    setAssignmentText(selectedCard?.submission_text ?? "");
    setAssignmentUrl(selectedCard?.submission_url ?? "");
    setAssignmentPhotoFile(null);
    setQuizSelectedIndex(null);
    setQuizFeedback(null);
  }, [selectedCard?.id, selectedCard?.submission_text, selectedCard?.submission_url]);

  function patchCard(cardId: number, patch: Partial<Card>) {
    setChapters(prev => prev.map(ch => ({
      ...ch,
      cards: ch.cards.map(c => c.id === cardId ? { ...c, ...patch } : c),
    })));
    setSelectedCard(prev => prev && prev.id === cardId ? { ...prev, ...patch } : prev);
  }

  function bumpProgressIfNewlyCompleted(card: Card) {
    if (card.is_completed) return;
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
  }

  async function submitAssignment(card: Card) {
    if (submittingAssignment) return;
    const format = card.submission_format || "text";
    if (format === "text" && !assignmentText.trim()) {
      toast("提出内容を入力してください");
      return;
    }
    if ((format === "video") && !assignmentUrl.trim()) {
      toast("動画のURLを入力してください");
      return;
    }
    if (format === "photo" && !assignmentPhotoFile && !assignmentUrl) {
      toast("写真を選択してください");
      return;
    }
    setSubmittingAssignment(true);
    try {
      let url = format === "video" ? assignmentUrl.trim() : "";
      if (format === "photo") {
        if (assignmentPhotoFile) {
          const uploaded = await api.uploadSubmissionPhoto(card.id, assignmentPhotoFile);
          url = uploaded.url;
        } else {
          url = assignmentUrl;
        }
      }
      const res = await api.submitAssignment(card.id, {
        text: format === "text" ? assignmentText.trim() : undefined,
        url: url || undefined,
      });
      bumpProgressIfNewlyCompleted(card);
      patchCard(card.id, {
        is_completed: true,
        submission_text: format === "text" ? assignmentText.trim() : null,
        submission_url: url || null,
        ai_feedback: res.ai_feedback,
      });
      toast("提出しました");
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "提出に失敗しました", "error");
    } finally {
      setSubmittingAssignment(false);
    }
  }

  async function submitQuizAnswer(card: Card) {
    if (quizSelectedIndex === null || submittingQuiz) return;
    setSubmittingQuiz(true);
    try {
      const res = await api.submitQuizAnswer(card.id, quizSelectedIndex);
      setQuizFeedback(res);
      bumpProgressIfNewlyCompleted(card);
      patchCard(card.id, { is_completed: true, quiz_is_correct: res.is_correct });
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "採点に失敗しました", "error");
    } finally {
      setSubmittingQuiz(false);
    }
  }

  async function setPace(pace: string) {
    try {
      await api.setPace(courseId, pace);
      setProgress(p => p ? { ...p, target_pace: pace } : p);
      setShowPaceModal(false);
      toast("ペースを設定しました");
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function completeCard(card: Card) {
    if (card.is_completed || completing) return;
    setCompleting(true);
    try {
      const res = await api.completeCard(card.id);
      bumpProgressIfNewlyCompleted(card);
      patchCard(card.id, { is_completed: true });
      setSelectedCard(null);
      if (res?.completion_message) {
        setCompletionNote(res.completion_message);
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
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
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
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
      <div className="flex flex-col gap-6">
        {/* 卒業メッセージ */}
        <div className="card flex flex-col gap-4 text-center">
          <h2 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}>
            🎓 おめでとうございます！
          </h2>
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
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <h2 className="font-bold text-lg" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>カリキュラム</h2>
        <span className="text-xs" style={{ color: "var(--muted)" }}>{chapters.length}{chapterUnit} · {progress?.total_cards ?? 0}カード</span>
      </div>

      {/* 完了時メッセージ（次への橋渡しの一言） */}
      {completionNote && (
        <div className="card flex items-center justify-between gap-3" style={{ border: "1.5px solid var(--accent)" }}>
          <p className="text-sm" style={{ color: "var(--text)" }}>💬 {completionNote}</p>
          <button onClick={() => setCompletionNote(null)} style={{ color: "var(--muted)", fontSize: "1.2rem", lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>
      )}

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
            <div className="flex items-center gap-3">
              <span
                className="flex items-center justify-center flex-shrink-0"
                style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: `${CARD_TYPE_COLOR[selectedCard.card_type] ?? "var(--muted)"}1a`,
                  color: CARD_TYPE_COLOR[selectedCard.card_type] ?? "var(--muted)",
                  fontSize: 16,
                }}
              >
                {CARD_TYPE_ICON[selectedCard.card_type]}
              </span>
              <h2 className="font-bold flex-1" style={{ color: "var(--text)" }}>{selectedCard.title}</h2>
              <button onClick={() => setSelectedCard(null)} style={{ color: "var(--muted)", fontSize: "1.5rem", lineHeight: 1 }}>×</button>
            </div>

            {selectedCard.youtube_url && <YouTubeEmbed url={selectedCard.youtube_url} />}
            {selectedCard.body && <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--text)" }}>{selectedCard.body}</p>}

            {/* video / message: シンプルな完了ボタン */}
            {(selectedCard.card_type === "video" || selectedCard.card_type === "message") && (
              !selectedCard.is_completed ? (
                <button className="btn-primary" onClick={() => completeCard(selectedCard)} disabled={completing}>
                  {completing ? "記録中..." : "完了にする"}
                </button>
              ) : (
                <p className="text-sm font-medium text-center" style={{ color: "var(--accent)" }}>✓ 完了済み</p>
              )
            )}

            {/* build_task: 提出形式に応じた入力 + AI一次判定 */}
            {selectedCard.card_type === "build_task" && (
              <div className="flex flex-col gap-3">
                {(selectedCard.submission_format ?? "text") === "text" && (
                  <textarea
                    className="w-full rounded border px-3 py-2 text-sm"
                    style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)", minHeight: 100, resize: "vertical" }}
                    placeholder="ここに提出内容を入力…"
                    value={assignmentText}
                    onChange={e => setAssignmentText(e.target.value)}
                    disabled={submittingAssignment}
                  />
                )}
                {selectedCard.submission_format === "video" && (
                  <input
                    className="w-full rounded border px-3 py-2 text-sm"
                    style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                    placeholder="YouTubeのURLを貼り付け…"
                    value={assignmentUrl}
                    onChange={e => setAssignmentUrl(e.target.value)}
                    disabled={submittingAssignment}
                  />
                )}
                {selectedCard.submission_format === "photo" && (
                  <div className="flex flex-col gap-2">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={e => setAssignmentPhotoFile(e.target.files?.[0] ?? null)}
                      disabled={submittingAssignment}
                    />
                    {selectedCard.submission_url && !assignmentPhotoFile && (
                      <img src={selectedCard.submission_url} alt="提出済みの写真" style={{ maxHeight: 200, borderRadius: 8, objectFit: "contain" }} />
                    )}
                  </div>
                )}

                <button className="btn-primary" onClick={() => submitAssignment(selectedCard)} disabled={submittingAssignment}>
                  {submittingAssignment ? "送信中..." : selectedCard.is_completed ? "再提出する" : "提出する"}
                </button>

                {selectedCard.ai_feedback && (
                  <div className="rounded-lg p-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <p className="text-xs font-bold mb-1" style={{ color: "var(--primary)" }}>フィードバック</p>
                    <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--text)" }}>{selectedCard.ai_feedback}</p>
                    {selectedCard.creator_comment && (
                      <div className="mt-2 pt-2" style={{ borderTop: "1px dashed var(--border)" }}>
                        <p className="text-xs font-bold mb-1" style={{ color: "var(--accent)" }}>先生から一言</p>
                        <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--text)" }}>{selectedCard.creator_comment}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* quiz: 選択肢と即時採点 */}
            {selectedCard.card_type === "quiz" && (
              <div className="flex flex-col gap-3">
                {(selectedCard.quiz_options ?? []).map((opt, i) => (
                  <button
                    key={i}
                    className="text-left px-3.5 py-2.5 rounded-lg text-sm transition-colors"
                    style={{
                      background: quizSelectedIndex === i ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "var(--surface)",
                      border: `1.5px solid ${quizSelectedIndex === i ? "var(--primary)" : "var(--border)"}`,
                      color: "var(--text)",
                    }}
                    onClick={() => setQuizSelectedIndex(i)}
                    disabled={submittingQuiz}
                  >
                    {opt.text}
                  </button>
                ))}
                <button
                  className="btn-primary"
                  onClick={() => submitQuizAnswer(selectedCard)}
                  disabled={quizSelectedIndex === null || submittingQuiz}
                >
                  {submittingQuiz ? "採点中..." : "回答する"}
                </button>
                {quizFeedback && (
                  <p className="text-sm font-medium text-center" style={{ color: quizFeedback.is_correct ? "var(--accent)" : "#dc2626" }}>
                    {quizFeedback.is_correct
                      ? "🎉 正解です！"
                      : `△ 不正解でした。正解は「${quizFeedback.correct_answer_text ?? ""}」`}
                  </p>
                )}
                {!quizFeedback && selectedCard.is_completed && (
                  <p className="text-sm font-medium text-center" style={{ color: selectedCard.quiz_is_correct ? "var(--accent)" : "var(--muted)" }}>
                    {selectedCard.quiz_is_correct ? "✓ 正解済み" : "回答済み（もう一度挑戦できます）"}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 進捗バー */}
      {progress && (
        <div className="card overflow-hidden p-0">
          <div className="px-5 sm:px-6 py-5" style={{ background: "linear-gradient(135deg, var(--primary), var(--accent))" }}>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.75)" }}>学習進捗</p>
                <p className="text-3xl font-black mt-1" style={{ color: "white", fontFamily: "var(--font-display)" }}>{completionPct}%</p>
              </div>
              <p className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.9)" }}>
                {progress.completed_cards} / {progress.total_cards} カード
              </p>
            </div>
            <div className="mt-3" style={{ background: "rgba(255,255,255,0.25)", borderRadius: 9999, height: 10 }}>
              <div style={{ background: "white", width: `${completionPct}%`, height: "100%", borderRadius: 9999, transition: "width 0.4s" }} />
            </div>
          </div>
          {progress.target_pace && (
            <div className="px-5 sm:px-6 py-2.5 flex items-center gap-2">
              <span className="pill" style={{ background: "var(--surface)", color: "var(--text)" }}>
                ⏱ {PACE_OPTIONS.find(p => p.value === progress.target_pace)?.label ?? progress.target_pace}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 章一覧 */}
      {chapters.map(chapter => {
        const chTotal = chapter.cards.length;
        const chDone = chapter.cards.filter(c => c.is_completed).length;
        const chPct = chTotal > 0 ? Math.round((chDone / chTotal) * 100) : 0;
        return (
          <div key={chapter.id} className="card flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <span
                className="flex items-center justify-center flex-shrink-0 font-black"
                style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: chPct >= 100 ? "var(--accent)" : "var(--primary)",
                  color: "white", fontSize: 14,
                }}
              >
                {chPct >= 100 ? "✓" : chapter.order}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                  {courseType === "pace_based" ? `${chapterLabel}${chapter.order}` : `${chapterLabel}${chapter.order}${chapterUnit}`}
                </p>
                <h2 className="font-bold text-base" style={{ color: "var(--text)" }}>{chapter.title}</h2>
                {chapter.goal && (
                  <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>🎯 {chapter.goal}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0" style={{ width: 64 }}>
                <span className="text-xs font-bold" style={{ color: chPct >= 100 ? "var(--accent)" : "var(--muted)" }}>{chDone}/{chTotal}</span>
                <div style={{ width: "100%", background: "var(--border)", borderRadius: 9999, height: 5 }}>
                  <div style={{ background: chPct >= 100 ? "var(--accent)" : "var(--primary)", width: `${chPct}%`, height: "100%", borderRadius: 9999, transition: "width 0.4s" }} />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {chapter.cards.map(card => {
                const typeColor = CARD_TYPE_COLOR[card.card_type] ?? "var(--muted)";
                const unavailable = card.youtube_available === false;
                const hasTitle = !!card.title?.trim();
                const displayTitle = hasTitle ? card.title : (CARD_TYPE_LABEL[card.card_type] ?? card.card_type);
                return (
                  <button
                    key={card.id}
                    className="hover-lift flex items-center gap-3 px-3.5 py-3 rounded-xl text-left transition-colors"
                    style={{
                      background: card.is_completed ? "var(--surface)" : "var(--card)",
                      border: `1px solid ${card.is_completed ? "var(--border)" : "var(--border)"}`,
                      opacity: unavailable ? 0.55 : 1,
                    }}
                    onClick={() => setSelectedCard(card)}
                  >
                    <span
                      className="flex items-center justify-center flex-shrink-0"
                      style={{
                        width: 32, height: 32, borderRadius: "50%",
                        background: card.is_completed ? "var(--accent)" : `${typeColor}1a`,
                        color: card.is_completed ? "white" : typeColor,
                        fontSize: 14,
                      }}
                    >
                      {card.is_completed ? "✓" : CARD_TYPE_ICON[card.card_type]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: card.is_completed ? "var(--muted)" : "var(--text)" }}>
                        {displayTitle}
                      </p>
                      {hasTitle && (
                        <p className="text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>{CARD_TYPE_LABEL[card.card_type] ?? card.card_type}</p>
                      )}
                    </div>
                    {unavailable ? (
                      <span className="pill flex-shrink-0" style={{ background: "rgba(239,68,68,0.16)", color: "#f87171" }}>非公開</span>
                    ) : (
                      <span className="flex-shrink-0" style={{ color: "var(--muted)", fontSize: 18 }}>›</span>
                    )}
                  </button>
                );
              })}
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
  );
}
