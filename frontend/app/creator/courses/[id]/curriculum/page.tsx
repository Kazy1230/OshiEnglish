"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { AppHeader } from "@/components/AppHeader";

// ---- 型 ----
type QuizOption = { text: string; is_correct: boolean };

type Card = {
  id: number;
  order: number;
  card_type: string;
  title: string | null;
  body: string | null;
  youtube_url: string | null;
  is_preview: boolean;
  quiz_options: QuizOption[] | null;
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

// ---- 定数 ----
const CARD_TYPES = [
  { value: "video",      label: "動画",       icon: "▶" },
  { value: "build_task", label: "課題",       icon: "🔨" },
  { value: "quiz",       label: "クイズ",     icon: "❓" },
  { value: "message",    label: "メッセージ", icon: "💬" },
] as const;

const CARD_TYPE_ICON: Record<string, string> = {
  video: "▶", build_task: "🔨", quiz: "❓", message: "💬",
};
const CARD_TYPE_LABEL: Record<string, string> = {
  video: "動画", build_task: "課題", quiz: "クイズ", message: "メッセージ",
};
const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft:        { label: "下書き", color: "#6b7280" },
  under_review: { label: "審査中", color: "#d97706" },
  published:    { label: "公開中", color: "#16a34a" },
  unpublished:  { label: "非公開", color: "#6b7280" },
};

