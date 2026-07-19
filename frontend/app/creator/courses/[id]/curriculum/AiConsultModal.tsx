"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";

const AI_SITES = [
  { label: "ChatGPT", url: "https://chatgpt.com/" },
  { label: "Claude", url: "https://claude.ai/" },
  { label: "Gemini", url: "https://gemini.google.com/" },
] as const;

type WalkthroughFields = {
  purpose: string;
  target_audience: string;
  topics: string;
  style: string;
  concerns: string;
  existing_videos: string;
};

export function AiConsultModal({ courseId, initial, onClose }: {
  courseId: number;
  initial: {
    curriculum_purpose: string | null;
    curriculum_target_audience: string | null;
    curriculum_topics: string | null;
    curriculum_style: string | null;
    curriculum_concerns: string | null;
    curriculum_existing_videos: string | null;
  };
  onClose: () => void;
}) {
  const [fields, setFields] = useState<WalkthroughFields>({
    purpose: initial.curriculum_purpose ?? "",
    target_audience: initial.curriculum_target_audience ?? "",
    topics: initial.curriculum_topics ?? "",
    style: initial.curriculum_style ?? "",
    concerns: initial.curriculum_concerns ?? "",
    existing_videos: initial.curriculum_existing_videos ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  function update<K extends keyof WalkthroughFields>(key: K, value: string) {
    setFields(f => ({ ...f, [key]: value }));
  }

  async function handleGeneratePrompt() {
    setSaving(true);
    try {
      await api.updateCurriculumMeta(courseId, fields);
      const res = await api.getCurriculumPrompt(courseId);
      setPrompt(res.prompt);
      setShowPrompt(true);
      toast("プロンプトを生成しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "生成に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        className="w-full flex flex-col"
        style={{ maxWidth: 560, maxHeight: "85vh", background: "var(--card)", borderRadius: 20, border: "1px solid var(--border)", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-bold text-lg" style={{ color: "var(--text)" }}>🤖 AIに相談</h2>
          <button onClick={onClose} style={{ fontSize: 20, lineHeight: 1, color: "var(--muted)" }}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            入力内容をもとにAI壁打ち用のプロンプトを生成します。空欄でもOKです。
          </p>

          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>講座の目的・ゴール</label>
            <textarea rows={2} value={fields.purpose} onChange={e => update("purpose", e.target.value)} placeholder="例：TOEIC800点を3ヶ月で達成させる" className="w-full" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>対象者</label>
            <textarea rows={2} value={fields.target_audience} onChange={e => update("target_audience", e.target.value)} placeholder="例：現在600点前後・3ヶ月後に受験予定の社会人" className="w-full" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>扱いたいトピック・要素</label>
            <textarea rows={2} value={fields.topics} onChange={e => update("topics", e.target.value)} placeholder="例：リスニング強化、文法パターン、語彙1000語" className="w-full" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>講師としてのスタイル・こだわり</label>
            <textarea rows={2} value={fields.style} onChange={e => update("style", e.target.value)} placeholder="例：実践重視、理論よりも使える英語、毎日短く継続" className="w-full" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>まだ迷っている・決めきれていない点</label>
            <textarea rows={2} value={fields.concerns} onChange={e => update("concerns", e.target.value)} placeholder="例：リーディングとリスニングどちらを先にするか迷っている" className="w-full" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>持っている動画（任意）</label>
            <textarea rows={3} value={fields.existing_videos} onChange={e => update("existing_videos", e.target.value)} placeholder={"例：\nhttps://youtu.be/xxx - リスニング基礎\nhttps://youtu.be/yyy - 文法入門"} className="w-full" />
          </div>

          {!showPrompt ? (
            <button onClick={handleGeneratePrompt} disabled={saving} className="btn-primary">
              {saving ? "生成中…" : "プロンプトを生成する"}
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="relative">
                <pre
                  className="text-xs whitespace-pre-wrap rounded-xl p-4 leading-relaxed"
                  style={{ background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border, #e5e7eb)", fontFamily: "inherit" }}
                >
                  {prompt}
                </pre>
                <button
                  onClick={handleCopy}
                  className="absolute top-3 right-3 text-xs px-3 py-1.5 rounded-lg font-medium transition"
                  style={{ background: copied ? "var(--accent)" : "var(--ink)", color: "#fff" }}
                >
                  {copied ? "コピーしました！" : "コピー"}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {AI_SITES.map(site => (
                  <a
                    key={site.url}
                    href={site.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold px-3 py-2 rounded-lg transition"
                    style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" }}
                  >
                    {site.label} を開く ↗
                  </a>
                ))}
              </div>
              <button onClick={handleGeneratePrompt} disabled={saving} className="btn-secondary text-sm self-start">
                {saving ? "更新中…" : "入力内容を保存してプロンプトを再生成"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
