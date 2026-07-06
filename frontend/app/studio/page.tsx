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
type SavedDraft = {
  id: number; theme: string; format: string | null; target_level: string | null;
  voiced_content: string | null; memo: string | null; updated_at: string | null;
};

const FORMATS: Format[] = [
  { key: "x", label: "X（ツイート）", icon: "𝕏", mediaType: "text", defaultVal: 140, unit: "文字", minVal: 50, maxVal: 280, hint: "短くパンチのある一言が刺さる" },
  { key: "threads", label: "Threads", icon: "ꝋ", mediaType: "text", defaultVal: 500, unit: "文字", minVal: 100, maxVal: 500, hint: "少し長めで深みのある投稿" },
  { key: "instagram_post", label: "インスタ投稿", icon: "📸", mediaType: "text", defaultVal: 1000, unit: "文字", minVal: 300, maxVal: 2000, hint: "絵文字＋ハッシュタグで拡散" },
  { key: "instagram_reel", label: "インスタReels", icon: "🎞", mediaType: "video", defaultVal: 60, unit: "秒", minVal: 15, maxVal: 90, hint: "冒頭3秒でフックが命" },
  { key: "youtube_short", label: "YouTubeショート", icon: "⚡", mediaType: "video", defaultVal: 60, unit: "秒", minVal: 15, maxVal: 60, hint: "縦型・60秒以内のテンポ重視" },
  { key: "youtube", label: "YouTube動画", icon: "▶", mediaType: "video", defaultVal: 480, unit: "秒", minVal: 120, maxVal: 1800, hint: "じっくり解説・信頼構築に最適" },
];

const STUDIO_SUBJECT_OPTIONS = [
  { key: "english", label: "英語", icon: "📚", description: "TOEIC・英会話・英文法など" },
  { key: "japanese", label: "日本語", icon: "🗾", description: "JLPT・日常会話・ビジネス日本語など" },
  { key: "it", label: "IT・プログラミング", icon: "💻", description: "Python・AWS・Web開発など" },
  { key: "music", label: "音楽", icon: "🎵", description: "ピアノ・ギター・音楽理論など" },
];

const FORMAT_LABEL: Record<string, string> = {
  x: "X", threads: "Threads", instagram_post: "インスタ投稿",
  instagram_reel: "インスタReels", youtube_short: "YouTubeショート", youtube: "YouTube動画",
};

type Step = "subject" | "format" | "ideas" | "angles" | "generating" | "result";
type Panel = "create" | "drafts" | "marketing";

