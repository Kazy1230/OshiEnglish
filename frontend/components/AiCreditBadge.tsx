"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/** クリエイター向けヘッダーに表示する、30日カレンダー相談AIチャットの残高バッジ。 */
export function AiCreditBadge() {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    api.getCreatorAiBalance().then(res => setBalance(res.balance)).catch(() => {});
  }, []);

  if (balance === null) return null;

  return (
    <span
      className="text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 whitespace-nowrap"
      style={{ background: "rgba(255,255,255,0.15)", color: "white" }}
      title="30日カレンダー相談AIチャットの残高"
    >
      🪙 {balance}
    </span>
  );
}
