"use client";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";

type Revenue = { gross_revenue: number; platform_fee: number; net_balance: number; active_subscriptions: number; fee_rate: number };

export function RevenuePanel() {
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    api.getMyRevenue().then(setRevenue).finally(() => setLoadingData(false));
  }, []);

  if (loadingData || !revenue) return <Skeleton />;

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col gap-3">
        <div className="flex justify-between text-sm">
          <span style={{ color: "var(--muted)" }}>売上総額</span>
          <span className="font-bold" style={{ color: "var(--text)" }}>¥{revenue.gross_revenue.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span style={{ color: "var(--muted)" }}>プラットフォーム手数料（{Math.round(revenue.fee_rate * 100)}%）</span>
          <span style={{ color: "var(--text)" }}>− ¥{revenue.platform_fee.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-base font-black pt-2 border-t" style={{ borderColor: "var(--border)" }}>
          <span style={{ color: "var(--primary)" }}>振込予定額</span>
          <span style={{ color: "var(--accent)" }}>¥{revenue.net_balance.toLocaleString()}</span>
        </div>
        <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>有効なサブスクリプション数: {revenue.active_subscriptions}件</p>
      </div>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        ※ 売上総額には買い切り購入の累計と、サブスクリプションの現在の月額（MRR）を含みます。実際の振込は月次で行われます。
      </p>
    </div>
  );
}
