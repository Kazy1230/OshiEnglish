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
  card_type: "video" | "assignment" | "test" | "message";
  title: string;
  body: string | null;
  youtube_url: string | null;
  is_preview: boolean;
  youtube_available: boolean | null;
};

type Chapter = {
  id: number;
  order: number;
  title: string;
  goal: string | null;
  assessment_criteria: string[] | null;
  cards: Card[];
};

type Meta = {
  curriculum_target_audience: string | null;
  curriculum_topics: string | null;
  curriculum_style: string | null;
  completion_video_url: string | null;
};

const CARD_TYPE_LABEL: Record<string, string> = {
  video: "動画",
  assignment: "課題",
  test: "テスト",
  message: "メッセージ",
};

export default function CurriculumBuilderPage() {
  const { loading } = useRoleGuard(["creator", "admin"]);
  const params = useParams();
  const courseId = Number(params.id);

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [meta, setMeta] = useState<Meta>({ curriculum_target_audience: null, curriculum_topics: null, curriculum_style: null, completion_video_url: null });
  const [fetching, setFetching] = useState(true);
  const [activeTab, setActiveTab] = useState<"meta" | "chapters">("meta");
  const [metaSaving, setMetaSaving] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [promptLoading, setPromptLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Chapter edit state
  const [expandedChapter, setExpandedChapter] = useState<number | null>(null);
  const [newChapterTitle, setNewChapterTitle] = useState("");
  const [chapterSaving, setChapterSaving] = useState(false);

  // Card add state
  const [addingCardTo, setAddingCardTo] = useState<number | null>(null);
  const [newCard, setNewCard] = useState({ card_type: "video", title: "", body: "", youtube_url: "", is_preview: false });
  const [cardSaving, setCardSaving] = useState(false);

  useEffect(() => {
    if (loading || !courseId) return;
    Promise.all([
      api.listChapters(courseId),
      api.getCurriculumMeta(courseId),
    ]).then(([chs, course]) => {
      setChapters(chs);
      setMeta({
        curriculum_target_audience: course.curriculum_target_audience ?? "",
        curriculum_topics: course.curriculum_topics ?? "",
        curriculum_style: course.curriculum_style ?? "",
        completion_video_url: course.completion_video_url ?? "",
      });
    }).catch(() => {}).finally(() => setFetching(false));
  }, [loading, courseId]);

  async function saveMeta() {
    setMetaSaving(true);
    try {
      await api.updateCurriculumMeta(courseId, meta);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setMetaSaving(false);
    }
  }

  async function loadPrompt() {
    setPromptLoading(true);
    try {
      const res = await api.getCurriculumPrompt(courseId);
      setPromptText(res.prompt);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setPromptLoading(false);
    }
  }

  function copyPrompt() {
    navigator.clipboard.writeText(promptText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function addChapter() {
    if (!newChapterTitle.trim()) return;
    setChapterSaving(true);
    try {
      const ch = await api.createChapter(courseId, { title: newChapterTitle.trim(), order: chapters.length + 1 });
      setChapters(prev => [...prev, { ...ch, cards: [] }]);
      setNewChapterTitle("");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setChapterSaving(false);
    }
  }

  async function deleteChapter(chapterId: number) {
    if (!confirm("この章と中のカードをすべて削除しますか？")) return;
    try {
      await api.deleteChapter(courseId, chapterId);
      setChapters(prev => prev.filter(c => c.id !== chapterId));
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function addCard(chapterId: number) {
    if (!newCard.title.trim()) return;
    setCardSaving(true);
    try {
      const card = await api.createCard(courseId, chapterId, {
        ...newCard,
        title: newCard.title.trim(),
        body: newCard.body || null,
        youtube_url: newCard.youtube_url || null,
        order: (chapters.find(c => c.id === chapterId)?.cards.length ?? 0) + 1,
      });
      setChapters(prev => prev.map(ch =>
        ch.id === chapterId ? { ...ch, cards: [...ch.cards, card] } : ch
      ));
      setNewCard({ card_type: "video", title: "", body: "", youtube_url: "", is_preview: false });
      setAddingCardTo(null);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCardSaving(false);
    }
  }

  async function deleteCard(chapterId: number, cardId: number) {
    try {
      await api.deleteCard(courseId, chapterId, cardId);
      setChapters(prev => prev.map(ch =>
        ch.id === chapterId ? { ...ch, cards: ch.cards.filter(c => c.id !== cardId) } : ch
      ));
    } catch (e: any) {
      alert(e.message);
    }
  }

  if (loading || fetching) return <Skeleton />;

  return (
    <div className="creator-theme min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" title="カリキュラム編集" />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        <div className="flex items-center gap-2">
          <Link href={`/creator/courses`} className="text-sm" style={{ color: "var(--muted)" }}>← コース一覧</Link>
        </div>

        {/* タブ */}
        <div className="flex gap-2 border-b" style={{ borderColor: "var(--border)" }}>
          {(["meta", "chapters"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-4 py-2 text-sm font-medium transition-colors"
              style={{
                borderBottom: activeTab === tab ? `2px solid var(--accent)` : "2px solid transparent",
                color: activeTab === tab ? "var(--accent)" : "var(--muted)",
              }}
            >
              {tab === "meta" ? "コース情報・プロンプト" : "章・カード構成"}
            </button>
          ))}
        </div>

        {activeTab === "meta" && (
          <div className="flex flex-col gap-6">
            <div className="card flex flex-col gap-4">
              <h2 className="font-bold" style={{ color: "var(--primary)" }}>カリキュラム作成の基本情報</h2>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                この情報を元に、外部AIへのプロンプトを生成します。ChatGPTやClaudeに貼り付けてカリキュラム案を作ってもらいましょう。
              </p>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>対象学習者</label>
                <textarea
                  className="input resize-none"
                  rows={3}
                  placeholder="例：英語初心者、TOEIC400点前後の社会人"
                  value={meta.curriculum_target_audience ?? ""}
                  onChange={e => setMeta(m => ({ ...m, curriculum_target_audience: e.target.value }))}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>カバーするトピック・スキル</label>
                <textarea
                  className="input resize-none"
                  rows={3}
                  placeholder="例：リスニング強化、文法の基礎、TOEIC頻出単語500語"
                  value={meta.curriculum_topics ?? ""}
                  onChange={e => setMeta(m => ({ ...m, curriculum_topics: e.target.value }))}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>学習スタイル・ペース</label>
                <textarea
                  className="input resize-none"
                  rows={2}
                  placeholder="例：1日20分、動画メインで週3〜4回のペース"
                  value={meta.curriculum_style ?? ""}
                  onChange={e => setMeta(m => ({ ...m, curriculum_style: e.target.value }))}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>卒業動画URL（全カード完了時に表示）</label>
                <input
                  className="input"
                  placeholder="https://youtube.com/..."
                  value={meta.completion_video_url ?? ""}
                  onChange={e => setMeta(m => ({ ...m, completion_video_url: e.target.value }))}
                />
              </div>

              <button className="btn-primary self-start" onClick={saveMeta} disabled={metaSaving}>
                {metaSaving ? "保存中..." : "保存する"}
              </button>
            </div>

            <div className="card flex flex-col gap-4">
              <h2 className="font-bold" style={{ color: "var(--primary)" }}>AIプロンプト生成</h2>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                上の情報を保存してから「プロンプトを生成」を押してください。生成されたプロンプトをChatGPT等に貼り付けてカリキュラム案を取得できます。
              </p>
              <button className="btn-ghost self-start" onClick={loadPrompt} disabled={promptLoading}>
                {promptLoading ? "生成中..." : "プロンプトを生成"}
              </button>

              {promptText && (
                <div className="flex flex-col gap-2">
                  <textarea
                    className="input resize-none font-mono text-xs"
                    rows={12}
                    readOnly
                    value={promptText}
                  />
                  <button className="btn-primary self-start" onClick={copyPrompt}>
                    {copied ? "コピーしました！" : "クリップボードにコピー"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "chapters" && (
          <div className="flex flex-col gap-4">
            {chapters.length === 0 && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>まだ章がありません。下のフォームから追加してください。</p>
            )}

            {chapters.map(chapter => (
              <div key={chapter.id} className="card flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <button
                    className="font-bold text-left flex-1"
                    style={{ color: "var(--primary)" }}
                    onClick={() => setExpandedChapter(expandedChapter === chapter.id ? null : chapter.id)}
                  >
                    {expandedChapter === chapter.id ? "▼" : "▶"} 第{chapter.order}章　{chapter.title}
                    <span className="ml-2 text-xs font-normal" style={{ color: "var(--muted)" }}>
                      {chapter.cards.length}カード
                    </span>
                  </button>
                  <button
                    className="text-xs px-2 py-1 rounded"
                    style={{ background: "#fee2e2", color: "#dc2626" }}
                    onClick={() => deleteChapter(chapter.id)}
                  >
                    削除
                  </button>
                </div>

                {chapter.goal && (
                  <p className="text-sm" style={{ color: "var(--muted)" }}>目標：{chapter.goal}</p>
                )}

                {expandedChapter === chapter.id && (
                  <div className="flex flex-col gap-2 mt-1">
                    {chapter.cards.map(card => (
                      <div
                        key={card.id}
                        className="flex items-center gap-2 px-3 py-2 rounded text-sm"
                        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                      >
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: "var(--border)", color: "var(--muted)" }}
                        >
                          {CARD_TYPE_LABEL[card.card_type]}
                        </span>
                        <span className="flex-1" style={{ color: "var(--text)" }}>{card.title}</span>
                        {card.is_preview && (
                          <span className="text-xs" style={{ color: "var(--accent)" }}>試聴可</span>
                        )}
                        {card.youtube_available === false && (
                          <span className="text-xs" style={{ color: "#ef4444" }}>動画非公開</span>
                        )}
                        <button
                          className="text-xs"
                          style={{ color: "#dc2626" }}
                          onClick={() => deleteCard(chapter.id, card.id)}
                        >
                          ×
                        </button>
                      </div>
                    ))}

                    {addingCardTo === chapter.id ? (
                      <div className="flex flex-col gap-2 p-3 rounded" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                        <select
                          className="input text-sm"
                          value={newCard.card_type}
                          onChange={e => setNewCard(c => ({ ...c, card_type: e.target.value }))}
                        >
                          <option value="video">動画</option>
                          <option value="assignment">課題</option>
                          <option value="test">テスト</option>
                          <option value="message">メッセージ</option>
                        </select>
                        <input
                          className="input text-sm"
                          placeholder="カードタイトル"
                          value={newCard.title}
                          onChange={e => setNewCard(c => ({ ...c, title: e.target.value }))}
                        />
                        {newCard.card_type === "video" && (
                          <input
                            className="input text-sm"
                            placeholder="YouTube URL"
                            value={newCard.youtube_url}
                            onChange={e => setNewCard(c => ({ ...c, youtube_url: e.target.value }))}
                          />
                        )}
                        <textarea
                          className="input text-sm resize-none"
                          rows={2}
                          placeholder="説明文（任意）"
                          value={newCard.body}
                          onChange={e => setNewCard(c => ({ ...c, body: e.target.value }))}
                        />
                        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text)" }}>
                          <input
                            type="checkbox"
                            checked={newCard.is_preview}
                            onChange={e => setNewCard(c => ({ ...c, is_preview: e.target.checked }))}
                          />
                          未購入者に試聴を許可する
                        </label>
                        <div className="flex gap-2">
                          <button className="btn-primary text-sm" onClick={() => addCard(chapter.id)} disabled={cardSaving}>
                            {cardSaving ? "追加中..." : "追加"}
                          </button>
                          <button className="btn-ghost text-sm" onClick={() => { setAddingCardTo(null); setNewCard({ card_type: "video", title: "", body: "", youtube_url: "", is_preview: false }); }}>
                            キャンセル
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="btn-ghost text-sm self-start"
                        onClick={() => setAddingCardTo(chapter.id)}
                      >
                        + カードを追加
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* 新しい章を追加 */}
            <div className="card flex flex-col gap-3">
              <h3 className="font-medium text-sm" style={{ color: "var(--primary)" }}>新しい章を追加</h3>
              <div className="flex gap-2">
                <input
                  className="input flex-1 text-sm"
                  placeholder="章のタイトル"
                  value={newChapterTitle}
                  onChange={e => setNewChapterTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addChapter(); }}
                />
                <button className="btn-primary text-sm" onClick={addChapter} disabled={chapterSaving || !newChapterTitle.trim()}>
                  {chapterSaving ? "追加中..." : "追加"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
