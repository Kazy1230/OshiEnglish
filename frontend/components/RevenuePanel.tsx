"use client";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";

type Revenue = { gross_revenue: number; platform_fee: number; net_balance: number; active_subscriptions: number; fee_rate: number };
type AiBalance = { balance: number; available_to_transfer: number; transferred_total: number };

export function RevenuePanel() {
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [aiBalance, setAiBalance] = useState<AiBalance | null>(null);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferring, setTransferring] = useState(false);

  function reload() {
    return Promise.all([
      api.getMyRevenue().then(setRevenue),
      api.getCreatorAiBalance().then(setAiBalance).catch(() => {}),
    ]);
  }

  useEffect(() => {
    reload().finally(() => setLoadingData(false));
  }, []);

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(transferAmount);
    if (!amount || amount <= 0) { toast("金額を入力してください", "error"); return; }
    setTransferring(true);
    try {
      await api.transferRevenueToAiBalance(amount);
      toast(`AIチャット残高に¥${amount.toLocaleString()}分チャージしました`, "success");
      setTransferAmount("");
      await reload();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "チャージに失敗しました", "error");
    } finally {
      setTransferring(false);
    }
  }

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

      {aiBalance && (
        <div className="card flex flex-col gap-3">
          <h2 className="font-bold text-sm" style={{ color: "var(--primary)" }}>🗓 カレンダー相談AIチャット残高</h2>
          <div className="flex justify-between text-sm">
            <span style={{ color: "var(--muted)" }}>現在の残高</span>
            <span className="font-bold" style={{ color: "var(--text)" }}>{aiBalance.balance} 回分</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: "var(--muted)" }}>売上からチャージ可能な額</span>
            <span className="font-bold" style={{ color: "var(--accent)" }}>¥{aiBalance.available_to_transfer.toLocaleString()}</span>
          </div>
          <form onSubmit={handleTransfer} className="flex gap-2 items-center pt-1">
            <input
              type="number"
              min={1}
              max={aiBalance.available_to_transfer}
              value={transferAmount}
              onChange={e => setTransferAmount(e.target.value)}
              placeholder="金額（円）"
              className="flex-1 text-sm"
              disabled={transferring || aiBalance.available_to_transfer <= 0}
            />
            <button
              type="submit"
              className="btn-primary text-sm px-4 disabled:opacity-40"
              disabled={transferring || aiBalance.available_to_transfer <= 0 || !transferAmount}
            >
              {transferring ? "処理中…" : "チャージする"}
            </button>
          </form>
          <p className="text-[11px]" style={{ color: "var(--muted)" }}>
            ¥1 = 1クレジット（1メッセージ）としてチャージされます。チャージした分は振込予定額から差し引かれます。
          </p>
        </div>
      )}
    </div>
  );
}
