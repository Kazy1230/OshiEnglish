"use client";
import { useState } from "react";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { AppHeader } from "@/components/AppHeader";
import { InboxPanel } from "@/components/InboxPanel";

export default function CreatorInboxPage() {
  const { loading } = useRoleGuard(["creator", "admin"]);
  const [overdueCount, setOverdueCount] = useState(0);

  if (loading) return <Skeleton />;

  return (
    <div className="creator-theme min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" title="未回答の質問（Tier B）" overdueCount={overdueCount} />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <InboxPanel onOverdueCountChange={setOverdueCount} />
      </main>
    </div>
  );
}
