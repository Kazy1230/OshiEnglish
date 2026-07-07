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

  useEffect(() => {
    if (!courseId) return;
    Promise.all([
      api.getLearnerCurriculum(courseId),
      api.getLearnerProgress(courseId),
    ]).then(([chs, prog]) => {
      setChapters(chs.chapters ?? chs);
      setProgress(prog);
      if (!prog.target_pace) setShowPaceModal(true);
      if (prog.is_graduated) setGraduated(true);
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
          api.graduateCourse(courseId).catch(() => {});
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

  if (fetching) return <Skeleton />;

  if (graduated && progress?.completion_video_url) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "var(--bg)" }}>
        <div className="card max-w-lg w-full flex flex-col gap-6 text-center">
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}>
            おめでとうございます！
          </h1>
          <p style={{ color: "var(--text)" }}>コースを修了しました。卒業動画をご覧ください。</p>
          <YouTubeEmbed url={progress.completion_video_url} />
          <Link href="/mypage" className="btn-primary self-center">マイページへ戻る</Link>
        </div>
      </div>
    );
  }

  const completionPct = progress && progress.total_cards > 0
    ? Math.round((progress.completed_cards / progress.total_cards) * 100)
    : 0;

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
                      border: `1px solid ${card.is_completed ? "var(--border)" : "var(--border)"}`,
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

        {progress?.is_graduated && !progress.completion_video_url && (
          <div className="card text-center flex flex-col gap-2">
            <p className="text-xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}>🎉 コース修了！</p>
            <p className="text-sm" style={{ color: "var(--muted)" }}>すべてのカードを完了しました。おめでとうございます。</p>
            <Link href="/mypage" className="btn-primary self-center mt-2">マイページへ</Link>
          </div>
        )}
      </div>
    </div>
  );
}
