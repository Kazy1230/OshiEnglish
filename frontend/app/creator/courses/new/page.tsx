"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { AppHeader } from "@/components/AppHeader";

type CharacterSummary = { id: number; name: string };

const STEPS = ["基本情報", "壁打ち相談", "プロンプト確認"] as const;

export default function NewCoursePage() {
  const router = useRouter();
  const { me, loading } = useRoleGuard(["creator", "admin"]);
  const [character, setCharacter] = useState<CharacterSummary | null>(null);
  const [loadingCharacter, setLoadingCharacter] = useState(true);
  const [step, setStep] = useState(0);

  // Step 0: 基本情報
  const [subject, setSubject] = useState("");
  const [title, setTitle] = useState("");
  const [isFree, setIsFree] = useState(false);
  const [tierAPrice, setTierAPrice] = useState("1480");
  const [tierBPrice, setTierBPrice] = useState("3980");
  const [enableTierA, setEnableTierA] = useState(true);
  const [enableTierB, setEnableTierB] = useState(true);
  const [courseType, setCourseType] = useState<"self_paced" | "pace_based">("self_paced");
  const [paceUnitDescription, setPaceUnitDescription] = useState("");

  // Step 1: 壁打ち相談
  const [purpose, setPurpose] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [topics, setTopics] = useState("");
  const [duration, setDuration] = useState("");
  const [style, setStyle] = useState("");
  const [concerns, setConcerns] = useState("");
  const [existingVideos, setExistingVideos] = useState("");

  // Step 2: プロンプト
  const [courseId, setCourseId] = useState<number | null>(null);
  const [prompt, setPrompt] = useState("");
  const [copied, setCopied] = useState(false);
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

  async function handleStep0(e: React.FormEvent) {
    e.preventDefault();
    if (!character) { toast("先にAIインタビューを完了して人格(キャラクター)を作成してください", "error"); return; }
    if (!subject.trim()) { toast("分野を入力してください", "error"); return; }
    if (!title.trim()) { toast("コース名を入力してください", "error"); return; }
    if (!isFree && !enableTierA && !enableTierB) {
      toast("Tier AまたはTier Bのどちらかは提供する必要があります", "error");
      return;
    }
    setStep(1);
  }

  async function handleStep1(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      let id: number = courseId ?? 0;
      if (!id) {
        const course = await api.createCourse({
          title,
          subject,
          price: 0,
          is_free: isFree,
          tier_a_price: !isFree && enableTierA ? Number(tierAPrice) : null,
          tier_b_price: enableTierB ? Number(tierBPrice) : null,
          course_type: courseType,
          pace_unit_description: courseType === "pace_based" ? (paceUnitDescription || null) : null,
        });
        id = course.id;
        setCourseId(id);
      }
      await api.updateCurriculumMeta(id, {
        purpose,
        target_audience: targetAudience,
        topics,
        duration,
        style,
        concerns,
        existing_videos: existingVideos,
      });
      const res = await api.getCurriculumPrompt(id);
      setPrompt(res.prompt);
      setStep(2);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "作成に失敗しました", "error");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleGoToChapters() {
    if (!courseId) return;
    router.push(`/creator/courses/${courseId}/chapters`);
  }

  if (loading || loadingCharacter) return <Skeleton />;

  return (
    <div className="creator-theme min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" title="新規コース作成" />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {/* ステッパー */}
        <div className="flex items-center gap-0 mb-8">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{
                    background: i <= step ? "var(--primary)" : "var(--border, #e5e7eb)",
                    color: i <= step ? "#fff" : "var(--muted)",
                  }}
                >
                  {i < step ? "✓" : i + 1}
                </div>
                <span className="text-xs mt-1 whitespace-nowrap" style={{ color: i === step ? "var(--primary)" : "var(--muted)" }}>{label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="flex-1 h-0.5 mx-2 mb-4" style={{ background: i < step ? "var(--primary)" : "var(--border, #e5e7eb)" }} />
              )}
            </div>
          ))}
        </div>

        {/* Step 0: 基本情報 */}
        {step === 0 && (
          <form onSubmit={handleStep0} className="card flex flex-col gap-5">
            <h2 className="font-bold text-lg" style={{ color: "var(--text)" }}>基本情報を入力</h2>

            {character ? (
              <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "var(--accent-bg, #f0fdf4)", color: "var(--text)" }}>
                🎭 このコースは「<span className="font-bold" style={{ color: "var(--primary)" }}>{character.name}</span>」として公開されます。
              </p>
            ) : (
              <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "#fef3c7", color: "#92400e" }}>
                先に<a href="/creator/interview" style={{ color: "var(--accent)" }}>AIインタビュー</a>を完了して人格(キャラクター)を作成してください。
              </p>
            )}

            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>分野 *</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} required placeholder="例: TOEIC、マイクラ建築、料理、Python" />
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>どんなニッチな分野でも入力できます</p>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>コース名 *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} required placeholder="例：TOEIC800達成への道" />
            </div>

            <div className="border-t pt-4" style={{ borderColor: "var(--border, #e5e7eb)" }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>このコースは、どちらのタイプですか？</h3>
              <div className="flex flex-col gap-2">
                <label
                  className="flex items-start gap-2 text-sm p-3 rounded-lg cursor-pointer"
                  style={{ border: `1.5px solid ${courseType === "self_paced" ? "var(--primary)" : "var(--border, #e5e7eb)"}` }}
                >
                  <input type="radio" name="courseType" className="mt-0.5" checked={courseType === "self_paced"} onChange={() => setCourseType("self_paced")} />
                  <span>
                    <span className="font-bold block" style={{ color: "var(--text)" }}>自由進行型</span>
                    <span className="text-xs" style={{ color: "var(--muted)" }}>学習者が自分のペースで完成を目指す（建築・会話練習など）</span>
                  </span>
                </label>
                <label
                  className="flex items-start gap-2 text-sm p-3 rounded-lg cursor-pointer"
                  style={{ border: `1.5px solid ${courseType === "pace_based" ? "var(--primary)" : "var(--border, #e5e7eb)"}` }}
                >
                  <input type="radio" name="courseType" className="mt-0.5" checked={courseType === "pace_based"} onChange={() => setCourseType("pace_based")} />
                  <span>
                    <span className="font-bold block" style={{ color: "var(--text)" }}>ペース管理型</span>
                    <span className="text-xs" style={{ color: "var(--muted)" }}>毎日/毎週のペースで継続することが重要（単語・リスニングなど）</span>
                  </span>
                </label>
              </div>
              {courseType === "pace_based" && (
                <div className="mt-3">
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>1回あたりの分量の目安</label>
                  <input value={paceUnitDescription} onChange={e => setPaceUnitDescription(e.target.value)} placeholder="例：1日10単語" />
                </div>
              )}
            </div>

            <div className="border-t pt-4" style={{ borderColor: "var(--border, #e5e7eb)" }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>料金設定</h3>
              <label className="flex items-center gap-2 text-sm mb-3 cursor-pointer">
                <input type="checkbox" checked={isFree} onChange={e => setIsFree(e.target.checked)} />
                <span style={{ color: "var(--text)" }}>無料コースにする</span>
              </label>
              <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
                {isFree
                  ? "無料コースは、必要であればTier B（AI＋クリエイター添削）のみを有料オプションとして追加できます。"
                  : "有料コースは「Tier Aのみ」「Tier A＋Tier B」「Tier Bのみ」の3パターンから選べます。"}
              </p>

              {!isFree && (
                <label className="flex items-center gap-2 text-sm mb-2 cursor-pointer">
                  <input type="checkbox" checked={enableTierA} onChange={e => setEnableTierA(e.target.checked)} />
                  <span style={{ color: "var(--text)" }}>Tier A（AIのみ）を提供する</span>
                </label>
              )}
              {!isFree && enableTierA && (
                <div className="flex flex-col gap-2 mb-2 ml-6">
                  <div>
                    <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>Tier A（AIのみ）月額</label>
                    <input type="number" min="980" max="1980" value={tierAPrice} onChange={e => setTierAPrice(e.target.value)} />
                    <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>980〜1,980円/月</p>
                  </div>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm mb-2 cursor-pointer">
                <input type="checkbox" checked={enableTierB} onChange={e => setEnableTierB(e.target.checked)} />
                <span style={{ color: "var(--text)" }}>Tier B（AI＋クリエイター添削）を提供する</span>
              </label>
              {enableTierB && (
                <div className="ml-6">
                  <input type="number" min="2980" max="5000" value={tierBPrice} onChange={e => setTierBPrice(e.target.value)} />
                  <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>2,980〜5,000円/月</p>
                </div>
              )}
              {!isFree && !enableTierA && !enableTierB && (
                <p className="text-xs mt-1" style={{ color: "#dc2626" }}>Tier AまたはTier Bのどちらかは提供する必要があります</p>
              )}
            </div>

            <div className="flex gap-3">
              <button type="button" className="btn-secondary flex-1" onClick={() => router.back()}>戻る</button>
              <button type="submit" className="btn-primary flex-1" disabled={!character}>
                次へ：カリキュラムの壁打ち
              </button>
            </div>
          </form>
        )}

        {/* Step 1: 壁打ち相談 */}
        {step === 1 && (
          <form onSubmit={handleStep1} className="card flex flex-col gap-5">
            <div>
              <h2 className="font-bold text-lg" style={{ color: "var(--text)" }}>カリキュラム壁打ち</h2>
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                入力内容をもとにAI壁打ち用のプロンプトを生成します。空欄でもOKです。
              </p>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>講座の目的・ゴール</label>
              <textarea rows={2} value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="例：TOEIC800点を3ヶ月で達成させる" className="w-full" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>対象者</label>
              <textarea rows={2} value={targetAudience} onChange={e => setTargetAudience(e.target.value)} placeholder="例：現在600点前後・3ヶ月後に受験予定の社会人" className="w-full" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>扱いたいトピック・要素</label>
              <textarea rows={2} value={topics} onChange={e => setTopics(e.target.value)} placeholder="例：リスニング強化、文法パターン、語彙1000語" className="w-full" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>期間感の目安</label>
              <input value={duration} onChange={e => setDuration(e.target.value)} placeholder="例：30日間、12週間、3ヶ月" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>講師としてのスタイル・こだわり</label>
              <textarea rows={2} value={style} onChange={e => setStyle(e.target.value)} placeholder="例：実践重視、理論よりも使える英語、毎日短く継続" className="w-full" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>まだ迷っている・決めきれていない点</label>
              <textarea rows={2} value={concerns} onChange={e => setConcerns(e.target.value)} placeholder="例：リーディングとリスニングどちらを先にするか迷っている" className="w-full" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>持っている動画（任意）</label>
              <textarea rows={3} value={existingVideos} onChange={e => setExistingVideos(e.target.value)} placeholder={"例：\nhttps://youtu.be/xxx - リスニング基礎\nhttps://youtu.be/yyy - 文法入門"} className="w-full" />
            </div>

            <div className="flex gap-3">
              <button type="button" className="btn-secondary flex-1" onClick={() => setStep(0)}>戻る</button>
              <button type="submit" className="btn-primary flex-1" disabled={submitting}>
                {submitting ? "生成中…" : "プロンプトを生成する"}
              </button>
            </div>
          </form>
        )}

        {/* Step 2: プロンプト確認 */}
        {step === 2 && (
          <div className="card flex flex-col gap-5">
            <div>
              <h2 className="font-bold text-lg" style={{ color: "var(--text)" }}>AI壁打ち用プロンプト</h2>
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                このプロンプトをChatGPTなどにコピーして、章立て案を作ってもらってください。
              </p>
            </div>

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
                style={{
                  background: copied ? "var(--accent)" : "var(--primary)",
                  color: "#fff",
                }}
              >
                {copied ? "コピーしました！" : "コピー"}
              </button>
            </div>

            <div className="rounded-xl p-4" style={{ background: "#fef9c3", color: "#713f12" }}>
              <p className="text-sm font-semibold mb-1">次のステップ</p>
              <ol className="text-xs space-y-1 list-decimal list-inside">
                <li>上のプロンプトをChatGPT / Claude などにコピーして壁打ちする</li>
                <li>章立てが決まったら「次へ」を押して章を入力する</li>
              </ol>
            </div>

            <div className="flex gap-3">
              <button type="button" className="btn-secondary flex-1" onClick={() => setStep(1)}>戻る</button>
              <button onClick={handleGoToChapters} className="btn-primary flex-1">
                次へ：章立てを入力する
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
