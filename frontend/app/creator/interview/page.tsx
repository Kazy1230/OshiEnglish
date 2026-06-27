"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { AppHeader } from "@/components/AppHeader";

type ChatItem = { role: "ai" | "creator"; text: string };

const BASE_TYPE_PRESETS: { value: string; label: string; description: string }[] = [
  { value: "共感型", label: "共感型", description: "まず気持ちに寄り添い、一緒に考える" },
  { value: "指導型", label: "指導型", description: "正しいやり方を丁寧に、論理的に教える" },
  { value: "激励型", label: "激励型", description: "とにかく背中を押す、ポジティブ全開" },
  { value: "厳格型", label: "厳格型", description: "妥協なく高い基準を求める、本気でぶつかる" },
];

export default function CreatorInterviewPage() {
  const router = useRouter();
  const { loading } = useRoleGuard(["creator", "admin"]);
  const [step, setStep] = useState<"preset" | "interview">("preset");
  const [history, setHistory] = useState<ChatItem[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [answer, setAnswer] = useState("");
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [starting, setStarting] = useState(false);

  function beginInterview(baseType?: string) {
    setStarting(true);
    setStep("interview");
    api.startInterview(baseType).then(res => {
      setProgress(res.progress);
      if (res.status === "completed") {
        setCompleted(true);
      } else {
        setHistory([{ role: "ai", text: res.question }]);
      }
    }).catch((err: unknown) => {
      toast(err instanceof Error ? err.message : "インタビューの開始に失敗しました", "error");
    }).finally(() => setStarting(false));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim()) return;
    setSubmitting(true);
    const myAnswer = answer.trim();
    setHistory(h => [...h, { role: "creator", text: myAnswer }]);
    setAnswer("");
    try {
      const res = await api.submitInterviewAnswer(myAnswer);
      setProgress(res.progress);
      if (res.status === "completed") {
        setCompleted(true);
      } else {
        setHistory(h => [...h, { role: "ai", text: res.question }]);
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "送信に失敗しました", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGenerateProfile() {
    setSubmitting(true);
    try {
      await api.generatePersonalityProfile();
      toast("人格プロファイルを生成しました", "success");
      router.push("/creator/profile");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "プロファイル生成に失敗しました", "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Skeleton />;

  if (step === "preset") {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg)" }}>
        <AppHeader role="creator" backHref="/dashboard" backLabel="ダッシュボード" title="AIインタビュー（人格収集）" />
        <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4">
          <p className="text-sm" style={{ color: "var(--text)" }}>
            まず、あなたの指導スタイルに近いものを選んでください。この後のAIインタビューでさらに細かく調整していきます。
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {BASE_TYPE_PRESETS.map(p => (
              <button
                key={p.value}
                className="card text-left flex flex-col gap-1 hover:shadow-md transition-shadow"
                onClick={() => beginInterview(p.value)}
              >
                <p className="font-bold" style={{ color: "var(--primary)" }}>{p.label}</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>{p.description}</p>
              </button>
            ))}
          </div>
          <button className="text-xs underline self-start" style={{ color: "var(--accent)" }} onClick={() => beginInterview()}>
            プリセットを選ばずにインタビューだけで進める
          </button>
        </main>
      </div>
    );
  }

  if (starting) return <Skeleton />;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" backHref="/dashboard" backLabel="ダッシュボード" title="AIインタビュー（人格収集）" />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4">
        {progress && <p className="text-xs self-end" style={{ color: "var(--muted)" }}>{progress.current}/{progress.total}問目</p>}
        <div className="flex flex-col gap-3">
          {history.map((item, i) => (
            <div key={i} className={`card max-w-[85%] ${item.role === "creator" ? "self-end" : "self-start"}`}
              style={{ background: item.role === "creator" ? "var(--accent)" : "var(--card)", color: item.role === "creator" ? "white" : "var(--text)" }}>
              <p className="text-sm whitespace-pre-wrap">{item.text}</p>
            </div>
          ))}
        </div>

        {completed ? (
          <div className="card flex flex-col gap-3 items-start">
            <p className="text-sm" style={{ color: "var(--text)" }}>
              インタビューが完了しました。回答内容から人格プロファイルを生成しましょう。
            </p>
            <button className="btn-primary" disabled={submitting} onClick={handleGenerateProfile}>
              {submitting ? "生成中…" : "人格プロファイルを生成する"}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex gap-2">
            <textarea rows={3} value={answer} onChange={e => setAnswer(e.target.value)}
              placeholder="ここに回答を入力してください" className="flex-1" />
            <button type="submit" className="btn-primary px-4" disabled={submitting || !answer.trim()}>
              {submitting ? "…" : "送信"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
