"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { LogoutButton } from "@/components/LogoutButton";

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
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="flex items-center justify-between px-4 sm:px-6 py-4" style={{ background: "var(--primary)" }}>
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-white/80 text-sm hover:text-white">← ダッシュボード</Link>
          <h1 className="text-white font-black text-lg">作成したコース</h1>
        </div>
        <LogoutButton variant="onColor" />
      </header>

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
                    style={{
                      background: c.status === "published" ? "var(--accent)" : c.status === "review" ? "#f5a623" : "var(--example-bg, #eee)",
                      color: c.status === "published" || c.status === "review" ? "white" : "var(--muted)",
                    }}
                  >
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                </div>
                {c.is_suspended && (
                  <p className="text-xs font-bold" style={{ color: "#e53e3e" }}>⚠ 運営により停止中</p>
                )}
                <p className="text-sm" style={{ color: "var(--muted)" }}>申込者数：{c.enrollment_count}人</p>
                <div className="flex gap-2 flex-wrap">
                  <Link href={`/creator/courses/${c.id}/calendar`} className="btn-ghost flex-1 text-center">編集する</Link>
                  <Link href={`/creator/courses/${c.id}/enrollments`} className="btn-ghost flex-1 text-center">申込者一覧</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
