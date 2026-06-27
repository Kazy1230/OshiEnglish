"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";

export default function CourseLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const courseId = Number(params.id);
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    api.getCourseDetail(courseId).then(c => setTitle(c.title)).catch(() => {});
  }, [courseId]);

  return (
    <div className="h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <AppHeader role="learner" backHref="/mypage" backLabel="マイページ" title={title ?? undefined} />
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
    </div>
  );
}
