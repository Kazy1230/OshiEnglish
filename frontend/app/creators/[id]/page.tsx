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
  sample_reply?: string | null;
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
  const hasSns = data.sns_youtube || data.sns_instagram || data.sns_twitter;

  function scrollToCourses() {
    document.getElementById("courses")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader
        role="learner"
        backHref="/creators"
        backLabel="クリエイター一覧"
        breadcrumb={[{ label: "トップ", href: "/" }, { label: "クリエイター一覧", href: "/creators" }, { label: data.display_name }]}
      />

      {/* ヒーロー：信頼感のあるカバー領域 */}
      <section className="relative gradient-hero overflow-hidden">
        <div className="pointer-events-none absolute -top-16 -right-16 w-72 h-72 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} />
        <div className="pointer-events-none absolute -bottom-20 left-10 w-56 h-56 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }} />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-10 sm:pt-14 pb-20 sm:pb-24 flex flex-col sm:flex-row sm:items-end gap-5">
          {data.character?.avatar_url ? (
            <img src={data.character.avatar_url} alt="" className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl object-cover shadow-soft flex-shrink-0" style={{ border: "4px solid rgba(255,255,255,0.85)" }} />
          ) : (
            <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl flex items-center justify-center text-4xl shadow-soft flex-shrink-0" style={{ background: "rgba(255,255,255,0.18)", border: "4px solid rgba(255,255,255,0.85)" }}>🎭</div>
          )}
          <div className="flex-1">
            <span className="pill" style={{ background: "rgba(255,255,255,0.18)", color: "white" }}>✅ 運営審査済みクリエイター</span>
            <h1 className="text-white text-2xl sm:text-3xl font-black tracking-tight mt-2">{data.display_name}</h1>
            {data.character?.name && data.character.name !== data.display_name && (
              <p className="text-white/80 text-sm mt-0.5">{data.character.name}</p>
            )}
            {data.speciality && (
              <span className="inline-block mt-2 text-xs font-bold px-3 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.16)", color: "white" }}>
                {data.speciality}
              </span>
            )}
          </div>
        </div>
      </section>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 -mt-12 sm:-mt-16 pb-24 sm:pb-12 flex flex-col lg:flex-row gap-6 relative">
        {/* サイドバー：信頼の証拠＋アクション */}
        <aside className="lg:w-72 flex-shrink-0 flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          <div className="card shadow-soft flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col items-center gap-0.5 py-3 rounded-xl" style={{ background: "var(--bg)" }}>
                <span className="text-xl font-black" style={{ color: "var(--primary)" }}>{data.total_learners ?? 0}</span>
                <span className="text-[11px]" style={{ color: "var(--muted)" }}>👥 学習者</span>
              </div>
              <div className="flex flex-col items-center gap-0.5 py-3 rounded-xl" style={{ background: "var(--bg)" }}>
                <span className="text-xl font-black" style={{ color: "var(--primary)" }}>{data.courses.length}</span>
                <span className="text-[11px]" style={{ color: "var(--muted)" }}>📘 コース</span>
              </div>
            </div>

            <button onClick={toggleFavorite} disabled={favoriting}
              className="w-full py-3 rounded-xl text-sm font-bold border-2 transition-all disabled:opacity-50"
              style={{ borderColor: "var(--accent)", color: data.is_favorited ? "white" : "var(--accent)", background: data.is_favorited ? "var(--accent)" : "transparent" }}>
              {data.is_favorited ? "★ お気に入り登録済み" : "☆ お気に入りに登録"}
            </button>

            {data.courses.length > 0 && (
              <button onClick={scrollToCourses} className="btn-primary w-full text-center">
                コースを見る ↓
              </button>
            )}

            {data.experience && (
              <div className="pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                <p className="text-[11px] font-bold mb-1" style={{ color: "var(--muted)" }}>指導実績</p>
                <p className="text-xs" style={{ color: "var(--text)" }}>{data.experience}</p>
              </div>
            )}

            {hasSns && (
              <div className="flex gap-3 text-xs pt-3" style={{ borderTop: "1px solid var(--border)", color: "var(--muted)" }}>
                {data.sns_youtube && <a href={data.sns_youtube} target="_blank" rel="noopener noreferrer">▶ YouTube</a>}
                {data.sns_instagram && <a href={data.sns_instagram} target="_blank" rel="noopener noreferrer">📷 Instagram</a>}
                {data.sns_twitter && <a href={data.sns_twitter} target="_blank" rel="noopener noreferrer">🐦 X</a>}
              </div>
            )}
          </div>
        </aside>

        {/* メインコンテンツ */}
        <div className="flex-1 flex flex-col gap-6 min-w-0 pt-2 lg:pt-16">
          {data.self_intro && (
            <div className="card shadow-soft relative overflow-hidden" style={{ borderColor: "var(--accent)" }}>
              <span className="absolute top-3 right-4 text-4xl opacity-10" style={{ color: "var(--accent)" }}>“</span>
              <p className="text-xs font-bold mb-1.5" style={{ color: "var(--accent)" }}>{data.character?.name ?? data.display_name}の想い</p>
              <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text)" }}>{data.self_intro}</p>
            </div>
          )}

          {data.bio && (
            <div>
              <SectionHeading>自己紹介</SectionHeading>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text)" }}>{data.bio}</p>
            </div>
          )}

          {((data.coaching_tags && data.coaching_tags.length > 0) || (data.skill_tags && data.skill_tags.length > 0)) && (
            <div>
              <SectionHeading>教えるスタイル</SectionHeading>
              <div className="flex flex-col gap-4">
                {data.coaching_tags && data.coaching_tags.length > 0 && (
                  <div className="card shadow-soft flex flex-col gap-3">
                    <span className="text-xs font-bold" style={{ color: "var(--primary)" }}>🤝 指導スタンス</span>
                    <div className="flex flex-col gap-2.5">
                      {data.coaching_tags.map((tag, i) => (
                        <p key={i} className="text-sm leading-relaxed pl-3" style={{ color: "var(--text)", borderLeft: "3px solid var(--primary)" }}>
                          {tag}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                {data.skill_tags && data.skill_tags.length > 0 && (
                  <div className="card shadow-soft flex flex-col gap-3">
                    <span className="text-xs font-bold" style={{ color: "var(--accent)" }}>💡 得意分野・指導の特徴</span>
                    <div className="flex flex-col gap-2.5">
                      {data.skill_tags.map((tag, i) => (
                        <p key={i} className="text-sm leading-relaxed pl-3" style={{ color: "var(--text)", borderLeft: "3px solid var(--accent)" }}>
                          {tag}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {data.character && data.sample_reply && (
            <div>
              <SectionHeading>会話のイメージ</SectionHeading>
              <SampleChatPreview characterName={data.character.name} avatarUrl={data.character.avatar_url} sampleReply={data.sample_reply} />
            </div>
          )}

          <div id="courses">
            <SectionHeading>コンテンツ一覧</SectionHeading>
            {data.courses.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>まだ公開コンテンツがありません。</p>
            ) : (
              <div className="flex flex-col gap-4">
                <Link href={`/courses/${featured.id}`} className="card hover-lift shadow-soft flex flex-col gap-2" style={{ borderColor: "var(--accent)" }}>
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
                        <Link key={c.id} href={`/courses/${c.id}`} className="card flex flex-col gap-2 hover-lift shadow-soft">
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
        </div>
      </main>
    </div>
  );
}
