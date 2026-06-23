"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { LogoutButton } from "@/components/LogoutButton";

type ChatItem = { role: "ai" | "creator"; text: string };

export default function CreatorInterviewPage() {
  const router = useRouter();
  const { loading } = useRoleGuard(["creator", "admin"]);
  const [history, setHistory] = useState<ChatItem[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [answer, setAnswer] = useState("");
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    if (loading) return;
    api.startInterview().then(res => {
      setProgress(res.progress);
      if (res.status === "completed") {
        setCompleted(true);
      } else {
        setHistory([{ role: "ai", text: res.question }]);
      }
    }).catch((err: unknown) => {
      toast(err instanceof Error ? err.message : "インタビューの開始に失敗しました", "error");
    }).finally(() => setStarting(false));
  }, [loading]);

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

  if (loading || starting) return <Skeleton />;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="px-4 sm:px-6 py-4 flex items-center justify-between" style={{ background: "var(--primary)" }}>
        <h1 className="text-white font-black text-lg">AIインタビュー（人格収集）</h1>
        <div className="flex items-center gap-3">
          {progress && <span className="text-white/80 text-sm">{progress.current}/{progress.total}問目</span>}
          <LogoutButton variant="onColor" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4">
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
