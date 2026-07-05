"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api, API_BASE } from "@/lib/api";
import { toast } from "@/components/Toast";
import { AppHeader } from "@/components/AppHeader";

// ── 型定義 ──────────────────────────────────────────────────────
type Idea = { title: string; hook: string; why: string };
type Angle = { label: string; hook: string; why: string };
type Format = {
  key: string; label: string; icon: string; mediaType: "text" | "video";
  defaultVal: number; unit: string; minVal: number; maxVal: number; hint: string;
};

// ── フォーマット定義 ─────────────────────────────────────────────
const FORMATS: Format[] = [
  { key: "x", label: "X（ツイート）", icon: "𝕏", mediaType: "text", defaultVal: 140, unit: "文字", minVal: 50, maxVal: 280, hint: "短くパンチのある一言が刺さる" },
  { key: "threads", label: "Threads", icon: "ꝋ", mediaType: "text", defaultVal: 500, unit: "文字", minVal: 100, maxVal: 500, hint: "少し長めで深みのある投稿" },
  { key: "instagram_post", label: "インスタ投稿", icon: "📸", mediaType: "text", defaultVal: 1000, unit: "文字", minVal: 300, maxVal: 2000, hint: "絵文字＋ハッシュタグで拡散" },
  { key: "instagram_reel", label: "インスタReels", icon: "🎞", mediaType: "video", defaultVal: 60, unit: "秒", minVal: 15, maxVal: 90, hint: "冒頭3秒でフックが命" },
  { key: "youtube_short", label: "YouTubeショート", icon: "⚡", mediaType: "video", defaultVal: 60, unit: "秒", minVal: 15, maxVal: 60, hint: "縦型・60秒以内のテンポ重視" },
  { key: "youtube", label: "YouTube動画", icon: "▶", mediaType: "video", defaultVal: 480, unit: "秒", minVal: 120, maxVal: 1800, hint: "じっくり解説・信頼構築に最適" },
];

type Step = "subject" | "format" | "ideas" | "angles" | "generating" | "result";

const STUDIO_SUBJECT_OPTIONS = [
  { key: "english", label: "英語", icon: "📚", description: "TOEIC・英会話・英文法など" },
  { key: "japanese", label: "日本語", icon: "🗾", description: "JLPT・日常会話・ビジネス日本語など" },
  { key: "it", label: "IT・プログラミング", icon: "💻", description: "Python・AWS・Web開発など" },
  { key: "music", label: "音楽", icon: "🎵", description: "ピアノ・ギター・音楽理論など" },
];

