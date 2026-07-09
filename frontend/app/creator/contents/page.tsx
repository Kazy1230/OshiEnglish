"use client";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { AppHeader } from "@/components/AppHeader";
import { ContentsPoolPanel } from "@/components/ContentsPoolPanel";

export default function CreatorContentsPage() {
  const { loading } = useRoleGuard(["creator", "admin"]);

  if (loading) return <Skeleton />;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" title="コンテンツプール" />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <ContentsPoolPanel />
      </main>
    </div>
  );
}
