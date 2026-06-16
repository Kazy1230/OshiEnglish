"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import { resolveTheme, type CharacterTheme } from "@/lib/theme";
import { useDarkMode } from "@/lib/darkMode";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { toast } from "@/components/Toast";

const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL || "http://localhost/api";

type RewardItem = {
  id: number;
  category: "line" | "title" | "wallpaper";
  category_label: string;
  trigger_type: "intimacy" | "article_count";
  threshold: number;
  unlocked: boolean;
  is_new: boolean;
  unlocked_at: string | null;
  text_content: string | null;
  icon: string | null;
  image_url: string | null;
};

type RewardsData = {
  intimacy_level: number;
  article_request_count: number;
  items: RewardItem[];
};

type Me = { username: string; is_admin: boolean; is_password_reset_required: boolean; character_id: number | null; theme_config?: { wallpaper_url?: string } | null };

const CATEGORY_ORDER: RewardItem["category"][] = ["line", "title", "wallpaper"];
const CATEGORY_ICON: Record<RewardItem["category"], string> = { line: "💬", title: "🏅", wallpaper: "🖼️" };

function triggerLabel(item: RewardItem): string {
  if (item.trigger_type === "intimacy") return `親密度 Lv.${item.threshold - 1} → Lv.${item.threshold} で解放`;
  return `記事依頼 累計${item.threshold}件で解放`;
}

