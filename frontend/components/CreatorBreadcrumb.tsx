"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type Crumb = { label: string; href?: string };

const COURSES_ROOT: Crumb = { label: "コース一覧", href: "/creator/courses" };

const ROUTES: { pattern: RegExp; trail: (m: RegExpMatchArray) => Crumb[] }[] = [
  { pattern: /^\/creator\/courses$/, trail: () => [{ label: "コース一覧" }] },
  { pattern: /^\/creator\/courses\/new$/, trail: () => [COURSES_ROOT, { label: "新規コース作成" }] },
  { pattern: /^\/creator\/courses\/\d+\/curriculum$/, trail: () => [COURSES_ROOT, { label: "カリキュラム編集" }] },
  { pattern: /^\/creator\/courses\/(\d+)\/chapters$/, trail: () => [COURSES_ROOT, { label: "章立てを入力" }] },
  { pattern: /^\/creator\/courses\/(\d+)\/chapters\/\d+$/, trail: (m) => [COURSES_ROOT, { label: "章立てを入力", href: `/creator/courses/${m[1]}/chapters` }, { label: "章の編集" }] },
  { pattern: /^\/creator\/courses\/\d+\/publish$/, trail: () => [COURSES_ROOT, { label: "公開設定" }] },
  { pattern: /^\/creator\/courses\/\d+\/preview$/, trail: () => [COURSES_ROOT, { label: "プレビュー" }] },
  { pattern: /^\/creator\/courses\/\d+\/enrollments$/, trail: () => [COURSES_ROOT, { label: "受講者一覧" }] },
  { pattern: /^\/creator\/courses\/\d+\/submissions$/, trail: () => [COURSES_ROOT, { label: "課題の提出物" }] },
  { pattern: /^\/creator\/courses\/\d+\/calendar$/, trail: () => [COURSES_ROOT, { label: "カレンダー" }] },
  { pattern: /^\/creator\/courses\/\d+\/textbooks$/, trail: () => [COURSES_ROOT, { label: "教材設定" }] },
  { pattern: /^\/creator\/interview$/, trail: () => [{ label: "AIインタビュー" }] },
  { pattern: /^\/creator\/apply$/, trail: () => [{ label: "クリエイター申請" }] },
  { pattern: /^\/creator\/profile$/, trail: () => [{ label: "クリエイタープロフィール" }] },
  { pattern: /^\/studio$/, trail: () => [{ label: "スタジオ" }] },
  { pattern: /^\/creator\/revenue$/, trail: () => [{ label: "収益" }] },
  { pattern: /^\/creator\/analytics$/, trail: () => [{ label: "分析" }] },
  { pattern: /^\/creator\/inbox$/, trail: () => [{ label: "受講者対応" }] },
  { pattern: /^\/creator\/contents$/, trail: () => [{ label: "コンテンツプール" }] },
  { pattern: /^\/dashboard\/characters\/new$/, trail: () => [{ label: "プロフィール画面" }] },
  { pattern: /^\/dashboard\/characters\/\d+$/, trail: () => [{ label: "プロフィール画面" }] },
];

/** クリエイター向け画面のパンくずリスト。/dashboardではルートのみ(リンク無し)を表示する。 */
export function CreatorBreadcrumb() {
  const pathname = usePathname();
  if (!pathname) return null;

  if (pathname === "/dashboard") {
    return <BreadcrumbBar crumbs={[{ label: "ダッシュボード" }]} />;
  }

  let trail: Crumb[] = [];
  for (const r of ROUTES) {
    const m = pathname.match(r.pattern);
    if (m) { trail = r.trail(m); break; }
  }

  const crumbs: Crumb[] = [{ label: "ダッシュボード", href: "/dashboard" }, ...trail];

  return <BreadcrumbBar crumbs={crumbs} />;
}

export function BreadcrumbBar({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav style={{ background: "var(--card)", borderBottom: "1px solid var(--border)" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center gap-1.5 flex-wrap" style={{ fontSize: 12, paddingTop: 8, paddingBottom: 8 }}>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span style={{ color: "var(--muted)" }}>/</span>}
            {c.href ? (
              <Link href={c.href} style={{ color: "var(--muted)" }}>{c.label}</Link>
            ) : (
              <span style={{ color: "var(--text)", fontWeight: 700 }}>{c.label}</span>
            )}
          </span>
        ))}
      </div>
    </nav>
  );
}
