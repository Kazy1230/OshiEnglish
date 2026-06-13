"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";

type SessionStatus = "loading" | "processing" | "issued" | "already_viewed" | "error";

function CompleteContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [credentials, setCredentials] = useState<{ username: string; temporary_password: string } | null>(null);

  useEffect(() => {
    if (!sessionId) { setStatus("error"); return; }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const res = await api.getPaymentSession(sessionId as string);
        if (cancelled) return;
        if (res.status === "issued") {
          setCredentials({ username: res.username, temporary_password: res.temporary_password });
          setStatus("issued");
        } else if (res.status === "already_viewed") {
          setStatus("already_viewed");
        } else {
          // processing: 少し待って再確認（決済確定の反映待ち）
          timer = setTimeout(poll, 2000);
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    }
    poll();

    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [sessionId]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black" style={{ color: "var(--primary)" }}>推しEnglish</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>お支払いありがとうございました</p>
        </div>

        <div className="card shadow-sm text-center">
          {status === "loading" || status === "processing" ? (
            <>
              <h2 className="text-lg font-bold mb-3" style={{ color: "var(--primary)" }}>アカウントを準備しています…</h2>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                決済の確認中です。このまま少々お待ちください。
              </p>
            </>
          ) : status === "issued" && credentials ? (
            <>
              <div className="text-3xl mb-2">🎉</div>
              <h2 className="text-lg font-bold mb-3" style={{ color: "var(--primary)" }}>アカウントが発行されました</h2>
              <div className="text-left p-3 rounded-lg mb-3" style={{ background: "var(--accentLight, #f0f7ee)", border: "1px solid var(--border)" }}>
                <p className="text-xs mb-1" style={{ color: "var(--muted)" }}>ユーザー名（メールアドレス）</p>
                <p className="font-mono font-bold mb-2 break-all" style={{ color: "var(--text)" }}>{credentials.username}</p>
                <p className="text-xs mb-1" style={{ color: "var(--muted)" }}>仮パスワード</p>
                <p className="font-mono font-bold break-all" style={{ color: "var(--text)" }}>{credentials.temporary_password}</p>
              </div>
              <div className="text-left p-3 rounded-lg mb-3" style={{ background: "var(--accentLight, #f0f7ee)", border: "1px solid var(--border)" }}>
                <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>
                  🎁 500クレジットを付与しました
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--text)" }}>
                  記事・問題のリクエストやDMの送信にご利用いただけます。ログイン後、ヘッダーの🔶アイコンから残高を確認できます。
                </p>
              </div>
              <p className="text-sm font-bold mb-2" style={{ color: "#e11d48" }}>
                ⚠️ この情報はこの画面でのみ表示され、二度と表示されません
              </p>
              <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>
                必ずスクリーンショットを撮るか、メモを取ってから次に進んでください。
                初回ログイン時にパスワードの変更をお願いします。
              </p>
              <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
                同じ内容をご登録のメールアドレス宛にも送付済みです。
              </p>
              <a href="/login" className="btn-primary text-center w-full block">ログイン画面へ</a>
            </>
          ) : status === "already_viewed" ? (
            <>
              <h2 className="text-lg font-bold mb-3" style={{ color: "var(--primary)" }}>アカウント情報は表示済みです</h2>
              <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
                ログイン情報はセキュリティのため一度しか表示できません。
                パスワードをお忘れの場合は運営者までご連絡ください。
              </p>
              <a href="/login" className="btn-primary text-center w-full block">ログイン画面へ</a>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold mb-3" style={{ color: "var(--primary)" }}>情報が見つかりませんでした</h2>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                URLが正しくないか、決済情報が見つかりませんでした。
                お手数ですが運営者までご連絡ください。
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ApplyCompletePage() {
  return (
    <Suspense>
      <CompleteContent />
    </Suspense>
  );
}
