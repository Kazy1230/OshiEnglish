"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

function PurchaseCompleteContent() {
  const searchParams = useSearchParams();
  const courseId = searchParams.get("course_id");
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) return;
    api.getCourseDetail(Number(courseId)).then(c => setTitle(c.title)).catch(() => {});
  }, [courseId]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--bg)" }}>
      <div className="card max-w-md text-center flex flex-col gap-4">
        <p className="text-4xl">🎉</p>
        <h1 className="text-xl font-black" style={{ color: "var(--primary)" }}>購入が完了しました</h1>
        {title && <p className="text-sm" style={{ color: "var(--muted)" }}>「{title}」をお楽しみください。</p>}
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          決済の反映に数秒かかることがあります。コンテンツが開かない場合は少し待ってから再読み込みしてください。
        </p>
        {courseId && (
          <Link href={`/courses/${courseId}`} className="btn-primary">コンテンツを読む →</Link>
        )}
        <Link href="/purchases" className="text-xs underline" style={{ color: "var(--muted)" }}>購入履歴を見る</Link>
      </div>
    </div>
  );
}

export default function PurchaseCompletePage() {
  return (
    <Suspense fallback={<div className="p-8" />}>
      <PurchaseCompleteContent />
    </Suspense>
  );
}
