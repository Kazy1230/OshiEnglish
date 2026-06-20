"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useDarkMode } from "@/lib/darkMode";
import { DarkModeToggle } from "@/components/DarkModeToggle";

type InstructorCard = {
  id: number;
  display_name: string;
  bio?: string | null;
  characters: { id: number; name: string; avatar_url?: string | null }[];
};

export default function InstructorsPage() {
  const [instructors, setInstructors] = useState<InstructorCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, toggleMode] = useDarkMode();

  useEffect(() => {
    api.listInstructors().then(setInstructors).finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="flex items-center justify-between px-4 sm:px-6 py-4" style={{ background: "var(--primary)" }}>
        <h1 className="text-white font-black text-lg">講師を選ぶ</h1>
        <DarkModeToggle mode={mode} onToggle={toggleMode} variant="onColor" />
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {loading ? (
          <p style={{ color: "var(--muted)" }}>読み込み中…</p>
        ) : instructors.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>まだ講師が登録されていません。</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {instructors.map(ins => (
              <Link key={ins.id} href={`/instructors/${ins.id}`} className="card flex flex-col gap-3 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3">
                  {ins.characters[0]?.avatar_url ? (
                    <img src={ins.characters[0].avatar_url} alt="" className="w-14 h-14 rounded-full object-cover" />
                  ) : (
                    <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl" style={{ background: "var(--example-bg, #eee)" }}>🎭</div>
                  )}
                  <div>
                    <p className="font-bold" style={{ color: "var(--primary)" }}>{ins.display_name}</p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      {ins.characters.map(c => c.name).join(" / ") || "キャラクター未設定"}
                    </p>
                  </div>
                </div>
                {ins.bio && <p className="text-xs line-clamp-2" style={{ color: "var(--muted)" }}>{ins.bio}</p>}
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
