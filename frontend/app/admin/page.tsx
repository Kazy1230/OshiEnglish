"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import { AdminSkeleton } from "@/components/Skeleton";
import { useDarkMode } from "@/lib/darkMode";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { reportError } from "@/lib/reportError";
import { toast } from "@/components/Toast";
import type { Tab } from "./types";
import { DashboardTab } from "./tabs/DashboardTab";
import { OrdersTab } from "./tabs/OrdersTab";
import { MessagesTab } from "./tabs/MessagesTab";
import { CorrectionsTab } from "./tabs/CorrectionsTab";
import { ArticlesTab } from "./tabs/ArticlesTab";
import { CustomersTab } from "./tabs/CustomersTab";
import { CharactersTab } from "./tabs/CharactersTab";
import { GrammarTab } from "./tabs/GrammarTab";
import { ServiceMenuTab } from "./tabs/ServiceMenuTab";
import { LogsTab } from "./tabs/LogsTab";
import { RewardsTab } from "./tabs/RewardsTab";
import { SuggestionsTab } from "./tabs/SuggestionsTab";

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [pendingCorrection, setPendingCorrection] = useState<any>(null);
  const [pendingArticleRequest, setPendingArticleRequest] = useState<any>(null);
  const [pendingRewardsCharacterId, setPendingRewardsCharacterId] = useState<number | null>(null);
  const [pendingWelcomePage, setPendingWelcomePage] = useState<any>(null);
  const [pendingMessagesCustomerId, setPendingMessagesCustomerId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [msgBadge, setMsgBadge] = useState(0);
  const [ordersBadge, setOrdersBadge] = useState(0);
  const [correctionsBadge, setCorrectionsBadge] = useState(0);
  const [mode, toggleMode] = useDarkMode();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    api.me().then(u => {
      if (!u.is_admin) { router.replace("/shelf"); return; }
      setLoading(false);
    }).catch(() => { clearToken(); router.replace("/login"); });
  }, [router]);

  // サイドバーの「チャット」にLINE風の未対応件数バッジを表示
  // （顧客からの未読メッセージ＋未対応の記事リクエスト＋未送付のご褒美の合計）
  // また、顧客からの新着メッセージが増えたタイミングでトースト通知を表示する
  const prevUnreadFromCustomerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    async function loadBadge() {
      try {
        const threads = await api.adminListThreads();
        if (cancelled) return;
        const total = threads.reduce((sum: number, th: any) =>
          sum + th.pending_requests + th.unread_from_customer + th.reward_status.pending_rewards, 0);
        setMsgBadge(total);

        const unreadFromCustomer = threads.reduce((sum: number, th: any) => sum + th.unread_from_customer, 0);
        const prev = prevUnreadFromCustomerRef.current;
        if (prev !== null && unreadFromCustomer > prev && tab !== "messages") {
          toast("💬 新着メッセージが届いています", "info");
        }
        prevUnreadFromCustomerRef.current = unreadFromCustomer;
      } catch (err) { reportError("admin:adminListThreads(badge)", err); }

      try {
        const orders = await api.adminGetOrders();
        if (cancelled) return;
        // 未納品の受注に加えて、納品済みでもキャラ作成依頼・記事・添削の対応待ちがある受注もバッジに含める
        setOrdersBadge(orders.filter((o: any) =>
          o.status !== "delivered"
          || o.character_creation_pending
          || o.pending_article_requests?.length > 0
          || o.pending_corrections?.length > 0
        ).length);
      } catch (err) { reportError("admin:adminGetOrders(badge)", err); }

      try {
        const [corrections, exerciseSubmissions] = await Promise.all([
          api.adminListCorrectionRequests(),
          api.adminListExerciseSubmissions(),
        ]);
        if (cancelled) return;
        setCorrectionsBadge(corrections.length + exerciseSubmissions.length);
      } catch (err) { reportError("admin:correctionsBadge", err); }
    }
    loadBadge();
    const interval = setInterval(loadBadge, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [tab]);

  // グローバルEscキーハンドラー（フォーム入力中は発火しない）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const active = document.activeElement?.tagName;
        if (active === "INPUT" || active === "TEXTAREA" || active === "SELECT") return;
        // ブラウザの戻るナビゲーションではなくフォーカスをBodyに戻す
        (document.activeElement as HTMLElement)?.blur();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (loading) return <AdminSkeleton />;

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "dashboard", label: "ダッシュボード", icon: "🏠" },
    { key: "orders", label: "受注リスト", icon: "📋" },
    { key: "messages", label: "チャット", icon: "💬" },
    { key: "corrections", label: "添削", icon: "✏️" },
    { key: "suggestions", label: "修正サジェスト", icon: "👍" },
    { key: "articles", label: "記事管理", icon: "📝" },
    { key: "customers", label: "顧客管理", icon: "👤" },
    { key: "characters", label: "キャラクター", icon: "🎭" },
    { key: "rewards", label: "報酬・成長ループ", icon: "🎁" },
    { key: "grammar", label: "文法マスター", icon: "📚" },
    { key: "menu", label: "料金・メニュー", icon: "💴" },
    { key: "logs", label: "アクセスログ", icon: "📊" },
  ];

  return (
    <div className="min-h-screen md:h-screen flex flex-col md:flex-row md:overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* モバイル用トップバー */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 shadow-md flex-shrink-0" style={{ background: "var(--primary)" }}>
        <button onClick={() => setMobileNavOpen(v => !v)} aria-label="メニューを開閉"
          className="text-white text-xl px-1">☰</button>
        <h1 className="text-base font-black text-white">推しEnglish 管理者画面</h1>
        <DarkModeToggle mode={mode} onToggle={toggleMode} variant="onColor" />
      </div>

      {/* サイドバー */}
      <aside className={`${mobileNavOpen ? "flex" : "hidden"} md:flex w-full md:w-56 flex-shrink-0 flex-col shadow-md md:h-screen md:sticky md:top-0 md:overflow-y-auto`} style={{ background: "var(--primary)" }}>
        <div className="hidden md:flex px-5 py-5 border-b border-white/10 items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-white">推しEnglish</h1>
            <p className="text-xs text-white/50 mt-0.5">管理者画面</p>
          </div>
          <DarkModeToggle mode={mode} onToggle={toggleMode} variant="onColor" />
        </div>
        <nav className="flex-1 py-4 flex flex-col gap-1 px-3">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setMobileNavOpen(false); }}
              className={`relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-left transition-all
                ${tab === t.key ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"}`}
            >
              <span>{t.icon}</span>{t.label}
              {t.key === "messages" && msgBadge > 0 && (
                <span className="ml-auto min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center text-[11px] font-black text-white shadow-md flex-shrink-0"
                  style={{ background: "#ff3b30" }}>
                  {msgBadge > 99 ? "99+" : msgBadge}
                </span>
              )}
              {t.key === "orders" && ordersBadge > 0 && (
                <span className="ml-auto min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center text-[11px] font-black text-white shadow-md flex-shrink-0"
                  style={{ background: "#ff3b30" }}>
                  {ordersBadge > 99 ? "99+" : ordersBadge}
                </span>
              )}
              {t.key === "corrections" && correctionsBadge > 0 && (
                <span className="ml-auto min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center text-[11px] font-black text-white shadow-md flex-shrink-0"
                  style={{ background: "#ff3b30" }}>
                  {correctionsBadge > 99 ? "99+" : correctionsBadge}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="px-3 pb-4">
          <button onClick={() => { clearToken(); router.push("/login"); }}
            className="w-full text-xs text-white/40 hover:text-white/70 transition-colors py-2">
            ログアウト
          </button>
        </div>
      </aside>

      {/* メインコンテンツ */}
      <main className="flex-1 overflow-auto p-4 sm:p-6 md:p-8 min-w-0 md:h-screen">
        {tab === "dashboard" && <DashboardTab onNavigate={setTab} />}
        {tab === "orders" && <OrdersTab
          onCreateArticleFromRequest={(order, request, targetCategory) => { setPendingArticleRequest({ order, request, targetCategory }); setTab("articles"); }}
          onNavigateToRewards={(characterId) => { setPendingRewardsCharacterId(characterId); setTab("rewards"); }}
          onNavigateToWelcomePage={(characterId) => { setPendingWelcomePage({ character_id: characterId }); setTab("articles"); }}
          onNavigateToMessages={(customerId) => { setPendingMessagesCustomerId(customerId); setTab("messages"); }}
        />}
        {tab === "messages" && <MessagesTab initialCustomerId={pendingMessagesCustomerId} onConsumeInitialCustomerId={() => setPendingMessagesCustomerId(null)} />}
        {tab === "corrections" && <CorrectionsTab onCreateFeedbackArticle={(item) => { setPendingCorrection(item); setTab("articles"); }} />}
        {tab === "suggestions" && <SuggestionsTab onNavigate={setTab} />}
        {tab === "articles" && <ArticlesTab pendingCorrection={pendingCorrection} onConsumePendingCorrection={() => setPendingCorrection(null)} pendingArticleRequest={pendingArticleRequest} onConsumePendingArticleRequest={() => setPendingArticleRequest(null)} pendingWelcomePage={pendingWelcomePage} onConsumePendingWelcomePage={() => setPendingWelcomePage(null)} />}
        {tab === "customers" && <CustomersTab />}
        {tab === "characters" && <CharactersTab />}
        {tab === "rewards" && <RewardsTab initialCharacterId={pendingRewardsCharacterId} onConsumeInitialCharacterId={() => setPendingRewardsCharacterId(null)} />}
        {tab === "grammar" && <GrammarTab />}
        {tab === "menu" && <ServiceMenuTab />}
        {tab === "logs" && <LogsTab />}
      </main>
    </div>
  );
}
