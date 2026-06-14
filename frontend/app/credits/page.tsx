"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import { resolveTheme, type CharacterTheme } from "@/lib/theme";
import { useDarkMode } from "@/lib/darkMode";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { toast } from "@/components/Toast";

const CREDIT_PACKS = [500, 1000, 2000, 5000];

function CreditsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, toggleMode] = useDarkMode();
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<number | null>(null);
  const [theme, setTheme] = useState<CharacterTheme | null>(null);
  const t = resolveTheme(theme, mode);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    (async () => {
      try {
        const [thread, user] = await Promise.all([api.getMyThread(), api.me()]);
        setCreditBalance(thread.credit_balance ?? 0);
        const charTheme = user.character_id ? await api.getCharacterTheme(user.character_id) : null;
        setTheme(charTheme);
      } catch {
        clearToken();
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (searchParams.get("session_id")) {
      toast("購入処理を受け付けました。残高への反映まで少し時間がかかる場合があります", "info");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePurchase(credits: number) {
    if (purchasing) return;
    setPurchasing(credits);
    try {
      const result = await api.purchaseCredits(credits);
      if (result?.checkout_url) {
        window.location.href = result.checkout_url;
      } else {
        toast("決済画面の作成に失敗しました", "error");
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "決済画面の作成に失敗しました", "error");
    } finally {
      setPurchasing(null);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: t.bg, fontFamily: t.fontFamily }}>
      <header className="sticky top-0 z-20 shadow-md" style={{ background: t.primary }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/chat")} aria-label="戻る"
              className="text-white/70 hover:text-white text-sm">← 戻る</button>
            <h1 className="text-lg sm:text-xl font-black text-white">クレジット購入</h1>
          </div>
          <DarkModeToggle mode={mode} onToggle={toggleMode} variant="onColor" />
        </div>
        <div className="h-1" style={{ background: t.accent }} />
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="rounded-xl p-4 mb-6" style={{ background: t.example_bg, border: `1px solid ${t.border}` }}>
          <p className="text-sm" style={{ color: t.text }}>現在のクレジット残高</p>
          <p className="text-3xl font-black mt-1" style={{ color: t.primary }}>
            {loading ? "…" : `${creditBalance ?? 0} クレジット`}
          </p>
        </div>

        <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
          1クレジット＝1円。500クレジット単位で購入できます。
        </p>

        {/* クレジットの使い道 */}
        <div className="rounded-xl p-4 mb-6" style={{ background: t.card, border: `1px solid ${t.border}` }}>
          <p className="text-sm font-bold mb-2" style={{ color: t.primary }}>
            💳 クレジットの使い道
          </p>
          <ul className="text-sm leading-relaxed list-disc pl-5" style={{ color: t.text }}>
            <li>キャラクターへのDM送信：<strong>1クレジット</strong></li>
            <li>記事・問題のリクエスト：依頼時に<strong>50クレジット</strong>、記事が届いて開封する時に残り<strong>150〜350クレジット</strong>（合計200〜400クレジット）</li>
            <li>キャラクターから届く特別記事（定期便）の開封：<strong>50クレジット</strong>（届くこと自体は無料）</li>
          </ul>
          <button type="button" onClick={() => router.push("/pricing")}
            className="text-xs font-bold mt-2" style={{ color: t.accent }}>
            料金プランの詳細を見る →
          </button>
        </div>

        <div className="rounded-xl p-4 mb-6" style={{ background: t.example_bg, border: `1px solid ${t.border}` }}>
          <p className="text-sm font-bold mb-1" style={{ color: t.primary }}>
            🎁 毎日ログインボーナス
          </p>
          <p className="text-sm leading-relaxed" style={{ color: t.text }}>
            毎日ログインすると10クレジットを獲得できます（残高が50クレジットを超えない範囲）。
            無課金でも、記事・問題のリクエストや、キャラクターから届く定期便の開封に活用できます。
          </p>
        </div>

        <p className="text-sm font-bold mb-3" style={{ color: t.primary }}>クレジットを購入する</p>
        <div className="flex flex-col gap-3">
          {CREDIT_PACKS.map(credits => (
            <button key={credits} type="button" onClick={() => handlePurchase(credits)} disabled={purchasing !== null}
              className="rounded-xl p-4 flex items-center justify-between gap-3 font-bold transition-all disabled:opacity-50"
              style={{ background: t.card, border: `1px solid ${t.border}`, color: t.text }}>
              <span>{credits} クレジット</span>
              <span className="text-lg font-black" style={{ color: t.accent }}>
                {purchasing === credits ? "処理中…" : `¥${credits.toLocaleString()}`}
              </span>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}

export default function CreditsPage() {
  return (
    <Suspense fallback={null}>
      <CreditsPageInner />
    </Suspense>
  );
}
