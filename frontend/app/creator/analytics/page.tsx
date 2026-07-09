"use client";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { AppHeader } from "@/components/AppHeader";
import { AnalyticsPanel } from "@/components/AnalyticsPanel";

export default function CreatorAnalyticsPage() {
  const { loading } = useRoleGuard(["creator", "admin"]);

  if (loading) return <Skeleton />;

  return (
    <div className="creator-theme min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" backHref="/dashboard" backLabel="ダッシュボード" title="質問分析ダッシュボード" />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <AnalyticsPanel />
      </main>
    </div>
  );
}
