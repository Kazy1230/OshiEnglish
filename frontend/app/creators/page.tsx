"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";

type CreatorCard = {
  id: number;
  display_name: string;
  bio?: string | null;
  character: { id: number; name: string; avatar_url?: string | null } | null;
};

export default function CreatorsPage() {
  const [creators, setCreators] = useState<CreatorCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listCreators().then(setCreators).finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="learner" title="クリエイターを選ぶ" />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {loading ? (
          <p style={{ color: "var(--muted)" }}>読み込み中…</p>
        ) : creators.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>まだクリエイターが登録されていません。</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {creators.map(cr => (
              <Link key={cr.id} href={`/creators/${cr.id}`} className="card flex flex-col gap-3 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3">
                  {cr.character?.avatar_url ? (
                    <img src={cr.character.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover" />
                  ) : (
                    <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl" style={{ background: "var(--example-bg, #eee)" }}>🎭</div>
                  )}
                  <div>
                    <p className="font-bold" style={{ color: "var(--primary)" }}>{cr.display_name}</p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      {cr.character?.name || "キャラクター未設定"}
                    </p>
                  </div>
                </div>
                {cr.bio && <p className="text-xs line-clamp-2" style={{ color: "var(--muted)" }}>{cr.bio}</p>}
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
