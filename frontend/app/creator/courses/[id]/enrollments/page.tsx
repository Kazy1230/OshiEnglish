"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";
import { toast } from "@/components/Toast";

type Enrollment = {
  user_id: number;
  username: string;
  type: "purchase" | "subscription";
  tier: string | null;
  status: string;
  enrolled_at: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  succeeded: "購入済み",
  incomplete: "決済待ち",
  active: "契約中",
  past_due: "支払い遅延",
  canceled: "解約済み",
};

export default function CourseEnrollmentsPage() {
  const params = useParams();
  const courseId = Number(params.id);
  const { loading } = useRoleGuard(["creator", "admin"]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (loading) return;
    api.listCourseEnrollments(courseId)
      .then(setEnrollments)
      .catch((err: unknown) => toast(err instanceof Error ? err.message : "取得に失敗しました", "error"))
      .finally(() => setFetching(false));
  }, [loading, courseId]);

  if (loading || fetching) return <Skeleton />;

  return (
    <div className="creator-theme min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" backHref="/creator/courses" backLabel="作成したコース" title="申込者一覧" />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4">
        <p className="text-sm" style={{ color: "var(--muted)" }}>{enrollments.length}人が申し込んでいます。</p>

        {enrollments.length === 0 ? (
          <div className="card">
            <p className="text-sm" style={{ color: "var(--muted)" }}>まだ申込者がいません。</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {enrollments.map((e, i) => (
              <div key={`${e.type}-${e.user_id}-${i}`} className="card flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-bold" style={{ color: "var(--primary)" }}>{e.username}</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    {e.type === "purchase" ? "買い切り購入" : `月額サブスク（Tier ${e.tier}）`}
                    {e.enrolled_at && ` ・ ${new Date(e.enrolled_at).toLocaleDateString("ja-JP")}`}
                  </p>
                </div>
                <span
                  className="text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap"
                  style={{
                    background: e.status === "succeeded" || e.status === "active" ? "var(--accent)" : "var(--surface)",
                    color: e.status === "succeeded" || e.status === "active" ? "white" : "var(--muted)",
                  }}
                >
                  {STATUS_LABEL[e.status] ?? e.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
