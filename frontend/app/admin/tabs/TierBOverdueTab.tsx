"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type OverdueQuestion = { question_id: number; course_title: string; creator_username: string | null; hours_elapsed: number };

/** G-04: Tier B講師の回答状況監視（24時間未回答のアラート） */
export function TierBOverdueTab() {
  const [overdue, setOverdue] = useState<OverdueQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.adminListTierBOverdue().then(setOverdue).finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: "var(--muted)" }}>読み込み中…</p>;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-black" style={{ color: "var(--primary)" }}>⏰ Tier B 24時間超未回答アラート</h2>
      {overdue.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>未回答の質問はありません。</p>
      ) : (
        <div className="flex flex-col gap-2">
          {overdue.map(o => (
            <div key={o.question_id} className="card">
              <p className="text-sm font-bold" style={{ color: "#e53e3e" }}>⚠ {o.hours_elapsed}時間経過</p>
              <p className="text-sm" style={{ color: "var(--text)" }}>{o.course_title}（{o.creator_username}）</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
