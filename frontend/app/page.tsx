"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useDarkMode } from "@/lib/darkMode";
import { DarkModeToggle } from "@/components/DarkModeToggle";

type CourseCard = {
  id: number;
  title: string;
  description?: string | null;
  thumbnail_url?: string | null;
  category?: string | null;
  price: number;
  is_free: boolean;
  tier_a_price?: number | null;
  tier_b_price?: number | null;
  character?: { name?: string | null; avatar_url?: string | null } | null;
};

function priceLabel(c: CourseCard) {
  if (c.is_free) return "無料";
  if (c.tier_a_price) return `¥${c.tier_a_price.toLocaleString()}/月〜`;
  if (c.tier_b_price) return `¥${c.tier_b_price.toLocaleString()}/月〜`;
  return `¥${c.price.toLocaleString()}`;
}

export default function Home() {
  const router = useRouter();
  const [mode, toggleMode] = useDarkMode();
  const [loggedIn, setLoggedIn] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);
  const [courses, setCourses] = useState<CourseCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("");

  useEffect(() => {
    if (!getToken()) {
      setCheckingRole(false);
      return;
    }
    setLoggedIn(true);
    api.me().then(me => {
      if (me.role === "admin") router.replace("/admin");
      else if (me.role === "creator") router.replace("/dashboard");
      else setCheckingRole(false);
    }).catch(() => setCheckingRole(false));
  }, [router]);

  useEffect(() => {
    api.listCourses(category || undefined).then(setCourses).finally(() => setLoading(false));
  }, [category]);

  const categories = useMemo(
    () => Array.from(new Set(courses.map(c => c.category).filter(Boolean))) as string[],
    [courses]
  );

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return courses;
    return courses.filter(c =>
      c.title.toLowerCase().includes(kw) || (c.description ?? "").toLowerCase().includes(kw)
    );
  }, [courses, keyword]);

  const newest = filtered.slice(0, 6);

  if (checkingRole) return null;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="flex items-center justify-between px-4 sm:px-6 py-4" style={{ background: "var(--primary)" }}>
        <h1 className="text-white font-black text-lg">ManaVillage</h1>
        <div className="flex items-center gap-3">
          <DarkModeToggle mode={mode} onToggle={toggleMode} variant="onColor" />
          {loggedIn ? (
            <Link href="/creators" className="text-white text-sm font-medium underline">クリエイターを探す</Link>
          ) : (
            <Link href="/login" className="text-white text-sm font-bold px-3 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.18)" }}>
              ログイン
            </Link>
          )}
        </div>
      </header>

      <section className="px-4 sm:px-6 py-12 text-center" style={{ background: "var(--primary)" }}>
        <h2 className="text-white text-2xl sm:text-3xl font-black mb-3">90日間のAIメンターシップで、学びを習慣に</h2>
        <p className="text-white/85 text-sm sm:text-base mb-6 max-w-xl mx-auto">
          自分にあったクリエイター（メンター）を選んで、AIと一緒に90日間の学習プランを伴走してもらいましょう。
        </p>
        {!loggedIn && (
          <div className="flex items-center justify-center gap-3">
            <Link href="/login" className="btn-primary px-6 py-2.5 inline-block" style={{ background: "white", color: "var(--primary)" }}>
              ログインしてはじめる
            </Link>
          </div>
        )}
      </section>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">
        <div className="card flex flex-col sm:flex-row gap-3">
          <input
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            placeholder="コース名・キーワードで検索"
            className="flex-1"
          />
          <select value={category} onChange={e => setCategory(e.target.value)} className="sm:w-48">
            <option value="">すべてのカテゴリ</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div>
          <h3 className="font-bold mb-3" style={{ color: "var(--primary)" }}>新着コース</h3>
          {loading ? (
            <p style={{ color: "var(--muted)" }}>読み込み中…</p>
          ) : newest.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>該当するコースが見つかりませんでした。</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {newest.map(c => (
                <Link key={c.id} href={`/courses/${c.id}`} className="card flex flex-col gap-2 hover:shadow-md transition-shadow">
                  {c.thumbnail_url ? (
                    <img src={c.thumbnail_url} alt="" className="w-full h-32 object-cover rounded-lg" />
                  ) : (
                    <div className="w-full h-32 rounded-lg flex items-center justify-center text-3xl" style={{ background: "var(--example-bg, #eee)" }}>📘</div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    {c.category && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--example-bg, #eee)", color: "var(--accent)" }}>
                        {c.category}
                      </span>
                    )}
                    <span className="text-xs font-bold" style={{ color: "var(--accent)" }}>{priceLabel(c)}</span>
                  </div>
                  <p className="font-bold" style={{ color: "var(--primary)" }}>{c.title}</p>
                  {c.description && <p className="text-xs line-clamp-2" style={{ color: "var(--muted)" }}>{c.description}</p>}
                  {c.character?.name && (
                    <p className="text-xs" style={{ color: "var(--muted)" }}>担当: {c.character.name}</p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        <Link
          href={loggedIn ? "/creator/apply" : "/login"}
          className="card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:shadow-md transition-shadow"
          style={{ borderColor: "var(--primary)" }}
        >
          <div>
            <p className="font-bold" style={{ color: "var(--primary)" }}>あなたも伴走コースを作りませんか？</p>
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              クリエイターとして申請し、AIメンターと90日コースを作成して学習者を伴走できます。
            </p>
          </div>
          <span className="btn-primary text-center whitespace-nowrap">クリエイター申請へ</span>
        </Link>
      </main>
    </div>
  );
}
