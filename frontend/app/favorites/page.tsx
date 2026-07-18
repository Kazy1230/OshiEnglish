"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { AppHeader } from "@/components/AppHeader";
import { SectionHeading } from "@/components/SectionHeading";

type FavoriteCreator = {
  creator_id: number;
  display_name: string;
  character: { id: number; name: string; avatar_url?: string | null } | null;
};

export default function FavoritesPage() {
  const { loading } = useRoleGuard(["learner", "admin"]);
  const [favorites, setFavorites] = useState<FavoriteCreator[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (loading) return;
    api.listFavorites().then(setFavorites).catch(() => {}).finally(() => setFetching(false));
  }, [loading]);

  async function handleRemove(creatorId: number) {
    try {
      await api.removeFavorite(creatorId);
      setFavorites(prev => prev.filter(f => f.creator_id !== creatorId));
      toast("お気に入りを解除しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "解除に失敗しました", "error");
    }
  }

  if (loading || fetching) return <Skeleton />;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="learner" title="お気に入り" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        <SectionHeading>お気に入りのクリエイター</SectionHeading>

        {favorites.length === 0 ? (
          <div className="card shadow-soft flex flex-col items-center gap-3 text-center py-10">
            <span className="text-4xl">⭐</span>
            <p className="text-sm" style={{ color: "var(--muted)" }}>まだお気に入りのクリエイターがいません。</p>
            <Link href="/creators" className="btn-cta">クリエイターを探す →</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {favorites.map(f => (
              <div key={f.creator_id} className="card hover-lift shadow-soft flex items-center gap-3">
                <Link href={`/creators/${f.creator_id}`} className="flex items-center gap-3 flex-1 min-w-0">
                  {f.character?.avatar_url ? (
                    <img src={f.character.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <span className="w-12 h-12 rounded-full flex items-center justify-center text-xl flex-shrink-0" style={{ background: "var(--surface)" }}>🎭</span>
                  )}
                  <span className="font-bold truncate" style={{ color: "var(--primary)" }}>{f.display_name}</span>
                </Link>
                <button onClick={() => handleRemove(f.creator_id)} className="text-xs underline flex-shrink-0" style={{ color: "var(--muted)" }}>
                  解除
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