export default function StudioPage() {
  const { me, loading } = useRoleGuard(["creator", "admin"]);
  const router = useRouter();
  const [character, setCharacter] = useState<{ id: number; name: string } | null>(null);
  const [loadingCharacter, setLoadingCharacter] = useState(true);

  const [subject, setSubject] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("subject");
  const [format, setFormat] = useState<Format | null>(null);
  const [paramVal, setParamVal] = useState(0); // 文字数 or 秒数

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [keyword, setKeyword] = useState(""); // 自由入力フォールバック

  const [angles, setAngles] = useState<Angle[]>([]);
  const [loadingAngles, setLoadingAngles] = useState(false);
  const [selectedAngle, setSelectedAngle] = useState<Angle | null>(null);

  // 生成結果
  const [rawPhase, setRawPhase] = useState("");
  const [result, setResult] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading) return;
    api.listMyCharacters().then(list => {
      if (list.length > 0) setCharacter(list[0]);
    }).catch(() => {}).finally(() => setLoadingCharacter(false));
    if (me?.role !== "admin") {
      api.getMyCreatorProfile().then(p => {
        if (p.status !== "active") {
          toast("クリエイター申請が承認されるまでスタジオは利用できません", "error");
          router.replace("/dashboard");
        }
      }).catch(() => {});
    }
  }, [loading, me, router]);

  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [result]);

  if (loading || loadingCharacter) return <Skeleton />;

  // ── ハンドラ ──────────────────────────────────────────────────

  function selectSubject(key: string) {
    setSubject(key);
    setStep("format");
  }

  function selectFormat(f: Format) {
    setFormat(f);
    setParamVal(f.defaultVal);
    setIdeas([]);
    setSelectedIdea(null);
    setAngles([]);
    setSelectedAngle(null);
    setResult("");
    setStep("ideas");
  }

  async function fetchIdeas() {
    if (!format || !character) return;
    setLoadingIdeas(true);
    setIdeas([]);
    setSelectedIdea(null);
    try {
      const durationSec = format.mediaType === "video" ? paramVal : undefined;
      const charLimit = format.mediaType === "text" ? paramVal : undefined;
      const res = await api.studioIdeas(format.key, character.id, durationSec, charLimit);
      setIdeas(res.ideas || []);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "ネタ提案に失敗しました", "error");
    } finally {
      setLoadingIdeas(false);
    }
  }

  async function selectIdea(idea: Idea) {
    setSelectedIdea(idea);
    setAngles([]);
    setSelectedAngle(null);
    setLoadingAngles(true);
    setStep("angles");
    try {
      const res = await api.studioAngles(idea.title, idea.hook, format!.key, character!.id);
      setAngles(res.angles || []);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "切り口提案に失敗しました", "error");
    } finally {
      setLoadingAngles(false);
    }
  }

  async function generate(angle: Angle) {
    if (!format || !character || !selectedIdea) return;
    setSelectedAngle(angle);
    setStep("generating");
    setGenerating(true);
    setRawPhase("");
    setResult("");

    const token = typeof window !== "undefined" ? localStorage.getItem("yt_token") : null;
    const durationSec = format.mediaType === "video" ? paramVal : undefined;
    const charLimit = format.mediaType === "text" ? paramVal : undefined;

    try {
      const res = await fetch(`${API_BASE}/studio/generate/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          character_id: character.id,
          format: format.key,
          idea: selectedIdea.title,
          hook: angle.hook,
          duration_sec: durationSec,
          char_limit: charLimit,
          subject: subject ?? undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "エラーが発生しました" }));
        throw new Error(err.detail);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let voiced = "";
      let phase: "raw" | "voiced" = "raw";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.error) throw new Error(evt.error);
            if (evt.phase === "raw" && !evt.delta) { /* phase start */ }
            if (evt.phase === "voiced" && !evt.delta) { phase = "voiced"; }
            if (evt.delta) {
              if (phase === "raw") setRawPhase(p => p + evt.delta);
              else { voiced += evt.delta; setResult(voiced); }
            }
            if (evt.done) setStep("result");
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "生成に失敗しました", "error");
      setStep("angles");
    } finally {
      setGenerating(false);
    }
  }

  async function copyResult() {
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function restart() {
    setSubject(null);
    setStep("subject");
    setFormat(null);
    setIdeas([]);
    setSelectedIdea(null);
    setAngles([]);
    setSelectedAngle(null);
    setResult("");
    setRawPhase("");
    setKeyword("");
  }

  // ── レンダリング ─────────────────────────────────────────────

  const progressSteps = [
    { key: "subject", label: "分野" },
    { key: "format", label: "フォーマット" },
    { key: "ideas", label: "ネタ選び" },
    { key: "angles", label: "切り口" },
    { key: "generating", label: "生成中" },
    { key: "result", label: "完成" },
  ];
  const stepIdx = progressSteps.findIndex(s => s.key === step);

  return (
    <div className="studio-theme min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" title="AIコンテンツ生成スタジオ" />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">

        {/* キャラクター未設定 */}
        {!character && (
          <div className="card flex flex-col gap-3">
            <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>まず人格（キャラクター）を作りましょう</p>
            <p className="text-sm" style={{ color: "var(--muted)" }}>スタジオでは、あなたの人格データをもとにコンテンツの口調を自動で合わせます。</p>
            <a href="/creator/interview" className="btn-primary self-start">AIインタビューへ →</a>
          </div>
        )}

        {character && (
          <>
            {/* ステッパー */}
            <div className="flex items-center gap-0">
              {progressSteps.map((s, i) => {
                const done = i < stepIdx;
                const current = i === stepIdx;
                return (
                  <div key={s.key} className="flex items-center flex-1 min-w-0">
                    <div className="flex flex-col items-center gap-1 flex-shrink-0">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-colors"
                        style={{
                          background: done ? "var(--accent)" : current ? "var(--primary)" : "var(--border)",
                          color: (done || current) ? "white" : "var(--muted)",
                        }}>
                        {done ? "✓" : i + 1}
                      </div>
                      <span className="text-[10px] font-bold whitespace-nowrap" style={{ color: current ? "var(--primary)" : "var(--muted)" }}>{s.label}</span>
                    </div>
                    {i < progressSteps.length - 1 && (
                      <div className="flex-1 h-0.5 mx-1 mb-4 rounded-full transition-colors" style={{ background: done ? "var(--accent)" : "var(--border)" }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* STEP 0: 分野選択 */}
            {step === "subject" && (
              <div className="flex flex-col gap-4">
                <div>
                  <p className="font-bold" style={{ color: "var(--text)" }}>どの分野のコンテンツを作りますか？</p>
                  <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>分野に合ったネタ・切り口をご提案します</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {STUDIO_SUBJECT_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => selectSubject(opt.key)}
                      className="card p-5 flex flex-col gap-2 text-left hover-lift transition-all"
                      style={{ background: "var(--card)" }}
                    >
                      <span className="text-2xl">{opt.icon}</span>
                      <span className="text-sm font-bold" style={{ color: "var(--primary)" }}>{opt.label}</span>
                      <span className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>{opt.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 2: フォーマット選択 */}
            {step === "format" && (
              <div className="flex flex-col gap-4">
                {subject && (
                  <div className="flex items-center justify-between px-3 py-2 rounded-xl" style={{ background: "color-mix(in srgb, var(--primary) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)" }}>
                    <span className="text-sm font-bold flex items-center gap-1.5" style={{ color: "var(--primary)" }}>
                      {STUDIO_SUBJECT_OPTIONS.find(o => o.key === subject)?.icon}{" "}
                      {STUDIO_SUBJECT_OPTIONS.find(o => o.key === subject)?.label}
                    </span>
                    <button type="button" onClick={() => { setSubject(null); setStep("subject"); }} className="text-xs underline" style={{ color: "var(--muted)" }}>変更</button>
                  </div>
                )}
                <div>
                  <p className="font-bold" style={{ color: "var(--text)" }}>どのフォーマットで投稿しますか？</p>
                  <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>フォーマットを選ぶと、最適な長さ・構成でコンテンツを生成します</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {FORMATS.map(f => (
                    <button key={f.key} onClick={() => selectFormat(f)}
                      className="card p-4 flex flex-col gap-2 text-left hover-lift transition-all"
                      style={{ background: "var(--card)" }}>
                      <span className="text-2xl">{f.icon}</span>
                      <span className="text-sm font-bold" style={{ color: "var(--text)" }}>{f.label}</span>
                      <span className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>{f.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 1: ネタ提案 */}
            {step === "ideas" && format && (
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold" style={{ color: "var(--text)" }}>
                      <span className="text-lg mr-1">{format.icon}</span>{format.label} のネタを選ぶ
                    </p>
                    <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>AIがあなたの人格にあったネタを提案します</p>
                  </div>
                  <button onClick={() => setStep("format")} className="text-xs underline flex-shrink-0 mt-1" style={{ color: "var(--muted)" }}>変更</button>
                </div>

                {/* 尺 / 文字数 */}
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <span className="text-sm font-bold" style={{ color: "var(--text)" }}>
                    {format.mediaType === "video" ? "尺" : "文字数"}
                  </span>
                  <input
                    type="number"
                    value={paramVal}
                    min={format.minVal}
                    max={format.maxVal}
                    onChange={e => setParamVal(Number(e.target.value))}
                    className="w-24 text-sm px-2 py-1 rounded-lg text-center"
                    style={{ background: "var(--bg)", border: "1.5px solid var(--border)", color: "var(--text)" }}
                  />
                  <span className="text-sm" style={{ color: "var(--muted)" }}>{format.unit}</span>
                  {format.mediaType === "video" && paramVal >= 60 && (
                    <span className="text-xs" style={{ color: "var(--muted)" }}>（約{Math.round(paramVal / 60)}分）</span>
                  )}
                </div>

                <button onClick={fetchIdeas} disabled={loadingIdeas} className="btn-primary self-start disabled:opacity-50">
                  {loadingIdeas ? "提案中…" : ideas.length > 0 ? "🔄 別のネタを提案する" : "✨ ネタを提案してもらう"}
                </button>

                {loadingIdeas && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
                  </div>
                )}

                {ideas.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-bold" style={{ color: "var(--muted)" }}>タップして選ぶ</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {ideas.map((idea, i) => (
                        <button key={i} onClick={() => selectIdea(idea)}
                          className="card p-4 text-left flex flex-col gap-2 hover-lift transition-all"
                          style={{ background: "var(--card)", textAlign: "left" }}>
                          <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>{idea.title}</p>
                          <p className="text-xs leading-relaxed" style={{ color: "var(--text)" }}>「{idea.hook}」</p>
                          <p className="text-[11px] px-2 py-1 rounded-full self-start" style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--accent)" }}>
                            {idea.why}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 自分でキーワードを入力するフォールバック */}
                <details className="text-sm">
                  <summary className="cursor-pointer" style={{ color: "var(--muted)" }}>自分でテーマを入力したい</summary>
                  <div className="flex gap-2 mt-2">
                    <input
                      value={keyword}
                      onChange={e => setKeyword(e.target.value)}
                      placeholder="例：仮定法過去完了、TOEICリスニング攻略"
                      className="flex-1 text-sm px-3 py-2 rounded-lg"
                      style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }}
                    />
                    <button
                      onClick={() => keyword.trim() && selectIdea({ title: keyword, hook: keyword, why: "手動入力" })}
                      disabled={!keyword.trim()}
                      className="btn-primary text-sm disabled:opacity-50"
                    >
                      選択
                    </button>
                  </div>
                </details>
              </div>
            )}

            {/* STEP 2: 切り口選択 */}
            {step === "angles" && selectedIdea && (
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>選んだネタ</p>
                    <p className="font-bold" style={{ color: "var(--text)" }}>{selectedIdea.title}</p>
                    <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>「{selectedIdea.hook}」</p>
                  </div>
                  <button onClick={() => setStep("ideas")} className="text-xs underline flex-shrink-0 mt-1" style={{ color: "var(--muted)" }}>変更</button>
                </div>

                <div>
                  <p className="font-bold" style={{ color: "var(--text)" }}>どの切り口で攻めますか？</p>
                  <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>角度が違うだけでバズり方が変わります</p>
                </div>

                {loadingAngles && (
                  <div className="flex flex-col gap-3">
                    {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
                  </div>
                )}

                {angles.map((angle, i) => (
                  <button key={i} onClick={() => generate(angle)}
                    className="card p-4 text-left flex flex-col gap-2 hover-lift transition-all"
                    style={{ background: "var(--card)" }}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black px-2.5 py-1 rounded-full" style={{ background: "var(--primary)", color: "white" }}>{angle.label}</span>
                      <span className="text-xs" style={{ color: "var(--accent)" }}>{angle.why}</span>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--text)" }}>「{angle.hook}」</p>
                    <span className="text-xs font-bold" style={{ color: "var(--accent)" }}>この切り口で生成する →</span>
                  </button>
                ))}
              </div>
            )}

            {/* STEP 3: 生成中 */}
            {(step === "generating" || (step === "result" && generating)) && (
              <div className="card flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <span key={i} className="w-2 h-2 rounded-full animate-bounce" style={{ background: "var(--accent)", animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                  <p className="text-sm font-bold" style={{ color: "var(--text)" }}>
                    {rawPhase && !result ? "素材を生成中…" : result ? "口調を変換中…" : "生成を開始しています…"}
                  </p>
                </div>
                {rawPhase && !result && (
                  <p className="text-xs whitespace-pre-wrap leading-relaxed line-clamp-6" style={{ color: "var(--muted)" }}>{rawPhase}</p>
                )}
                {result && (
                  <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text)" }}>{result}</p>
                )}
              </div>
            )}

            {/* STEP 4: 結果 */}
            {step === "result" && result && (
              <div ref={resultRef} className="flex flex-col gap-4">
                <div className="card overflow-hidden p-0">
                  <div className="px-5 py-3 flex items-center justify-between" style={{ background: "linear-gradient(135deg, var(--primary), var(--accent))" }}>
                    <div>
                      <p className="text-xs text-white/70">{format?.label} · {selectedIdea?.title}</p>
                      <p className="text-sm font-bold text-white">{selectedAngle?.label}</p>
                    </div>
                    <button onClick={copyResult} className="text-xs font-bold px-3 py-1.5 rounded-full transition-all" style={{ background: "rgba(255,255,255,0.2)", color: "white" }}>
                      {copied ? "✓ コピー済み" : "コピー"}
                    </button>
                  </div>
                  <div className="p-5">
                    <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text)" }}>{result}</p>
                  </div>
                  {format?.mediaType === "text" && (
                    <div className="px-5 pb-3">
                      <p className="text-xs" style={{ color: "var(--muted)" }}>{result.length} 文字</p>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 flex-wrap">
                  <button onClick={() => generate(selectedAngle!)} disabled={generating} className="btn-ghost disabled:opacity-50">
                    🔄 再生成
                  </button>
                  <button onClick={() => { setStep("angles"); setResult(""); setRawPhase(""); }} className="btn-ghost">
                    ← 切り口を変える
                  </button>
                  <button onClick={restart} className="btn-ghost">
                    ✦ 最初から
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
