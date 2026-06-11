"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import type { Tab } from "../types";
export function DashboardTab({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStats = async () => {
    const [orders, articles, customers, serviceItems] = await Promise.all([
      api.adminGetOrders(),
      api.adminGetArticles(),
      api.adminGetCustomers(),
      api.adminListAllServiceItems().catch(() => []),
    ]);
    const nonAdmin = customers.filter((c: any) => !c.is_admin);
    setStats({
      newOrders: orders.filter((o: any) => o.status === "new").length,
      inProgress: orders.filter((o: any) => o.status === "in_progress").length,
      totalOrders: orders.length,
      publishedArticles: articles.filter((a: any) => a.status === "published").length,
      draftArticles: articles.filter((a: any) => a.status === "draft").length,
      reviewArticles: articles.filter((a: any) => a.status === "review").length,
      exerciseArticles: articles.filter((a: any) => a.article_type === "exercise").length,
      publishedExercises: articles.filter((a: any) => a.article_type === "exercise" && a.status === "published").length,
      totalCustomers: nonAdmin.length,
      pwNotChanged: nonAdmin.filter((c: any) => c.is_password_reset_required).length,
      activeMenuItems: serviceItems.filter((s: any) => s.is_active).length,
      totalMenuItems: serviceItems.length,
      recentOrders: orders.slice(0, 5),
      recentArticles: articles.slice(0, 5),
    });
    setLastUpdated(new Date());
  };

  useEffect(() => {
    fetchStats().finally(() => setLoading(false));
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    try { await fetchStats(); toast("データを更新しました", "success"); }
    finally { setRefreshing(false); }
  }

  if (loading) return <p style={{ color: "var(--muted)" }}>読み込み中…</p>;
  if (!stats) return null;

  const statusColor: Record<string, string> = { draft: "#f5f5f5", review: "#fff8e1", published: "#e8fdf0" };
  const statusLabel: Record<string, string> = { draft: "下書き", review: "確認中", published: "公開中" };
  const orderStatusLabel: Record<string, string> = { new: "🆕 新規", in_progress: "🔧 対応中", delivered: "✅ 納品済" };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black" style={{ color: "var(--primary)" }}>🏠 ダッシュボード</h2>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              更新: {lastUpdated.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
          <button className="btn-ghost text-sm py-1.5 px-3" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? "更新中…" : "🔄 更新"}
          </button>
        </div>
      </div>

      {/* KPIカード（7枚：演習問題数を追加） */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: "受注合計", value: stats.totalOrders, sub: `新規 ${stats.newOrders}件`, color: "#fdf6f6", action: () => onNavigate("orders") },
          { label: "対応中", value: stats.inProgress, sub: "受注リストへ", color: "#fff8e1", action: () => onNavigate("orders") },
          { label: "公開記事", value: stats.publishedArticles, sub: `確認待 ${stats.reviewArticles}件`, color: "#e8fdf0", action: () => onNavigate("articles") },
          { label: "下書き", value: stats.draftArticles, sub: "記事管理へ", color: "#f5f5f5", action: () => onNavigate("articles") },
          { label: "🧩 演習問題", value: stats.exerciseArticles, sub: `公開中 ${stats.publishedExercises}件`, color: "#ece4ff", action: () => onNavigate("articles") },
          { label: "顧客数", value: stats.totalCustomers, sub: `PW未変更 ${stats.pwNotChanged}人`, color: "#e8f4fd", action: () => onNavigate("customers") },
          { label: "掲載中メニュー", value: stats.activeMenuItems, sub: `全${stats.totalMenuItems}項目`, color: "#f3eefb", action: () => onNavigate("menu") },
        ].map(s => (
          <button key={s.label} onClick={s.action}
            className="card text-left hover:shadow-md transition-all"
            style={{ background: s.color }}>
            <p className="text-xs" style={{ color: "var(--muted)" }}>{s.label}</p>
            <p className="text-3xl font-black mt-1" style={{ color: "var(--primary)" }}>{s.value}</p>
            <p className="text-xs mt-1" style={{ color: "var(--accent)" }}>{s.sub}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* 最近の受注 */}
        <div className="card flex flex-col gap-2">
          <div className="flex items-center justify-between mb-2">
            <p className="font-bold text-sm" style={{ color: "var(--primary)" }}>📋 最近の受注</p>
            <button className="text-xs" style={{ color: "var(--accent)" }} onClick={() => onNavigate("orders")}>すべて見る →</button>
          </div>
          {stats.recentOrders.length === 0
            ? <p className="text-xs" style={{ color: "var(--muted)" }}>受注はありません</p>
            : stats.recentOrders.map((o: any) => (
              <div key={o.id} className="flex items-center justify-between py-1.5 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{o.customer_name}</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>{o.character_name || "—"} / {o.grammar_topic || "—"}</p>
                </div>
                <span className="text-xs">{orderStatusLabel[o.status]}</span>
              </div>
            ))
          }
        </div>

        {/* 最近の記事 */}
        <div className="card flex flex-col gap-2">
          <div className="flex items-center justify-between mb-2">
            <p className="font-bold text-sm" style={{ color: "var(--primary)" }}>📝 最近の記事</p>
            <button className="text-xs" style={{ color: "var(--accent)" }} onClick={() => onNavigate("articles")}>すべて見る →</button>
          </div>
          {stats.recentArticles.length === 0
            ? <p className="text-xs" style={{ color: "var(--muted)" }}>記事はありません</p>
            : stats.recentArticles.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between py-1.5 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <div className="flex-1 min-w-0 mr-2">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>
                    {a.article_type === "blog" && "📰 "}{a.article_type === "exercise" && "🧩 "}{a.title}
                  </p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    {a.article_type === "exercise"
                      ? `${a.exercise_category || "演習問題"} / ${a.character_name || "—"}`
                      : `${a.customer_name || `顧客ID:${a.customer_id}`} / ${a.character_name || "—"}`}
                  </p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: statusColor[a.status] }}>{statusLabel[a.status]}</span>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}