"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { PublicHeader } from "@/components/PublicHeader";

export default function PricingPage() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(!!getToken());
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <PublicHeader />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 flex flex-col gap-8">
        <div>
          <h2 className="text-2xl font-black mb-2" style={{ color: "var(--primary)" }}>料金プラン</h2>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            ManaVillageは、クリエイターが作る「30日伴走コース」をコース単位で購入する仕組みです。
            価格はコースごとにクリエイターが設定するため、コース詳細ページで実際の金額をご確認ください。
          </p>
        </div>

        <section className="flex flex-col gap-4">
          <h3 className="text-lg font-black" style={{ color: "var(--primary)" }}>コースの購入形式</h3>

          <div className="card flex flex-col gap-2">
            <p className="text-sm font-black" style={{ color: "var(--primary)" }}>買い切り購入</p>
            <p className="text-sm" style={{ color: "var(--text)" }}>
              レッスン形式のコースで採用される形式です。一度購入すれば、そのコースのレッスンに期間の制限なくアクセスできます。
            </p>
          </div>

          <div className="card flex flex-col gap-3">
            <p className="text-sm font-black" style={{ color: "var(--primary)" }}>月額サブスクリプション（30日伴走コース）</p>
            <p className="text-sm" style={{ color: "var(--text)" }}>
              30日間、クリエイターのメソッドに基づいた伴走コーチングを受けられるコースです。2つのTierから選べます。
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg p-3" style={{ background: "var(--example-bg, #eee)", border: "1px solid var(--border)" }}>
                <p className="text-xs font-black mb-1" style={{ color: "var(--accent)" }}>Tier A（AIのみ）</p>
                <p className="text-sm" style={{ color: "var(--text)" }}>
                  AIが毎日の声かけ・学習相談に答えます。目安：月額980〜1,980円
                </p>
              </div>
              <div className="rounded-lg p-3" style={{ background: "var(--example-bg, #eee)", border: "1px solid var(--border)" }}>
                <p className="text-xs font-black mb-1" style={{ color: "var(--accent)" }}>Tier B（AI＋クリエイター添削）</p>
                <p className="text-sm" style={{ color: "var(--text)" }}>
                  AIの回答に加え、クリエイター本人が直接添削・回答します。目安：月額2,980〜5,000円
                </p>
              </div>
            </div>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              ※ 実際の価格はクリエイター・コースごとに異なります。いつでも解約・Tier変更が可能です。
            </p>
          </div>
        </section>

        <section className="card flex flex-col gap-2">
          <h3 className="text-lg font-black" style={{ color: "var(--primary)" }}>無料コース</h3>
          <p className="text-sm" style={{ color: "var(--text)" }}>
            クリエイターによっては、一部のレッスンを無料公開していたり、コース全体を無料で提供している場合もあります。
          </p>
        </section>

        <section className="rounded-xl p-6 text-center" style={{ background: "var(--primary)" }}>
          <p className="text-white font-black text-lg mb-1">気になるクリエイターを見つけましょう</p>
          <p className="text-white/80 text-sm mb-4">30日間の伴走コースから、自分に合ったクリエイターを選べます。</p>
          <button onClick={() => router.push(loggedIn ? "/creators" : "/login")} className="btn-cta" style={{ background: "white", color: "var(--primary)" }}>
            クリエイターを探す →
          </button>
        </section>
      </main>
    </div>
  );
}
