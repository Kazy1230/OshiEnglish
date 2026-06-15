"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import { resolveTheme, pickGreeting, type CharacterTheme } from "@/lib/theme";
import { ArticleSkeleton } from "@/components/Skeleton";
import { useDarkMode } from "@/lib/darkMode";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { reportError } from "@/lib/reportError";
import { toast } from "@/components/Toast";
import ReactMarkdown from "react-markdown";

type Article = {
  id: number;
  title: string;
  content?: string | null;
  tips?: string[];
  example_sentences?: string[];
  character_id: number;
  article_type?: string;
  exercise_format?: "multiple_choice" | "written_response" | null;
  exercise_category?: string | null;
  exercise_data?: any;
  exercise_progress?: {
    attempt_number: number;
    answers: Record<string, { chosen_index: number | null; is_correct: boolean; correct_index: number | null; explanation: string | null }>;
    completed: boolean;
    score?: number;
    total?: number;
    character_comment?: string | null;
  } | null;
  unlock_cost?: number;
  opened_at?: string | null;
  locked?: boolean;
};
type Me = { username: string; display_name?: string; character_id?: number | null };
type BlogPost = { id: number; title: string; created_at: string | null };

const PAGE_BREAK_MARKER = "<!--PAGE-->";
const PAGE_TARGET_LENGTH = 1500;

/**
 * 記事本文を「1ページ約1500文字」の複数ページに分割する。
 * - LLM生成記事は <!--PAGE--> マーカーをキリの良い位置（見出しの直前）に含めているので、それを優先的に使う
 * - マーカーがない（旧記事など）場合は、段落の境界を見ながら自動で分割するフォールバックを使う
 *   （文・段落の途中で割れて読みにくくならないよう、見出しの直前を優先して区切る）
 */
function splitContentIntoPages(content: string): string[] {
  if (!content) return [""];

  if (content.includes(PAGE_BREAK_MARKER)) {
    const parts = content.split(PAGE_BREAK_MARKER).map(s => s.trim()).filter(Boolean);
    return parts.length > 0 ? parts : [content];
  }

  const blocks = content.split(/\n{2,}/).filter(b => b.trim() !== "");
  if (blocks.length <= 1) return [content];

  const pages: string[] = [];
  let current: string[] = [];
  let currentLen = 0;

  for (const block of blocks) {
    const isHeading = /^#{1,3}\s/.test(block.trim());
    // すでにある程度の分量があり、かつ見出しの直前であれば、そこでページを区切る
    if (currentLen >= PAGE_TARGET_LENGTH && isHeading && current.length > 0) {
      pages.push(current.join("\n\n"));
      current = [block];
      currentLen = block.length;
    } else {
      current.push(block);
      currentLen += block.length + 2;
    }
  }
  if (current.length > 0) pages.push(current.join("\n\n"));
  return pages.length > 0 ? pages : [content];
}

