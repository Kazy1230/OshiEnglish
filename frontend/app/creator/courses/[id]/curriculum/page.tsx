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
import { AiConsultModal } from "./AiConsultModal";

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
  description: string | null;
  status: string;
  is_free: boolean;
  tier_a_price: number | null;
  tier_b_price: number | null;
  course_type: string;
  enrollment_count: number;
  thumbnail_url: string | null;
  subject: string | null;
  curriculum_purpose: string | null;
  curriculum_target_audience: string | null;
  curriculum_duration: string | null;
  curriculum_topics: string | null;
  curriculum_style: string | null;
  curriculum_concerns: string | null;
  curriculum_existing_videos: string | null;
  completion_video_url: string | null;
};

type TabKey = "basic" | "curriculum" | "intro" | "preview";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "basic", label: "基本情報", icon: "📝" },
  { key: "curriculum", label: "カリキュラム", icon: "📚" },
  { key: "intro", label: "紹介文", icon: "💬" },
  { key: "preview", label: "プレビュー", icon: "👀" },
];

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
  card, courseId, chapterId, onDelete, onDuplicate, onUpdate, locked, courseIsFree,
}: {
  card: Card;
  courseId: number;
  chapterId: number;
  onDelete: (id: number) => void;
  onDuplicate: (id: number) => void;
  onUpdate: (id: number, data: Partial<Card>) => void;
  locked: boolean;
  courseIsFree: boolean;
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
        {!courseIsFree && card.is_preview && (
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(59,130,246,0.16)", color: "#60a5fa" }}>無料</span>
        )}
        <button onClick={() => setExpanded(e => !e)} className="text-xs px-2 py-1 rounded" style={{ background: "var(--bg)", color: "var(--primary)" }}>
          {expanded ? "閉じる" : "編集"}
        </button>
        {!locked && (
          <>
            <button onClick={() => onDuplicate(card.id)} className="text-xs px-2 py-1 rounded" style={{ background: "var(--bg)", color: "var(--muted)" }}>複製</button>
            <button onClick={() => onDelete(card.id)} className="text-xs px-2 py-1 rounded" style={{ background: "rgba(239,68,68,0.16)", color: "#f87171" }}>削除</button>
          </>
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t pt-3" style={{ borderColor: "var(--border, #e5e7eb)" }}>
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

          {!courseIsFree && (
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={localCard.is_preview} onChange={e => setLocalCard(c => ({ ...c, is_preview: e.target.checked }))} />
              <span style={{ color: "var(--text)" }}>無料プレビューとして公開する</span>
            </label>
          )}

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
  chapter, courseId, onDeleteChapter, onChapterUpdate, onChapterMetaUpdate, locked, courseIsFree,
}: {
  chapter: Chapter;
  courseId: number;
  onDeleteChapter: (id: number) => void;
  onChapterUpdate: (chapterId: number, cards: Card[]) => void;
  onChapterMetaUpdate: (chapterId: number, title: string, goal: string | null) => void;
  locked: boolean;
  courseIsFree: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [titleDraft, setTitleDraft] = useState(chapter.title);
  const [goalDraft, setGoalDraft] = useState(chapter.goal ?? "");
  const [savingMeta, setSavingMeta] = useState(false);
  const [cards, setCards] = useState<Card[]>([...chapter.cards].sort((a, b) => a.order - b.order));
  const [addingType, setAddingType] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function handleSaveMeta() {
    if (!titleDraft.trim()) { toast("章タイトルを入力してください", "error"); return; }
    setSavingMeta(true);
    try {
      await api.updateChapter(courseId, chapter.id, { title: titleDraft, goal: goalDraft || null });
      onChapterMetaUpdate(chapter.id, titleDraft, goalDraft || null);
      toast("章を更新しました", "success");
      setEditingMeta(false);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "更新に失敗しました", "error");
    } finally {
      setSavingMeta(false);
    }
  }

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
          <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5" style={{ background: "var(--ink)", color: "#fff" }}>
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
        {!locked && (
          <>
            <button
              onClick={() => setEditingMeta(v => !v)}
              className="text-xs px-2 py-1 rounded flex-shrink-0"
              style={{ background: "var(--bg)", color: "var(--primary)" }}
            >章を編集</button>
            <button
              onClick={() => onDeleteChapter(chapter.id)}
              className="text-xs px-2 py-1 rounded flex-shrink-0"
              style={{ background: "rgba(239,68,68,0.16)", color: "#f87171" }}
            >削除</button>
          </>
        )}
      </div>

      {editingMeta && (
        <div className="px-4 pb-4 flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--border, #e5e7eb)" }}>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>章タイトル</label>
            <input value={titleDraft} onChange={e => setTitleDraft(e.target.value)} placeholder="例：リスニング基礎を固める" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>この章のゴール（任意）</label>
            <input value={goalDraft} onChange={e => setGoalDraft(e.target.value)} placeholder="例：Part1〜4を安定して正解できるようになる" />
          </div>
          <button onClick={handleSaveMeta} disabled={savingMeta} className="btn-primary text-sm self-start">
            {savingMeta ? "保存中…" : "保存"}
          </button>
        </div>
      )}

      {/* カードビルダー（展開時） */}
      {open && (
        <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: "var(--border, #e5e7eb)" }}>
          {/* カード追加ボタン */}
          {locked ? (
            <p className="text-xs mb-4 px-3 py-2 rounded-lg" style={{ background: "rgba(245,158,11,0.16)", color: "#fbbf24" }}>
              受講者がいる公開中のコースのため、カードの追加・削除はできません。内容の編集・並び替えは可能です。
            </p>
          ) : (
            <div className="flex gap-2 flex-wrap mb-4">
              {CARD_TYPES.map(t => (
                <button key={t.value} type="button"
                  onClick={() => handleAddCard(t.value)}
                  disabled={addingType !== null}
                  className="text-xs px-3 py-1.5 rounded-xl font-medium transition"
                  style={{
                    background: addingType === t.value ? "var(--ink)" : "var(--card, #fff)",
                    color: addingType === t.value ? "#fff" : "var(--text)",
                    border: "1px solid var(--border, #e5e7eb)",
                  }}
                >
                  {t.icon} {t.label}を追加
                </button>
              ))}
            </div>
          )}

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
                      locked={locked}
                      courseIsFree={courseIsFree}
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

function NewChapterForm({ courseId, nextOrder, onCreated }: { courseId: number; nextOrder: number; onCreated: (chapter: Chapter) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!title.trim()) { toast("章タイトルを入力してください", "error"); return; }
    setSaving(true);
    try {
      const created = await api.createChapter(courseId, { title, goal: goal || null, order: nextOrder });
      onCreated({ id: created.id, order: created.order, title, goal: goal || null, cards: [] });
      setTitle("");
      setGoal("");
      setOpen(false);
      toast("章を追加しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "追加に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full py-3 rounded-xl text-sm font-medium transition"
        style={{ border: "2px dashed var(--border, #e5e7eb)", color: "var(--primary)", background: "transparent" }}
      >
        + 章を追加
      </button>
    );
  }

  return (
    <div className="card flex flex-col gap-3" style={{ padding: "1rem" }}>
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>章タイトル *</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="例：リスニング基礎を固める" />
      </div>
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>この章のゴール（任意）</label>
        <input value={goal} onChange={e => setGoal(e.target.value)} placeholder="例：Part1〜4を安定して正解できるようになる" />
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={() => setOpen(false)}>キャンセル</button>
        <button type="button" className="btn-primary flex-1" onClick={handleCreate} disabled={saving}>
          {saving ? "追加中…" : "追加する"}
        </button>
      </div>
    </div>
  );
}

function ThumbnailInput({ courseId, currentUrl, onUploaded }: { courseId: number; currentUrl: string | null; onUploaded: (url: string) => void }) {
  const [thumbnailUrl, setThumbnailUrl] = useState(currentUrl);
  const [uploading, setUploading] = useState(false);

  async function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await api.uploadCourseThumbnail(courseId, file);
      setThumbnailUrl(res.thumbnail_url);
      onUploaded(res.thumbnail_url);
      toast("サムネイルを更新しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "アップロードに失敗しました", "error");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      {thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnailUrl} alt="" className="w-32 h-20 rounded-lg object-cover flex-shrink-0" style={{ border: "1px solid var(--border, #e5e7eb)" }} />
      ) : (
        <div className="w-32 h-20 rounded-lg flex items-center justify-center text-2xl flex-shrink-0" style={{ background: "var(--bg)", border: "1px solid var(--border, #e5e7eb)" }}>🖼️</div>
      )}
      <div className="flex flex-col gap-1">
        <p className="text-xs" style={{ color: "var(--muted)" }}>PNG / JPG / WEBP、5MBまで</p>
        <label className="btn-secondary text-xs cursor-pointer inline-block w-fit" style={{ opacity: uploading ? 0.5 : 1 }}>
          {uploading ? "処理中…" : thumbnailUrl ? "変更する" : "アップロードする"}
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleSelect} disabled={uploading} className="hidden" />
        </label>
      </div>
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
    <div>
      <div className="flex gap-2">
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://youtu.be/..."
          className="flex-1"
          style={!url ? { borderColor: "#dc2626" } : undefined}
        />
        <button onClick={handleSave} disabled={saving} className="btn-secondary text-sm flex-shrink-0">
          {saving ? "保存中" : "保存"}
        </button>
      </div>
      {!url && (
        <p className="text-xs mt-1" style={{ color: "#dc2626" }}>卒業動画が未設定です。公開申請前に設定してください。</p>
      )}
    </div>
  );
}

