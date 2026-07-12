"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";

type CreatedCourse = {
  id: number;
  title: string;
  status: string;
  is_suspended: boolean;
  enrollment_count: number;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "下書き",
  review: "運営確認中",
  published: "公開中",
  unpublished: "非公開",
};

const STATUS_BADGE_STYLE: Record<string, { background: string; color: string }> = {
  draft: { background: "var(--example-bg, #eee)", color: "var(--muted)" },
  review: { background: "#f5a623", color: "white" },
  published: { background: "var(--accent)", color: "white" },
  unpublished: { background: "#8a8a8a", color: "white" },
};

export default function CreatorCoursesPage() {
  const { loading } = useRoleGuard(["creator", "admin"]);
  const [courses, setCourses] = useState<CreatedCourse[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (loading) return;
    api.getMyCreatedCourses().then(setCourses).catch(() => {}).finally(() => setFetching(false));
  }, [loading]);

  if (loading || fetching) return <Skeleton />;

  return (
    <div className="creator-theme min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" title="作成したコース" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        <Link href="/creator/courses/new" className="btn-primary self-start">+ 新しいコースを作る</Link>

        {courses.length === 0 ? (
          <div className="card">
            <p className="text-sm" style={{ color: "var(--muted)" }}>まだコースを作成していません。</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {courses.map(c => (
              <div key={c.id} className="card flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold" style={{ color: "var(--primary)" }}>{c.title}</p>
                  <span
                    className="text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap"
                    style={STATUS_BADGE_STYLE[c.status] ?? STATUS_BADGE_STYLE.draft}
                  >
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                </div>
                {c.is_suspended && (
                  <p className="text-xs font-bold" style={{ color: "#e53e3e" }}>⚠ 運営により停止中</p>
                )}
                <p className="text-sm" style={{ color: "var(--muted)" }}>申込者数：{c.enrollment_count}人</p>
                <div className="flex gap-2 flex-wrap">
                  <Link href={`/creator/courses/${c.id}/curriculum`} className="btn-ghost flex-1 text-center">カリキュラム編集</Link>
                  <Link href={`/creator/courses/${c.id}/enrollments`} className="btn-ghost flex-1 text-center">申込者一覧</Link>
                  <Link href={`/creator/courses/${c.id}/submissions`} className="btn-ghost flex-1 text-center">課題の提出物</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
