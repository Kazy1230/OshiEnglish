"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { AppHeader } from "@/components/AppHeader";

type CharacterSummary = { id: number; name: string };


export default function NewCoursePage() {
  const router = useRouter();
  const { me, loading } = useRoleGuard(["creator", "admin"]);
  const [character, setCharacter] = useState<CharacterSummary | null>(null);
  const [loadingCharacter, setLoadingCharacter] = useState(true);

  const [subject, setSubject] = useState("");
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [category, setCategory] = useState("");
  const [targetLearner, setTargetLearner] = useState("");
  const [intensity, setIntensity] = useState("");
  const [pace, setPace] = useState("標準");
  const [tierAPrice, setTierAPrice] = useState("1480");
  const [tierBPrice, setTierBPrice] = useState("3980");
  const [enableTierB, setEnableTierB] = useState(true);
  const [isFree, setIsFree] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    api.listMyCharacters().then(list => setCharacter(list[0] ?? null)).catch(() => {}).finally(() => setLoadingCharacter(false));
    if (me?.role !== "admin") {
      api.getMyCreatorProfile().then(p => {
        if (p.status !== "active") {
          toast("クリエイター申請が承認されるまでコースを作成できません", "error");
          router.replace("/dashboard");
        }
      }).catch(() => {});
    }
  }, [loading, me, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!character) { toast("先にAIインタビューを完了して人格(キャラクター)を作成してください", "error"); return; }
    if (!subject.trim()) { toast("分野を入力してください", "error"); return; }
    setSubmitting(true);
    try {
      const course = await api.createCourse({
        title,
        goal,
        subject,
        category: category || null,
        target_learner: targetLearner,
        intensity,
        pace,
        price: 0,
        is_free: isFree,
        tier_a_price: isFree ? null : Number(tierAPrice),
        tier_b_price: enableTierB ? Number(tierBPrice) : null,
      });
      toast("コースを作成しました。次に使用する教材を設定しましょう。", "success");
      router.push(`/creator/courses/${course.id}/textbooks`);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "作成に失敗しました", "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || loadingCharacter) return <Skeleton />;

  return (
    <div className="creator-theme min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" title="30日伴走コース新規作成" />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
          <form onSubmit={handleSubmit} className="card flex flex-col gap-4">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>分野 *</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} required placeholder="例: マイクラ建築、料理、ヨガ、TOEIC、Python" />
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>どんなニッチな分野でも入力できます</p>
            </div>

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
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>カテゴリ（任意）</label>
              <input value={category} onChange={e => setCategory(e.target.value)} placeholder="例: 初心者向け、ビジネス英語（任意）" />
            </div>

            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>コース名 *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} required placeholder="例：TOEIC800達成 30日伴走コース" />
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
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>進行速度 *</label>
              <select value={pace} onChange={e => setPace(e.target.value)} required>
                <option value="ゆっくり">ゆっくり（無理なく着実に）</option>
                <option value="標準">標準</option>
                <option value="速め">速め（短期集中）</option>
              </select>
            </div>
            <div>
              <label className="flex items-center gap-2 text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>
                <input type="checkbox" checked={isFree} onChange={e => setIsFree(e.target.checked)} />
                無料コースにする
              </label>
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                ※ 無料コースはTier A（AIのみ伴走）を提供できません。Tier B（AI＋クリエイター添削）の有料オプションは併用できます。
              </p>
            </div>
            {!isFree && (
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>Tier A（AIのみ伴走）月額 *</label>
                <input type="number" min="980" max="1980" value={tierAPrice} onChange={e => setTierAPrice(e.target.value)} required />
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>980〜1,980円/月の範囲で指定してください</p>
              </div>
            )}
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
              ※ 次の画面で使用する教材を設定し、30日分の学習内容をAIが自動生成します。生成には<a href="/creator/profile" style={{ color: "var(--accent)" }}>人格プロファイル</a>が必要です。
            </p>
            <button type="submit" className="btn-primary text-center" disabled={submitting || !character}>
              {submitting ? "作成中…" : "作成して次へ（教材を設定する）"}
            </button>
          </form>
      </main>
    </div>
  );
}