// ---- 基本情報タブ ----
function BasicInfoTab({ meta, courseId, onUpdated }: { meta: CourseMeta; courseId: number; onUpdated: (patch: Partial<CourseMeta>) => void }) {
  const [title, setTitle] = useState(meta.title);
  const [subject, setSubject] = useState(meta.subject ?? "");
  const [isFree, setIsFree] = useState(meta.is_free);
  const [enableTierA, setEnableTierA] = useState(meta.tier_a_price != null);
  const [enableTierB, setEnableTierB] = useState(meta.tier_b_price != null);
  const [tierAPrice, setTierAPrice] = useState(String(meta.tier_a_price ?? 1480));
  const [tierBPrice, setTierBPrice] = useState(String(meta.tier_b_price ?? 3980));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!title.trim()) { toast("コース名を入力してください", "error"); return; }
    if (!isFree && !enableTierA && !enableTierB) { toast("Tier AまたはTier Bのどちらかは提供する必要があります", "error"); return; }
    setSaving(true);
    try {
      const patch = {
        title,
        subject,
        is_free: isFree,
        tier_a_price: !isFree && enableTierA ? Number(tierAPrice) : null,
        tier_b_price: !isFree && enableTierB ? Number(tierBPrice) : null,
      };
      await api.updateCourse(courseId, patch);
      onUpdated(patch);
      toast("保存しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="card flex flex-col gap-4">
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>分野</label>
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="例: TOEIC、マイクラ建築、料理、Python" />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>コース名</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="例：TOEIC800達成への道" />
        </div>
        <div>
          <span className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>コースタイプ</span>
          <span className="text-xs px-2 py-1 rounded-full inline-block" style={{ background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)" }}>
            {meta.course_type === "pace_based" ? "ペース管理型" : "自由進行型"}（作成後は変更できません）
          </span>
        </div>
      </div>

      <div className="card flex flex-col gap-3">
        <h3 className="font-semibold text-sm" style={{ color: "var(--text)" }}>料金設定</h3>
        <label
          className="flex items-center justify-between gap-2 text-sm p-3 rounded-lg cursor-pointer"
          style={{ border: `1.5px solid ${isFree ? "var(--primary)" : "var(--border, #e5e7eb)"}`, background: isFree ? "var(--surface)" : "transparent" }}
        >
          <span className="font-bold" style={{ color: "var(--text)" }}>無料コースにする</span>
          <input type="checkbox" checked={isFree} onChange={e => setIsFree(e.target.checked)} />
        </label>

        {!isFree && (
          <div className="flex flex-col gap-3">
            <label
              className="flex items-center justify-between gap-2 text-sm p-3 rounded-lg cursor-pointer"
              style={{ border: `1.5px solid ${enableTierA ? "var(--primary)" : "var(--border, #e5e7eb)"}`, background: enableTierA ? "var(--surface)" : "transparent" }}
            >
              <span>
                <span className="font-bold" style={{ color: "var(--text)" }}>Tier A</span>
                <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>AIのみが伴走</span>
              </span>
              <input type="checkbox" checked={enableTierA} onChange={e => setEnableTierA(e.target.checked)} />
            </label>
            {enableTierA && (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border, #e5e7eb)" }}>
                <span className="text-sm font-bold" style={{ color: "var(--muted)" }}>¥</span>
                <input type="number" min={980} max={20000} value={tierAPrice} onChange={e => setTierAPrice(e.target.value)} style={{ border: "none", padding: 0, background: "transparent" }} />
                <span className="text-xs whitespace-nowrap" style={{ color: "var(--muted)" }}>/月</span>
              </div>
            )}

            <label
              className="flex items-center justify-between gap-2 text-sm p-3 rounded-lg cursor-pointer"
              style={{ border: `1.5px solid ${enableTierB ? "var(--primary)" : "var(--border, #e5e7eb)"}`, background: enableTierB ? "var(--surface)" : "transparent" }}
            >
              <span>
                <span className="font-bold" style={{ color: "var(--text)" }}>Tier B</span>
                <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>AI＋クリエイター添削</span>
              </span>
              <input type="checkbox" checked={enableTierB} onChange={e => setEnableTierB(e.target.checked)} />
            </label>
            {enableTierB && (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border, #e5e7eb)" }}>
                <span className="text-sm font-bold" style={{ color: "var(--muted)" }}>¥</span>
                <input type="number" min={2980} max={100000} value={tierBPrice} onChange={e => setTierBPrice(e.target.value)} style={{ border: "none", padding: 0, background: "transparent" }} />
                <span className="text-xs whitespace-nowrap" style={{ color: "var(--muted)" }}>/月</span>
              </div>
            )}
          </div>
        )}

        <button onClick={handleSave} disabled={saving} className="btn-primary self-start">
          {saving ? "保存中…" : "保存する"}
        </button>
      </div>

      <div className="card">
        <h3 className="font-semibold text-sm mb-3" style={{ color: "var(--text)" }}>コースサムネイル</h3>
        <ThumbnailInput courseId={courseId} currentUrl={meta.thumbnail_url} onUploaded={url => onUpdated({ thumbnail_url: url })} />
      </div>

      <div className="card">
        <h3 className="font-semibold text-sm mb-3" style={{ color: "var(--text)" }}>卒業動画（必須）</h3>
        <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>全カード完了時に再生される動画URL。公開申請には設定が必要です。</p>
        <CompletionVideoInput courseId={courseId} currentUrl={meta.completion_video_url} />
      </div>
    </div>
  );
}

// ---- 紹介文タブ ----
function IntroTab({ meta, courseId, onUpdated }: { meta: CourseMeta; courseId: number; onUpdated: (patch: Partial<CourseMeta>) => void }) {
  const [description, setDescription] = useState(meta.description ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await api.updateCourse(courseId, { description });
      onUpdated({ description });
      toast("保存しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card flex flex-col gap-3">
      <h3 className="font-semibold text-sm" style={{ color: "var(--text)" }}>コース紹介文</h3>
      <p className="text-xs" style={{ color: "var(--muted)" }}>学習者向けのコース詳細ページに表示されます。</p>
      <textarea
        rows={8}
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="このコースでどんなことが学べるか、どんな人におすすめかを書いてください。"
        className="w-full"
      />
      <button onClick={handleSave} disabled={saving} className="btn-primary self-start">
        {saving ? "保存中…" : "保存する"}
      </button>
    </div>
  );
}

// ---- プレビュータブ ----
function PreviewTab({ meta, chapters }: { meta: CourseMeta; chapters: Chapter[] }) {
  const [openChapter, setOpenChapter] = useState<number | null>(chapters[0]?.id ?? null);
  const totalCards = chapters.reduce((s, ch) => s + ch.cards.length, 0);
  const previewCards = chapters.reduce((s, ch) => s + ch.cards.filter(c => c.is_preview).length, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="card" style={{ padding: "1.5rem" }}>
        {meta.subject && (
          <span className="text-xs px-2 py-0.5 rounded-full mb-2 inline-block" style={{ background: "var(--bg)", color: "var(--muted)", border: "1px solid var(--border, #e5e7eb)" }}>
            {meta.subject}
          </span>
        )}
        <h1 className="font-bold text-2xl mt-1" style={{ color: "var(--text)" }}>{meta.title}</h1>
        {meta.description && <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>{meta.description}</p>}
        {meta.curriculum_purpose && <p className="text-sm mt-2" style={{ color: "var(--text)" }}>🎯 {meta.curriculum_purpose}</p>}
        {meta.curriculum_target_audience && <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>対象: {meta.curriculum_target_audience}</p>}

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

      <h2 className="font-bold text-base" style={{ color: "var(--text)" }}>カリキュラム</h2>
      {chapters.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-sm" style={{ color: "var(--muted)" }}>章がまだありません</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {chapters.map((ch, i) => (
            <div key={ch.id} className="card overflow-hidden">
              <button
                className="w-full flex items-center gap-3 p-4 text-left transition"
                onClick={() => setOpenChapter(openChapter === ch.id ? null : ch.id)}
                style={{ background: "transparent" }}
              >
                <span className="text-xs font-bold px-2 py-1 rounded-full flex-shrink-0" style={{ background: "var(--ink)", color: "#fff" }}>第{i + 1}章</span>
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
                      <div key={card.id} className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0" style={{ borderColor: "var(--border, #e5e7eb)" }}>
                        <span className="text-xs w-5 text-center flex-shrink-0" style={{ color: "var(--muted)" }}>{j + 1}</span>
                        <span className="text-sm">{CARD_TYPE_ICON[card.card_type] || "📄"}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate" style={{ color: "var(--text)" }}>{card.title || CARD_TYPE_LABEL[card.card_type] || card.card_type}</p>
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
      )}
    </div>
  );
}

// ---- メインページ ----
export default function CurriculumHubPage() {
  const { loading } = useRoleGuard(["creator", "admin"]);
  const params = useParams();
  const router = useRouter();
  const courseId = Number(params.id);

  const [meta, setMeta] = useState<CourseMeta | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [fetching, setFetching] = useState(true);
  const [tab, setTab] = useState<TabKey>("basic");
  const [showAiModal, setShowAiModal] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, chs] = await Promise.all([
        api.getCurriculumMeta(courseId),
        api.listChapters(courseId),
      ]);
      if (m.course_type === "pace_based") {
        router.replace(`/creator/courses/${courseId}/calendar`);
        return;
      }
      setMeta(m);
      setChapters(chs);
    } catch {
      toast("読み込みに失敗しました", "error");
    } finally {
      setFetching(false);
    }
  }, [courseId, router]);

  useEffect(() => { if (!loading) load(); }, [loading, load]);

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

  function handleChapterMetaUpdate(chapterId: number, title: string, goal: string | null) {
    setChapters(prev => prev.map(ch => ch.id === chapterId ? { ...ch, title, goal } : ch));
  }

  function handleChapterCreated(chapter: Chapter) {
    setChapters(prev => [...prev, chapter]);
  }

  function handleMetaUpdated(patch: Partial<CourseMeta>) {
    setMeta(prev => prev ? { ...prev, ...patch } : prev);
  }

  if (loading || fetching) return <Skeleton />;
  if (!meta) return null;

  const statusInfo = STATUS_LABEL[meta.status] ?? { label: meta.status, color: "#6b7280" };
  const locked = meta.status === "published" && meta.enrollment_count > 0;

  return (
    <div className="creator-theme min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" title="コース編集" />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: `${statusInfo.color}20`, color: statusInfo.color }}>
                {statusInfo.label}
              </span>
              {meta.subject && (
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--bg)", color: "var(--muted)" }}>{meta.subject}</span>
              )}
            </div>
            <h1 className="font-bold text-xl" style={{ color: "var(--text)" }}>{meta.title}</h1>
          </div>
          <Link href={`/creator/courses/${courseId}/publish`}>
            <button className="btn-primary text-sm">公開設定へ</button>
          </Link>
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          {/* サイドバー */}
          <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible flex-shrink-0" style={{ width: "100%", maxWidth: 200 }}>
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-sm whitespace-nowrap transition-all"
                style={{
                  background: tab === t.key ? "var(--surface)" : "transparent",
                  color: tab === t.key ? "var(--primary)" : "var(--text)",
                  fontWeight: tab === t.key ? 700 : 400,
                }}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </nav>

          {/* メインコンテンツ（ど真ん中固定） */}
          <div className="flex-1 min-w-0 flex justify-center">
            <div className="w-full" style={{ maxWidth: 720 }}>
              {tab === "basic" && <BasicInfoTab meta={meta} courseId={courseId} onUpdated={handleMetaUpdated} />}

              {tab === "curriculum" && (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-bold text-base" style={{ color: "var(--text)" }}>章一覧</h2>
                    <button onClick={() => setShowAiModal(true)} className="btn-secondary text-sm">🤖 AIに相談</button>
                  </div>

                  {locked && (
                    <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "rgba(245,158,11,0.16)", color: "#fbbf24" }}>
                      受講者がいる公開中のコースのため、章の追加・削除・並べ替えはできません。カードの内容編集は可能です。
                    </p>
                  )}

                  {chapters.map(ch => (
                    <ChapterSection
                      key={ch.id}
                      locked={locked}
                      chapter={ch}
                      courseId={courseId}
                      onDeleteChapter={handleDeleteChapter}
                      onChapterUpdate={handleChapterUpdate}
                      onChapterMetaUpdate={handleChapterMetaUpdate}
                      courseIsFree={meta?.is_free ?? false}
                    />
                  ))}

                  {!locked && (
                    <NewChapterForm courseId={courseId} nextOrder={chapters.length + 1} onCreated={handleChapterCreated} />
                  )}
                </div>
              )}

              {tab === "intro" && <IntroTab meta={meta} courseId={courseId} onUpdated={handleMetaUpdated} />}

              {tab === "preview" && <PreviewTab meta={meta} chapters={chapters} />}
            </div>
          </div>
        </div>
      </main>

      {showAiModal && (
        <AiConsultModal courseId={courseId} initial={meta} onClose={() => setShowAiModal(false)} />
      )}
    </div>
  );
}
