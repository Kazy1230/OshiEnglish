"use client";

import { LogoutButton } from "@/components/LogoutButton";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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

const STEPS = [
  {
    icon: "🔍",
    title: "コースを選ぶ",
    desc: "目標、価格、クリエイターの雰囲気を比べて、自分に合う伴走コースを探します。",
  },
  {
    icon: "🧭",
    title: "Day1診断を受ける",
    desc: "現在地、目標、学習時間、苦手分野を答えると30日プランが作られます。",
  },
  {
    icon: "🔥",
    title: "毎日進める",
    desc: "今日のタスクを確認し、チャットで報告や相談をしながら学習を続けます。",
  },
] as const;

function priceLabel(c: CourseCard) {
  if (c.is_free) return "無料";
  const prices = [c.tier_a_price, c.tier_b_price].filter((p): p is number => typeof p === "number" && p > 0);
  if (prices.length > 0) return `月額 ¥${Math.min(...prices).toLocaleString()}〜`;
  return `¥${c.price.toLocaleString()}`;
}

function tierLabel(c: CourseCard) {
  if (c.tier_a_price && c.tier_b_price) return "Tier A / B";
  if (c.tier_b_price) return "Tier B";
  if (c.tier_a_price) return "Tier A";
  return c.is_free ? "無料" : "買い切り";
}