export default function RewardsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [theme, setTheme] = useState<CharacterTheme | null>(null);
  const [data, setData] = useState<RewardsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, toggleMode] = useDarkMode();
  const [celebrating, setCelebrating] = useState<RewardItem | null>(null);
  const [applying, setApplying] = useState(false);

  async function load() {
    const user = await api.me();
    setMe(user);
    const [rewards, charTheme] = await Promise.all([
      api.getMyRewards(),
      user.character_id ? api.getCharacterTheme(user.character_id) : Promise.resolve(null),
    ]);
    setData(rewards);
    setTheme(charTheme);
    return rewards as RewardsData;
  }

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    (async () => {
      try {
        const user = await api.me();
        if (user.is_password_reset_required) { router.replace("/change-password"); return; }
        if (user.is_admin) { router.replace("/admin"); return; }
        const rewards = await load();
        const newItem = rewards.items.find(i => i.unlocked && i.is_new);
        if (newItem) setCelebrating(newItem);
      } catch {
        clearToken();
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const t = resolveTheme(theme, mode);

  async function dismissCelebration() {
    if (!celebrating) return;
    const current = celebrating;
    try {
      await api.ackRewardUnlock(current.id);
    } catch { /* 演出の確認は失敗してもブロックしない */ }
    setData(prev => prev ? {
      ...prev,
      items: prev.items.map(i => i.id === current.id ? { ...i, is_new: false } : i),
    } : prev);
    setData(prev => {
      if (!prev) return prev;
      const next = prev.items.find(i => i.unlocked && i.is_new && i.id !== current.id);
      setCelebrating(next || null);
      return prev;
    });
  }

  async function handleApplyWallpaper(item: RewardItem) {
    setApplying(true);
    try {
      await api.applyWallpaper(item.id);
      const user = await api.me();
      setMe(user);
      toast("壁紙を適用しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "適用に失敗しました", "error");
    } finally {
      setApplying(false);
    }
  }

  async function handleClearWallpaper() {
    setApplying(true);
    try {
      await api.clearWallpaper();
      const user = await api.me();
      setMe(user);
      toast("壁紙の適用を解除しました", "info");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "解除に失敗しました", "error");
    } finally {
      setApplying(false);
    }
  }

  if (loading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: t.bg }}>
        <p style={{ color: "var(--muted)" }}>読み込み中…</p>
      </div>
    );
  }

  const currentWallpaper = me?.theme_config?.wallpaper_url;

  return (
    <div className="min-h-screen" style={{ background: t.bg, fontFamily: t.fontFamily }}>
      {/* ヘッダー */}
      <header className="sticky top-0 z-20 shadow-md" style={{ background: t.primary }}>
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} aria-label="戻る"
              className="text-white/70 hover:text-white text-sm">← 戻る</button>
            <h1 className="text-white font-black text-sm sm:text-base">🎁 ご褒美コレクション</h1>
          </div>
          <div className="flex items-center gap-2">
            <DarkModeToggle mode={mode} onToggle={toggleMode} variant="onColor" />
            <button onClick={() => { clearToken(); router.push("/login"); }}
              className="text-xs text-white/50 hover:text-white transition-colors">ログアウト</button>
          </div>
        </div>
        <div className="h-1" style={{ background: t.accent }} />
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* 進捗サマリー */}
        <div className="rounded-2xl p-4 sm:p-5 mb-6" style={{ background: t.card, border: `1px solid ${t.border}` }}>
          <div className="flex flex-wrap gap-4 sm:gap-8">
            <div>
              <p className="text-xs" style={{ color: "var(--muted)" }}>親密度レベル</p>
              <p className="text-2xl font-black" style={{ color: t.primary }}>Lv.{data.intimacy_level}</p>
            </div>
            <div>
              <p className="text-xs" style={{ color: "var(--muted)" }}>記事依頼回数</p>
              <p className="text-2xl font-black" style={{ color: t.primary }}>{data.article_request_count} 件</p>
            </div>
          </div>
        </div>

        {currentWallpaper && (
          <div className="rounded-xl p-3 mb-6 flex items-center justify-between gap-3 text-xs"
            style={{ background: t.example_bg, border: `1px dashed ${t.border}`, color: t.text }}>
            <span>現在、壁紙が適用されています</span>
            <button className="px-2 py-1 rounded font-bold" style={{ color: "#c0392b" }} disabled={applying}
              onClick={handleClearWallpaper}>解除する</button>
          </div>
        )}

        {CATEGORY_ORDER.map(category => {
          const items = data.items.filter(i => i.category === category)
            .sort((a, b) => (a.trigger_type === b.trigger_type ? a.threshold - b.threshold : (a.trigger_type === "intimacy" ? -1 : 1)));
          if (items.length === 0) return null;
          return (
            <section key={category} className="mb-8">
              <h2 className="text-lg font-black mb-3 flex items-center gap-2" style={{ color: t.primary }}>
                <span>{CATEGORY_ICON[category]}</span>
                <span>{items[0].category_label}</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {items.map(item => (
                  <RewardCard key={item.id} item={item} t={t} currentWallpaper={currentWallpaper}
                    applying={applying} onApplyWallpaper={() => handleApplyWallpaper(item)} />
                ))}
              </div>
            </section>
          );
        })}

        {data.items.length === 0 && (
          <p className="text-sm text-center py-12" style={{ color: "var(--muted)" }}>
            まだ報酬は登録されていません。チャットや学習を続けて親密度を高めましょう！
          </p>
        )}
      </main>

      {/* 解放アニメーション */}
      {celebrating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }} onClick={dismissCelebration}>
          <div className="reward-unlock-pop max-w-sm w-full rounded-2xl p-6 text-center"
            style={{ background: t.card, border: `2px solid ${t.accent}` }}
            onClick={e => e.stopPropagation()}>
            <div className="text-5xl mb-3 reward-unlock-bounce">🎉</div>
            <p className="text-sm font-bold mb-1" style={{ color: "var(--muted)" }}>新しい報酬を解放しました！</p>
            <p className="text-lg font-black mb-3" style={{ color: t.primary }}>
              {CATEGORY_ICON[celebrating.category]} {celebrating.category_label}
            </p>
            <RewardContent item={celebrating} t={t} />
            <button className="btn-primary w-full mt-4" onClick={dismissCelebration}>確認しました</button>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes reward-unlock-pop {
          from { opacity: 0; transform: scale(0.85); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes reward-unlock-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .reward-unlock-pop { animation: reward-unlock-pop 0.3s ease-out; }
        .reward-unlock-bounce { animation: reward-unlock-bounce 0.8s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

function RewardContent({ item, t }: { item: RewardItem; t: ReturnType<typeof resolveTheme> }) {
  if (item.category === "line") {
    return <p className="text-sm" style={{ color: t.text }}>「{item.text_content}」</p>;
  }
  if (item.category === "title") {
    return (
      <p className="text-base font-bold" style={{ color: t.text }}>
        {item.icon ? `${item.icon} ` : ""}{item.text_content}
      </p>
    );
  }
  if (item.image_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`${API_ORIGIN}${item.image_url}`} alt={item.text_content || "壁紙"}
        className="w-full rounded-lg" style={{ maxHeight: "200px", objectFit: "cover" }} />
    );
  }
  return <p className="text-sm" style={{ color: "var(--muted)" }}>{item.text_content || "壁紙"}</p>;
}

function RewardCard({ item, t, currentWallpaper, applying, onApplyWallpaper }: {
  item: RewardItem;
  t: ReturnType<typeof resolveTheme>;
  currentWallpaper?: string;
  applying: boolean;
  onApplyWallpaper: () => void;
}) {
  if (!item.unlocked) {
    return (
      <div className="rounded-xl p-4 flex flex-col items-center justify-center text-center gap-2"
        style={{ background: t.example_bg, border: `1px dashed ${t.border}`, minHeight: "120px" }}>
        <div className="w-14 h-14 rounded-lg flex items-center justify-center text-2xl"
          style={{ background: t.border, filter: "blur(1px)", opacity: 0.6 }}>
          {CATEGORY_ICON[item.category]}
        </div>
        <p className="text-xs font-bold" style={{ color: "var(--muted)" }}>未解放：{item.category_label}</p>
        <p className="text-[11px]" style={{ color: "var(--muted)" }}>{triggerLabel(item)}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-4 flex flex-col gap-2"
      style={{ background: t.card, border: `1px solid ${t.accent}` }}>
      <p className="text-[11px] font-bold" style={{ color: t.accent }}>解放済み・{triggerLabel(item)}</p>
      <RewardContent item={item} t={t} />
      {item.category === "wallpaper" && item.image_url && (
        currentWallpaper === item.image_url ? (
          <span className="text-xs font-bold text-center" style={{ color: t.accent }}>現在適用中</span>
        ) : (
          <button className="btn-accent text-xs" disabled={applying} onClick={onApplyWallpaper}>この壁紙を適用する</button>
        )
      )}
    </div>
  );
}
