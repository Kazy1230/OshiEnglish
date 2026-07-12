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
  submission_format: string | null;
  completion_message: string | null;
};

const SUBMISSION_FORMATS = [
  { value: "text", label: "テキスト" },
  { value: "video", label: "動画（YouTube URL）" },
  { value: "photo", label: "写真" },
] as const;

type Chapter = {
  id: number;
  title: string;
  goal: string | null;
};

const CARD_TYPES = [
  { value: "video", label: "動画", icon: "▶" },
  { value: "build_task", label: "課題", icon: "🔨" },
  { value: "quiz", label: "クイズ", icon: "❓" },
  { value: "message", label: "メッセージ", icon: "💬" },
] as const;

function SortableCard({
  card,
  courseId,
  chapterId,
  onDelete,
  onDuplicate,
  onUpdate,
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
  const [quizOptions, setQuizOptions] = useState<QuizOption[]>(card.quiz_options || [{ text: "", is_correct: true }, { text: "", is_correct: false }]);

  async function handleSave() {
    if (!localCard.title || !localCard.title.trim()) {
      toast("カードのタイトルを入力してください。学習者にはこのタイトルで内容が伝わります", "error");
      return;
    }
    setSaving(true);
    try {
      const data: Record<string, unknown> = {
        card_type: localCard.card_type,
        title: localCard.title,
        body: localCard.body,
        youtube_url: localCard.youtube_url,
        is_preview: localCard.is_preview,
      };
      if (localCard.card_type === "quiz") {
        data.quiz_options = quizOptions;
      }
      if (localCard.card_type === "build_task") {
        data.submission_format = localCard.submission_format || "text";
      }
      if (localCard.card_type === "video" || localCard.card_type === "message") {
        data.completion_message = localCard.completion_message;
      }
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
      <div className="flex items-center gap-3 p-4">
        {/* ドラッグハンドル */}
        <div {...attributes} {...listeners} className="cursor-grab text-lg select-none" style={{ color: "var(--muted)" }}>
          ⠿
        </div>
        <span className="text-base">{typeInfo.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>
            {card.title || typeInfo.label}
          </p>
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
              <button
                key={t.value}
                type="button"
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
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>
              タイトル <span style={{ color: "#dc2626" }}>*必須</span>
            </label>
            <input value={localCard.title || ""} onChange={e => setLocalCard(c => ({ ...c, title: e.target.value }))} placeholder="例：現在完了形とは（何を学ぶかが伝わるタイトルにしてください）" />
          </div>

          {(localCard.card_type === "video") && (
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>YouTube URL</label>
              <input value={localCard.youtube_url || ""} onChange={e => setLocalCard(c => ({ ...c, youtube_url: e.target.value }))} placeholder="https://youtu.be/..." />
            </div>
          )}

          {(localCard.card_type === "message" || localCard.card_type === "build_task") && (
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>
                {localCard.card_type === "build_task" ? "課題の指示文" : "本文"}
              </label>
              <textarea rows={4} value={localCard.body || ""} onChange={e => setLocalCard(c => ({ ...c, body: e.target.value }))} placeholder="内容を入力…" className="w-full" />
            </div>
          )}

          {localCard.card_type === "build_task" && (
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>提出形式</label>
              <div className="flex gap-2 flex-wrap">
                {SUBMISSION_FORMATS.map(f => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setLocalCard(c => ({ ...c, submission_format: f.value }))}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium transition"
                    style={{
                      background: (localCard.submission_format || "text") === f.value ? "var(--primary)" : "var(--bg)",
                      color: (localCard.submission_format || "text") === f.value ? "#fff" : "var(--muted)",
                      border: "1px solid var(--border, #e5e7eb)",
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                学習者が提出した内容にAIが即座に定性的なフィードバックを返します。あなたのレビュー・追加コメントは任意です。
              </p>
            </div>
          )}

          {(localCard.card_type === "video" || localCard.card_type === "message") && (
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>完了時メッセージ（任意）</label>
              <textarea
                rows={2}
                value={localCard.completion_message || ""}
                onChange={e => setLocalCard(c => ({ ...c, completion_message: e.target.value }))}
                placeholder="例：お疲れさま！次はいよいよ実践編だよ。"
                className="w-full"
              />
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>完了時に学習者へ表示される、次への橋渡しの一言です</p>
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
                    <input type="radio" name={`correct-${card.id}`} checked={opt.is_correct} onChange={() => setQuizOptions(opts => opts.map((o, j) => ({ ...o, is_correct: i === j })))} />
                    <input
                      value={opt.text}
                      onChange={e => setQuizOptions(opts => opts.map((o, j) => j === i ? { ...o, text: e.target.value } : o))}
                      placeholder={`選択肢 ${i + 1}`}
                      className="flex-1"
                    />
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

export default function ChapterDetailPage() {
  const { loading } = useRoleGuard(["creator", "admin"]);
  const params = useParams();
  const courseId = Number(params.id);
  const chapterId = Number(params.chapterId);
  const router = useRouter();

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [fetching, setFetching] = useState(true);
  const [addingType, setAddingType] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(async () => {
    try {
      const chs = await api.listChapters(courseId);
      const ch = chs.find((c: Chapter & { cards: Card[] }) => c.id === chapterId);
      if (!ch) { router.replace(`/creator/courses/${courseId}/curriculum`); return; }
      setChapter({ id: ch.id, title: ch.title, goal: ch.goal });
      setCards([...ch.cards].sort((a: Card, b: Card) => a.order - b.order));
    } catch {
      toast("読み込みに失敗しました", "error");
    } finally {
      setFetching(false);
    }
  }, [courseId, chapterId, router]);

  useEffect(() => { if (!loading) load(); }, [loading, load]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = cards.findIndex(c => c.id === active.id);
    const newIndex = cards.findIndex(c => c.id === over.id);
    const reordered = arrayMove(cards, oldIndex, newIndex);
    setCards(reordered);
    try {
      await api.reorderCards(courseId, chapterId, reordered.map(c => c.id));
    } catch {
      toast("並び替えに失敗しました", "error");
    }
  }

  async function handleAddCard(type: string) {
    setAddingType(type);
    try {
      const res = await api.createCard(courseId, chapterId, { card_type: type, order: cards.length });
      const chs = await api.listChapters(courseId);
      const ch = chs.find((c: Chapter & { cards: Card[] }) => c.id === chapterId);
      if (ch) setCards([...ch.cards].sort((a: Card, b: Card) => a.order - b.order));
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
      await api.deleteCard(courseId, chapterId, cardId);
      setCards(prev => prev.filter(c => c.id !== cardId));
      toast("削除しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "削除に失敗しました", "error");
    }
  }

  async function handleDuplicate(cardId: number) {
    try {
      await api.duplicateCard(courseId, chapterId, cardId);
      const chs = await api.listChapters(courseId);
      const ch = chs.find((c: Chapter & { cards: Card[] }) => c.id === chapterId);
      if (ch) setCards([...ch.cards].sort((a: Card, b: Card) => a.order - b.order));
      toast("複製しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "複製に失敗しました", "error");
    }
  }

  function handleUpdate(cardId: number, data: Partial<Card>) {
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, ...data } : c));
  }

  if (loading || fetching) return <Skeleton />;
  if (!chapter) return null;

  return (
    <div className="creator-theme min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" title={chapter.title} />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-2 mb-6">
          <Link href={`/creator/courses/${courseId}/curriculum`}>
            <button className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--bg)", color: "var(--muted)", border: "1px solid var(--border, #e5e7eb)" }}>
              ← カリキュラムへ戻る
            </button>
          </Link>
        </div>

        <div className="card mb-6" style={{ padding: "1.25rem" }}>
          <h1 className="font-bold text-lg" style={{ color: "var(--text)" }}>{chapter.title}</h1>
          {chapter.goal && <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>🎯 {chapter.goal}</p>}
          <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>{cards.length} カード</p>
        </div>

        {/* カード追加ボタン */}
        <div className="flex gap-2 flex-wrap mb-6">
          {CARD_TYPES.map(t => (
            <button
              key={t.value}
              type="button"
              onClick={() => handleAddCard(t.value)}
              disabled={addingType !== null}
              className="text-sm px-4 py-2 rounded-xl font-medium transition"
              style={{
                background: addingType === t.value ? "var(--primary)" : "var(--card, #fff)",
                color: addingType === t.value ? "#fff" : "var(--text)",
                border: "1px solid var(--border, #e5e7eb)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              }}
            >
              {t.icon} {t.label}を追加
            </button>
          ))}
        </div>

        {/* カード一覧（DnD） */}
        {cards.length === 0 ? (
          <div className="card text-center py-10">
            <p className="text-sm" style={{ color: "var(--muted)" }}>上のボタンからカードを追加してください</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-3">
                {cards.map(card => (
                  <SortableCard
                    key={card.id}
                    card={card}
                    courseId={courseId}
                    chapterId={chapterId}
                    onDelete={handleDelete}
                    onDuplicate={handleDuplicate}
                    onUpdate={handleUpdate}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </main>
    </div>
  );
}