export default function Home() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);
  const [courses, setCourses] = useState<CourseCard[]>([]);
  const [allCourses, setAllCourses] = useState<CourseCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("");
  const [achieversCount, setAchieversCount] = useState(0);

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
    setLoading(true);
    api.listCourses(category || undefined).then(setCourses).finally(() => setLoading(false));
  }, [category]);

  useEffect(() => {
    api.listCourses().then(setAllCourses).catch(() => { });
    api.getPublicStats().then(s => setAchieversCount(s.achievers_count)).catch(() => { });
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(allCourses.map(c => c.category).filter(Boolean))) as string[],
    [allCourses]
  );

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return courses;
    return courses.filter(c =>
      c.title.toLowerCase().includes(kw) ||
      (c.description ?? "").toLowerCase().includes(kw) ||
      (c.character?.name ?? "").toLowerCase().includes(kw)
    );
  }, [courses, keyword]);

  const featured = filtered[0] ?? null;
  const courseGrid = featured ? filtered.slice(1, 7) : filtered.slice(0, 6);

  if (checkingRole) return null;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="sticky top-0 z-30" style={{ background: "color-mix(in srgb, var(--card) 88%, transparent)", backdropFilter: "blur(16px)", boxShadow: "0 1px 0 var(--border)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link href="/" className="font-black text-lg tracking-tight whitespace-nowrap" style={{ color: "var(--primary)" }}>
            Mana<span style={{ color: "var(--accent)" }}>Village</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-6 text-sm font-bold" style={{ color: "var(--muted)" }}>
            <a href="#courses" className="hover:opacity-75 transition-opacity">コース</a>
            <a href="#how-it-works" className="hover:opacity-75 transition-opacity">使い方</a>
            <Link href="/creators" className="hover:opacity-75 transition-opacity">クリエイター</Link>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            {loggedIn ? (
              <>
                <Link href="/mypage" className="text-sm font-bold" style={{ color: "var(--primary)" }}>マイページ</Link>
                <LogoutButton variant="onSurface" />
              </>
            ) : (
              <>
                <Link href="/login" className="text-sm font-bold" style={{ color: "var(--primary)" }}>ログイン</Link>
                <Link href="/signup" className="btn-primary text-sm px-4 py-2">無料登録</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* ===== ヒーロー：エディトリアル ===== */}
        <section className="relative overflow-hidden" style={{ background: "var(--ink)" }}>
          {/* ノイズテクスチャ風オーバーレイ */}
          <div className="pointer-events-none absolute inset-0" style={{
            backgroundImage: "radial-gradient(circle at 70% 30%, color-mix(in srgb, var(--accent) 18%, transparent) 0%, transparent 55%), radial-gradient(circle at 15% 80%, color-mix(in srgb, var(--accent) 10%, transparent) 0%, transparent 45%)",
          }} />
          {/* 細いゴールドラインアクセント */}
          <div className="pointer-events-none absolute top-0 left-0 right-0 h-px" style={{ background: "var(--accent)", opacity: 0.5 }} />

          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-28 sm:pb-36 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-12 lg:gap-16 items-center">
            <div className="flex flex-col gap-8">
              <div className="flex items-center gap-3">
                <div className="h-px w-10 flex-shrink-0" style={{ background: "var(--accent)" }} />
                <span className="text-xs font-bold tracking-[0.2em] uppercase" style={{ color: "var(--accent)" }}>Mentor Platform</span>
              </div>
              <h1 style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(3rem, 7vw, 5.5rem)",
                fontWeight: 600,
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
                color: "var(--bg)",
              }}>
                学ぶ人に、<br />
                <em style={{ fontStyle: "italic", color: "var(--accent)" }}>メンター</em>を。
              </h1>
              <p style={{ fontSize: "1.05rem", lineHeight: 1.85, color: "color-mix(in srgb, var(--bg) 70%, transparent)", maxWidth: "34rem" }}>
                誰と挑戦するかで、未来は変わる。<br />
                その一歩を、最後まで支えるために。
              </p>
              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <a href="#courses" style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  padding: "0.85rem 2.2rem", borderRadius: 4, fontWeight: 600,
                  background: "var(--accent)", color: "var(--bg)",
                  fontSize: "0.95rem", letterSpacing: "0.04em", transition: "opacity 0.2s",
                  boxShadow: "0 4px 24px color-mix(in srgb, var(--accent) 40%, transparent)",
                }}>
                  コースを探す →
                </a>
                <Link href="/creator/apply" style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  padding: "0.85rem 2.2rem", borderRadius: 4, fontWeight: 600,
                  border: "1px solid color-mix(in srgb, var(--bg) 25%, transparent)",
                  color: "color-mix(in srgb, var(--bg) 80%, transparent)",
                  fontSize: "0.95rem", letterSpacing: "0.04em", transition: "border-color 0.2s, color 0.2s",
                }}>
                  クリエイターとして参加
                </Link>
              </div>
            </div>

            <div className="relative">
              {featured ? (
                <FeaturedCourse course={featured} />
              ) : (
                <div className="p-8 min-h-[320px] flex flex-col justify-between" style={{
                  background: "color-mix(in srgb, var(--bg) 5%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--bg) 12%, transparent)",
                  borderRadius: 8,
                }}>
                  <div>
                    <p className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: "var(--accent)" }}>Coming Soon</p>
                    <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem", fontWeight: 600, color: "var(--bg)", lineHeight: 1.3 }}>
                      公開コースがここに<br />表示されます
                    </h2>
                    <p className="text-sm mt-4 leading-relaxed" style={{ color: "color-mix(in srgb, var(--bg) 55%, transparent)" }}>
                      クリエイターのコースが公開されると、サムネイル・価格・伴走タイプが確認できます。
                    </p>
                  </div>
                  <Link href="/creator/apply" style={{
                    display: "inline-flex", alignItems: "center",
                    padding: "0.7rem 1.8rem", borderRadius: 4, fontWeight: 600, alignSelf: "flex-start",
                    background: "var(--accent)", color: "var(--bg)", fontSize: "0.9rem",
                  }}>コースを作る</Link>
                </div>
              )}
            </div>
          </div>

          {/* ボトムライン */}
          <div className="absolute bottom-0 left-0 right-0" style={{ height: 1, background: "var(--border)", opacity: 0.3 }} />
        </section>

        {/* ===== 統計バー ===== */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-0">
          <div className="grid grid-cols-3 border-b" style={{ borderColor: "var(--border)" }}>
            <StatCell value="30日" label="伴走学習プラン" />
            <StatCell value="毎日" label="タスクと相談チャット" border />
            <StatCell value={achieversCount > 0 ? `${achieversCount.toLocaleString()}名+` : "A / B"} label={achieversCount > 0 ? "コース完走者" : "選べるTier"} border />
          </div>
        </div>

        {/* ===== コース一覧 ===== */}
        <section id="courses" className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-14 pb-10 sm:pb-14">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-px w-6 flex-shrink-0" style={{ background: "var(--accent)" }} />
                  <p className="text-xs font-bold tracking-[0.18em] uppercase" style={{ color: "var(--accent)" }}>Courses</p>
                </div>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 600, color: "var(--primary)" }}>伴走コースを探す</h2>
                <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
                  {loading ? "コースを読み込んでいます。" : `${filtered.length}件のコースが見つかりました。`}
                </p>
              </div>
              <div className="w-full md:w-[420px]">
                <label className="sr-only" htmlFor="course-search">コースを検索</label>
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl border shadow-soft" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                  <SearchIcon />
                  <input
                    id="course-search"
                    value={keyword}
                    onChange={e => setKeyword(e.target.value)}
                    placeholder="コース名・説明・クリエイター名で検索"
                    style={{ border: "none", background: "transparent", padding: 0, width: "100%" }}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              <CategoryButton active={category === ""} onClick={() => setCategory("")}>すべて</CategoryButton>
              {categories.map(cat => (
                <CategoryButton key={cat} active={category === cat} onClick={() => setCategory(cat)}>
                  {cat}
                </CategoryButton>
              ))}
            </div>

            {loading ? (
              <CourseGridSkeleton />
            ) : filtered.length === 0 ? (
              <div className="border rounded-2xl p-8 text-center shadow-soft" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <p className="font-bold" style={{ color: "var(--primary)" }}>条件に合うコースがありません</p>
                <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>検索キーワードやカテゴリを変えて試してください。</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {courseGrid.map(course => (
                  <CourseTile key={course.id} course={course} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ===== 始め方：タイムライン ===== */}
        <section id="how-it-works" style={{ background: "color-mix(in srgb, var(--card) 60%, var(--bg))" }}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
            <div className="text-center mb-14">
              <div className="flex items-center justify-center gap-3 mb-2">
                <div className="h-px w-8 flex-shrink-0" style={{ background: "var(--accent)" }} />
                <p className="text-xs font-bold tracking-[0.18em] uppercase" style={{ color: "var(--accent)" }}>How It Works</p>
                <div className="h-px w-8 flex-shrink-0" style={{ background: "var(--accent)" }} />
              </div>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)", fontWeight: 600, color: "var(--primary)" }}>始め方はシンプルです</h2>
            </div>
            <div className="relative grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-5">
              <div className="hidden md:block absolute top-7 left-[16.6%] right-[16.6%] h-0.5" style={{ background: "var(--border)" }} />
              {STEPS.map((step, index) => (
                <div key={step.title} className="relative flex flex-col items-center text-center gap-3">
                  <span className="relative w-14 h-14 flex items-center justify-center text-2xl"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4 }}>
                    {step.icon}
                  </span>
                  <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", fontWeight: 600, color: "var(--primary)" }}>
                    <span style={{ color: "var(--accent)", marginRight: 4 }}>{index + 1}.</span>{step.title}
                  </h3>
                  <p className="text-sm leading-relaxed max-w-xs" style={{ color: "var(--muted)" }}>{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== クリエイター向けCTA ===== */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
          <div className="relative overflow-hidden p-10 sm:p-16 flex flex-col md:flex-row md:items-center md:justify-between gap-8"
            style={{ background: "var(--ink)", border: "1px solid var(--border)" }}>
            {/* ゴールドアクセントライン */}
            <div className="pointer-events-none absolute top-0 left-0 right-0 h-px" style={{ background: "var(--accent)" }} />
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px w-6 flex-shrink-0" style={{ background: "var(--accent)" }} />
                <p className="text-xs font-bold tracking-[0.18em] uppercase" style={{ color: "var(--accent)" }}>For Creators</p>
              </div>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", fontWeight: 600, lineHeight: 1.2, color: "var(--bg)" }}>
                あなたのメソッドを、<br />30日伴走コースに。
              </h2>
              <p className="text-sm leading-relaxed mt-4 max-w-xl" style={{ color: "color-mix(in srgb, var(--bg) 60%, transparent)" }}>
                インタビューで指導スタイルを整理し、教材と30日プランを組み合わせてコースを公開できます。
              </p>
            </div>
            <Link href="/creator/apply" className="relative flex-shrink-0" style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              padding: "0.9rem 2.4rem", borderRadius: 4, fontWeight: 600,
              background: "var(--accent)", color: "var(--bg)",
              fontSize: "0.95rem", letterSpacing: "0.04em", whiteSpace: "nowrap",
            }}>
              クリエイター申請へ
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

function StatCell({ value, label, border = false }: { value: string; label: string; border?: boolean }) {
  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 text-center" style={border ? { borderLeft: "1px solid var(--border)" } : undefined}>
      <p style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.4rem,3vw,2rem)", fontWeight: 600, color: "var(--primary)", letterSpacing: "-0.02em" }}>{value}</p>
      <p className="text-[11px] sm:text-xs mt-1.5 tracking-wide uppercase" style={{ color: "var(--muted)" }}>{label}</p>
    </div>
  );
}

function FeaturedCourse({ course }: { course: CourseCard }) {
  return (
    <Link
      href={`/courses/${course.id}`}
      className="block rounded-3xl overflow-hidden hover-lift shadow-2xl"
      style={{ background: "var(--card)" }}
    >
      <div className="relative">
        <CourseImage course={course} className="h-56 sm:h-64" />
        <div className="absolute inset-x-0 bottom-0 h-24 pointer-events-none" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.55), transparent)" }} />
        <span className="absolute top-3 left-3 pill" style={{ background: "rgba(245,239,224,0.92)", color: "var(--accent)" }}>
          注目コース
        </span>
        <span className="absolute bottom-3 right-3 text-sm font-black text-white drop-shadow">{priceLabel(course)}</span>
      </div>
      <div className="p-5 sm:p-6">
        <h2 className="text-xl sm:text-2xl font-black line-clamp-2" style={{ color: "var(--primary)" }}>{course.title}</h2>
        {course.description && (
          <p className="text-sm leading-relaxed mt-2 line-clamp-2" style={{ color: "var(--muted)" }}>{course.description}</p>
        )}
        <CreatorRow course={course} />
      </div>
    </Link>
  );
}

