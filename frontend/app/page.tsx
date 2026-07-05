"use client";

import { DarkModeToggle } from "@/components/DarkModeToggle";
import { LogoutButton } from "@/components/LogoutButton";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useDarkMode } from "@/lib/darkMode";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ContentCard, ContentItem } from "@/components/ContentEmbed";

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
  const [mode, toggleMode] = useDarkMode();
  const [loggedIn, setLoggedIn] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);
  const [courses, setCourses] = useState<CourseCard[]>([]);
  const [allCourses, setAllCourses] = useState<CourseCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("");
  const [achieversCount, setAchieversCount] = useState(0);
  const [feedContents, setFeedContents] = useState<ContentItem[]>([]);
  const [feedSubject, setFeedSubject] = useState("");
  const [feedLiked, setFeedLiked] = useState<Record<number, { liked: boolean; count: number }>>({});

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
    api.listPublicContentsNoAuth(undefined, 6).then(setFeedContents).catch(() => {});
  }, []);

  useEffect(() => {
    api.listPublicContentsNoAuth(feedSubject || undefined, 6).then(setFeedContents).catch(() => {});
  }, [feedSubject]);

  async function handleFeedLike(id: number) {
    try {
      const res = await api.toggleContentLike(id);
      setFeedLiked(prev => ({ ...prev, [id]: { liked: res.liked, count: res.like_count } }));
      setFeedContents(prev => prev.map(c => c.id === id ? { ...c, liked: res.liked, like_count: res.like_count } : c));
    } catch {}
  }

  const FEED_SUBJECT_TABS = [
    { key: "", label: "すべて" },
    { key: "english", label: "英語" },
    { key: "it", label: "IT" },
    { key: "music", label: "音楽" },
    { key: "japanese", label: "日本語" },
  ];

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
            <DarkModeToggle mode={mode} onToggle={toggleMode} variant="onSurface" />
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
        {/* ===== ヒーロー：メッシュグラデーション＋波形ディバイダー ===== */}
        <section className="relative overflow-hidden" style={{ background: "linear-gradient(160deg, var(--primary) 0%, color-mix(in srgb, var(--primary) 40%, var(--accent)) 65%, var(--accent) 100%)" }}>
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background:
                "radial-gradient(circle at 12% 18%, rgba(255,255,255,0.16), transparent 38%)," +
                "radial-gradient(circle at 88% 8%, rgba(255,255,255,0.12), transparent 42%)," +
                "radial-gradient(circle at 75% 85%, rgba(0,0,0,0.18), transparent 45%)",
            }}
          />
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-24 sm:pb-32 grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-12 items-center">
            <div className="flex flex-col gap-7">
              <div className="flex flex-wrap gap-2">
                <span className="pill backdrop-blur-sm" style={{ background: "rgba(255,255,255,0.16)", color: "white", border: "1px solid rgba(255,255,255,0.25)" }}>
                  ✨ 30日伴走コース
                </span>
                <span className="pill backdrop-blur-sm" style={{ background: "rgba(255,255,255,0.1)", color: "white", border: "1px solid rgba(255,255,255,0.2)" }}>
                  クリエイターメソッド
                </span>
              </div>
              <h1 className="text-4xl sm:text-6xl font-black leading-[1.1] text-white tracking-tight">
                学ぶ人に、<br />
                <span style={{ background: "linear-gradient(120deg, #fff, rgba(255,255,255,0.6))", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
                  メンターを。
                </span>
              </h1>
              <p className="text-base sm:text-xl leading-relaxed max-w-xl text-white/85">
                誰と挑戦するかで、未来は変わる。ひとりじゃない。
                <br />
                その一歩を、最後まで支えるために。
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <a href="#courses" className="btn-cta text-center shadow-lg" style={{ background: "white", color: "var(--primary)" }}>
                  コースを探す →
                </a>
                <Link href="/creator/apply" className="text-center px-6 py-3 rounded-full font-bold border-2 transition-colors hover:bg-white/10" style={{ borderColor: "rgba(255,255,255,0.5)", color: "white" }}>
                  クリエイターとして参加
                </Link>
              </div>
            </div>

            <div className="relative">
              {featured ? (
                <FeaturedCourse course={featured} />
              ) : (
                <div className="rounded-3xl p-6 sm:p-8 min-h-[320px] flex flex-col justify-between shadow-2xl" style={{ background: "var(--card)" }}>
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

          {/* 波形ディバイダー */}
          <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1440 80" fill="none" preserveAspectRatio="none" style={{ height: "60px" }}>
            <path d="M0 40C240 80 480 0 720 24C960 48 1200 88 1440 32V80H0V40Z" fill="var(--bg)" />
          </svg>
        </section>

        {/* ===== 統計バー：ヒーローと次セクションの境界に浮かせる ===== */}
        <div className="relative -mt-10 sm:-mt-14 z-10 max-w-5xl mx-auto px-4 sm:px-6">
          <div className="rounded-2xl shadow-2xl grid grid-cols-3" style={{ background: "var(--card)" }}>
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
                <p className="text-xs font-black tracking-widest" style={{ color: "var(--accent)" }}>COURSES</p>
                <h2 className="text-2xl sm:text-3xl font-black mt-1" style={{ color: "var(--primary)" }}>伴走コースを探す</h2>
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

        {/* ===== コンテンツフィード ===== */}
        {feedContents.length > 0 && (
          <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <div>
                <p className="text-xs font-black tracking-widest" style={{ color: "var(--accent)" }}>CONTENT FEED</p>
                <h2 className="text-2xl font-black mt-0.5" style={{ color: "var(--primary)" }}>クリエイターのコンテンツ</h2>
              </div>
              <div className="flex gap-2 flex-wrap">
                {FEED_SUBJECT_TABS.map(t => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setFeedSubject(t.key)}
                    className="text-sm px-3 py-1.5 rounded-full font-bold transition-all"
                    style={{
                      background: feedSubject === t.key ? "var(--primary)" : "var(--card)",
                      color: feedSubject === t.key ? "white" : "var(--muted)",
                      border: `1.5px solid ${feedSubject === t.key ? "var(--primary)" : "var(--border)"}`,
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {feedContents.map(c => (
                <ContentCard
                  key={c.id}
                  item={c}
                  onLike={loggedIn ? handleFeedLike : undefined}
                />
              ))}
            </div>
          </section>
        )}

        {/* ===== 始め方：タイムライン ===== */}
        <section id="how-it-works" style={{ background: "color-mix(in srgb, var(--card) 60%, var(--bg))" }}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
            <div className="text-center mb-12">
              <p className="text-xs font-black tracking-widest" style={{ color: "var(--accent)" }}>HOW IT WORKS</p>
              <h2 className="text-2xl sm:text-3xl font-black mt-1" style={{ color: "var(--primary)" }}>始め方はシンプルです</h2>
            </div>
            <div className="relative grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-5">
              <div className="hidden md:block absolute top-7 left-[16.6%] right-[16.6%] h-0.5" style={{ background: "var(--border)" }} />
              {STEPS.map((step, index) => (
                <div key={step.title} className="relative flex flex-col items-center text-center gap-3">
                  <span
                    className="relative w-14 h-14 rounded-full flex items-center justify-center text-2xl shadow-soft"
                    style={{ background: "linear-gradient(135deg, var(--primary), var(--accent))" }}
                  >
                    {step.icon}
                  </span>
                  <h3 className="font-black" style={{ color: "var(--primary)" }}>
                    <span style={{ color: "var(--accent)" }}>{index + 1}.</span> {step.title}
                  </h3>
                  <p className="text-sm leading-relaxed max-w-xs" style={{ color: "var(--muted)" }}>{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== クリエイター向けCTA ===== */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
          <div className="relative overflow-hidden rounded-3xl p-8 sm:p-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6 shadow-2xl" style={{ background: "linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 30%, var(--accent)))" }}>
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: "radial-gradient(circle at 85% 20%, rgba(255,255,255,0.14), transparent 50%)" }}
            />
            <div className="relative">
              <p className="text-xs font-black tracking-widest text-white/70">FOR CREATORS</p>
              <h2 className="text-2xl sm:text-3xl font-black mt-2 text-white">あなたのメソッドを、<br className="sm:hidden" />30日伴走コースに。</h2>
              <p className="text-sm leading-relaxed mt-3 text-white/78 max-w-2xl">
                インタビューで指導スタイルを整理し、教材と30日プランを組み合わせてコースを公開できます。
              </p>
            </div>
            <Link href="/creator/apply" className="relative btn-cta text-center flex-shrink-0 shadow-lg" style={{ background: "white", color: "var(--primary)" }}>
              クリエイター申請へ
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t" style={{ borderColor: "var(--border)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="font-black text-sm" style={{ color: "var(--primary)" }}>
            Mana<span style={{ color: "var(--accent)" }}>Village</span>
          </p>
          <div className="flex items-center gap-5 text-sm" style={{ color: "var(--muted)" }}>
            <Link href="/creators" className="hover:opacity-75 transition-opacity">クリエイターを探す</Link>
            <Link href="/creator/apply" className="hover:opacity-75 transition-opacity">クリエイター申請</Link>
            <Link href="/login" className="hover:opacity-75 transition-opacity">ログイン</Link>
          </div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>© ManaVillage</p>
        </div>
      </footer>
    </div>
  );
}

function StatCell({ value, label, border = false }: { value: string; label: string; border?: boolean }) {
  return (
    <div className="px-3 sm:px-6 py-5 sm:py-6 text-center" style={border ? { borderLeft: "1px solid var(--border)" } : undefined}>
      <p className="text-xl sm:text-2xl font-black" style={{ color: "var(--primary)" }}>{value}</p>
      <p className="text-[11px] sm:text-xs mt-1" style={{ color: "var(--muted)" }}>{label}</p>
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
        <span className="absolute top-3 left-3 pill" style={{ background: "rgba(255,255,255,0.92)", color: "var(--accent)" }}>
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
      className="rounded-2xl overflow-hidden hover-lift shadow-soft flex flex-col min-h-full"
      style={{ background: "var(--card)" }}
    >
      <div className="relative">
        <CourseImage course={course} className="h-40" />
        <span className="absolute top-3 left-3 text-xs font-bold px-2 py-1 rounded-full backdrop-blur-sm" style={{ background: "rgba(255,255,255,0.85)", color: "var(--primary)" }}>
          {tierLabel(course)}
        </span>
        <span className="absolute top-3 right-3 text-xs font-black px-2 py-1 rounded-full text-white" style={{ background: "color-mix(in srgb, var(--accent) 90%, black)" }}>
          {priceLabel(course)}
        </span>
      </div>
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div>
          {course.category && <p className="text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>{course.category}</p>}
          <h3 className="font-black line-clamp-2" style={{ color: "var(--primary)" }}>{course.title}</h3>
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
      className="whitespace-nowrap flex-shrink-0 px-3 py-2 rounded-full text-sm font-bold border transition-colors"
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
