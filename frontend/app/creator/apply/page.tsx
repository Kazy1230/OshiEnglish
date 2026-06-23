"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { toast } from "@/components/Toast";

export default function CreatorApplyPage() {
  const router = useRouter();
  const [speciality, setSpeciality] = useState("");
  const [experience, setExperience] = useState("");
  const [snsYoutube, setSnsYoutube] = useState("");
  const [snsInstagram, setSnsInstagram] = useState("");
  const [snsTwitter, setSnsTwitter] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!getToken()) { router.push("/login"); return; }
    setSubmitting(true);
    try {
      await api.applyAsCreator({
        speciality: speciality.trim() || null,
        experience: experience.trim() || null,
        sns_youtube: snsYoutube.trim() || null,
        sns_instagram: snsInstagram.trim() || null,
        sns_twitter: snsTwitter.trim() || null,
      });
      toast("クリエイター申請を受け付けました。審査と並行して、AIインタビューで人格プロファイルの作成を進めましょう。", "success");
      router.push("/creator/interview");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "申請に失敗しました", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="px-4 sm:px-6 py-4" style={{ background: "var(--primary)" }}>
        <h1 className="text-white font-black text-lg">クリエイター申請</h1>
      </header>
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <form onSubmit={handleSubmit} className="card flex flex-col gap-4">
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            申請後、運営による審査を経てコース作成権限が付与されます。審査と並行して、AIインタビューで人格プロファイルの作成を進められます。
          </p>
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
          <button type="submit" className="btn-primary text-center" disabled={submitting}>
            {submitting ? "送信中…" : "申請する"}
          </button>
        </form>
      </main>
    </div>
  );
}