// ---- SortableCard ----
function SortableCard({
  card, courseId, chapterId, onDelete, onDuplicate, onUpdate,
}: {
  card: Card;
  courseId: number;
  chapterId: number;
  onDelete: (id: number) => void;
  onDuplicate: (id: number) => void;
  onUpdate: (id: number, data: Partial<Card>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const [expanded, setExpanded] = useState(false);
  const [localCard, setLocalCard] = useState(card);
  const [saving, setSaving] = useState(false);
  const [quizOptions, setQuizOptions] = useState<QuizOption[]>(
    card.quiz_options || [{ text: "", is_correct: true }, { text: "", is_correct: false }]
  );

  async function handleSave() {
    setSaving(true);
    try {
      const data: Record<string, unknown> = {
        card_type: localCard.card_type,
        title: localCard.title,
        body: localCard.body,
        youtube_url: localCard.youtube_url,
        is_preview: localCard.is_preview,
      };
      if (localCard.card_type === "quiz") data.quiz_options = quizOptions;
      await api.updateCard(courseId, chapterId, card.id, data);
      onUpdate(card.id, { ...localCard, quiz_options: localCard.card_type === "quiz" ? quizOptions : null });
      toast("保存しました", "success");
      setExpanded(false);
    } catch {
      toast("保存に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  }

  const typeInfo = CARD_TYPES.find(t => t.value === card.card_type) || CARD_TYPES[0];

  return (
    <div ref={setNodeRef} style={{ ...style, padding: "0" }} className="card">
      <div className="flex items-center gap-3 p-3">
        <div {...attributes} {...listeners} className="cursor-grab text-lg select-none" style={{ color: "var(--muted)" }}>⠿</div>
        <span className="text-base">{typeInfo.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>{card.title || typeInfo.label}</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>{typeInfo.label}</p>
        </div>
        {card.is_preview && (
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#dbeafe", color: "#1d4ed8" }}>無料</span>
        )}
        <button onClick={() => setExpanded(e => !e)} className="text-xs px-2 py-1 rounded" style={{ background: "var(--bg)", color: "var(--primary)" }}>
          {expanded ? "閉じる" : "編集"}
        </button>
        <button onClick={() => onDuplicate(card.id)} className="text-xs px-2 py-1 rounded" style={{ background: "var(--bg)", color: "var(--muted)" }}>複製</button>
        <button onClick={() => onDelete(card.id)} className="text-xs px-2 py-1 rounded" style={{ background: "#fee2e2", color: "#dc2626" }}>削除</button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t pt-3" style={{ borderColor: "var(--border, #e5e7eb)" }}>
          <div className="flex gap-2 flex-wrap">
            {CARD_TYPES.map(t => (
              <button key={t.value} type="button"
                onClick={() => setLocalCard(c => ({ ...c, card_type: t.value }))}
                className="text-xs px-3 py-1.5 rounded-lg font-medium transition"
                style={{
                  background: localCard.card_type === t.value ? "var(--primary)" : "var(--bg)",
                  color: localCard.card_type === t.value ? "#fff" : "var(--muted)",
                  border: "1px solid var(--border, #e5e7eb)",
                }}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>タイトル</label>
            <input value={localCard.title || ""} onChange={e => setLocalCard(c => ({ ...c, title: e.target.value }))} placeholder="カードのタイトル" />
          </div>

          {localCard.card_type === "video" && (
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>YouTube URL</label>
              <input value={localCard.youtube_url || ""} onChange={e => setLocalCard(c => ({ ...c, youtube_url: e.target.value }))} placeholder="https://youtu.be/..." />
            </div>
          )}

          {(localCard.card_type === "message" || localCard.card_type === "build_task") && (
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>本文</label>
              <textarea rows={4} value={localCard.body || ""} onChange={e => setLocalCard(c => ({ ...c, body: e.target.value }))} placeholder="内容を入力…" className="w-full" />
            </div>
          )}

          {localCard.card_type === "quiz" && (
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>問題文</label>
              <textarea rows={2} value={localCard.body || ""} onChange={e => setLocalCard(c => ({ ...c, body: e.target.value }))} placeholder="問題文を入力…" className="w-full" />
              <label className="text-xs font-medium block mb-1 mt-3" style={{ color: "var(--muted)" }}>選択肢（正解にチェック）</label>
              <div className="flex flex-col gap-2">
                {quizOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="radio" name={`correct-${card.id}`} checked={opt.is_correct}
                      onChange={() => setQuizOptions(opts => opts.map((o, j) => ({ ...o, is_correct: i === j })))} />
                    <input value={opt.text}
                      onChange={e => setQuizOptions(opts => opts.map((o, j) => j === i ? { ...o, text: e.target.value } : o))}
                      placeholder={`選択肢 ${i + 1}`} className="flex-1" />
                    {quizOptions.length > 2 && (
                      <button type="button" onClick={() => setQuizOptions(opts => opts.filter((_, j) => j !== i))} style={{ color: "#dc2626", fontSize: "0.75rem" }}>✕</button>
                    )}
                  </div>
                ))}
                {quizOptions.length < 4 && (
                  <button type="button" onClick={() => setQuizOptions(opts => [...opts, { text: "", is_correct: false }])} className="text-xs" style={{ color: "var(--primary)" }}>
                    + 選択肢を追加
                  </button>
                )}
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={localCard.is_preview} onChange={e => setLocalCard(c => ({ ...c, is_preview: e.target.checked }))} />
            <span style={{ color: "var(--text)" }}>無料プレビューとして公開する</span>
          </label>

          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      )}
    </div>
  );
}

// ---- ChapterSection（1章分のカードビルダー） ----
function ChapterSection({
  chapter, courseId, onDeleteChapter, onChapterUpdate,
}: {
  chapter: Chapter;
  courseId: number;
  onDeleteChapter: (id: number) => void;
  onChapterUpdate: (chapterId: number, cards: Card[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cards, setCards] = useState<Card[]>([...chapter.cards].sort((a, b) => a.order - b.order));
  const [addingType, setAddingType] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = cards.findIndex(c => c.id === active.id);
    const newIndex = cards.findIndex(c => c.id === over.id);
    const reordered = arrayMove(cards, oldIndex, newIndex);
    setCards(reordered);
    onChapterUpdate(chapter.id, reordered);
    try {
      await api.reorderCards(courseId, chapter.id, reordered.map(c => c.id));
    } catch {
      toast("並び替えに失敗しました", "error");
    }
  }

  async function handleAddCard(type: string) {
    setAddingType(type);
    try {
      await api.createCard(courseId, chapter.id, { card_type: type, order: cards.length });
      const chs = await api.listChapters(courseId);
      const ch = chs.find((c: Chapter) => c.id === chapter.id);
      if (ch) {
        const sorted = [...ch.cards].sort((a: Card, b: Card) => a.order - b.order);
        setCards(sorted);
        onChapterUpdate(chapter.id, sorted);
      }
      toast("カードを追加しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "追加に失敗しました", "error");
    } finally {
      setAddingType(null);
    }
  }

  async function handleDelete(cardId: number) {
    if (!confirm("このカードを削除しますか？")) return;
    try {
      await api.deleteCard(courseId, chapter.id, cardId);
      const next = cards.filter(c => c.id !== cardId);
      setCards(next);
      onChapterUpdate(chapter.id, next);
      toast("削除しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "削除に失敗しました", "error");
    }
  }

  async function handleDuplicate(cardId: number) {
    try {
      await api.duplicateCard(courseId, chapter.id, cardId);
      const chs = await api.listChapters(courseId);
      const ch = chs.find((c: Chapter) => c.id === chapter.id);
      if (ch) {
        const sorted = [...ch.cards].sort((a: Card, b: Card) => a.order - b.order);
        setCards(sorted);
        onChapterUpdate(chapter.id, sorted);
      }
      toast("複製しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "複製に失敗しました", "error");
    }
  }

  function handleUpdate(cardId: number, data: Partial<Card>) {
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, ...data } : c));
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* 章ヘッダー */}
      <div className="flex items-center gap-3 p-4">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex-1 flex items-start gap-3 text-left"
        >
          <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5" style={{ background: "var(--primary)", color: "#fff" }}>
            第{chapter.order}章
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm" style={{ color: "var(--text)" }}>{chapter.title}</p>
            {chapter.goal && <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>🎯 {chapter.goal}</p>}
            {!open && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {cards.length === 0 ? (
                  <span className="text-xs" style={{ color: "var(--muted)" }}>カードがまだありません</span>
                ) : (
                  cards.map(card => (
                    <span key={card.id} className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border, #e5e7eb)" }}>
                      {CARD_TYPE_ICON[card.card_type] || "📄"} {card.title || CARD_TYPE_LABEL[card.card_type] || card.card_type}
                    </span>
                  ))
                )}
              </div>
            )}
          </div>
          <span className="text-xs flex-shrink-0" style={{ color: "var(--muted)" }}>{open ? "▲" : "▼"}</span>
        </button>
        <button
          onClick={() => onDeleteChapter(chapter.id)}
          className="text-xs px-2 py-1 rounded flex-shrink-0"
          style={{ background: "#fee2e2", color: "#dc2626" }}
        >削除</button>
      </div>

      {/* カードビルダー（展開時） */}
      {open && (
        <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: "var(--border, #e5e7eb)" }}>
          {/* カード追加ボタン */}
          <div className="flex gap-2 flex-wrap mb-4">
            {CARD_TYPES.map(t => (
              <button key={t.value} type="button"
                onClick={() => handleAddCard(t.value)}
                disabled={addingType !== null}
                className="text-xs px-3 py-1.5 rounded-xl font-medium transition"
                style={{
                  background: addingType === t.value ? "var(--primary)" : "var(--card, #fff)",
                  color: addingType === t.value ? "#fff" : "var(--text)",
                  border: "1px solid var(--border, #e5e7eb)",
                }}
              >
                {t.icon} {t.label}を追加
              </button>
            ))}
          </div>

          {/* カード一覧 */}
          {cards.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: "var(--muted)" }}>上のボタンからカードを追加してください</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-2">
                  {cards.map(card => (
                    <SortableCard
                      key={card.id}
                      card={card}
                      courseId={courseId}
                      chapterId={chapter.id}
                      onDelete={handleDelete}
                      onDuplicate={handleDuplicate}
                      onUpdate={handleUpdate}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}
    </div>
  );
}

// ---- メインページ ----
export default function CurriculumHubPage() {
  const { loading } = useRoleGuard(["creator", "admin"]);
  const params = useParams();
  const courseId = Number(params.id);

  const [meta, setMeta] = useState<CourseMeta | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [fetching, setFetching] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const [copied, setCopied] = useState(false);

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

  function handleChapterUpdate(chapterId: number, cards: Card[]) {
    setChapters(prev => prev.map(ch => ch.id === chapterId ? { ...ch, cards } : ch));
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
                <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{ background: `${statusInfo.color}20`, color: statusInfo.color }}>
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
              <Link href={`/creator/courses/${courseId}/publish`}>
                <button className="btn-secondary text-sm">公開設定</button>
              </Link>
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
                <pre className="text-xs whitespace-pre-wrap rounded-xl p-4 leading-relaxed"
                  style={{ background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border, #e5e7eb)", fontFamily: "inherit" }}>
                  {prompt}
                </pre>
                <button onClick={handleCopy}
                  className="absolute top-3 right-3 text-xs px-3 py-1.5 rounded-lg font-medium"
                  style={{ background: copied ? "var(--accent)" : "var(--primary)", color: "#fff" }}>
                  {copied ? "コピーしました！" : "コピー"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 章一覧ヘッダー */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-base" style={{ color: "var(--text)" }}>章一覧</h2>
          <Link href={`/creator/courses/${courseId}/chapters`}>
            <button className="btn-secondary text-sm">章立てを編集</button>
          </Link>
        </div>

        {/* 章一覧 */}
        {chapters.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>まだ章がありません</p>
            <Link href={`/creator/courses/${courseId}/chapters`}>
              <button className="btn-primary">章立てを入力する</button>
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {chapters.map(ch => (
              <ChapterSection
                key={ch.id}
                chapter={ch}
                courseId={courseId}
                onDeleteChapter={handleDeleteChapter}
                onChapterUpdate={handleChapterUpdate}
              />
            ))}
          </div>
        )}

        {/* 卒業動画 */}
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
          <Link href={`/creator/courses/${courseId}/publish`} className="flex-1">
            <button className="btn-primary w-full">公開設定へ</button>
          </Link>
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
      <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://youtu.be/..." className="flex-1" />
      <button onClick={handleSave} disabled={saving} className="btn-secondary text-sm flex-shrink-0">
        {saving ? "保存中" : "保存"}
      </button>
    </div>
  );
}
