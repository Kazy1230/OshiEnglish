"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { AppHeader } from "@/components/AppHeader";

type CharacterSummary = { id: number; name: string };

const SUBJECT_OPTIONS = [
  { key: "english", label: "英語", icon: "📚", description: "TOEIC・英会話・英文法など" },
  { key: "it", label: "IT・プログラミング", icon: "💻", description: "Python・AWS・Web開発など" },
  { key: "music", label: "音楽", icon: "🎵", description: "ピアノ・ギター・音楽理論など" },
  { key: "japanese", label: "日本語", icon: "🗾", description: "JLPT・日常会話・ビジネス日本語など" },
];

const CATEGORY_MAP: Record<string, string[]> = {
  english: ["TOEIC", "TOEFL", "IELTS", "英検", "英会話", "ビジネス英語", "英文法", "英作文"],
  it: ["Python", "JavaScript", "TypeScript", "AWS", "データベース", "アルゴリズム", "Web開発", "モバイル開発"],
  music: ["ピアノ", "ギター", "DTM", "音楽理論", "ボーカル", "ドラム", "ベース", "作曲・編曲"],
  japanese: ["JLPT N5", "JLPT N4", "JLPT N3", "JLPT N2", "JLPT N1", "日常会話", "ビジネス日本語", "読み書き"],
};

export default function NewCoursePage() {
  const router = useRouter();
  const { me, loading } = useRoleGuard(["creator", "admin"]);
  const [character, setCharacter] = useState<CharacterSummary | null>(null);
  const [loadingCharacter, setLoadingCharacter] = useState(true);

  const [subject, setSubject] = useState<string | null>(null);
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

  // subjectが変わったらcategoryをリセット
  useEffect(() => {
    setCategory("");
  }, [subject]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!character) { toast("先にAIインタビューを完了して人格(キャラクター)を作成してください", "error"); return; }
    if (!subject) { toast("分野を選択してください", "error"); return; }
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

  const categoryOptions = subject ? (CATEGORY_MAP[subject] ?? []) : [];

  return (
    <div className="creator-theme min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" title="30日伴走コース新規作成" />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">

        {/* Step 1: 分野選択 */}
        {!subject ? (
          <div className="card flex flex-col gap-5">
            <div>
              <p className="font-black text-base" style={{ color: "var(--primary)" }}>このコースの分野を選んでください</p>
              <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>分野に合わせたカテゴリ・質問テンプレートが使えます</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {SUBJECT_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSubject(opt.key)}
                  className="flex flex-col items-center gap-3 px-4 py-6 rounded-2xl text-center transition-all hover:scale-[1.03]"
                  style={{
                    background: "var(--card)",
                    border: "1.5px solid var(--border)",
                  }}
                >
                  <span className="text-3xl">{opt.icon}</span>
                  <span className="font-black text-sm" style={{ color: "var(--primary)" }}>{opt.label}</span>
                  <span className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>{opt.description}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card flex flex-col gap-4">
            {/* 選択した分野の表示 */}
            <div className="flex items-center justify-between px-3 py-2 rounded-xl" style={{ background: "color-mix(in srgb, var(--primary) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)" }}>
              <div className="flex items-center gap-2">
                <span className="text-lg">{SUBJECT_OPTIONS.find(o => o.key === subject)?.icon}</span>
                <span className="text-sm font-bold" style={{ color: "var(--primary)" }}>{SUBJECT_OPTIONS.find(o => o.key === subject)?.label}</span>
              </div>
              <button type="button" onClick={() => setSubject(null)} className="text-xs underline" style={{ color: "var(--muted)" }}>変更</button>
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
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>カテゴリ</label>
              <select value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">カテゴリを選択（任意）</option>
                {categoryOptions.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
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
        )}
      </main>
    </div>
  );
}
