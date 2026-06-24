"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/Skeleton";

type WeeklyContent = {
  weekly_summary?: string;
  achievement?: string;
  challenge?: string;
  next_week_focus?: string;
  encouragement?: string;
};
type MonthlyContent = {
  monthly_summary?: string;
  progress_vs_goal?: string;
  achievement?: string;
  challenge?: string;
  plan_adjustment?: string;
  encouragement?: string;
};
type Review = {
  id: number;
  review_type: "weekly" | "monthly";
  period_number: number;
  content: WeeklyContent & MonthlyContent;
  created_at: string;
};

export default function ReviewsPage() {
  const params = useParams();
  const courseId = Number(params.id);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getReviews(courseId).then(setReviews).finally(() => setLoading(false));
  }, [courseId]);

  const weekly = reviews.filter(r => r.review_type === "weekly");
  const monthly = reviews.filter(r => r.review_type === "monthly");

  return (
    <div>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">
        <h1 className="text-2xl font-black" style={{ color: "var(--primary)" }}>📈 週次・月次レビュー</h1>

        {loading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="card flex flex-col items-center gap-2 text-center py-10">
            <p className="text-3xl">📬</p>
            <p className="text-sm font-bold" style={{ color: "var(--text)" }}>まだレビューが届いていません</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              7日ごとに週次レビュー、30日ごとに月次レビューが届きます。まずは日々の学習報告を続けましょう。
            </p>
            <Link href={`/courses/${courseId}/chat`} className="btn-primary mt-2">伴走チャットへ戻る</Link>
          </div>
        ) : (
          <>
            {monthly.length > 0 && (
              <section className="flex flex-col gap-4">
                <h2 className="font-bold" style={{ color: "var(--primary)" }}>月次レビュー</h2>
                {monthly.map(r => (
                  <div key={r.id} className="card flex flex-col gap-2">
                    <p className="text-xs font-bold" style={{ color: "var(--accent)" }}>第{r.period_number}ヶ月</p>
                    {r.content.monthly_summary && <p className="text-sm" style={{ color: "var(--text)" }}>{r.content.monthly_summary}</p>}
                    {r.content.progress_vs_goal && (
                      <p className="text-sm"><span className="font-bold" style={{ color: "var(--primary)" }}>目標との差分: </span>{r.content.progress_vs_goal}</p>
                    )}
                    {r.content.achievement && (
                      <p className="text-sm"><span className="font-bold" style={{ color: "var(--primary)" }}>良かった点: </span>{r.content.achievement}</p>
                    )}
                    {r.content.challenge && (
                      <p className="text-sm"><span className="font-bold" style={{ color: "var(--primary)" }}>来月の課題: </span>{r.content.challenge}</p>
                    )}
                    {r.content.plan_adjustment && (
                      <p className="text-sm"><span className="font-bold" style={{ color: "var(--primary)" }}>計画の修正案: </span>{r.content.plan_adjustment}</p>
                    )}
                    {r.content.encouragement && (
                      <p className="text-sm italic" style={{ color: "var(--accent)" }}>「{r.content.encouragement}」</p>
                    )}
                  </div>
                ))}
              </section>
            )}

            {weekly.length > 0 && (
              <section className="flex flex-col gap-4">
                <h2 className="font-bold" style={{ color: "var(--primary)" }}>週次レビュー</h2>
                {weekly.map(r => (
                  <div key={r.id} className="card flex flex-col gap-2">
                    <p className="text-xs font-bold" style={{ color: "var(--accent)" }}>第{r.period_number}週</p>
                    {r.content.weekly_summary && <p className="text-sm" style={{ color: "var(--text)" }}>{r.content.weekly_summary}</p>}
                    {r.content.achievement && (
                      <p className="text-sm"><span className="font-bold" style={{ color: "var(--primary)" }}>良かった点: </span>{r.content.achievement}</p>
                    )}
                    {r.content.challenge && (
                      <p className="text-sm"><span className="font-bold" style={{ color: "var(--primary)" }}>来週の課題: </span>{r.content.challenge}</p>
                    )}
                    {r.content.next_week_focus && (
                      <p className="text-sm"><span className="font-bold" style={{ color: "var(--primary)" }}>来週のテーマ: </span>{r.content.next_week_focus}</p>
                    )}
                    {r.content.encouragement && (
                      <p className="text-sm italic" style={{ color: "var(--accent)" }}>「{r.content.encouragement}」</p>
                    )}
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
