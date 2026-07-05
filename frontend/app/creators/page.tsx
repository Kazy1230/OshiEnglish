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

const SUBJECT_TABS = [
  { key: "all", label: "すべて" },
  { key: "english", label: "英語" },
  { key: "it", label: "IT・プログラミング" },
  { key: "music", label: "音楽" },
];

export default function CreatorsPage() {
  const [creators, setCreators] = useState<CreatorCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSubject, setActiveSubject] = useState("all");

  useEffect(() => {
    api.listCreators().then(setCreators).finally(() => setLoading(false));
  }, []);

  const filtered = activeSubject === "all"
    ? creators
    : creators.filter(cr => cr.subject === activeSubject);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <PublicHeader />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Subject filter tabs */}
        <div className="flex gap-2 flex-wrap mb-6">
          {SUBJECT_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveSubject(tab.key)}
              className="text-sm font-bold px-4 py-2 rounded-full transition-all"
              style={{
                background: activeSubject === tab.key ? "var(--primary)" : "var(--card)",
                color: activeSubject === tab.key ? "white" : "var(--muted)",
                border: `1.5px solid ${activeSubject === tab.key ? "var(--primary)" : "var(--border)"}`,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ color: "var(--muted)" }}>読み込み中…</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>
            {activeSubject === "all" ? "まだクリエイターが登録されていません。" : "この分野のクリエイターはまだいません。"}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {filtered.map(cr => (
              <Link key={cr.id} href={`/creators/${cr.id}`} className="card flex gap-4 hover-lift">
                <div className="flex-shrink-0 w-16 sm:w-20">
                  {cr.character?.avatar_url ? (
                    <img src={cr.character.avatar_url} alt="" className="w-full aspect-square rounded-full object-cover" />
                  ) : (
                    <div className="w-full aspect-square rounded-full flex items-center justify-center text-2xl" style={{ background: "var(--example-bg, #eee)" }}>🎭</div>
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