// ── コンテンツ作成パネル ─────────────────────────────────────────
function CreatePanel({ character, onSave }: { character: { id: number; name: string } | null; onSave: () => void }) {
  const [subject, setSubject] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("subject");
  const [format, setFormat] = useState<Format | null>(null);
  const [paramVal, setParamVal] = useState(0);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [keyword, setKeyword] = useState("");
  const [angles, setAngles] = useState<Angle[]>([]);
  const [loadingAngles, setLoadingAngles] = useState(false);
  const [selectedAngle, setSelectedAngle] = useState<Angle | null>(null);
  const [rawPhase, setRawPhase] = useState("");
  const [result, setResult] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draftId, setDraftId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMemo, setSavedMemo] = useState("");
  const [showMemoInput, setShowMemoInput] = useState(false);
  const [alreadySaved, setAlreadySaved] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (result) resultRef.current?.scrollIntoView({ behavior: "smooth" }); }, [result]);

  const progressSteps = [
    { key: "subject", label: "分野" }, { key: "format", label: "フォーマット" },
    { key: "ideas", label: "ネタ選び" }, { key: "angles", label: "切り口" },
    { key: "generating", label: "生成中" }, { key: "result", label: "完成" },
  ];
  const stepIdx = progressSteps.findIndex(s => s.key === step);

  function selectFormat(f: Format) {
    setFormat(f); setParamVal(f.defaultVal);
    setIdeas([]); setSelectedIdea(null); setAngles([]); setSelectedAngle(null); setResult(""); setStep("ideas");
  }

  async function fetchIdeas() {
    if (!format || !character) return;
    setLoadingIdeas(true); setIdeas([]); setSelectedIdea(null);
    try {
      const durationSec = format.mediaType === "video" ? paramVal : undefined;
      const charLimit = format.mediaType === "text" ? paramVal : undefined;
      const res = await api.studioIdeas(format.key, character.id, durationSec, charLimit, subject ?? undefined);
      setIdeas(res.ideas || []);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "ネタ提案に失敗しました", "error");
    } finally { setLoadingIdeas(false); }
  }

  async function selectIdea(idea: Idea) {
    setSelectedIdea(idea); setAngles([]); setSelectedAngle(null); setLoadingAngles(true); setStep("angles");
    try {
      const res = await api.studioAngles(idea.title, idea.hook, format!.key, character!.id, subject ?? undefined);
      setAngles(res.angles || []);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "切り口提案に失敗しました", "error");
    } finally { setLoadingAngles(false); }
  }

  async function generate(angle: Angle) {
    if (!format || !character || !selectedIdea) return;
    setSelectedAngle(angle); setStep("generating"); setGenerating(true); setRawPhase(""); setResult(""); setDraftId(null); setAlreadySaved(false);
    const token = typeof window !== "undefined" ? localStorage.getItem("yt_token") : null;
    const durationSec = format.mediaType === "video" ? paramVal : undefined;
    const charLimit = format.mediaType === "text" ? paramVal : undefined;
    try {
      const res = await fetch(`${API_BASE}/studio/generate/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ character_id: character.id, format: format.key, idea: selectedIdea.title, hook: angle.hook, duration_sec: durationSec, char_limit: charLimit, subject: subject ?? undefined }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({ detail: "エラーが発生しました" })); throw new Error(err.detail); }
      const rawDraftId = res.headers.get("X-Draft-Id");
      if (rawDraftId) setDraftId(Number(rawDraftId));
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "", voiced = "", phase: "raw" | "voiced" = "raw";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.error) throw new Error(evt.error);
            if (evt.phase === "voiced" && !evt.delta) { phase = "voiced"; }
            if (evt.delta) { if (phase === "raw") setRawPhase(p => p + evt.delta); else { voiced += evt.delta; setResult(voiced); } }
            if (evt.done) { setStep("result"); if (evt.draft_id) setDraftId(evt.draft_id); }
          } catch { /* ignore */ }
        }
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "生成に失敗しました", "error"); setStep("angles");
    } finally { setGenerating(false); }
  }

  async function handleSave() {
    if (!draftId) return;
    setSaving(true);
    try {
      await api.saveDraft(draftId, savedMemo || undefined);
      setAlreadySaved(true); setShowMemoInput(false);
      toast("コンテンツ案に保存しました", "success");
      onSave();
    } catch { toast("保存に失敗しました", "error"); } finally { setSaving(false); }
  }

  function restart() {
    setSubject(null); setStep("subject"); setFormat(null); setIdeas([]); setSelectedIdea(null);
    setAngles([]); setSelectedAngle(null); setResult(""); setRawPhase(""); setKeyword("");
    setDraftId(null); setAlreadySaved(false); setSavedMemo(""); setShowMemoInput(false);
  }

  if (!character) {
    return (
      <div className="card flex flex-col gap-3">
        <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>まず人格（キャラクター）を作りましょう</p>
        <p className="text-sm" style={{ color: "var(--muted)" }}>スタジオでは、あなたの人格データをもとにコンテンツの口調を自動で合わせます。</p>
        <a href="/creator/interview" className="btn-primary self-start">AIインタビューへ →</a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ステッパー */}
      <div className="flex items-center gap-0">
        {progressSteps.map((s, i) => {
          const done = i < stepIdx, current = i === stepIdx;
          return (
            <div key={s.key} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center gap-1 flex-shrink-0">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-colors"
                  style={{ background: done ? "var(--accent)" : current ? "var(--primary)" : "var(--border)", color: (done || current) ? "white" : "var(--muted)" }}>
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

      {/* STEP 0: 分野 */}
      {step === "subject" && (
        <div className="flex flex-col gap-4">
          <p className="font-bold" style={{ color: "var(--text)" }}>どの分野のコンテンツを作りますか？</p>
          <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
            {STUDIO_SUBJECT_OPTIONS.map(opt => (
              <button key={opt.key} onClick={() => { setSubject(opt.key); setStep("format"); }}
                className="card p-5 flex flex-col gap-2 text-left hover-lift" style={{ background: "var(--card)" }}>
                <span className="text-2xl">{opt.icon}</span>
                <span className="text-sm font-bold" style={{ color: "var(--primary)" }}>{opt.label}</span>
                <span className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>{opt.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STEP 1: フォーマット */}
      {step === "format" && (
        <div className="flex flex-col gap-4">
          {subject && (
            <div className="flex items-center justify-between px-3 py-2 rounded-xl" style={{ background: "color-mix(in srgb, var(--primary) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)" }}>
              <span className="text-sm font-bold flex items-center gap-1.5" style={{ color: "var(--primary)" }}>
                {STUDIO_SUBJECT_OPTIONS.find(o => o.key === subject)?.icon} {STUDIO_SUBJECT_OPTIONS.find(o => o.key === subject)?.label}
              </span>
              <button onClick={() => { setSubject(null); setStep("subject"); }} className="text-xs underline" style={{ color: "var(--muted)" }}>変更</button>
            </div>
          )}
          <p className="font-bold" style={{ color: "var(--text)" }}>どのフォーマットで投稿しますか？</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {FORMATS.map(f => (
              <button key={f.key} onClick={() => selectFormat(f)} className="card p-4 flex flex-col gap-2 text-left hover-lift" style={{ background: "var(--card)" }}>
                <span className="text-2xl">{f.icon}</span>
                <span className="text-sm font-bold" style={{ color: "var(--text)" }}>{f.label}</span>
                <span className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>{f.hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STEP 2: ネタ */}
      {step === "ideas" && format && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-bold" style={{ color: "var(--text)" }}><span className="text-lg mr-1">{format.icon}</span>{format.label} のネタを選ぶ</p>
              <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>AIがあなたの人格にあったネタを提案します</p>
            </div>
            <button onClick={() => setStep("format")} className="text-xs underline flex-shrink-0 mt-1" style={{ color: "var(--muted)" }}>変更</button>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
            <span className="text-sm font-bold" style={{ color: "var(--text)" }}>{format.mediaType === "video" ? "尺" : "文字数"}</span>
            <input type="number" value={paramVal} min={format.minVal} max={format.maxVal} onChange={e => setParamVal(Number(e.target.value))}
              className="w-24 text-sm px-2 py-1 rounded-lg text-center" style={{ background: "var(--bg)", border: "1.5px solid var(--border)", color: "var(--text)" }} />
            <span className="text-sm" style={{ color: "var(--muted)" }}>{format.unit}</span>
            {format.mediaType === "video" && paramVal >= 60 && <span className="text-xs" style={{ color: "var(--muted)" }}>（約{Math.round(paramVal / 60)}分）</span>}
          </div>
          <button onClick={fetchIdeas} disabled={loadingIdeas} className="btn-primary self-start disabled:opacity-50">
            {loadingIdeas ? "提案中…" : ideas.length > 0 ? "🔄 別のネタを提案する" : "✨ ネタを提案してもらう"}
          </button>
          {ideas.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold" style={{ color: "var(--muted)" }}>タップして選ぶ</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ideas.map((idea, i) => (
                  <button key={i} onClick={() => selectIdea(idea)} className="card p-4 text-left flex flex-col gap-2 hover-lift" style={{ background: "var(--card)" }}>
                    <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>{idea.title}</p>
                    <p className="text-xs leading-relaxed" style={{ color: "var(--text)" }}>「{idea.hook}」</p>
                    <p className="text-[11px] px-2 py-1 rounded-full self-start" style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--accent)" }}>{idea.why}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer" style={{ color: "var(--muted)" }}>自分でテーマを入力したい</summary>
            <div className="flex gap-2 mt-2">
              <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="例：仮定法過去完了"
                className="flex-1 text-sm px-3 py-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
              <button onClick={() => keyword.trim() && selectIdea({ title: keyword, hook: keyword, why: "手動入力" })} disabled={!keyword.trim()} className="btn-primary text-sm disabled:opacity-50">選択</button>
            </div>
          </details>
        </div>
      )}

      {/* STEP 3: 切り口 */}
      {step === "angles" && selectedIdea && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>選んだネタ</p>
              <p className="font-bold" style={{ color: "var(--text)" }}>{selectedIdea.title}</p>
            </div>
            <button onClick={() => setStep("ideas")} className="text-xs underline flex-shrink-0 mt-1" style={{ color: "var(--muted)" }}>変更</button>
          </div>
          <p className="font-bold" style={{ color: "var(--text)" }}>どの切り口で攻めますか？</p>
          {loadingAngles && <div className="flex flex-col gap-3">{[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-xl" style={{ background: "var(--card)", animation: "pulse 1.5s infinite" }} />)}</div>}
          {angles.map((angle, i) => (
            <button key={i} onClick={() => generate(angle)} className="card p-4 text-left flex flex-col gap-2 hover-lift" style={{ background: "var(--card)" }}>
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

      {/* STEP 4: 生成中 */}
      {(step === "generating" || (step === "result" && generating)) && (
        <div className="card flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="flex gap-1">{[0, 1, 2].map(i => <span key={i} className="w-2 h-2 rounded-full animate-bounce" style={{ background: "var(--accent)", animationDelay: `${i * 0.15}s` }} />)}</div>
            <p className="text-sm font-bold" style={{ color: "var(--text)" }}>
              {rawPhase && !result ? "素材を生成中…" : result ? "口調を変換中…" : "生成を開始しています…"}
            </p>
          </div>
          {rawPhase && !result && <p className="text-xs whitespace-pre-wrap leading-relaxed line-clamp-6" style={{ color: "var(--muted)" }}>{rawPhase}</p>}
          {result && <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text)" }}>{result}</p>}
        </div>
      )}

      {/* STEP 5: 結果 */}
      {step === "result" && result && (
        <div ref={resultRef} className="flex flex-col gap-4">
          <div className="card overflow-hidden p-0">
            <div className="px-5 py-3 flex items-center justify-between" style={{ background: "linear-gradient(135deg, var(--primary), var(--accent))" }}>
              <div>
                <p className="text-xs text-white/70">{format?.label} · {selectedIdea?.title}</p>
                <p className="text-sm font-bold text-white">{selectedAngle?.label}</p>
              </div>
              <button onClick={async () => { await navigator.clipboard.writeText(result); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.2)", color: "white" }}>
                {copied ? "✓ コピー済み" : "コピー"}
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text)" }}>{result}</p>
            </div>
            {format?.mediaType === "text" && <div className="px-5 pb-3"><p className="text-xs" style={{ color: "var(--muted)" }}>{result.length} 文字</p></div>}
          </div>

          {/* 保存ボタン */}
          <div className="card p-4 flex flex-col gap-3" style={{ border: "1.5px solid var(--primary)" }}>
            {alreadySaved ? (
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 18 }}>✅</span>
                <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>コンテンツ案に保存済み</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold" style={{ color: "var(--text)" }}>📁 コンテンツ案として保存</p>
                  <button onClick={() => setShowMemoInput(v => !v)} className="text-xs underline" style={{ color: "var(--muted)" }}>
                    {showMemoInput ? "メモを閉じる" : "+ メモを追加"}
                  </button>
                </div>
                {showMemoInput && (
                  <textarea className="input w-full text-sm" rows={2} placeholder="使用予定・メモなど（任意）"
                    value={savedMemo} onChange={e => setSavedMemo(e.target.value)} style={{ resize: "none" }} />
                )}
                <button onClick={handleSave} disabled={saving} className="btn-primary self-start disabled:opacity-50">
                  {saving ? "保存中…" : "コンテンツ案に保存する"}
                </button>
              </>
            )}
          </div>

          <div className="flex gap-3 flex-wrap">
            <button onClick={() => generate(selectedAngle!)} disabled={generating} className="btn-ghost disabled:opacity-50">🔄 再生成</button>
            <button onClick={() => { setStep("angles"); setResult(""); setRawPhase(""); }} className="btn-ghost">← 切り口を変える</button>
            <button onClick={restart} className="btn-ghost">✦ 最初から</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── コンテンツ案パネル ────────────────────────────────────────────
function DraftsPanel({ refreshKey }: { refreshKey: number }) {
  const [drafts, setDrafts] = useState<SavedDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    api.listSavedDrafts().then(setDrafts).catch(() => {}).finally(() => setLoading(false));
  }, [refreshKey]);

  async function handleDelete(id: number) {
    if (!confirm("このコンテンツ案を削除しますか？")) return;
    await api.deleteDraft(id).catch(() => {});
    setDrafts(prev => prev.filter(d => d.id !== id));
    toast("削除しました", "success");
  }

  if (loading) return <div style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>読み込み中…</div>;
  if (drafts.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "64px 0", color: "var(--muted)" }}>
        <p style={{ fontSize: 40, marginBottom: 12 }}>📁</p>
        <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>保存済みのコンテンツ案はありません</p>
        <p style={{ fontSize: 13 }}>「コンテンツ作成」で生成した内容を保存すると、ここに表示されます。</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-bold" style={{ color: "var(--muted)" }}>{drafts.length}件のコンテンツ案</p>
      {drafts.map(d => (
        <div key={d.id} className="card overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: expanded === d.id ? "1px solid var(--border)" : "none" }}>
            <button className="flex-1 text-left flex flex-col gap-1" onClick={() => setExpanded(expanded === d.id ? null : d.id)}>
              <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{d.theme}</p>
              <div className="flex items-center gap-2 flex-wrap">
                {d.format && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--muted)" }}>{FORMAT_LABEL[d.format] ?? d.format}</span>}
                {d.memo && <span className="text-xs" style={{ color: "var(--muted)" }}>📝 {d.memo}</span>}
                {d.updated_at && <span className="text-xs" style={{ color: "var(--muted)" }}>{new Date(d.updated_at).toLocaleDateString("ja-JP")}</span>}
              </div>
            </button>
            <div className="flex items-center gap-2 flex-shrink-0">
              {d.voiced_content && (
                <button onClick={() => { navigator.clipboard.writeText(d.voiced_content!); toast("コピーしました", "success"); }}
                  className="text-xs px-3 py-1 rounded-full" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--muted)", cursor: "pointer" }}>
                  コピー
                </button>
              )}
              <button onClick={() => handleDelete(d.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 18, padding: 4 }}>×</button>
            </div>
          </div>
          {expanded === d.id && d.voiced_content && (
            <div className="px-4 py-4">
              <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text)" }}>{d.voiced_content}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── マーケティング戦略パネル ──────────────────────────────────────
function MarketingPanel() {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatting, setChatting] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getMarketingStrategy().then((d: { content: string }) => setContent(d.content || "")).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatHistory]);

  async function handleSave() {
    setSaving(true);
    try { await api.updateMarketingStrategy(content); toast("保存しました", "success"); }
    catch { toast("保存に失敗しました", "error"); } finally { setSaving(false); }
  }

  async function handleChat(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim() || chatting) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatHistory(prev => [...prev, { role: "user", text: msg }]);
    setChatting(true);
    try {
      const res = await api.marketingStrategyChat(msg, content || undefined);
      setChatHistory(prev => [...prev, { role: "ai", text: res.reply }]);
    } catch { toast("AIの応答に失敗しました", "error"); } finally { setChatting(false); }
  }

  if (loading) return <div style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>読み込み中…</div>;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold" style={{ color: "var(--text)" }}>📊 マーケティング戦略メモ</p>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-xs disabled:opacity-50" style={{ padding: "4px 14px" }}>
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
        <textarea
          className="input w-full text-sm"
          rows={10}
          placeholder={"ターゲット層・差別化ポイント・発信チャネル・投稿頻度など、\nマーケティング戦略をメモしておきましょう。\n\n例：\n## ターゲット\n英語学習を始めたい社会人 25-35歳\n\n## 差別化\n挫折経験のある人向けに「続けられる」メソッドを発信"}
          value={content}
          onChange={e => setContent(e.target.value)}
          style={{ resize: "vertical", lineHeight: 1.7 }}
        />
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>マークダウン形式で書くと読みやすくなります。コンテンツ作成時にこの戦略が参照されます。</p>
      </div>

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 20 }}>
        <p className="text-sm font-bold mb-3" style={{ color: "var(--text)" }}>🤖 AIアドバイザーに相談</p>
        <div className="flex flex-col gap-3" style={{ minHeight: 120, maxHeight: 320, overflowY: "auto", marginBottom: 12, padding: "0 2px" }}>
          {chatHistory.length === 0 && (
            <div style={{ padding: "24px 0", textAlign: "center", color: "var(--muted)" }}>
              <p className="text-sm">戦略についてAIに相談できます。</p>
              <div className="flex flex-wrap gap-2 justify-center mt-3">
                {["ターゲット設定のアドバイスをください", "どのSNSが効果的ですか？", "差別化ポイントの見つけ方は？"].map(s => (
                  <button key={s} onClick={() => setChatInput(s)} className="text-xs px-3 py-1.5 rounded-full"
                    style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--muted)", cursor: "pointer" }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {chatHistory.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div style={{
                maxWidth: "85%", padding: "10px 14px", borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                background: m.role === "user" ? "var(--primary)" : "var(--card)",
                color: m.role === "user" ? "white" : "var(--text)",
                border: m.role === "ai" ? "1px solid var(--border)" : "none",
                fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap",
              }}>
                {m.text}
              </div>
            </div>
          ))}
          {chatting && (
            <div className="flex justify-start">
              <div className="flex gap-1 px-4 py-3 rounded-2xl" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                {[0, 1, 2].map(i => <span key={i} className="w-2 h-2 rounded-full animate-bounce" style={{ background: "var(--muted)", animationDelay: `${i * 0.15}s` }} />)}
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
        <form onSubmit={handleChat} className="flex gap-2">
          <input className="input flex-1 text-sm" placeholder="AIに相談する…" value={chatInput} onChange={e => setChatInput(e.target.value)} />
          <button type="submit" disabled={chatting || !chatInput.trim()} className="btn-primary disabled:opacity-50" style={{ padding: "0 16px" }}>送信</button>
        </form>
      </div>
    </div>
  );
}

// ── メインページ ─────────────────────────────────────────────────
export default function StudioPage() {
  const { me, loading } = useRoleGuard(["creator", "admin"]);
  const router = useRouter();
  const [character, setCharacter] = useState<{ id: number; name: string } | null>(null);
  const [loadingCharacter, setLoadingCharacter] = useState(true);
  const [panel, setPanel] = useState<Panel>("create");
  const [draftsRefreshKey, setDraftsRefreshKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    api.listMyCharacters().then(list => { if (list.length > 0) setCharacter(list[0]); }).catch(() => {}).finally(() => setLoadingCharacter(false));
    if (me?.role !== "admin") {
      api.getMyCreatorProfile().then(p => {
        if (p.status !== "active") { toast("クリエイター申請が承認されるまでスタジオは利用できません", "error"); router.replace("/dashboard"); }
      }).catch(() => {});
    }
  }, [loading, me, router]);

  if (loading || loadingCharacter) return <Skeleton />;

  const NAV_ITEMS: { key: Panel; icon: string; label: string }[] = [
    { key: "create", icon: "✍️", label: "コンテンツ作成" },
    { key: "drafts", icon: "📁", label: "コンテンツ案" },
    { key: "marketing", icon: "📊", label: "マーケティング戦略" },
  ];

  return (
    <div className="studio-theme min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" title="AIコンテンツ生成スタジオ" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6" style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>

        {/* サイドバー（デスクトップ） */}
        <aside className="hidden lg:flex flex-col gap-2 flex-shrink-0" style={{ width: 200, position: "sticky", top: 72 }}>
          <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: "var(--muted)" }}>メニュー</p>
          {NAV_ITEMS.map(item => (
            <button key={item.key} onClick={() => setPanel(item.key)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10,
                textAlign: "left", fontSize: 14, fontWeight: panel === item.key ? 800 : 500, cursor: "pointer",
                background: panel === item.key ? "var(--primary)" : "transparent",
                color: panel === item.key ? "white" : "var(--text)",
                border: "none", transition: "all 0.15s",
              }}>
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </aside>

        {/* モバイル タブ */}
        <div className="lg:hidden w-full" style={{ marginBottom: 16 }}>
          <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {NAV_ITEMS.map(item => (
              <button key={item.key} onClick={() => setPanel(item.key)}
                className="whitespace-nowrap flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold"
                style={{
                  background: panel === item.key ? "var(--primary)" : "var(--card)",
                  color: panel === item.key ? "white" : "var(--muted)",
                  border: `1.5px solid ${panel === item.key ? "var(--primary)" : "var(--border)"}`,
                }}>
                {item.icon} {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* メインコンテンツ */}
        <main style={{ flex: 1, minWidth: 0 }}>
          {panel === "create" && (
            <CreatePanel character={character} onSave={() => setDraftsRefreshKey(k => k + 1)} />
          )}
          {panel === "drafts" && (
            <DraftsPanel refreshKey={draftsRefreshKey} />
          )}
          {panel === "marketing" && (
            <MarketingPanel />
          )}
        </main>
      </div>
    </div>
  );
}
