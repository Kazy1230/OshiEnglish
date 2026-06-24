"use client";
import { useEffect, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";

const TABS = [
  { suffix: "", label: "概要" },
  { suffix: "/chat", label: "伴走チャット" },
  { suffix: "/schedule", label: "90日スケジュール" },
  { suffix: "/reviews", label: "レビュー" },
];

export default function CourseLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const courseId = Number(params.id);
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    api.getCourseDetail(courseId).then(c => setTitle(c.title)).catch(() => {});
  }, [courseId]);

  const isDiagnosis = pathname?.includes("/diagnosis");
  const basePath = `/courses/${courseId}`;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <AppHeader role="learner" backHref="/mypage" backLabel="マイページ" title={title ?? undefined} />

      {!isDiagnosis && (
        <nav className="flex items-center gap-1 px-4 sm:px-6 overflow-x-auto" style={{ background: "var(--card)", borderBottom: "1px solid var(--border)" }}>
          {TABS.map(tab => {
            const href = `${basePath}${tab.suffix}`;
            const active = pathname === href;
            return (
              <Link
                key={tab.suffix}
                href={href}
                className="px-3 py-3 text-sm font-bold whitespace-nowrap border-b-2 transition-colors"
                style={{
                  color: active ? "var(--primary)" : "var(--muted)",
                  borderColor: active ? "var(--primary)" : "transparent",
                }}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      )}

      <div className="flex-1">{children}</div>
    </div>
  );
}
