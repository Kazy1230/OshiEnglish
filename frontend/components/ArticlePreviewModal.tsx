"use client";
import { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { resolveTheme } from "@/lib/theme";
import { useDarkMode } from "@/lib/darkMode";

type Props = {
  article: any;
  character: any | null;
  onClose: () => void;
};

function SectionLabel({ icon, label, color }: { icon: string; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-lg">{icon}</span>
      <span className="font-black text-sm" style={{ color }}>{label}</span>
      <div className="flex-1 h-px" style={{ background: color, opacity: 0.2 }} />
    </div>
  );
}

export function ArticlePreviewModal({ article, character, onClose }: Props) {
  const [mode] = useDarkMode();
  const t = resolveTheme(character ? { id: character.id, name: character.name, description: character.description, color_scheme: character.color_scheme, font_style: character.font_style } : null, mode);
  // ブログ記事は「依頼に応えた解説記事」の体裁ではないため、ラベル文言を出し分ける
  const isBlog = article?.article_type === "blog";
  const isExercise = article?.article_type === "exercise";

  // Escキーで閉じる
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // スクロールロック
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-8 px-4 overflow-y-auto"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl" style={{ background: t.bg, fontFamily: t.fontFamily }}>
        {/* モーダルヘッダー */}
        <div className="flex items-center justify-between px-5 py-3" style={{ background: "#1a1a2e" }}>
          <div className="flex items-center gap-2">
            <span className="text-white text-sm font-bold">👁 プレビュー</span>
            <span className="text-xs text-white/50">（顧客側の表示イメージ）</span>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-lg leading-none">✕</button>
        </div>

        {/* キャラクターバナー */}
        {character && (
          <div className="overflow-hidden" style={{ border: `2px solid ${t.accent}` }}>
            <div className="px-5 py-3 flex items-center gap-3" style={{ background: t.primary }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-black text-white"
                style={{ background: t.accent }}>
                {character.name.charAt(0)}
              </div>
              <div>
                <p className="text-xs text-white/60">{isBlog ? "書き手" : "担当キャラクター"}</p>
                <p className="font-black text-white text-sm">{character.name}</p>
              </div>
            </div>
            {character.description && (
              <div className="px-5 py-2 text-xs italic" style={{ background: t.example_bg, color: t.accent }}>
                「{character.description}」
              </div>
            )}
          </div>
        )}

        <div className="p-6 flex flex-col gap-4">
          {/* タイトル */}
          <div className="rounded-2xl px-5 py-4" style={{ background: t.card, border: `1px solid ${t.border}` }}>
            <p className="text-xs font-bold mb-1" style={{ color: t.accent }}>
              {isBlog ? `📰 ${character?.name ?? ""}のブログ` : isExercise ? `🧩 演習問題${article.exercise_category ? `（${article.exercise_category}）` : ""}` : "文法解説"}
            </p>
            <h2 className="text-xl font-black" style={{ color: t.primary }}>{article.title}</h2>
          </div>

          {/* 演習問題プレビュー（顧客が最初に見る状態＝正解・解説は非表示） */}
          {isExercise && (
            <div className="rounded-2xl px-5 py-4" style={{ background: t.card, border: `1px solid ${t.border}` }}>
              <SectionLabel color={t.primary} icon="🧩" label="問題" />
              <ExercisePreviewBody article={article} t={t} />
              <p className="text-xs mt-3 px-3 py-2 rounded-lg" style={{ background: t.tips_bg, color: t.accent }}>
                💡 これは顧客が「解答する前」に見る状態のプレビューです。
                {article.exercise_format === "written_response"
                  ? "（評価観点メモは運営向けの内部情報のため、顧客には表示されません）"
                  : "（正解・解説は、顧客が解答して採点した後に初めて表示されます）"}
              </p>
            </div>
          )}

          {/* 本文（演習問題の場合は「補足メモ」として表示。空なら非表示） */}
          {(!isExercise || (article.content && article.content.trim())) && (
          <div className="rounded-2xl px-5 py-4" style={{ background: t.card, border: `1px solid ${t.border}` }}>
            {isBlog
              ? <SectionLabel color={t.primary} icon="📰" label="本文" />
              : isExercise
              ? <SectionLabel color={t.accent} icon="📝" label="ひとことメモ" />
              : <SectionLabel color={t.primary} icon="📖" label="解説" />}
            <div className="text-sm leading-loose" style={{ color: t.text }}>
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
                  code: ({children}) => <code className="text-xs px-1.5 py-0.5 rounded" style={{ background: t.bg, color: t.accent, fontFamily: "monospace" }}>{children}</code>,
                  hr: () => <hr className="my-4" style={{ borderColor: t.border }} />,
                }}>
                {article.content}
              </ReactMarkdown>
            </div>
          </div>
          )}

          {/* 例文 */}
          {!isExercise && article.example_sentences?.length > 0 && (
            <div className="rounded-2xl px-5 py-4" style={{ background: t.card, border: `1px solid ${t.border}` }}>
              <SectionLabel color={t.accent} icon="💬" label="例文" />
              <div className="flex flex-col gap-3">
                {article.example_sentences.map((raw: unknown, i: number) => {
                  // データ形式が想定外（オブジェクト等）でも画面ごと落ちないように防御的に文字列化する
                  const s = typeof raw === "string" ? raw : (raw && typeof raw === "object"
                    ? [(raw as any).en, (raw as any).ja].filter(Boolean).join(" / ")
                    : String(raw ?? ""));
                  const parts = s.split(" / ");
                  const eng = parts[0]?.trim() ?? s;
                  const jpn = parts[1]?.trim() ?? null;
                  return (
                    <div key={i} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${t.border}` }}>
                      <div className="px-4 py-1.5" style={{ background: t.accent }}>
                        <span className="text-xs font-black text-white">例文 {i + 1}</span>
                      </div>
                      <div className="px-4 py-3" style={{ background: t.example_bg }}>
                        <p className="text-sm font-bold">{eng}</p>
                        {jpn && <p className="text-xs mt-1.5" style={{ color: t.accent }}>{jpn}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tips */}
          {!isExercise && article.tips?.length > 0 && (
            <div className="rounded-2xl px-5 py-4" style={{ background: t.tips_bg, border: `2px solid ${t.accent}` }}>
              <SectionLabel color={t.accent} icon="💡" label="Tips" />
              <ul className="flex flex-col gap-2">
                {article.tips.map((tip: string, i: number) => (
                  <li key={i} className="flex gap-2 items-start text-sm">
                    <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-black text-white"
                      style={{ background: t.accent }}>{i + 1}</span>
                    <span style={{ color: t.text }}>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 演習問題のプレビュー本体（顧客が解答前に見る状態を、選択式・記述式それぞれ再現する） */
function ExercisePreviewBody({ article, t }: { article: any; t: ReturnType<typeof resolveTheme> }) {
  const data = article.exercise_data ?? {};
  const isWritten = article.exercise_format === "written_response";

  return (
    <div className="flex flex-col gap-3">
      {data.instructions && (
        <div className="rounded-xl px-4 py-3 text-sm leading-relaxed" style={{ background: t.example_bg, color: t.text, border: `1px solid ${t.border}` }}>
          {String(data.instructions)}
        </div>
      )}

      {!isWritten && data.listening_script && (
        <div className="rounded-xl px-4 py-2.5 text-xs font-bold" style={{ background: t.tips_bg, color: t.accent, border: `1px solid ${t.border}` }}>
          🎧 リスニングスクリプトあり（顧客側では折りたたみ表示・解答後に確認できます）
        </div>
      )}

      {isWritten ? (
        <>
          {data.prompt && (
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${t.border}` }}>
              <div className="px-4 py-2" style={{ background: t.example_bg }}>
                <span className="text-xs font-black" style={{ color: t.accent }}>📝 お題</span>
              </div>
              <div className="px-4 py-3" style={{ background: t.card }}>
                <p className="text-sm font-bold leading-relaxed whitespace-pre-wrap" style={{ color: t.text }}>{String(data.prompt)}</p>
              </div>
            </div>
          )}
          <div className="rounded-xl px-4 py-3 text-xs" style={{ border: `1px dashed ${t.border}`, color: t.text, opacity: 0.7 }}>
            （ここに解答用テキストエリアと「📨 提出する」ボタンが表示されます。提出されるとキャラクターへのチャットとして送信されます）
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2.5">
          {(data.questions ?? []).map((q: any, qi: number) => (
            <div key={qi} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${t.border}` }}>
              <div className="px-4 py-2" style={{ background: t.example_bg }}>
                <span className="text-xs font-black" style={{ color: t.accent }}>設問 {qi + 1}</span>
              </div>
              <div className="px-4 py-3 flex flex-col gap-1.5" style={{ background: t.card }}>
                <p className="text-sm font-bold leading-relaxed whitespace-pre-wrap" style={{ color: t.text }}>{q.prompt}</p>
                <div className="flex flex-col gap-1">
                  {(q.choices ?? []).map((c: string, ci: number) => (
                    <div key={ci} className="text-sm px-3 py-1.5 rounded-lg border-2" style={{ borderColor: t.border, color: t.text, background: t.bg }}>
                      <span className="font-bold mr-1.5">{String.fromCharCode(65 + ci)}.</span>{c}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
          <div className="rounded-xl px-4 py-3 text-xs" style={{ border: `1px dashed ${t.border}`, color: t.text, opacity: 0.7 }}>
            （ここに「✓ 採点する」ボタンが表示されます。採点後はスコア・正誤・解説・キャラクターからのコメントが表示されます）
          </div>
        </div>
      )}
    </div>
  );
}
