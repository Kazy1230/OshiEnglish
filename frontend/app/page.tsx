"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useDarkMode } from "@/lib/darkMode";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { LogoutButton } from "@/components/LogoutButton";

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

const STEPS = [
  { icon: "🎭", title: "クリエイターを選ぶ", desc: "得意分野・指導スタイルの合うメンターを見つけます" },
  { icon: "🗺️", title: "30日プランを受け取る", desc: "クリエイターのメソッドに基づいた、あなた専用のロードマップ" },
  { icon: "💬", title: "毎日、伴走してもらう", desc: "日々のタスクと対話で、目標達成までしっかり伴走します" },
] as const;

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

  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setSlide(0);
  }, [newest.length]);

  useEffect(() => {
    if (paused || newest.length <= 1) return;
    const timer = setInterval(() => {
      setSlide(prev => (prev + 1) % newest.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [paused, newest.length]);

  if (checkingRole) return null;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="flex items-center justify-between px-4 sm:px-6 py-4 sticky top-0 z-20 shadow-soft" style={{ background: "var(--primary)" }}>
        <h1 className="text-white font-black text-lg tracking-tight">
          Mana<span style={{ color: "var(--accent)", filter: "brightness(1.6)" }}>Village</span>
        </h1>
        <div className="flex items-center gap-3">
          <DarkModeToggle mode={mode} onToggle={toggleMode} variant="onColor" />
          {loggedIn ? (
            <>
              <Link href="/mypage" className="text-white text-sm font-medium hover:opacity-80 transition-opacity">マイページ</Link>
              <Link href="/creators" className="text-white text-sm font-medium hover:opacity-80 transition-opacity">クリエイターを探す</Link>
              <LogoutButton variant="onColor" />
            </>
          ) : (
            <>
              <Link href="/signup" className="text-white text-sm font-medium hover:opacity-80 transition-opacity">新規登録</Link>
              <Link href="/login" className="text-white text-sm font-bold px-4 py-2 rounded-full transition-transform hover:-translate-y-0.5" style={{ background: "rgba(255,255,255,0.18)" }}>
                ログイン
              </Link>
            </>
          )}
        </div>
      </header>

      {/* ヒーロー */}
      <section className="gradient-hero relative overflow-hidden px-4 sm:px-6 pt-16 sm:pt-20 pb-24 sm:pb-28 text-center">
        <div className="pointer-events-none absolute -top-16 -left-16 w-72 h-72 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} />
        <div className="pointer-events-none absolute -bottom-24 -right-10 w-96 h-96 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }} />
        <div className="pointer-events-none absolute top-1/3 right-1/4 w-24 h-24 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }} />
        <div className="relative">
          <span className="pill mb-4" style={{ background: "rgba(255,255,255,0.16)", color: "white" }}>
            🌱 30日間、好きなクリエイターと目標達成へ
          </span>
          <h2 className="text-white text-3xl sm:text-5xl font-black mb-4 leading-tight tracking-tight">
            学びを習慣に変える、<br className="sm:hidden" />伴走型コーチング
          </h2>
          <p className="text-white/85 text-sm sm:text-lg mb-8 max-w-xl mx-auto leading-relaxed">
            自分に合ったクリエイターを選んで、その人のメソッドで30日間、目標達成まで伴走してもらいましょう。
          </p>
          {!loggedIn ? (
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link href="/signup" className="btn-cta">
                新規登録してはじめる →
              </Link>
              <Link href="/login" className="text-white text-sm font-bold px-5 py-3 rounded-full transition-transform hover:-translate-y-0.5" style={{ background: "rgba(255,255,255,0.18)" }}>
                ログイン
              </Link>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3">
              <Link href="/creators" className="btn-cta">クリエイターを探す →</Link>
            </div>
          )}

          <div className="flex items-center justify-center gap-6 sm:gap-10 mt-10 text-white/90">
            <div>
              <p className="text-2xl sm:text-3xl font-black">30<span className="text-sm font-bold">日</span></p>
              <p className="text-xs text-white/70 mt-0.5">伴走期間</p>
            </div>
            <div className="w-px h-8" style={{ background: "rgba(255,255,255,0.25)" }} />
            <div>
              <p className="text-2xl sm:text-3xl font-black">毎日</p>
              <p className="text-xs text-white/70 mt-0.5">伴走メッセージが届く</p>
            </div>
            <div className="w-px h-8" style={{ background: "rgba(255,255,255,0.25)" }} />
            <div>
              <p className="text-2xl sm:text-3xl font-black">Tier A/B</p>
              <p className="text-xs text-white/70 mt-0.5">クリエイター直接添削も選べる</p>
            </div>
          </div>
        </div>
      </section>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col gap-14">
        {/* 検索バー：ヒーローに重ねる */}
        <div
          className="shadow-soft flex flex-col sm:flex-row sm:items-stretch rounded-full overflow-hidden focus-within:ring-2 -mt-12 relative z-10"
          style={{ background: "var(--card)", border: "1px solid var(--border)", "--tw-ring-color": "var(--accent)" } as React.CSSProperties}
        >
          <div className="flex-1 flex items-center gap-2 px-5 py-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              placeholder="コース名・キーワードで検索"
              style={{ border: "none", background: "transparent", padding: 0, width: "100%" }}
            />
          </div>
          <div className="hidden sm:block w-px my-2" style={{ background: "var(--border)" }} />
          <div className="sm:w-52 px-3 py-2 sm:py-0 flex items-center">
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              style={{ border: "none", background: "transparent", padding: "0.5rem 0.25rem", width: "100%" }}
            >
              <option value="">すべてのカテゴリ</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 新着コース：カルーセル */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1.5 h-5 rounded-full" style={{ background: "var(--accent)" }} />
            <h3 className="font-black text-lg" style={{ color: "var(--primary)" }}>新着コース</h3>
          </div>
          {loading ? (
            <div className="card animate-pulse flex flex-col sm:flex-row gap-4">
              <div className="w-full sm:w-64 h-40 rounded-lg flex-shrink-0" style={{ background: "var(--border)" }} />
              <div className="flex-1 flex flex-col gap-2 justify-center">
                <div className="h-4 rounded w-1/3" style={{ background: "var(--border)" }} />
                <div className="h-5 rounded w-2/3" style={{ background: "var(--border)" }} />
                <div className="h-3 rounded w-full" style={{ background: "var(--border)" }} />
              </div>
            </div>
          ) : newest.length === 0 ? (
            <p className="card text-center" style={{ color: "var(--muted)" }}>該当するコースが見つかりませんでした。</p>
          ) : (
            <div
              className="relative overflow-hidden rounded-2xl shadow-soft"
              onMouseEnter={() => setPaused(true)}
              onMouseLeave={() => setPaused(false)}
            >
              <div
                className="flex transition-transform duration-700 ease-in-out"
                style={{ transform: `translateX(-${slide * 100}%)` }}
              >
                {newest.map(c => (
                  <Link
                    key={c.id}
                    href={`/courses/${c.id}`}
                    className="w-full flex-shrink-0 flex flex-col sm:flex-row gap-4 sm:gap-6 p-5 sm:p-6"
                    style={{ background: "var(--card)" }}
                  >
                    <div className="relative w-full sm:w-64 flex-shrink-0">
                      {c.thumbnail_url ? (
                        <img src={c.thumbnail_url} alt="" className="w-full h-40 sm:h-44 object-cover rounded-lg" />
                      ) : (
                        <div className="w-full h-40 sm:h-44 rounded-lg flex items-center justify-center text-4xl gradient-hero">📘</div>
                      )}
                      {c.character?.name && (
                        <div
                          className="absolute -bottom-3 left-3 flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full shadow-soft"
                          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                        >
                          {c.character.avatar_url ? (
                            <img src={c.character.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                          ) : (
                            <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs" style={{ background: "var(--example-bg, #eee)" }}>🎭</span>
                          )}
                          <span className="text-xs font-bold" style={{ color: "var(--primary)" }}>{c.character.name}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 flex flex-col gap-2 justify-center mt-3 sm:mt-0">
                      <div className="flex items-center gap-2">
                        {c.category && (
                          <span className="pill" style={{ background: "var(--example-bg, #eee)", color: "var(--accent)" }}>
                            {c.category}
                          </span>
                        )}
                        <span className="text-xs font-black" style={{ color: "var(--accent)" }}>{priceLabel(c)}</span>
                      </div>
                      <p className="font-black text-lg" style={{ color: "var(--primary)" }}>{c.title}</p>
                      {c.description && <p className="text-sm line-clamp-2" style={{ color: "var(--muted)" }}>{c.description}</p>}
                    </div>
                  </Link>
                ))}
              </div>

              {newest.length > 1 && (
                <div className="flex items-center justify-center gap-2 py-3" style={{ background: "var(--card)" }}>
                  {newest.map((c, i) => (
                    <button
                      key={c.id}
                      aria-label={`${i + 1}番目のコースを表示`}
                      onClick={() => setSlide(i)}
                      className="rounded-full transition-all"
                      style={{
                        width: i === slide ? "20px" : "8px",
                        height: "8px",
                        background: i === slide ? "var(--accent)" : "var(--border)",
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 使い方3ステップ */}
        <div>
          <div className="text-center mb-8">
            <span className="text-xs font-black tracking-widest" style={{ color: "var(--accent)" }}>HOW IT WORKS</span>
            <h3 className="font-black text-xl sm:text-2xl mt-2" style={{ color: "var(--primary)" }}>はじめるのは、3ステップだけ</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {STEPS.map((s, i) => (
              <div key={s.title} className="card hover-lift relative text-center flex flex-col items-center gap-2">
                <span
                  className="absolute -top-3 -left-3 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white"
                  style={{ background: "var(--accent)" }}
                >
                  {i + 1}
                </span>
                <span className="text-3xl">{s.icon}</span>
                <p className="font-bold" style={{ color: "var(--primary)" }}>{s.title}</p>
                <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* クリエイターCTA */}
        <div className="card shadow-soft flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 sm:p-8 relative overflow-hidden" style={{ borderLeft: "4px solid var(--accent)" }}>
          <div className="flex items-start gap-4">
            <span className="text-3xl flex-shrink-0">🌟</span>
            <div>
              <p className="font-black text-lg" style={{ color: "var(--primary)" }}>あなたも伴走コースを作りませんか？</p>
              <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                クリエイターとして申請し、あなたのメソッドで30日コースを作成して、学習者の目標達成に伴走できます。
              </p>
            </div>
          </div>
          <Link href="/creator/apply" className="btn-cta whitespace-nowrap text-center flex-shrink-0">
            クリエイター申請へ →
          </Link>
        </div>
      </main>
    </div>
  );
}
