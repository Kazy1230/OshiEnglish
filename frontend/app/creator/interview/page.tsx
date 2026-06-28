"use client";
import { AppHeader } from "@/components/AppHeader";
import { Skeleton } from "@/components/Skeleton";
import { toast } from "@/components/Toast";
import { api } from "@/lib/api";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type ChatItem = { role: "learner" | "creator"; text: string };

const GENDER_PRESETS: { value: string; label: string; icon: string }[] = [
  { value: "男性", label: "男性", icon: "👨" },
  { value: "女性", label: "女性", icon: "👩" },
  { value: "中性的", label: "中性的", icon: "🧑" },
];

const BASE_TYPE_PRESETS: { value: string; label: string; icon: string; description: string }[] = [
  { value: "共感型", label: "共感型", icon: "🤝", description: "まず気持ちに寄り添い、一緒に考える" },
  { value: "指導型", label: "指導型", icon: "📐", description: "正しいやり方を丁寧に、論理的に教える" },
  { value: "激励型", label: "激励型", icon: "🔥", description: "とにかく背中を押す、ポジティブ全開" },
  { value: "厳格型", label: "厳格型", icon: "🎯", description: "妥協なく高い基準を求める、本気でぶつかる" },
];

export default function CreatorInterviewPage() {
  const router = useRouter();
  const { loading } = useRoleGuard(["creator", "admin"]);
  const [step, setStep] = useState<"checking" | "done" | "gender" | "preset" | "interview">("checking");
  const [gender, setGender] = useState<string | undefined>(undefined);
  const [history, setHistory] = useState<ChatItem[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [answer, setAnswer] = useState("");
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [starting, setStarting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading) return;
    api.getPersonalityProfile()
      .then(() => setStep("done"))
      .catch(() => setStep("gender"));
  }, [loading]);

  function beginInterview(baseType?: string) {
    setStarting(true);
    setStep("interview");
    api.startInterview(baseType, gender).then(res => {
      setProgress(res.progress);
      if (res.status === "completed") {
        setCompleted(true);
      } else {
        setHistory([{ role: "learner", text: res.question }]);
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
        setHistory(h => [...h, { role: "learner", text: res.question }]);
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, completed]);

  if (loading || step === "checking") return <Skeleton />;

  if (step === "done") {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg)" }}>
        <AppHeader role="creator" backHref="/dashboard" backLabel="ダッシュボード" title="AIインタビュー（人格収集）" />
        <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10 flex flex-col gap-4 items-center text-center">
          <span className="text-4xl">✅</span>
          <h1 className="text-xl font-black" style={{ color: "var(--text)" }}>AIインタビューは完了済みです</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            このインタビューは初回のみです。内容を見直したい場合は人格プロファイルを編集してください。
          </p>
          <Link href="/creator/profile" className="btn-primary">人格プロファイルを編集する</Link>
        </main>
      </div>
    );
  }

  if (step === "gender") {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg)" }}>
        <AppHeader role="creator" backHref="/dashboard" backLabel="ダッシュボード" title="AIインタビュー（人格収集）" />

        <section className="gradient-hero relative overflow-hidden px-4 sm:px-6 py-10 sm:py-12 text-center">
          <div className="pointer-events-none absolute -top-10 -right-10 w-48 h-48 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} />
          <div className="relative max-w-2xl mx-auto">
            <span className="pill mb-3" style={{ background: "rgba(255,255,255,0.16)", color: "white" }}>🎭 あなたの人格をAIに伝える</span>
            <h1 className="text-white text-2xl sm:text-3xl font-black tracking-tight">キャラクターの性別を選んでください</h1>
            <p className="text-white/85 text-sm mt-2">
              一人称や口調（俺・私・〜だよ・〜だね等）に反映されます。後から変更もできます。
            </p>
          </div>
        </section>

        <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {GENDER_PRESETS.map(g => (
              <button
                key={g.value}
                className="card hover-lift shadow-soft text-center flex flex-col items-center gap-2 py-6"
                onClick={() => { setGender(g.value); setStep("preset"); }}
              >
                <span className="text-3xl">{g.icon}</span>
                <p className="font-black" style={{ color: "var(--primary)" }}>{g.label}</p>
              </button>
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (step === "preset") {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg)" }}>
        <AppHeader role="creator" backHref="/dashboard" backLabel="ダッシュボード" title="AIインタビュー（人格収集）" />

        <section className="gradient-hero relative overflow-hidden px-4 sm:px-6 py-10 sm:py-12 text-center">
          <div className="pointer-events-none absolute -top-10 -right-10 w-48 h-48 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} />
          <div className="relative max-w-2xl mx-auto">
            <span className="pill mb-3" style={{ background: "rgba(255,255,255,0.16)", color: "white" }}>🎭 あなたの人格をAIに伝える</span>
            <h1 className="text-white text-2xl sm:text-3xl font-black tracking-tight">指導スタイルを教えてください</h1>
            <p className="text-white/85 text-sm mt-2">
              まず近いタイプを選んでください。この後の会話シミュレーションで、さらに細かくあなたらしさを調整していきます。
            </p>
          </div>
        </section>

        <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {BASE_TYPE_PRESETS.map(p => (
              <button
                key={p.value}
                className="card hover-lift shadow-soft text-left flex items-start gap-3"
                onClick={() => beginInterview(p.value)}
              >
                <span className="text-2xl flex-shrink-0">{p.icon}</span>
                <div>
                  <p className="font-black" style={{ color: "var(--primary)" }}>{p.label}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{p.description}</p>
                </div>
              </button>
            ))}
          </div>
          <button className="text-xs underline self-center mt-1" style={{ color: "var(--accent)" }} onClick={() => beginInterview()}>
            プリセットを選ばずに会話シミュレーションだけで進める
          </button>
        </main>
      </div>
    );
  }

  if (starting) return <Skeleton />;

  return (
    <div className="h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" backHref="/dashboard" backLabel="ダッシュボード" title="AIインタビュー（人格収集）" />

      <div className="flex items-center gap-3 px-4 sm:px-6 py-3 flex-shrink-0" style={{ background: "linear-gradient(135deg, var(--primary), var(--accent))" }}>
        <span className="text-xl">🎭</span>
        <div className="flex-1">
          <p className="text-xs font-bold text-white">学習者になりきったAIとの会話シミュレーション</p>
          {progress && (
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.3)" }}>
                <div className="h-1.5 rounded-full" style={{ background: "white", width: `${Math.round((progress.current / progress.total) * 100)}%` }} />
              </div>
              <span className="text-xs whitespace-nowrap text-white/90">{progress.current}/{progress.total}問目</span>
            </div>
          )}
        </div>
      </div>

      <main className="flex-1 min-h-0 max-w-2xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4 overflow-y-auto">
        <p className="text-xs text-center" style={{ color: "var(--muted)" }}>
          実際にあなたのコースを受けている学習者だと想像して、本当に話しかけるように返信してください。
        </p>
        <p className="text-xs text-center" style={{ color: "var(--muted)" }}>
          学習者からこう聞かれました。あなたならどう返しますか？
        </p>
        <br />

        {history.map((item, i) => (
          item.role === "learner" ? (
            <div key={i} className="flex items-start gap-2 max-w-[85%] self-start">
              <span className="w-8 h-8 rounded-full flex items-center justify-center text-base flex-shrink-0" style={{ background: "var(--example-bg, #eee)" }}>🧑‍🎓</span>
              <div className="rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm whitespace-pre-wrap" style={{ background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)" }}>
                {item.text}
              </div>
            </div>
          ) : (
            <div key={i} className="self-end max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm whitespace-pre-wrap" style={{ background: "var(--primary)", color: "white" }}>
              {item.text}
            </div>
          )
        ))}

        {completed && (
          <div className="card flex flex-col gap-3 items-start mt-2">
            <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>🎉 会話シミュレーションが完了しました</p>
            <p className="text-sm" style={{ color: "var(--text)" }}>
              あなたの返答内容から、口調・励まし方・指導哲学を反映した人格プロファイルを生成します。
            </p>
            <button className="btn-primary" disabled={submitting} onClick={handleGenerateProfile}>
              {submitting ? "生成中…" : "人格プロファイルを生成する"}
            </button>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      {!completed && (
        <form onSubmit={handleSubmit} className="border-t px-4 sm:px-6 py-3 flex gap-2 flex-shrink-0" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
          <textarea
            rows={2}
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            placeholder="この学習者に、実際に話しかけるように返信してください…"
            className="flex-1"
          />
          <button type="submit" className="btn-primary px-4 self-end" disabled={submitting || !answer.trim()}>
            {submitting ? "…" : "送信"}
          </button>
        </form>
      )}
    </div>
  );
}
