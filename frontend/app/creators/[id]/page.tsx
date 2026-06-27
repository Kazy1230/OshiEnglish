"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { AppHeader } from "@/components/AppHeader";
import { toast } from "@/components/Toast";
import { SampleChatPreview } from "@/components/SampleChatPreview";
import { SectionHeading } from "@/components/SectionHeading";

type CreatorDetail = {
  id: number;
  display_name: string;
  bio?: string | null;
  speciality?: string | null;
  experience?: string | null;
  self_intro?: string | null;
  coaching_tags?: string[];
  skill_tags?: string[];
  total_learners?: number;
  sns_youtube?: string | null;
  sns_instagram?: string | null;
  sns_twitter?: string | null;
  character: { id: number; name: string; avatar_url?: string | null } | null;
  courses: { id: number; title: string; description?: string | null; thumbnail_url?: string | null; category?: string | null; price: number; is_free: boolean }[];
  is_favorited: boolean;
};

export default function CreatorPage() {
  const params = useParams();
  const router = useRouter();
  const creatorId = Number(params.id);
  const [data, setData] = useState<CreatorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [favoriting, setFavoriting] = useState(false);

  useEffect(() => {
    api.getCreator(creatorId).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [creatorId]);

  async function toggleFavorite() {
    if (!data) return;
    if (!getToken()) { router.push("/login"); return; }
    setFavoriting(true);
    try {
      if (data.is_favorited) {
        await api.removeFavorite(creatorId);
        setData({ ...data, is_favorited: false });
        toast("お気に入りを解除しました", "info");
      } else {
        await api.addFavorite(creatorId);
        setData({ ...data, is_favorited: true });
        toast("お気に入りに登録しました", "success");
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "操作に失敗しました", "error");
    } finally {
      setFavoriting(false);
    }
  }

  if (loading) return <p className="p-8" style={{ color: "var(--muted)" }}>読み込み中…</p>;
  if (!data) return <p className="p-8" style={{ color: "var(--muted)" }}>クリエイターが見つかりません</p>;

  const [featured, ...rest] = data.courses;

  function scrollToCourses() {
    document.getElementById("courses")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="learner" backHref="/creators" backLabel="クリエイター一覧" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6 pb-24 sm:pb-8">
        {/* ファーストビュー：カバー＋プロフィールカード */}
        <div className="card overflow-hidden flex flex-col gap-0 p-0">
          <div className="gradient-hero h-20 sm:h-28 relative">
            <div className="pointer-events-none absolute -top-6 -right-6 w-32 h-32 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }} />
          </div>
          <div className="flex flex-col gap-5 p-5 sm:p-6 -mt-10">
            <div className="flex items-end gap-4">
              {data.character?.avatar_url ? (
                <img src={data.character.avatar_url} alt="" className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover shadow-soft" style={{ border: "3px solid var(--card)" }} />
              ) : (
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl flex items-center justify-center text-3xl shadow-soft" style={{ background: "var(--example-bg, #eee)", border: "3px solid var(--card)" }}>🎭</div>
              )}
              <div className="flex-1 pb-1">
                <h1 className="text-xl sm:text-2xl font-black" style={{ color: "var(--primary)" }}>{data.display_name}</h1>
                <p className="text-xs" style={{ color: "var(--muted)" }}>{data.character?.name}</p>
              </div>
            </div>

            {data.speciality && (
              <span className="pill self-start" style={{ background: "var(--example-bg, #eee)", color: "var(--accent)" }}>
                {data.speciality}
              </span>
            )}

            {/* 統計情報：社会的証明 */}
            <div className="flex gap-6 text-sm font-bold pt-3" style={{ borderTop: "1px solid var(--border)", color: "var(--primary)" }}>
              <div className="flex items-center gap-1.5">
                <span>👥</span>
                <span>{data.total_learners ?? 0}</span>
                <span className="font-normal text-xs" style={{ color: "var(--muted)" }}>学習者</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span>📘</span>
                <span>{data.courses.length}</span>
                <span className="font-normal text-xs" style={{ color: "var(--muted)" }}>コース</span>
              </div>
            </div>

            <button onClick={toggleFavorite} disabled={favoriting}
              className="w-full py-3 rounded-xl text-sm font-bold border-2 transition-all disabled:opacity-50"
              style={{ borderColor: "var(--accent)", color: data.is_favorited ? "white" : "var(--accent)", background: data.is_favorited ? "var(--accent)" : "transparent" }}>
              {data.is_favorited ? "★ お気に入り登録済み" : "☆ お気に入りに登録"}
            </button>
          </div>
        </div>

        {data.self_intro && (
          <div className="card" style={{ borderColor: "var(--accent)" }}>
            <p className="text-xs font-bold mb-1" style={{ color: "var(--accent)" }}>{data.character?.name ?? data.display_name}の想い</p>
            <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--text)" }}>{data.self_intro}</p>
          </div>
        )}

        {data.bio && <p className="text-sm" style={{ color: "var(--text)" }}>{data.bio}</p>}
        {data.experience && (
          <p className="text-xs" style={{ color: "var(--muted)" }}>指導実績：{data.experience}</p>
        )}

        {/* 教えるスタイル：スタンス（性格・指導方針）とスキル（得意分野）を分けて表示 */}
        {((data.coaching_tags && data.coaching_tags.length > 0) || (data.skill_tags && data.skill_tags.length > 0)) && (
          <div className="card flex flex-col gap-3">
            <p className="text-xs font-bold" style={{ color: "var(--primary)" }}>教えるスタイル</p>
            {data.coaching_tags && data.coaching_tags.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold" style={{ color: "var(--muted)" }}>指導スタンス</span>
                <div className="flex gap-2 flex-wrap">
                  {data.coaching_tags.map((tag, i) => (
                    <span key={i} className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: "var(--primary)", color: "white", opacity: 0.85 }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {data.skill_tags && data.skill_tags.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold" style={{ color: "var(--muted)" }}>得意分野・指導の特徴</span>
                <div className="flex gap-2 flex-wrap">
                  {data.skill_tags.map((tag, i) => (
                    <span key={i} className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: "var(--accent)", color: "white", opacity: 0.85 }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 text-xs" style={{ color: "var(--muted)" }}>
          {data.sns_youtube && <a href={data.sns_youtube} target="_blank" rel="noopener noreferrer">▶ YouTube</a>}
          {data.sns_instagram && <a href={data.sns_instagram} target="_blank" rel="noopener noreferrer">📷 Instagram</a>}
          {data.sns_twitter && <a href={data.sns_twitter} target="_blank" rel="noopener noreferrer">🐦 X</a>}
        </div>

        {/* 伴走チャットのイメージ：コース一覧の直前に置き、購入直前に「この人と学ぶイメージ」を想起させる */}
        {data.character && <SampleChatPreview characterName={data.character.name} tags={data.coaching_tags ?? []} />}

        <div id="courses">
          <SectionHeading>コンテンツ一覧</SectionHeading>
          {data.courses.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>まだ公開コンテンツがありません。</p>
          ) : (
            <div className="flex flex-col gap-4">
              <Link href={`/courses/${featured.id}`} className="card hover-lift flex flex-col gap-2" style={{ borderColor: "var(--accent)" }}>
                <div className="flex items-center gap-2">
                  <span className="pill" style={{ background: "var(--accent)", color: "white" }}>おすすめ</span>
                  {featured.category && <span className="pill" style={{ background: "var(--example-bg, #eee)", color: "var(--accent)" }}>{featured.category}</span>}
                </div>
                <p className="font-black text-lg" style={{ color: "var(--primary)" }}>{featured.title}</p>
                {featured.description && <p className="text-sm line-clamp-2" style={{ color: "var(--muted)" }}>{featured.description}</p>}
                <p className="text-sm font-bold" style={{ color: "var(--accent)" }}>
                  {featured.is_free ? "無料" : `¥${featured.price.toLocaleString()}`}
                </p>
              </Link>

              {rest.length > 0 && (
                <div>
                  <p className="text-xs font-bold mb-2" style={{ color: "var(--muted)" }}>その他のコース</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {rest.map(c => (
                      <Link key={c.id} href={`/courses/${c.id}`} className="card flex flex-col gap-2 hover-lift">
                        {c.category && <span className="pill self-start" style={{ background: "var(--example-bg, #eee)", color: "var(--accent)" }}>{c.category}</span>}
                        <p className="font-bold" style={{ color: "var(--primary)" }}>{c.title}</p>
                        {c.description && <p className="text-xs line-clamp-2" style={{ color: "var(--muted)" }}>{c.description}</p>}
                        <p className="text-sm font-bold" style={{ color: "var(--accent)" }}>
                          {c.is_free ? "無料" : `¥${c.price.toLocaleString()}`}
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* モバイル：親指で押しやすい位置にコース一覧への誘導を固定表示 */}
      {data.courses.length > 0 && (
        <button
          onClick={scrollToCourses}
          className="sm:hidden fixed bottom-4 left-4 right-4 btn-cta text-center z-30"
        >
          コース一覧へ ↓
        </button>
      )}
    </div>
  );
}
