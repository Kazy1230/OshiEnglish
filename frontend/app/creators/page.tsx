"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";
import { SampleChatPreview } from "@/components/SampleChatPreview";

type CreatorCard = {
  id: number;
  display_name: string;
  bio?: string | null;
  total_learners?: number;
  coaching_tags?: string[];
  sample_reply?: string | null;
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

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {loading ? (
          <p style={{ color: "var(--muted)" }}>読み込み中…</p>
        ) : creators.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>まだクリエイターが登録されていません。</p>
        ) : (
          <div className="flex flex-col gap-4">
            {creators.map(cr => (
              <Link key={cr.id} href={`/creators/${cr.id}`} className="card flex gap-4 hover-lift">
                <div className="flex-shrink-0" style={{ width: "20%" }}>
                  {cr.character?.avatar_url ? (
                    <img src={cr.character.avatar_url} alt="" className="w-full aspect-square rounded-full object-cover" />
                  ) : (
                    <div className="w-full aspect-square rounded-full flex items-center justify-center text-2xl" style={{ background: "var(--example-bg, #eee)" }}>🎭</div>
                  )}
                </div>

                <div className="flex flex-col gap-3" style={{ width: "80%" }}>
                  <div>
                    <p className="font-bold" style={{ color: "var(--primary)" }}>{cr.display_name}</p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>{cr.character?.name || "キャラクター未設定"}</p>
                    {!!cr.total_learners && cr.total_learners > 0 && (
                      <p className="text-xs mt-1" style={{ color: "var(--accent)" }}>学習者{cr.total_learners}名が選択</p>
                    )}
                  </div>

                  {cr.bio && <p className="text-sm" style={{ color: "var(--text)" }}>{cr.bio}</p>}

                  {cr.character && <SampleChatPreview characterName={cr.character.name} avatarUrl={cr.character.avatar_url} sampleReply={cr.sample_reply} compact />}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