function CourseTile({ course }: { course: CourseCard }) {
  return (
    <Link
      href={`/courses/${course.id}`}
      className="overflow-hidden hover-lift flex flex-col min-h-full"
      style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6 }}
    >
      <div className="relative">
        <CourseImage course={course} className="h-40" />
        <span className="absolute top-3 left-3 text-xs font-bold px-2 py-1 rounded-full backdrop-blur-sm" style={{ background: "rgba(245,239,224,0.85)", color: "var(--primary)" }}>
          {tierLabel(course)}
        </span>
        <span className="absolute top-3 right-3 text-xs font-black px-2 py-1 rounded-full text-white" style={{ background: "color-mix(in srgb, var(--accent) 90%, black)" }}>
          {priceLabel(course)}
        </span>
      </div>
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div>
          {course.category && <p className="text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>{course.category}</p>}
          <h3 className="line-clamp-2" style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", fontWeight: 600, color: "var(--primary)" }}>{course.title}</h3>
          {course.description && (
            <p className="text-sm leading-relaxed mt-2 line-clamp-2" style={{ color: "var(--muted)" }}>{course.description}</p>
          )}
        </div>
        <div className="mt-auto pt-2 border-t" style={{ borderColor: "var(--border)" }}>
          <CreatorRow course={course} compact />
        </div>
      </div>
    </Link>
  );
}

