"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getToken, setToken } from "@/lib/auth";
import { toast } from "@/components/Toast";
import { AppHeader } from "@/components/AppHeader";

export default function CreatorApplyPage() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [speciality, setSpeciality] = useState("");
  const [experience, setExperience] = useState("");
  const [snsYoutube, setSnsYoutube] = useState("");
  const [snsInstagram, setSnsInstagram] = useState("");
  const [snsTwitter, setSnsTwitter] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLoggedIn(!!getToken());
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const applicationFields = {
      speciality: speciality.trim() || null,
      experience: experience.trim() || null,
      sns_youtube: snsYoutube.trim() || null,
      sns_instagram: snsInstagram.trim() || null,
      sns_twitter: snsTwitter.trim() || null,
    };

    setSubmitting(true);
    try {
      if (loggedIn) {
        await api.applyAsCreator(applicationFields);
      } else {
        if (password !== passwordConfirm) {
          setError("パスワードが一致しません");
          setSubmitting(false);
          return;
        }
        const data = await api.applyAsCreatorPublic({ email, password, ...applicationFields });
        setToken(data.access_token);
      }
      toast("クリエイター申請を受け付けました。審査と並行して、AIインタビューで人格プロファイルの作成を進めましょう。", "success");
      router.push("/creator/interview");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "申請に失敗しました";
      if (loggedIn) toast(message, "error"); else setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loggedIn === null) return null;

  const applicationFieldsForm = (
    <>
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>専門分野</label>
        <input value={speciality} onChange={e => setSpeciality(e.target.value)} placeholder="例：TOEIC対策・英会話" />
      </div>
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>指導実績</label>
        <textarea rows={4} value={experience} onChange={e => setExperience(e.target.value)}
          placeholder="これまでの指導経験・実績などを教えてください" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>YouTube</label>
          <input value={snsYoutube} onChange={e => setSnsYoutube(e.target.value)} placeholder="https://youtube.com/..." />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>Instagram</label>
          <input value={snsInstagram} onChange={e => setSnsInstagram(e.target.value)} placeholder="https://instagram.com/..." />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>X（Twitter）</label>
          <input value={snsTwitter} onChange={e => setSnsTwitter(e.target.value)} placeholder="https://x.com/..." />
        </div>
      </div>
    </>
  );

  if (loggedIn) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg)" }}>
        <AppHeader role="learner" backHref="/" backLabel="トップページ" title="クリエイター申請" />
        <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
          <form onSubmit={handleSubmit} className="card flex flex-col gap-4">
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              申請後、運営による審査を経てコース作成権限が付与されます。審査と並行して、AIインタビューで人格プロファイルの作成を進められます。
            </p>
            {applicationFieldsForm}
            <button type="submit" className="btn-primary text-center" disabled={submitting}>
              {submitting ? "送信中…" : "申請する"}
            </button>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <p className="text-xs font-black tracking-wide" style={{ color: "var(--accent)" }}>FOR CREATORS</p>
          <h1 className="text-3xl font-black mt-1" style={{ color: "var(--primary)" }}>クリエイターとして参加</h1>
          <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
            あなたのメソッドで30日伴走コースを作り、学習者の目標達成に伴走しませんか？
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card flex flex-col gap-4 shadow-sm" style={{ borderTop: "4px solid var(--accent)" }} noValidate>
          <div>
            <label htmlFor="email" className="text-sm font-medium block mb-1" style={{ color: "var(--muted)" }}>メールアドレス</label>
            <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
              required autoFocus placeholder="example@example.com" autoComplete="email" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="password" className="text-sm font-medium block mb-1" style={{ color: "var(--muted)" }}>パスワード（8文字以上）</label>
              <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)}
                required minLength={8} placeholder="••••••••" autoComplete="new-password" />
            </div>
            <div>
              <label htmlFor="passwordConfirm" className="text-sm font-medium block mb-1" style={{ color: "var(--muted)" }}>パスワード（確認）</label>
              <input id="passwordConfirm" type="password" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)}
                required minLength={8} placeholder="••••••••" autoComplete="new-password" />
            </div>
          </div>

          <hr style={{ borderColor: "var(--border)" }} />

          {applicationFieldsForm}

          {error && (
            <p role="alert" className="text-sm text-red-500 bg-red-50 rounded-lg p-2 text-center">{error}</p>
          )}

          <button type="submit" className="btn-primary text-center w-full mt-1" disabled={submitting} aria-busy={submitting}>
            {submitting ? "申請中…" : "クリエイター申請する"}
          </button>
          <p className="text-xs text-center" style={{ color: "var(--muted)" }}>
            申請後、運営の審査を経てコース作成権限が付与されます。審査と並行してAIインタビューを進められます。
          </p>
        </form>

        <p className="text-center text-xs mt-6">
          すでにアカウントをお持ちの方は{" "}
          <Link href="/login" className="font-medium" style={{ color: "var(--accent)" }}>こちらからログイン</Link>
        </p>
      </div>
    </div>
  );
}
