"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useDarkMode } from "@/lib/darkMode";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { toast } from "@/components/Toast";

type InstructorDetail = {
  id: number;
  display_name: string;
  bio?: string | null;
  sns_youtube?: string | null;
  sns_instagram?: string | null;
  sns_twitter?: string | null;
  characters: { id: number; name: string; avatar_url?: string | null }[];
  courses: { id: number; title: string; description?: string | null; thumbnail_url?: string | null; category?: string | null; price: number; is_free: boolean }[];
  is_favorited: boolean;
};

export default function InstructorPage() {
  const params = useParams();
  const router = useRouter();
  const instructorId = Number(params.id);
  const [data, setData] = useState<InstructorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [favoriting, setFavoriting] = useState(false);
  const [mode, toggleMode] = useDarkMode();

  useEffect(() => {
    api.getInstructor(instructorId).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [instructorId]);

  async function toggleFavorite() {
    if (!data) return;
    if (!getToken()) { router.push("/login"); return; }
    setFavoriting(true);
    try {
      if (data.is_favorited) {
        await api.removeFavorite(instructorId);
        setData({ ...data, is_favorited: false });
        toast("お気に入りを解除しました", "info");
      } else {
        await api.addFavorite(instructorId);
        setData({ ...data, is_favorited: true });
        toast("お気に入りに登録しました", "success");
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "操作に失敗しました", "error");
    } finally {
      setFavoriting(false);
    }
  }

  if (loading) return <p className="p-8" style={{ color: "var(--muted)" }}>読み込み中…</p>;
  if (!data) return <p className="p-8" style={{ color: "var(--muted)" }}>講師が見つかりません</p>;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="flex items-center justify-between px-4 sm:px-6 py-4" style={{ background: "var(--primary)" }}>
        <Link href="/instructors" className="text-white/80 text-sm">← 講師一覧</Link>
        <DarkModeToggle mode={mode} onToggle={toggleMode} variant="onColor" />
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        <div className="card flex flex-col sm:flex-row gap-4 sm:items-center">
          <div className="flex items-center gap-3">
            {data.characters[0]?.avatar_url ? (
              <img src={data.characters[0].avatar_url} alt="" className="w-20 h-20 rounded-full object-cover" />
            ) : (
              <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl" style={{ background: "var(--example-bg, #eee)" }}>🎭</div>
            )}
            <div>
              <h1 className="text-xl font-black" style={{ color: "var(--primary)" }}>{data.display_name}</h1>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                {data.characters.map(c => c.name).join(" / ")}
              </p>
            </div>
          </div>
          <button onClick={toggleFavorite} disabled={favoriting}
            className="sm:ml-auto px-4 py-2 rounded-full text-sm font-bold border-2 transition-all disabled:opacity-50"
            style={{ borderColor: "var(--accent)", color: data.is_favorited ? "white" : "var(--accent)", background: data.is_favorited ? "var(--accent)" : "transparent" }}>
            {data.is_favorited ? "★ お気に入り登録済み" : "☆ お気に入りに登録"}
          </button>
        </div>

        {data.bio && <p className="text-sm" style={{ color: "var(--text)" }}>{data.bio}</p>}

        <div className="flex gap-3 text-xs" style={{ color: "var(--muted)" }}>
          {data.sns_youtube && <a href={data.sns_youtube} target="_blank" rel="noopener noreferrer">▶ YouTube</a>}
          {data.sns_instagram && <a href={data.sns_instagram} target="_blank" rel="noopener noreferrer">📷 Instagram</a>}
          {data.sns_twitter && <a href={data.sns_twitter} target="_blank" rel="noopener noreferrer">🐦 X</a>}
        </div>

        <div>
          <h2 className="font-bold mb-3" style={{ color: "var(--primary)" }}>コンテンツ一覧</h2>
          {data.courses.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>まだ公開コンテンツがありません。</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {data.courses.map(c => (
                <Link key={c.id} href={`/courses/${c.id}`} className="card flex flex-col gap-2 hover:shadow-md transition-shadow">
                  {c.category && <span className="text-xs font-bold self-start px-2 py-0.5 rounded-full" style={{ background: "var(--example-bg, #eee)", color: "var(--accent)" }}>{c.category}</span>}
                  <p className="font-bold" style={{ color: "var(--primary)" }}>{c.title}</p>
                  {c.description && <p className="text-xs line-clamp-2" style={{ color: "var(--muted)" }}>{c.description}</p>}
                  <p className="text-sm font-bold" style={{ color: "var(--accent)" }}>
                    {c.is_free ? "無料" : `¥${c.price.toLocaleString()}`}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