function CourseImage({ course, className }: { course: CourseCard; className: string }) {
  if (course.thumbnail_url) {
    return <img src={course.thumbnail_url} alt="" className={`w-full object-cover ${className}`} />;
  }
  return (
    <div className={`w-full flex items-center justify-center ${className}`} style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--ink) 86%, white), color-mix(in srgb, var(--accent) 72%, white))" }}>
      <div className="text-center px-6">
        <p className="text-white text-sm font-black tracking-widest">MANA VILLAGE</p>
        <p className="text-white/80 text-xs mt-2">30日伴走コース</p>
      </div>
    </div>
  );
}

function CreatorRow({ course, compact = false }: { course: CourseCard; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${compact ? "mt-0" : "mt-5"}`}>
      {course.character?.avatar_url ? (
        <img src={course.character.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
      ) : (
        <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white" style={{ background: "var(--accent)" }}>
          M
        </span>
      )}
      <div className="min-w-0">
        <p className="text-xs" style={{ color: "var(--muted)" }}>担当クリエイター</p>
        <p className="text-sm font-bold truncate" style={{ color: "var(--primary)" }}>
          {course.character?.name || "ManaVillage"}
        </p>
      </div>
    </div>
  );
}

function CategoryButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="whitespace-nowrap flex-shrink-0 px-3 py-2 rounded-full text-sm font-bold border transition-colors"
      style={{
        background: active ? "var(--ink)" : "var(--card)",
        color: active ? "white" : "var(--muted)",
        borderColor: active ? "var(--ink)" : "var(--border)",
      }}
    >
      {children}
    </button>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function CourseGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl overflow-hidden animate-pulse" style={{ background: "var(--card)" }}>
          <div className="h-40" style={{ background: "var(--border)" }} />
          <div className="p-4 flex flex-col gap-3">
            <div className="h-4 w-24 rounded" style={{ background: "var(--border)" }} />
            <div className="h-5 w-4/5 rounded" style={{ background: "var(--border)" }} />
            <div className="h-4 w-full rounded" style={{ background: "var(--border)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
