"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";

/**
 * 1クリエイター=1人格(キャラクター)。キャラクターはAIインタビュー完了時に自動作成されるため、
 * このページは単独の「新規作成」フォームではなく、既存キャラクターの編集画面 or インタビューへの振り分け役。
 */
export default function NewCharacterRedirectPage() {
  const { loading } = useRoleGuard(["creator", "admin"]);
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    api.listMyCharacters().then(list => {
      if (list[0]) router.replace(`/dashboard/characters/${list[0].id}`);
      else router.replace("/creator/interview");
    }).catch(() => router.replace("/dashboard"));
  }, [loading, router]);

  return <Skeleton />;
}
