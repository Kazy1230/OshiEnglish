"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { PublicHeader } from "@/components/PublicHeader";
import { SampleChatPreview } from "@/components/SampleChatPreview";

type CreatorCard = {
  id: number;
  display_name: string;
  bio?: string | null;
  total_learners?: number;
  coaching_tags?: string[];
  sample_reply?: string | null;
  subject?: string | null;
  character: { id: number; name: string; avatar_url?: string | null } | null;
};

export default function CreatorsPage() {
  const [creators, setCreators] = useState<CreatorCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchSubject, setSearchSubject] = useState("");

  useEffect(() => {
    api.listCreators().then(setCreators).finally(() => setLoading(false));
  }, []);

  const filtered = searchSubject.trim()
    ? creators.filter(cr => cr.subject?.toLowerCase().includes(searchSubject.toLowerCase()))
    : creators;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <PublicHeader />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* 分野検索 */}
        <div className="mb-6">
          <input
            value={searchSubject}
            onChange={e => setSearchSubject(e.target.value)}
            placeholder="分野で絞り込む（例: 料理、Python、ヨガ）"
            className="w-full"
            style={{ maxWidth: 400 }}
          />
        </div>

        {loading ? (
          <p style={{ color: "var(--muted)" }}>読み込み中…</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>
            {creators.length === 0 ? "まだクリエイターが登録されていません。" : "この分野のクリエイターはまだいません。"}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {filtered.map(cr => (
              <Link key={cr.id} href={`/creators/${cr.id}`} className="card flex gap-4 hover-lift">
                <div className="flex-shrink-0 w-16 sm:w-20">
                  {cr.character?.avatar_url ? (
                    <img src={cr.character.avatar_url} alt="" className="w-full aspect-square rounded-full object-cover" />
                  ) : (
                    <div className="w-full aspect-square rounded-full flex items-center justify-center text-2xl" style={{ background: "var(--surface)" }}>🎭</div>
                  )}
                </div>

                <div className="flex flex-col gap-3 flex-1 min-w-0">
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
