"use client";

import { DarkModeToggle } from "@/components/DarkModeToggle";
import { LogoutButton } from "@/components/LogoutButton";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useDarkMode } from "@/lib/darkMode";
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
    title: "コースを選ぶ",
    desc: "目標、価格、クリエイターの雰囲気を比べて、自分に合う伴走コースを探します。",
  },
  {
    title: "Day1診断を受ける",
    desc: "現在地、目標、学習時間、苦手分野を答えると30日プランが作られます。",
  },
  {
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
  const [mode, toggleMode] = useDarkMode();
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
      <header className="sticky top-0 z-30 border-b" style={{ background: "color-mix(in srgb, var(--card) 92%, transparent)", borderColor: "var(--border)", backdropFilter: "blur(14px)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link href="/" className="font-black text-lg tracking-tight whitespace-nowrap" style={{ color: "var(--primary)" }}>
            Mana<span style={{ color: "var(--accent)" }}>Village</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-5 text-sm" style={{ color: "var(--muted)" }}>
            <a href="#courses" className="hover:opacity-75">コース</a>
            <a href="#how-it-works" className="hover:opacity-75">使い方</a>
            <Link href="/creators" className="hover:opacity-75">クリエイター</Link>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <DarkModeToggle mode={mode} onToggle={toggleMode} variant="onSurface" />
            {loggedIn ? (
              <>
                <Link href="/mypage" className="hidden sm:inline text-sm font-bold" style={{ color: "var(--primary)" }}>マイページ</Link>
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
        <section className="border-b" style={{ borderColor: "var(--border)" }}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-8 lg:gap-12 items-center">
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap gap-2">
                <span className="pill" style={{ background: "color-mix(in srgb, var(--accent) 12%, var(--card))", color: "var(--accent)" }}>
                  30日伴走コース
                </span>
                <span className="pill" style={{ background: "color-mix(in srgb, var(--primary) 10%, var(--card))", color: "var(--primary)" }}>
                  クリエイターメソッド
                </span>
              </div>
              <div>
                <h1 className="text-3xl sm:text-5xl font-black leading-tight" style={{ color: "var(--primary)" }}>
                  学ぶ人に、メンターを。
                </h1>
                <p className="mt-4 text-base sm:text-lg leading-relaxed max-w-2xl" style={{ color: "var(--muted)" }}>
                  誰と挑戦するかで、未来は変わる。ひとりじゃない。
                  <br />
                  その一歩を、最後まで支えるために。
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <a href="#courses" className="btn-cta text-center">コースを探す</a>
                <Link href="/creator/apply" className="btn-ghost text-center" style={{ color: "var(--primary)" }}>
                  クリエイターとして参加
                </Link>
              </div>
              <div className="grid grid-cols-3 gap-3 max-w-xl">
                <Stat value="30日" label="学習プラン" />
                <Stat value="毎日" label="タスクと相談" />
                <Stat value="A/B" label="選べるTier" />
              </div>
            </div>

            <div className="relative">
              {featured ? (
                <FeaturedCourse course={featured} />
              ) : (
                <div className="border rounded-lg p-6 sm:p-8 min-h-[320px] flex flex-col justify-between" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                  <div>
                    <p className="text-sm font-bold" style={{ color: "var(--accent)" }}>コース準備中</p>
                    <h2 className="text-2xl font-black mt-3" style={{ color: "var(--primary)" }}>公開コースがここに表示されます</h2>
                    <p className="text-sm mt-3 leading-relaxed" style={{ color: "var(--muted)" }}>
                      クリエイターのコースが公開されると、サムネイル、価格、伴走タイプが確認できます。
                    </p>
                  </div>
                  <Link href="/creator/apply" className="btn-primary self-start">コースを作る</Link>
                </div>
              )}
            </div>
          </div>
        </section>

        <section id="courses" className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <p className="text-xs font-black tracking-widest" style={{ color: "var(--accent)" }}>COURSES</p>
                <h2 className="text-2xl sm:text-3xl font-black mt-1" style={{ color: "var(--primary)" }}>伴走コースを探す</h2>
                <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
                  {loading ? "コースを読み込んでいます。" : `${filtered.length}件のコースが見つかりました。`}
                </p>
              </div>
              <div className="w-full md:w-[420px]">
                <label className="sr-only" htmlFor="course-search">コースを検索</label>
                <div className="flex items-center gap-2 px-4 py-3 rounded-lg border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
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
              <div className="border rounded-lg p-8 text-center" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <p className="font-bold" style={{ color: "var(--primary)" }}>条件に合うコースがありません</p>
                <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>検索キーワードやカテゴリを変えて試してください。</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {courseGrid.map(course => (
                  <CourseTile key={course.id} course={course} />
                ))}
              </div>
            )}
          </div>
        </section>

        <section id="how-it-works" className="border-y" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--card) 54%, var(--bg))" }}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-6">
              <div>
                <p className="text-xs font-black tracking-widest" style={{ color: "var(--accent)" }}>HOW IT WORKS</p>
                <h2 className="text-2xl sm:text-3xl font-black mt-1" style={{ color: "var(--primary)" }}>始め方はシンプルです</h2>
              </div>
              {achieversCount > 0 && (
                <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>
                  累計 {achieversCount.toLocaleString()} 名以上が30日コースを完走
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {STEPS.map((step, index) => (
                <div key={step.title} className="border rounded-lg p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                  <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black text-white" style={{ background: "var(--accent)" }}>
                    {index + 1}
                  </span>
                  <h3 className="font-black mt-4" style={{ color: "var(--primary)" }}>{step.title}</h3>
                  <p className="text-sm leading-relaxed mt-2" style={{ color: "var(--muted)" }}>{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
          <div className="border rounded-lg p-6 sm:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-5" style={{ background: "var(--primary)", borderColor: "var(--primary)" }}>
            <div>
              <p className="text-xs font-black tracking-widest text-white/70">FOR CREATORS</p>
              <h2 className="text-2xl font-black mt-2 text-white">あなたのメソッドを、30日伴走コースに。</h2>
              <p className="text-sm leading-relaxed mt-2 text-white/78 max-w-2xl">
                インタビューで指導スタイルを整理し、教材と30日プランを組み合わせてコースを公開できます。
              </p>
            </div>
            <Link href="/creator/apply" className="btn-cta text-center flex-shrink-0">クリエイター申請へ</Link>
          </div>
        </section>
      </main>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="border rounded-lg px-3 py-3" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <p className="text-xl font-black" style={{ color: "var(--primary)" }}>{value}</p>
      <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{label}</p>
    </div>
  );
}

function FeaturedCourse({ course }: { course: CourseCard }) {
  return (
    <Link
      href={`/courses/${course.id}`}
      className="block border rounded-lg overflow-hidden hover-lift"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
    >
      <CourseImage course={course} className="h-56 sm:h-64" />
      <div className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <span className="pill" style={{ background: "color-mix(in srgb, var(--accent) 12%, var(--card))", color: "var(--accent)" }}>
            注目コース
          </span>
          <span className="text-sm font-black" style={{ color: "var(--primary)" }}>{priceLabel(course)}</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-black mt-4 line-clamp-2" style={{ color: "var(--primary)" }}>{course.title}</h2>
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
      className="border rounded-lg overflow-hidden hover-lift flex flex-col min-h-full"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
    >
      <CourseImage course={course} className="h-40" />
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold px-2 py-1 rounded" style={{ background: "color-mix(in srgb, var(--primary) 8%, var(--card))", color: "var(--primary)" }}>
            {tierLabel(course)}
          </span>
          <span className="text-xs font-black" style={{ color: "var(--accent)" }}>{priceLabel(course)}</span>
        </div>
        <div>
          {course.category && <p className="text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>{course.category}</p>}
          <h3 className="font-black line-clamp-2" style={{ color: "var(--primary)" }}>{course.title}</h3>
          {course.description && (
            <p className="text-sm leading-relaxed mt-2 line-clamp-2" style={{ color: "var(--muted)" }}>{course.description}</p>
          )}
        </div>
        <div className="mt-auto">
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
    <div className={`w-full flex items-center justify-center ${className}`} style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--primary) 86%, white), color-mix(in srgb, var(--accent) 72%, white))" }}>
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
      className="whitespace-nowrap flex-shrink-0 px-3 py-2 rounded-lg text-sm font-bold border transition-colors"
      style={{
        background: active ? "var(--primary)" : "var(--card)",
        color: active ? "white" : "var(--muted)",
        borderColor: active ? "var(--primary)" : "var(--border)",
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
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="border rounded-lg overflow-hidden animate-pulse" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
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
