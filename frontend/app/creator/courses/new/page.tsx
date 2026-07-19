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
  const [isFree, setIsFree] = useState(false);
  const [tierAPrice, setTierAPrice] = useState("1480");
  const [tierBPrice, setTierBPrice] = useState("3980");
  const [enableTierA, setEnableTierA] = useState(true);
  const [enableTierB, setEnableTierB] = useState(true);
  const [courseType, setCourseType] = useState<"self_paced" | "pace_based">("self_paced");
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
    if (!title.trim()) { toast("コース名を入力してください", "error"); return; }
    if (!isFree && !enableTierA && !enableTierB) {
      toast("Tier AまたはTier Bのどちらかは提供する必要があります", "error");
      return;
    }

    setSubmitting(true);
    try {
      const course = await api.createCourse({
        title,
        subject,
        price: 0,
        is_free: isFree,
        tier_a_price: !isFree && enableTierA ? Number(tierAPrice) : null,
        tier_b_price: !isFree && enableTierB ? Number(tierBPrice) : null,
        course_type: courseType,
      });
      router.push(courseType === "pace_based" ? `/creator/courses/${course.id}/calendar` : `/creator/courses/${course.id}/curriculum`);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "作成に失敗しました", "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || loadingCharacter) return <Skeleton />;

  return (
    <div className="creator-theme min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" title="新規コース作成" />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <form onSubmit={handleSubmit} className="card flex flex-col gap-5">
          <h2 className="font-bold text-lg" style={{ color: "var(--text)" }}>基本情報を入力</h2>

          {character ? (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "var(--accent-bg, #f0fdf4)", color: "var(--text)" }}>
              🎭 このコースは「<span className="font-bold" style={{ color: "var(--primary)" }}>{character.name}</span>」として公開されます。
            </p>
          ) : (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "rgba(245,158,11,0.16)", color: "#fbbf24" }}>
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
          </div>

          <div className="border-t pt-4" style={{ borderColor: "var(--border, #e5e7eb)" }}>
            <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--text)" }}>料金設定</h3>
            <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
              {isFree
                ? "無料コースは、すべての学習者が料金なしでアクセスできます。"
                : "有料コースは「Tier Aのみ」「Tier A＋Tier B」「Tier Bのみ」の3パターンから選べます。"}
            </p>

            <label
              className="flex items-center justify-between gap-2 text-sm p-3 rounded-lg cursor-pointer mb-3"
              style={{ border: `1.5px solid ${isFree ? "var(--primary)" : "var(--border, #e5e7eb)"}`, background: isFree ? "var(--surface)" : "transparent" }}
            >
              <span className="font-bold" style={{ color: "var(--text)" }}>無料コースにする</span>
              <input type="checkbox" checked={isFree} onChange={e => setIsFree(e.target.checked)} />
            </label>

            {!isFree && (
              <div className="flex flex-col gap-3">
                <PriceTierCard
                  label="Tier A"
                  description="AIのみが伴走"
                  enabled={enableTierA}
                  onToggle={v => setEnableTierA(v)}
                  price={tierAPrice}
                  onPriceChange={setTierAPrice}
                  min={980}
                  max={20000}
                />
                <PriceTierCard
                  label="Tier B"
                  description="AI＋クリエイター添削"
                  enabled={enableTierB}
                  onToggle={v => setEnableTierB(v)}
                  price={tierBPrice}
                  onPriceChange={setTierBPrice}
                  min={2980}
                  max={100000}
                />
              </div>
            )}

            {!isFree && !enableTierA && !enableTierB && (
              <p className="text-xs mt-2" style={{ color: "#dc2626" }}>Tier AまたはTier Bのどちらかは提供する必要があります</p>
            )}
          </div>

          <div className="flex gap-3">
            <button type="button" className="btn-secondary flex-1" onClick={() => router.back()}>戻る</button>
            <button type="submit" className="btn-primary flex-1" disabled={!character || submitting}>
              {submitting ? "作成中…" : courseType === "pace_based" ? "作成して30日カレンダーへ" : "作成してカリキュラム編集へ"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

function PriceTierCard({ label, description, enabled, onToggle, price, onPriceChange, min, max }: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  price: string;
  onPriceChange: (v: string) => void;
  min: number;
  max: number;
}) {
  return (
    <div
      className="rounded-lg p-3 transition-colors"
      style={{ border: `1.5px solid ${enabled ? "var(--primary)" : "var(--border, #e5e7eb)"}`, background: enabled ? "var(--surface)" : "transparent" }}
    >
      <label className="flex items-center justify-between gap-2 text-sm cursor-pointer">
        <span>
          <span className="font-bold" style={{ color: "var(--text)" }}>{label}</span>
          <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>{description}</span>
        </span>
        <input type="checkbox" checked={enabled} onChange={e => onToggle(e.target.checked)} />
      </label>
      {enabled && (
        <div className="mt-3 flex items-center gap-2">
          <div className="flex items-center gap-1.5 flex-1 px-3 py-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border, #e5e7eb)" }}>
            <span className="text-sm font-bold" style={{ color: "var(--muted)" }}>¥</span>
            <input
              type="number"
              min={min}
              max={max}
              value={price}
              onChange={e => onPriceChange(e.target.value)}
              style={{ border: "none", padding: 0, background: "transparent" }}
            />
            <span className="text-xs whitespace-nowrap" style={{ color: "var(--muted)" }}>/月</span>
          </div>
        </div>
      )}
      {enabled && (
        <p className="text-xs mt-1.5" style={{ color: "var(--muted)" }}>
          {min.toLocaleString()}〜{max.toLocaleString()}円/月の範囲で設定できます
        </p>
      )}
    </div>
  );
}
