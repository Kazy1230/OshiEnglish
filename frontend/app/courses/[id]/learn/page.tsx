"use client";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Skeleton } from "@/components/Skeleton";

/** 学習画面はコース詳細ページ(/courses/[id])に統合された。旧リンク互換のためリダイレクトのみ行う。 */
export default function LearnPageRedirect() {
  const params = useParams();
  const router = useRouter();
  const courseId = Number(params.id);

  useEffect(() => {
    router.replace(`/courses/${courseId}`);
  }, [courseId, router]);

  return <Skeleton />;
}
