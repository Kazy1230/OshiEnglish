"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import { resolveTheme, type CharacterTheme } from "@/lib/theme";
import { useDarkMode } from "@/lib/darkMode";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { toast } from "@/components/Toast";

type Order = {
  id: number;
  created_at: string | null;
  description: string;
  amount_display: string;
  refund_status: string | null;
  stripe_receipt_url: string | null;
};

type Me = { username: string; is_admin: boolean; is_password_reset_required: boolean; character_id: number | null };

export default function PurchasesPage() {
  const router = useRouter();
  const [theme, setTheme] = useState<CharacterTheme | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [mode, toggleMode] = useDarkMode();

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    (async () => {
      try {
        const user: Me = await api.me();
        if (user.is_password_reset_required) { router.replace("/change-password"); return; }
        if (user.is_admin) { router.replace("/admin"); return; }
        const [data, charTheme] = await Promise.all([
          api.getMyOrders(),
          user.character_id ? api.getCharacterTheme(user.character_id) : Promise.resolve(null),
        ]);
        setOrders(data);
        setTheme(charTheme);
      } catch {
        clearToken();
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const t = resolveTheme(theme, mode);

  async function handleDownload(order: Order) {
    setDownloadingId(order.id);
    try {
      await api.downloadReceipt(order.id);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "領収書のダウンロードに失敗しました", "error");
    } finally {
      setDownloadingId(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: t.bg }}>
        <p style={{ color: "var(--muted)" }}>読み込み中…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: t.bg, fontFamily: t.fontFamily }}>
      {/* ヘッダー */}
      <header className="sticky top-0 z-20 shadow-md" style={{ background: t.primary }}>
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/shelf")} aria-label="本棚へ戻る"
              className="text-white/70 hover:text-white text-sm">← 本棚</button>
            <h1 className="text-white font-black text-sm sm:text-base">🧾 購入履歴</h1>
          </div>
          <div className="flex items-center gap-2">
            <DarkModeToggle mode={mode} onToggle={toggleMode} variant="onColor" />
          </div>
        </div>
        <div className="h-1" style={{ background: t.accent }} />
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {orders.length === 0 ? (
          <div className="text-center py-12 px-4 sm:px-8 rounded-2xl border-2 border-dashed" style={{ borderColor: t.border, background: t.card }}>
            <p className="text-5xl mb-4">🧾</p>
            <p className="font-bold" style={{ color: t.primary, fontFamily: t.fontFamily }}>購入履歴はまだありません</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {orders.map(order => (
              <div key={order.id} className="rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3"
                style={{ background: t.card, border: `1px solid ${t.border}` }}>
                <div>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    {order.created_at ? new Date(order.created_at).toLocaleDateString("ja-JP") : "-"}
                    {order.refund_status === "refunded" && (
                      <span className="ml-2 text-xs px-2 py-0.5 rounded-full" style={{ background: "#fce8e8", color: "#c0392b" }}>返金済み</span>
                    )}
                  </p>
                  <p className="font-bold mt-0.5" style={{ color: t.primary, fontFamily: t.fontFamily }}>{order.description}</p>
                  <p className="text-sm mt-0.5" style={{ color: t.accent }}>{order.amount_display}</p>
                </div>
                <button onClick={() => handleDownload(order)} disabled={downloadingId === order.id}
                  className="text-xs px-4 py-2 rounded-full font-bold text-white transition-all hover:shadow-md disabled:opacity-60"
                  style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.accent})` }}>
                  {downloadingId === order.id ? "作成中…" : "📄 領収書をダウンロード"}
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