export default function ArticlePage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params.id);

  const [me, setMe] = useState<Me | null>(null);
  const [article, setArticle] = useState<Article | null>(null);
  const [theme, setTheme] = useState<CharacterTheme | null>(null);
  const [greeting, setGreeting] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, toggleMode] = useDarkMode();
  const [pageIndex, setPageIndex] = useState(0);
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [unlocking, setUnlocking] = useState(false);
  const [insufficientCredits, setInsufficientCredits] = useState(false);
  const articleSectionRef = useRef<HTMLDivElement>(null);

  // ページ送り時は本文セクションの先頭へスクロールする。
  // ページ全体のトップ（document top）まで飛ばすと読書中の位置から大きく離れてしまうため、
  // 本文カードの先頭だけを基準にスクロールし、ジャンプ量を最小限にする。
  function scrollToArticleTopIfNeeded() {
    const el = articleSectionRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const pages = useMemo(() => splitContentIntoPages(article?.content ?? ""), [article?.content]);

  // idが数値でない場合は即エラー
  useEffect(() => {
    if (isNaN(id) || id <= 0) {
      setError("この記事は見つかりませんでした");
      setLoading(false);
      return;
    }
    if (!getToken()) { router.replace("/login"); return; }
    (async () => {
      try {
        const user = await api.me();
        setMe(user);
        const data: Article = await api.getArticle(id);
        setArticle(data);
        setPageIndex(0);
        // ページタイトルを動的に設定
        document.title = `${data.title} | 推しEnglish`;
        // オリキャラ作成中（顧客にキャラ未割り当て）の場合、汎用ウェルカム記事の
        // character_id は記事作成時にたまたま選ばれたキャラ（公式キャラ等）を指しているだけで
        // 顧客自身のキャラではないため、テーマ・キャラ表示はしない
        if (data.character_id && user.character_id) {
          const charTheme = await api.getCharacterTheme(data.character_id);
          setTheme(charTheme);
          setGreeting(pickGreeting(charTheme));
          // サイドバー演出用：このキャラクターが書いている「ブログ記事」一覧（失敗しても本編表示は継続）
          try {
            const posts = await api.getCharacterBlogPosts(data.character_id);
            setBlogPosts(Array.isArray(posts) ? posts.filter((p: BlogPost) => p.id !== data.id) : []);
          } catch (err) {
            reportError("articles:getCharacterBlogPosts", err);
            setBlogPosts([]);
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && (err.message.includes("404") || err.message.includes("見つかりません"))) {
          setError("この記事は見つかりませんでした");
        } else {
          clearToken(); router.replace("/login");
        }
      } finally {
        setLoading(false);
      }
    })();
    // クリーンアップ：ページ離脱時にタイトルを戻す
    return () => { document.title = "推しEnglish"; };
  }, [id, router]);

  const t = resolveTheme(theme, mode);
  // ブログ記事は「依頼に応えて書いた解説記事」ではなく「キャラクターが趣味で書いている読み物」という
  // 体裁のため、文言・ラベル類を記事タイプに応じて出し分ける（依頼記事の語彙をそのまま使うと違和感が出るため）
  const isBlog = article?.article_type === "blog";
  const isExercise = article?.article_type === "exercise";

  async function handleUnlock() {
    if (!article) return;
    setUnlocking(true);
    setInsufficientCredits(false);
    try {
      const data: Article = await api.unlockArticle(article.id);
      setArticle(data);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("402")) {
        setInsufficientCredits(true);
        toast("クレジットが不足しています", "error");
      } else {
        toast(err instanceof Error ? err.message : "開封に失敗しました", "error");
      }
    } finally {
      setUnlocking(false);
    }
  }

  if (loading) return <ArticleSkeleton />;

  if (error) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: t.bg }}>
      <div className="text-center p-8 rounded-2xl shadow" style={{ background: t.card }}>
        <p className="text-4xl mb-3">🔒</p>
        <p className="font-bold" style={{ color: t.primary }}>{error}</p>
        <button onClick={() => router.push("/shelf")}
          className="mt-4 px-4 py-2 rounded-lg border text-sm"
          style={{ borderColor: t.border, color: t.accent }}>← 本棚に戻る</button>
      </div>
    </div>
  );

  if (!article) return null;

  return (
    <div className="min-h-screen" style={{ background: t.bg, fontFamily: t.fontFamily, color: t.text }}>
      {/* 透かし */}
      <div className="watermark"><span style={{ color: t.primary }}>{me?.display_name || me?.username}</span></div>

      {/* ヘッダー */}
      <header className="sticky top-0 z-20 shadow-md" style={{ background: t.primary }}>
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center gap-4">
          <button onClick={() => router.push("/shelf")} aria-label="本棚に戻る"
            className="text-white/60 hover:text-white text-sm transition-colors flex-shrink-0 no-print">← 本棚</button>
          <h1 className="text-sm font-bold text-white truncate flex-1">{article.title}</h1>
          <div className="flex items-center gap-2 flex-shrink-0 no-print">
            <DarkModeToggle mode={mode} onToggle={toggleMode} variant="onColor" />
            <button onClick={() => window.print()} aria-label="この記事を印刷する"
              className="text-white/50 hover:text-white text-xs transition-colors"
              title="印刷">🖨️</button>
          </div>
        </div>
        <div className="h-1" style={{ background: t.accent }} />
      </header>

      {/* パンくずリスト */}
      <div className="max-w-4xl mx-auto px-4 pt-4 pb-0 relative z-10 no-print">
        <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 text-xs" style={{ color: t.accent }}>
          <button onClick={() => router.push("/shelf")} className="hover:underline" style={{ color: t.accent }}
            aria-label="本棚に戻る">
            📚 本棚
          </button>
          <span aria-hidden="true" style={{ color: t.border }}>›</span>
          <span className="truncate max-w-xs" style={{ color: t.text }} aria-current="page">{article.title}</span>
        </nav>
      </div>

      {/* レイアウト: 左サイドバー + 本文 + 右サイドバー */}
      <div className="max-w-4xl mx-auto px-4 py-6 relative z-10 flex gap-6">

        {/* 左サイドバー装飾 */}
        <aside className="hidden lg:flex flex-col items-center gap-3 w-14 flex-shrink-0 pt-2">
          {/* キャラクターアバター（ミニ） */}
          {theme && (
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black text-white shadow-sm flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.accent})` }} title={theme.name}>
              {theme.name.charAt(0)}
            </div>
          )}
          <div className="w-1 flex-1 rounded-full" style={{ background: t.accent, opacity: 0.25 }} />
          <div className="text-2xl" style={{ writingMode: "vertical-rl", color: t.accent, opacity: 0.5, letterSpacing: "0.2em", fontSize: "0.6rem", fontWeight: 900 }}>
            推しEnglish
          </div>
          <div className="w-1 flex-1 rounded-full" style={{ background: t.primary, opacity: 0.15 }} />
          {/* セクションのミニアイコン（章立てナビ風の装飾） */}
          <div className="flex flex-col gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: t.primary }} title={isBlog ? "本文" : "解説"} />
            {article.example_sentences && article.example_sentences.length > 0 && (
              <span className="w-2 h-2 rounded-full" style={{ background: t.accent, opacity: 0.6 }} title="例文" />
            )}
            {article.tips && article.tips.length > 0 && (
              <span className="w-2 h-2 rounded-full" style={{ background: t.accent, opacity: 0.3 }} title="Tips" />
            )}
          </div>
        </aside>

        {/* 本文エリア */}
        <main className="flex-1 min-w-0 flex flex-col gap-6">

          {/* キャラクターバナー */}
          {theme && (
            <div className="rounded-2xl overflow-hidden shadow-sm" style={{ border: `2px solid ${t.accent}` }}>
              <div className="px-5 py-3 flex items-center gap-3" style={{ background: t.primary }}>
                {theme.image_url ? (
                  <img src={`${(process.env.NEXT_PUBLIC_API_URL || "http://localhost/api")}${theme.image_url}`}
                    alt={`${theme.name}のプロフィール画像`}
                    className="w-8 h-8 rounded-full object-cover shadow-sm flex-shrink-0"
                    style={{ border: "2px solid rgba(255,255,255,0.4)" }} />
                ) : (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-black text-white flex-shrink-0"
                    style={{ background: t.accent }}>
                    {theme.name.charAt(0)}
                  </div>
                )}
                <div>
                  <p className="text-xs text-white/60">{isBlog ? "書き手" : "担当キャラクター"}</p>
                  <p className="font-black text-white text-sm">{theme.name}</p>
                </div>
              </div>
              {theme.description && (
                <div className="px-5 py-2 text-xs italic flex items-center gap-3" style={{ background: t.example_bg, color: t.accent }}>
                  {theme.image_url && (
                    <img src={`${(process.env.NEXT_PUBLIC_API_URL || "http://localhost/api")}${theme.image_url}`}
                      alt="" aria-hidden="true"
                      className="w-12 h-12 rounded-xl object-cover shadow-sm flex-shrink-0"
                      style={{ border: `1px solid ${t.border}` }} />
                  )}
                  <span>「{theme.description}」</span>
                </div>
              )}
            </div>
          )}

          {/* 記事タイトル */}
          <div className="rounded-2xl px-4 sm:px-6 py-5 shadow-sm" style={{ background: t.card, border: `1px solid ${t.border}` }}>
            <p className="text-xs font-bold mb-1" style={{ color: t.accent }}>
              {isBlog ? `📰 ${theme?.name ?? ""}のブログ` : isExercise ? `🧩 演習問題${article.exercise_category ? `（${article.exercise_category}）` : ""}` : "文法解説"}
            </p>
            <h2 className="text-xl font-black leading-snug" style={{ color: t.primary }}>{article.title}</h2>
          </div>

          {/* ロック画面：未開封の有料記事はクレジットを消費して開封する */}
          {article.locked && (
            <div className="rounded-2xl px-4 sm:px-6 py-10 shadow-sm text-center" style={{ background: t.card, border: `1px solid ${t.border}` }}>
              <p className="text-4xl mb-3">🔒</p>
              <p className="font-bold mb-2" style={{ color: t.primary }}>
                この{isExercise ? "問題" : "記事"}は{article.unlock_cost}クレジットで読めます
              </p>
              <p className="text-xs mb-4" style={{ color: t.accent }}>
                開封すると{article.unlock_cost}クレジットを消費して、いつでも読めるようになります。
              </p>
              <button type="button" onClick={handleUnlock} disabled={unlocking}
                className="px-6 py-2.5 rounded-full text-sm font-bold border-2 transition-all hover:shadow-md disabled:opacity-50"
                style={{ borderColor: t.primary, color: "white", background: t.primary }}>
                {unlocking ? "開封中…" : `🔓 ${article.unlock_cost}クレジットを使って読む`}
              </button>
              {insufficientCredits && (
                <div className="mt-4">
                  <p className="text-xs font-bold mb-2" style={{ color: "#d9534f" }}>クレジットが不足しています</p>
                  <button type="button" onClick={() => router.push("/credits")}
                    className="px-4 py-2 rounded-full text-xs font-bold border-2 transition-all hover:shadow-md"
                    style={{ borderColor: t.accent, color: t.accent, background: t.card }}>
                    クレジットを購入する →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 演習問題：問題表示・解答UI（選択式は自動採点、記述式はキャラへの提出） */}
          {!article.locked && isExercise && (
            <div className="rounded-2xl px-4 sm:px-6 py-5 shadow-sm" style={{ background: t.card, border: `1px solid ${t.border}` }}>
              <SectionLabel color={t.primary} icon="🧩" label="問題" />
              <div className="mt-3">
                <ExerciseView article={article} theme={t} charTheme={theme} />
              </div>
            </div>
          )}

          {/* 補足メモ（演習問題で本文に何か書かれている場合のみ表示） */}
          {!article.locked && isExercise && article.content && article.content.trim() && (
            <div className="rounded-2xl px-4 sm:px-6 py-5 shadow-sm" style={{ background: t.card, border: `1px solid ${t.border}` }}>
              <SectionLabel color={t.accent} icon="📝" label="ひとことメモ" />
              <div className="mt-3 markdown-body" style={{ color: t.text, "--md-accent": t.accent, "--md-primary": t.primary, "--md-bg": t.bg, "--md-border": t.border } as React.CSSProperties}>
                <ReactMarkdown components={{ p: ({children}) => <p className="text-sm leading-loose mb-2">{children}</p> }}>
                  {article.content}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* 本文（Markdownレンダリング・複数ページ表示） */}
          {!article.locked && !isExercise && (
          <div ref={articleSectionRef} className="rounded-2xl px-4 sm:px-6 py-5 shadow-sm" style={{ background: t.card, border: `1px solid ${t.border}` }}>
            <div className="flex items-center justify-between">
              {isBlog
                ? <SectionLabel color={t.primary} icon="📰" label="本文" />
                : <SectionLabel color={t.primary} icon="📖" label="解説" />}
              {pages.length > 1 && (
                <span className="text-xs font-bold flex-shrink-0 ml-3 px-2.5 py-1 rounded-full" style={{ background: t.example_bg, color: t.accent }}>
                  {pageIndex + 1} / {pages.length} ページ
                </span>
              )}
            </div>
            <div className="mt-3 markdown-body" style={{ color: t.text, "--md-accent": t.accent, "--md-primary": t.primary, "--md-bg": t.bg, "--md-border": t.border } as React.CSSProperties}>
              <ReactMarkdown
                components={{
                  h1: ({children}) => <h1 className="text-xl font-black mt-4 mb-2" style={{ color: t.primary }}>{children}</h1>,
                  h2: ({children}) => <h2 className="text-lg font-bold mt-4 mb-2" style={{ color: t.primary }}>{children}</h2>,
                  h3: ({children}) => <h3 className="text-base font-bold mt-3 mb-1" style={{ color: t.accent }}>{children}</h3>,
                  p: ({children}) => <p className="text-sm leading-loose mb-3">{children}</p>,
                  strong: ({children}) => <strong className="font-bold" style={{ color: t.primary }}>{children}</strong>,
                  em: ({children}) => <em className="italic" style={{ color: t.accent }}>{children}</em>,
                  ul: ({children}) => <ul className="list-disc list-inside mb-3 flex flex-col gap-1 text-sm">{children}</ul>,
                  ol: ({children}) => <ol className="list-decimal list-inside mb-3 flex flex-col gap-1 text-sm">{children}</ol>,
                  li: ({children}) => <li className="leading-relaxed">{children}</li>,
                  blockquote: ({children}) => (
                    <blockquote className="border-l-4 pl-4 italic my-3 text-sm"
                      style={{ borderColor: t.accent, color: t.accent, background: t.example_bg, padding: "0.5rem 1rem", borderRadius: "0 8px 8px 0" }}>
                      {children}
                    </blockquote>
                  ),
                  code: ({children, className}) => {
                    const isBlock = className?.includes("language-");
                    return isBlock
                      ? <code className="block text-xs p-3 rounded-lg my-2 overflow-x-auto" style={{ background: t.bg, color: t.primary, fontFamily: "monospace" }}>{children}</code>
                      : <code className="text-xs px-1.5 py-0.5 rounded" style={{ background: t.bg, color: t.accent, fontFamily: "monospace" }}>{children}</code>;
                  },
                  hr: () => <hr className="my-4" style={{ borderColor: t.border }} />,
                }}
              >
                {pages[pageIndex] ?? article.content ?? ""}
              </ReactMarkdown>
            </div>

            {/* ページ送りコントロール */}
            {pages.length > 1 && (
              <div className="mt-5 pt-4 flex items-center justify-between gap-3 no-print" style={{ borderTop: `1px solid ${t.border}` }}>
                <button
                  onClick={() => { setPageIndex(p => Math.max(0, p - 1)); scrollToArticleTopIfNeeded(); }}
                  disabled={pageIndex === 0}
                  className="px-4 py-2 rounded-full text-sm font-bold border-2 transition-all hover:shadow-md disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ borderColor: t.primary, color: t.primary, background: t.card }}>
                  ← 前のページ
                </button>
                <div className="flex gap-1.5">
                  {pages.map((_, i) => (
                    <button key={i} onClick={() => { setPageIndex(i); scrollToArticleTopIfNeeded(); }}
                      aria-label={`${i + 1}ページ目へ`}
                      className="rounded-full transition-all"
                      style={{
                        width: i === pageIndex ? "1.5rem" : "0.5rem",
                        height: "0.5rem",
                        background: i === pageIndex ? t.primary : t.border,
                      }} />
                  ))}
                </div>
                <button
                  onClick={() => { setPageIndex(p => Math.min(pages.length - 1, p + 1)); scrollToArticleTopIfNeeded(); }}
                  disabled={pageIndex === pages.length - 1}
                  className="px-4 py-2 rounded-full text-sm font-bold border-2 transition-all hover:shadow-md disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ borderColor: t.primary, color: t.primary, background: t.card }}>
                  次のページ →
                </button>
              </div>
            )}
          </div>
          )}

          {/* 例文 */}
          {!isExercise && article.example_sentences && article.example_sentences.length > 0 && (
            <div className="rounded-2xl px-4 sm:px-6 py-5 shadow-sm" style={{ background: t.card, border: `1px solid ${t.border}` }}>
              <SectionLabel color={t.accent} icon="💬" label="例文" />
              <div className="mt-3 flex flex-col gap-3">
                {article.example_sentences.map((s, i) => (
                  <ExampleCard key={i} index={i} text={s} theme={t} />
                ))}
              </div>
            </div>
          )}

          {/* Tips */}
          {!isExercise && article.tips && article.tips.length > 0 && (
            <div className="rounded-2xl px-4 sm:px-6 py-5 shadow-sm" style={{ background: t.tips_bg, border: `2px solid ${t.accent}` }}>
              <SectionLabel color={t.accent} icon="💡" label="Tips" />
              <ul className="mt-3 flex flex-col gap-2">
                {article.tips.map((tip, i) => (
                  <li key={i} className="flex gap-2 items-start text-sm">
                    <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-black text-white"
                      style={{ background: t.accent }}>
                      {i + 1}
                    </span>
                    <span style={{ color: t.text }}>{renderInlineMarkdown(tip, t)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* フッター */}
          <div className="text-center pt-4 pb-6 no-print">
            <button onClick={() => router.push("/shelf")} aria-label="本棚に戻る"
              className="px-6 py-2 rounded-full text-sm font-bold border-2 transition-all hover:shadow-md"
              style={{ borderColor: t.primary, color: t.primary, background: t.card }}>
              ← 本棚に戻る
            </button>
          </div>
        </main>

        {/* 右サイドバー */}
        <aside className="hidden lg:flex flex-col gap-4 w-44 flex-shrink-0 pt-2">
          {/* キャラカラーのアクセントブロック */}
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ border: `1px solid ${t.border}` }}>
            <div className="p-4 text-center" style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.accent})` }}>
              {theme?.image_url ? (
                <img src={`${(process.env.NEXT_PUBLIC_API_URL || "http://localhost/api")}${theme.image_url}`}
                  alt={`${theme.name}のプロフィール画像`}
                  className="w-12 h-12 mx-auto mb-2 rounded-full object-cover shadow-sm"
                  style={{ border: "2px solid rgba(255,255,255,0.5)" }} />
              ) : (
                <div className="w-10 h-10 mx-auto mb-2 rounded-full flex items-center justify-center text-base font-black"
                  style={{ background: "rgba(255,255,255,0.25)", color: "white" }}>
                  {theme?.name?.charAt(0) ?? "?"}
                </div>
              )}
              <p className="text-xs text-white/70 mb-0.5">{isBlog ? "書き手" : "担当"}</p>
              <p className="text-sm font-black text-white">{theme?.name ?? "—"}</p>
            </div>
            {/* キャラクターからのひとこと */}
            {greeting && (
              <div className="px-3 py-3 text-xs leading-relaxed" style={{ background: t.example_bg, color: t.text }}>
                <p className="font-bold mb-1" style={{ color: t.accent }}>💬 {theme?.name}より</p>
                <p>「{greeting}」</p>
              </div>
            )}
          </div>

          {/* この記事のサマリー（ブログ記事は「学習コンテンツの数値」を出すと不自然なので、文字数・ページ数のみ表示） */}
          <div className="rounded-2xl p-4 flex flex-col gap-2.5 text-xs" style={{ background: t.card, border: `1px solid ${t.border}` }}>
            <p className="font-bold" style={{ color: t.primary }}>{isBlog ? "📰 この記事について" : isExercise ? "🧩 この問題について" : "📋 この記事"}</p>
            {isExercise ? (
              <>
                <div className="flex items-center justify-between">
                  <span style={{ color: t.text, opacity: 0.7 }}>📚 カテゴリ</span>
                  <span className="font-bold" style={{ color: t.primary }}>{article.exercise_category || "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span style={{ color: t.text, opacity: 0.7 }}>✍️ 形式</span>
                  <span className="font-bold px-2 py-0.5 rounded-full text-white" style={{ background: t.accent }}>
                    {article.exercise_format === "written_response" ? "記述式" : "選択式"}
                  </span>
                </div>
                {article.exercise_format === "multiple_choice" && (
                  <div className="flex items-center justify-between">
                    <span style={{ color: t.text, opacity: 0.7 }}>❓ 設問数</span>
                    <span className="font-bold px-2 py-0.5 rounded-full text-white" style={{ background: t.accent }}>
                      {(article.exercise_data?.questions?.length ?? 0)}問
                    </span>
                  </div>
                )}
              </>
            ) : (
              <>
                {!isBlog && (
                  <>
                    <div className="flex items-center justify-between">
                      <span style={{ color: t.text, opacity: 0.7 }}>💬 例文</span>
                      <span className="font-bold px-2 py-0.5 rounded-full text-white" style={{ background: t.accent }}>{article.example_sentences?.length ?? 0}本</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span style={{ color: t.text, opacity: 0.7 }}>💡 Tips</span>
                      <span className="font-bold px-2 py-0.5 rounded-full text-white" style={{ background: t.accent }}>{article.tips?.length ?? 0}個</span>
                    </div>
                  </>
                )}
                <div className="flex items-center justify-between">
                  <span style={{ color: t.text, opacity: 0.7 }}>📖 文字数</span>
                  <span className="font-bold" style={{ color: t.primary }}>約{article.content?.length ?? 0}字</span>
                </div>
                {pages.length > 1 && (
                  <div className="flex items-center justify-between">
                    <span style={{ color: t.text, opacity: 0.7 }}>📑 ページ数</span>
                    <span className="font-bold" style={{ color: t.primary }}>全{pages.length}ページ</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 学習のヒント／ブログのひとこと装飾カード（記事タイプに応じて文言を出し分け） */}
          <div className="rounded-2xl p-4 text-xs leading-relaxed" style={{ background: t.tips_bg, border: `1px dashed ${t.accent}`, color: t.text }}>
            {isBlog ? (
              <>
                <p className="font-bold mb-1" style={{ color: t.accent }}>📰 ブログについて</p>
                <p>{theme?.name ?? "先生"}が息抜きに書いている、ちょっとした読み物コーナーだよ。授業の合間にのぞいてみてね。</p>
              </>
            ) : isExercise ? (
              <>
                <p className="font-bold mb-1" style={{ color: t.accent }}>✏️ 取り組み方のコツ</p>
                <p>
                  {article.exercise_format === "written_response"
                    ? "じっくり考えてから解答してね。提出すると、後で先生からのフィードバックがチャットに届くよ。"
                    : "わからない問題は焦らず一度全部解いてから、最後に「採点する」を押してね。解説もしっかり読み返そう。"}
                </p>
              </>
            ) : (
              <>
                <p className="font-bold mb-1" style={{ color: t.accent }}>✏️ 読み方のコツ</p>
                <p>例文は声に出して読むと記憶に残りやすいよ。Tipsは試験前にもう一度チェックしてみてね。</p>
              </>
            )}
          </div>

          {/* キャラクターのブログ（世界観演出：あたかもキャラクターが趣味でブログを書いているかのような導線） */}
          {blogPosts.length > 0 ? (
            <div className="rounded-2xl p-4 flex flex-col gap-2.5 text-xs" style={{ background: t.card, border: `1px solid ${t.border}` }}>
              <p className="font-bold" style={{ color: t.primary }}>📰 {theme?.name ?? "先生"}のブログ</p>
              <div className="flex flex-col gap-2">
                {blogPosts.map(p => (
                  // ネット上でよく見る「外部リンクのバナー」風カード。
                  // タイトルは2行までに切り詰め、その下に疑似URLを添えて
                  // ひと目で「リンク（別記事へのアクセス）」だと分かるようにする
                  <a key={p.id} href={`/articles/${p.id}`}
                    className="group block rounded-xl overflow-hidden transition-all hover:shadow-md hover:-translate-y-0.5"
                    style={{ border: `1px solid ${t.border}`, textDecoration: "none" }}>
                    <div className="px-3 py-2.5 flex flex-col gap-1.5" style={{ background: t.example_bg }}>
                      <p className="font-bold leading-snug line-clamp-2" style={{ color: t.text }}>
                        {p.title}
                      </p>
                      <p className="flex items-center gap-1 truncate" style={{ color: t.accent, fontFamily: "monospace", fontSize: "0.65rem", opacity: 0.85 }}>
                        <span aria-hidden="true">🔗</span>
                        <span className="truncate">yourteacher.local/blog/{p.id}</span>
                        <span className="ml-auto flex-shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true">→</span>
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ) : (
            /* 縦書き装飾（ブログ記事が無いときのフォールバック表示） */
            <div className="flex-1 flex items-center justify-center min-h-[60px]">
              <div style={{ writingMode: "vertical-rl", color: t.accent, opacity: 0.2, fontSize: "0.55rem", fontWeight: 900, letterSpacing: "0.3em" }}>
                {article.title}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

type InlineTheme = { primary: string; accent: string; bg: string };

/**
 * tips・例文などの「短い1行テキスト」内の **太字** / `コード` / *斜体* をインライン装飾として描画する。
 * これらのフィールドはMarkdownパーサ（ReactMarkdown）を通していないため、
 * 記法がそのまま文字列として表示されてしまう問題を解消するための軽量レンダラ。
 *
 * また、`[[audio:URL]]` / `[[audio:URL|ラベル]]` という記法を、その場所に展開される
 * 音声プレーヤーとして描画する。リスニング問題の instructions や questions[].prompt の
 * 任意の位置に埋め込むことで、「記事内の指定した場所に音声を置く」ことができる。
 */
function renderInlineMarkdown(text: string, t: InlineTheme): React.ReactNode[] {
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[\[audio:[^\]]+\]\])/g;
  const parts = text.split(regex).filter(p => p !== "");
  return parts.map((part, i) => {
    if (part.startsWith("[[audio:") && part.endsWith("]]")) {
      const [url, label] = part.slice("[[audio:".length, -2).split("|");
      return (
        <span key={i} className="block my-2">
          {label && <span className="text-xs font-bold block mb-1" style={{ color: t.accent }}>🎧 {label}</span>}
          <audio controls src={`${(process.env.NEXT_PUBLIC_API_URL || "http://localhost/api")}${url}`} className="w-full" />
        </span>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-bold" style={{ color: t.primary }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} className="text-xs px-1.5 py-0.5 rounded" style={{ background: t.bg, color: t.accent, fontFamily: "monospace" }}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i} className="italic" style={{ color: t.accent }}>{part.slice(1, -1)}</em>;
    }
    return <span key={i}>{part}</span>;
  });
}

function SectionLabel({ icon, label, color }: { icon: string; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-lg">{icon}</span>
      <span className="font-black text-sm" style={{ color }}>{label}</span>
      <div className="flex-1 h-px" style={{ background: color, opacity: 0.2 }} />
    </div>
  );
}

function ExampleCard({ index, text, theme: t }: {
  index: number; text: string;
  theme: ReturnType<typeof resolveTheme>;
}) {
  // 英文と和訳を自動分割（ / で区切り想定）。
  // データ形式が想定外（文字列以外）でも画面ごと落ちないように防御的に文字列化する
  const safeText = typeof text === "string" ? text : (text && typeof text === "object"
    ? [(text as any).en, (text as any).ja].filter(Boolean).join(" / ")
    : String(text ?? ""));
  const parts = safeText.split(" / ");
  const eng = parts[0]?.trim() ?? safeText;
  const jpn = parts[1]?.trim() ?? null;

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${t.border}` }}>
      {/* 番号バー */}
      <div className="px-4 py-1.5 flex items-center gap-2" style={{ background: t.accent }}>
        <span className="text-xs font-black text-white">例文 {index + 1}</span>
      </div>
      <div className="px-4 py-3" style={{ background: t.example_bg }}>
        <p className="text-sm font-bold leading-relaxed" style={{ color: "#1a1a2e" }}>{renderInlineMarkdown(eng, t)}</p>
        {jpn && <p className="text-xs mt-1.5" style={{ color: t.accent }}>{renderInlineMarkdown(jpn, t)}</p>}
      </div>
    </div>
  );
}

/* ==================== 演習問題：表示・解答UI ====================
 * 「今までのUIを維持しながら、どんな種類の問題でもきれいに表示・解答できる」という要望に応え、
 * exercise_format に応じて表示を出し分ける単一の入口コンポーネント。
 * - multiple_choice（選択式）：その場で解答→自動採点→正解・解説を表示
 * - written_response（記述式）：お題に沿って記述→提出→キャラクターへチャットとして送信、フィードバックを待つ
 */
function ExerciseView({ article, theme: t, charTheme }: { article: Article; theme: ReturnType<typeof resolveTheme>; charTheme: CharacterTheme | null }) {
  if (article.exercise_format === "written_response") {
    return <WrittenExercise article={article} theme={t} />;
  }
  return <MultipleChoiceExercise article={article} theme={t} charTheme={charTheme} />;
}

function MultipleChoiceExercise({ article, theme: t, charTheme }: { article: Article; theme: ReturnType<typeof resolveTheme>; charTheme: CharacterTheme | null }) {
  const data = article.exercise_data ?? {};
  const questions: any[] = Array.isArray(data.questions) ? data.questions : [];
  const progress = article.exercise_progress;

  // 設問は解答した瞬間にロックされ、その場で正誤・解説が表示される。
  // 画面再読み込み後もロック状態を復元できるよう、article.exercise_progress（前回までの解答記録）から初期化する。
  const [attemptNumber, setAttemptNumber] = useState<number>(progress?.attempt_number ?? 1);
  const [answers, setAnswers] = useState<(number | null)[]>(() =>
    questions.map((_, i) => progress?.answers?.[String(i)]?.chosen_index ?? null)
  );
  const [results, setResults] = useState<(any | null)[]>(() =>
    questions.map((_, i) => progress?.answers?.[String(i)] ?? null)
  );
  const [completed, setCompleted] = useState<boolean>(!!progress?.completed);
  const [scoreInfo, setScoreInfo] = useState<{ score: number; total: number; character_comment?: string | null } | null>(
    progress?.completed ? { score: progress.score ?? 0, total: progress.total ?? questions.length, character_comment: progress.character_comment } : null
  );
  const [answeringIndex, setAnsweringIndex] = useState<number | null>(null);
  const [errMsg, setErrMsg] = useState("");

  async function choose(qIndex: number, choiceIndex: number) {
    if (results[qIndex]) return; // 解答済みの設問はロックされ変更不可
    if (answeringIndex !== null) return;
    setErrMsg("");
    setAnsweringIndex(qIndex);
    try {
      const res = await api.answerExerciseQuestion(article.id, qIndex, choiceIndex, undefined, attemptNumber);
      setAnswers(prev => prev.map((a, i) => i === qIndex ? choiceIndex : a));
      setResults(prev => prev.map((r, i) => i === qIndex ? {
        chosen_index: choiceIndex, is_correct: res.is_correct, correct_index: res.correct_index, explanation: res.explanation,
      } : r));
      if (res.completed) {
        setCompleted(true);
        setScoreInfo({ score: res.score, total: res.total, character_comment: res.character_comment });
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : "解答の送信に失敗しました。時間をおいて再度お試しください");
    } finally {
      setAnsweringIndex(null);
    }
  }

  function retry() {
    setAttemptNumber(prev => prev + 1);
    setAnswers(questions.map(() => null));
    setResults(questions.map(() => null));
    setCompleted(false);
    setScoreInfo(null);
    setErrMsg("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const answeredCount = results.filter(Boolean).length;

  return (
    <div className="flex flex-col gap-4">
      {/* 案内文 */}
      {data.instructions && (
        <div className="rounded-xl px-4 py-3 text-sm leading-relaxed" style={{ background: t.example_bg, color: t.text, border: `1px solid ${t.border}` }}>
          {renderInlineMarkdown(String(data.instructions), t)}
        </div>
      )}

      {/* リスニング音声（設問共通。存在する場合のみ表示） */}
      {data.audio_url && (
        <div className="rounded-xl px-4 py-3" style={{ background: t.example_bg, border: `1px solid ${t.border}` }}>
          <p className="text-xs font-bold mb-2" style={{ color: t.accent }}>🎧 音声を聞いて、設問に答えてください</p>
          <audio controls src={`${(process.env.NEXT_PUBLIC_API_URL || "http://localhost/api")}${data.audio_url}`} className="w-full" />
        </div>
      )}

      {/* リスニングスクリプト（存在する場合のみ／ネタバレにならないよう折りたたみ表示） */}
      {data.listening_script && (
        <details className="rounded-xl overflow-hidden" style={{ border: `1px solid ${t.border}` }}>
          <summary className="px-4 py-2.5 text-xs font-bold cursor-pointer select-none" style={{ background: t.tips_bg, color: t.accent }}>
            🎧 スクリプトを表示する（リスニング後の確認用）
          </summary>
          <div className="px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap" style={{ background: t.card, color: t.text }}>
            {String(data.listening_script)}
          </div>
        </details>
      )}

      {/* 採点結果サマリー */}
      {completed && scoreInfo && (
        <div className="rounded-xl px-4 py-4 text-center" style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.accent})` }}>
          <p className="text-xs text-white/70 mb-1">採点結果{attemptNumber > 1 ? `（${attemptNumber}回目の挑戦）` : ""}</p>
          <p className="text-2xl font-black text-white">{scoreInfo.score} / {scoreInfo.total} 問 正解</p>
        </div>
      )}

      {/* 進捗（解答中のみ表示） */}
      {!completed && (
        <p className="text-xs text-center" style={{ color: t.text, opacity: 0.7 }}>
          {answeredCount} / {questions.length} 問 解答済み
          {attemptNumber > 1 ? `（${attemptNumber}回目の挑戦）` : ""}
        </p>
      )}

      {/* スコアに応じたキャラクターからのひとこと（世界観演出：採点して終わりにせず、結果に応じて反応してくれる） */}
      {completed && scoreInfo && scoreInfo.character_comment && (
        <div className="rounded-xl px-4 py-3 flex items-start gap-3" style={{ background: t.example_bg, border: `1px solid ${t.border}` }}>
          {charTheme?.image_url ? (
            <img src={`${(process.env.NEXT_PUBLIC_API_URL || "http://localhost/api")}${charTheme.image_url}`}
              alt={`${charTheme.name}のプロフィール画像`}
              className="w-9 h-9 rounded-full object-cover shadow-sm flex-shrink-0"
              style={{ border: `2px solid ${t.accent}` }} />
          ) : (
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black text-white flex-shrink-0"
              style={{ background: t.accent }}>
              {charTheme?.name?.charAt(0) ?? "?"}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs font-bold mb-0.5" style={{ color: t.accent }}>💬 {charTheme?.name ?? "先生"}より</p>
            <p className="text-sm leading-relaxed" style={{ color: t.text }}>{renderInlineMarkdown(String(scoreInfo?.character_comment ?? ""), t)}</p>
          </div>
        </div>
      )}

      {/* 設問一覧 */}
      <div className="flex flex-col gap-3">
        {questions.map((q, qi) => {
          const r = results[qi];
          const isAnswering = answeringIndex === qi;
          return (
            <div key={qi} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${t.border}` }}>
              <div className="px-4 py-2 flex items-center justify-between" style={{ background: t.example_bg }}>
                <span className="text-xs font-black" style={{ color: t.accent }}>設問 {qi + 1}</span>
                {r && (
                  <span className="text-xs font-black px-2 py-0.5 rounded-full text-white"
                    style={{ background: r.is_correct ? "#3aa76d" : "#d9534f" }}>
                    {r.is_correct ? "○ 正解" : "✕ 不正解"}
                  </span>
                )}
              </div>
              <div className="px-4 py-3 flex flex-col gap-2.5" style={{ background: t.card }}>
                {q.audio_url && (
                  <audio controls src={`${(process.env.NEXT_PUBLIC_API_URL || "http://localhost/api")}${q.audio_url}`} className="w-full" />
                )}
                <p className="text-sm font-bold leading-relaxed whitespace-pre-wrap" style={{ color: t.text }}>{renderInlineMarkdown(String(q.prompt ?? ""), t)}</p>
                <div className="flex flex-col gap-1.5">
                  {(q.choices ?? []).map((choice: string, ci: number) => {
                    const isChosen = answers[qi] === ci;
                    const isCorrectChoice = r ? r.correct_index === ci : false;
                    let style: React.CSSProperties = { borderColor: t.border, color: t.text, background: t.bg };
                    if (r) {
                      if (isCorrectChoice) style = { borderColor: "#3aa76d", color: "#2d7a4f", background: "#e8f7ee" };
                      else if (isChosen && !isCorrectChoice) style = { borderColor: "#d9534f", color: "#a83d36", background: "#fbeceb" };
                    } else if (isChosen) {
                      style = { borderColor: t.primary, color: "white", background: t.primary };
                    }
                    return (
                      <button key={ci} type="button" disabled={!!r || isAnswering}
                        onClick={() => choose(qi, ci)}
                        className="text-left text-sm px-3 py-2 rounded-lg border-2 transition-all"
                        style={{ ...style, cursor: (r || isAnswering) ? "default" : "pointer", opacity: isAnswering ? 0.6 : 1 }}>
                        <span className="font-bold mr-1.5">{String.fromCharCode(65 + ci)}.</span>
                        {choice}
                        {r && isCorrectChoice && <span className="ml-2 text-xs">← 正解</span>}
                      </button>
                    );
                  })}
                </div>
                {r && r.explanation && (
                  <div className="rounded-lg px-3 py-2.5 text-xs leading-relaxed mt-1" style={{ background: t.tips_bg, border: `1px dashed ${t.accent}`, color: t.text }}>
                    <p className="font-bold mb-1" style={{ color: t.accent }}>💡 解説</p>
                    <p className="whitespace-pre-wrap">{renderInlineMarkdown(String(r.explanation), t)}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {errMsg && <p className="text-xs font-bold text-center" style={{ color: "#d9534f" }}>{errMsg}</p>}

      {!completed && (
        <p className="text-xs text-center" style={{ color: t.accent }}>
          選択肢を選ぶとその場で正解・解説が表示され、選択肢は変更できなくなります。最後まで解答すると採点結果が表示されます。
        </p>
      )}
      {completed && (
        <>
          <p className="text-xs text-center" style={{ color: t.accent }}>
            採点が完了しました。間違えた問題は解説を読み返して、復習に役立ててね。
          </p>
          <button type="button" onClick={retry}
            className="self-center px-8 py-2.5 rounded-full text-sm font-bold border-2 transition-all hover:shadow-md"
            style={{ borderColor: t.primary, color: "white", background: t.primary }}>
            🔄 もう一度挑戦する
          </button>
        </>
      )}
    </div>
  );
}

function WrittenExercise({ article, theme: t }: { article: Article; theme: ReturnType<typeof resolveTheme> }) {
  const data = article.exercise_data ?? {};
  const isSpeaking = data.skill === "speaking";
  const [answer, setAnswer] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  function openConfirm() {
    if (isSpeaking) {
      if (!mediaFile) {
        setErrMsg("音声または動画ファイルを選択してから提出してください");
        return;
      }
    } else if (!answer.trim()) {
      setErrMsg("解答を入力してから提出してください");
      return;
    }
    setErrMsg("");
    setShowConfirm(true);
  }

  async function handleSubmit() {
    setShowConfirm(false);
    setSubmitting(true);
    try {
      if (isSpeaking && mediaFile) {
        await api.submitSpeakingExercise(article.id, mediaFile, note.trim() || undefined);
      } else {
        await api.submitWrittenExercise(article.id, answer);
      }
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : "提出に失敗しました。時間をおいて再度お試しください");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {data.instructions && (
        <div className="rounded-xl px-4 py-3 text-sm leading-relaxed" style={{ background: t.example_bg, color: t.text, border: `1px solid ${t.border}` }}>
          {renderInlineMarkdown(String(data.instructions), t)}
        </div>
      )}

      {data.prompt && (
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${t.border}` }}>
          <div className="px-4 py-2" style={{ background: t.example_bg }}>
            <span className="text-xs font-black" style={{ color: t.accent }}>📝 お題{isSpeaking ? "（音声）" : ""}</span>
          </div>
          <div className="px-4 py-3" style={{ background: t.card }}>
            <p className="text-sm font-bold leading-relaxed whitespace-pre-wrap" style={{ color: t.text }}>{renderInlineMarkdown(String(data.prompt), t)}</p>
          </div>
        </div>
      )}

      {submitted ? (
        <div className="rounded-xl px-4 py-5 text-center" style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.accent})` }}>
          <p className="text-2xl mb-1.5">📨</p>
          <p className="font-black text-white text-sm">解答を提出しました！</p>
          <p className="text-xs text-white/80 mt-1.5">先生からのフィードバックは、アプリ内チャットに届きます。届いたら見てみてね。</p>
        </div>
      ) : (
        <>
          {isSpeaking ? (
            <>
              <div>
                <label className="text-xs font-bold block mb-1.5" style={{ color: t.accent }}>あなたの解答（音声または動画ファイル）</label>
                <input type="file" accept="audio/*,video/*"
                  onChange={e => setMediaFile(e.target.files?.[0] ?? null)}
                  className="w-full text-sm rounded-xl px-3 py-2.5 outline-none"
                  style={{ border: `1px solid ${t.border}`, background: t.bg, color: t.text }} />
                {mediaFile && (
                  mediaFile.type.startsWith("video/") ? (
                    <video controls src={URL.createObjectURL(mediaFile)} className="w-full rounded-xl mt-2 max-h-64" />
                  ) : (
                    <audio controls src={URL.createObjectURL(mediaFile)} className="w-full mt-2" />
                  )
                )}
              </div>
              <div>
                <label className="text-xs font-bold block mb-1.5" style={{ color: t.accent }}>メモ（任意）</label>
                <textarea rows={3} value={note} onChange={e => setNote(e.target.value)}
                  placeholder="伝えておきたいことがあれば入力してください（任意）…"
                  className="w-full text-sm rounded-xl px-3 py-2.5 outline-none"
                  style={{ border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontFamily: t.fontFamily }} />
              </div>
            </>
          ) : (
            <div>
              <label className="text-xs font-bold block mb-1.5" style={{ color: t.accent }}>あなたの解答</label>
              <textarea rows={8} value={answer} onChange={e => setAnswer(e.target.value)}
                placeholder="ここに解答を入力してください…"
                className="w-full text-sm rounded-xl px-3 py-2.5 outline-none"
                style={{ border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontFamily: t.fontFamily }} />
              <p className="text-xs mt-1 text-right" style={{ color: t.accent, opacity: 0.7 }}>{answer.length} 文字</p>
            </div>
          )}
          {errMsg && <p className="text-xs font-bold text-center" style={{ color: "#d9534f" }}>{errMsg}</p>}
          <button type="button" onClick={openConfirm} disabled={submitting}
            className="self-center px-8 py-2.5 rounded-full text-sm font-bold border-2 transition-all hover:shadow-md disabled:opacity-50"
            style={{ borderColor: t.primary, color: "white", background: t.primary }}>
            {submitting ? "提出中…" : "📨 提出する"}
          </button>
          <p className="text-xs text-center" style={{ color: t.accent, opacity: 0.8 }}>
            ※提出すると先生（キャラクター）へのチャットとして送信され、後ほど添削・フィードバックが届きます。
          </p>
        </>
      )}

      {/* 提出確認モーダル（ネイティブconfirmの代わりにキャラのセリフで確認させる） */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setShowConfirm(false)}>
          <div className="rounded-2xl px-5 py-5 w-full max-w-sm shadow-xl"
            style={{ background: t.card, border: `1px solid ${t.border}` }}
            onClick={e => e.stopPropagation()}>
            <p className="text-sm font-bold leading-relaxed mb-1" style={{ color: t.primary }}>
              この内容で提出する？
            </p>
            <p className="text-xs leading-relaxed mb-4" style={{ color: t.text, opacity: 0.85 }}>
              提出したらもう書き直せないよ。準備ができたら送ってね。フィードバックは後でチャットに届くから、楽しみに待ってて。
            </p>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowConfirm(false)}
                className="px-4 py-2 rounded-full text-xs font-bold border-2 transition-all hover:shadow-md"
                style={{ borderColor: t.border, color: t.text, background: t.bg }}>
                書き直す
              </button>
              <button type="button" onClick={handleSubmit} disabled={submitting}
                className="px-4 py-2 rounded-full text-xs font-bold border-2 transition-all hover:shadow-md disabled:opacity-50"
                style={{ borderColor: t.primary, color: "white", background: t.primary }}>
                {submitting ? "提出中…" : "📨 これで提出する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
