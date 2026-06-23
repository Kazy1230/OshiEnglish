"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";

type CharacterSummary = { id: number; name: string };

export default function NewCoursePage() {
  const router = useRouter();
  const { loading } = useRoleGuard(["creator", "admin"]);
  const [character, setCharacter] = useState<CharacterSummary | null>(null);
  const [loadingCharacter, setLoadingCharacter] = useState(true);
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [targetLearner, setTargetLearner] = useState("");
  const [intensity, setIntensity] = useState("");
  const [tierAPrice, setTierAPrice] = useState("1480");
  const [tierBPrice, setTierBPrice] = useState("3980");
  const [enableTierB, setEnableTierB] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    api.listMyCharacters().then(list => setCharacter(list[0] ?? null)).catch(() => {}).finally(() => setLoadingCharacter(false));
  }, [loading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!character) { toast("先にAIインタビューを完了して人格(キャラクター)を作成してください", "error"); return; }
    setSubmitting(true);
    try {
      const course = await api.createCourse({
        title,
        goal,
        target_learner: targetLearner,
        intensity,
        price: 0,
        is_free: false,
        tier_a_price: Number(tierAPrice),
        tier_b_price: enableTierB ? Number(tierBPrice) : null,
      });
      toast("コースを作成しました。次に90日分のコンテンツを生成しましょう。", "success");
      router.push(`/creator/courses/${course.id}/calendar`);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "作成に失敗しました", "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || loadingCharacter) return <Skeleton />;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="px-4 sm:px-6 py-4 flex items-center gap-3" style={{ background: "var(--primary)" }}>
        <Link href="/dashboard" className="text-white/80 text-sm hover:text-white">← ダッシュボード</Link>
        <h1 className="text-white font-black text-lg">90日伴走コース新規作成</h1>
      </header>
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <form onSubmit={handleSubmit} className="card flex flex-col gap-4">
          {character ? (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              🎭 このコースは「<span className="font-bold" style={{ color: "var(--primary)" }}>{character.name}</span>」として公開されます。
            </p>
          ) : (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              先に<a href="/creator/interview" style={{ color: "var(--accent)" }}>AIインタビュー</a>を完了して人格(キャラクター)を作成してください。
            </p>
          )}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>コース名 *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} required placeholder="例：TOEIC800達成 90日伴走コース" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>ゴール *</label>
            <input value={goal} onChange={e => setGoal(e.target.value)} required placeholder="例：TOEIC800点を取得する" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>対象者 *</label>
            <input value={targetLearner} onChange={e => setTargetLearner(e.target.value)} required placeholder="例：現在600点前後・3ヶ月後に受験予定" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>学習強度 *</label>
            <input value={intensity} onChange={e => setIntensity(e.target.value)} required placeholder="例：1日30〜60分" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>Tier A（AIのみ伴走）月額 *</label>
            <input type="number" min="980" max="1980" value={tierAPrice} onChange={e => setTierAPrice(e.target.value)} required />
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>980〜1,980円/月の範囲で指定してください</p>
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>
              <input type="checkbox" checked={enableTierB} onChange={e => setEnableTierB(e.target.checked)} />
              Tier B（AI＋クリエイター添削）を提供する
            </label>
            {enableTierB && (
              <>
                <input type="number" min="2980" max="5000" value={tierBPrice} onChange={e => setTierBPrice(e.target.value)} required />
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>2,980〜5,000円/月の範囲で指定してください</p>
              </>
            )}
          </div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            ※ 90日分の学習内容は次の画面でAIが自動生成します。生成には<a href="/creator/profile" style={{ color: "var(--accent)" }}>人格プロファイル</a>が必要です。
          </p>
          <button type="submit" className="btn-primary text-center" disabled={submitting || !character}>
            {submitting ? "作成中…" : "作成して次へ"}
          </button>
        </form>
      </main>
    </div>
  );
}
