"use client";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { AppHeader } from "@/components/AppHeader";
import { RevenuePanel } from "@/components/RevenuePanel";

export default function CreatorRevenuePage() {
  const { loading } = useRoleGuard(["creator", "admin"]);

  if (loading) return <Skeleton />;

  return (
    <div className="creator-theme min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" title="収益ダッシュボード" />
      <main className="max-w-xl mx-auto px-4 sm:px-6 py-8">
        <RevenuePanel />
      </main>
    </div>
  );
}
