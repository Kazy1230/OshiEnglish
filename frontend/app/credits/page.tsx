"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import { resolveTheme } from "@/lib/theme";
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
  const t = resolveTheme(null, mode);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    (async () => {
      try {
        const thread = await api.getMyThread();
        setCreditBalance(thread.credit_balance ?? 0);
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
          DM送信は1クレジット、記事・問題のリクエストは200〜400クレジットを消費します。
        </p>

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
