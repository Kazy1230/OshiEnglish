"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { AppHeader } from "@/components/AppHeader";
import { toast } from "@/components/Toast";

type CreatorDetail = {
  id: number;
  display_name: string;
  bio?: string | null;
  speciality?: string | null;
  experience?: string | null;
  self_intro?: string | null;
  coaching_tags?: string[];
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

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="learner" backHref="/creators" backLabel="クリエイター一覧" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        <div className="card flex flex-col sm:flex-row gap-4 sm:items-center">
          <div className="flex items-center gap-3">
            {data.character?.avatar_url ? (
              <img src={data.character.avatar_url} alt="" className="w-20 h-20 rounded-full object-cover" />
            ) : (
              <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl" style={{ background: "var(--example-bg, #eee)" }}>🎭</div>
            )}
            <div>
              <h1 className="text-xl font-black" style={{ color: "var(--primary)" }}>{data.display_name}</h1>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                {data.character?.name}
              </p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {data.speciality && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--example-bg, #eee)", color: "var(--accent)" }}>
                    {data.speciality}
                  </span>
                )}
                {!!data.total_learners && data.total_learners > 0 && (
                  <span className="text-xs" style={{ color: "var(--muted)" }}>学習者{data.total_learners}名が選択</span>
                )}
              </div>
            </div>
          </div>
          <button onClick={toggleFavorite} disabled={favoriting}
            className="sm:ml-auto px-4 py-2 rounded-full text-sm font-bold border-2 transition-all disabled:opacity-50"
            style={{ borderColor: "var(--accent)", color: data.is_favorited ? "white" : "var(--accent)", background: data.is_favorited ? "var(--accent)" : "transparent" }}>
            {data.is_favorited ? "★ お気に入り登録済み" : "☆ お気に入りに登録"}
          </button>
        </div>

        {data.self_intro && (
          <div className="card" style={{ borderColor: "var(--accent)" }}>
            <p className="text-xs font-bold mb-1" style={{ color: "var(--accent)" }}>{data.character?.name ?? data.display_name}からのメッセージ</p>
            <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--text)" }}>{data.self_intro}</p>
          </div>
        )}

        {data.bio && <p className="text-sm" style={{ color: "var(--text)" }}>{data.bio}</p>}
        {data.experience && (
          <p className="text-xs" style={{ color: "var(--muted)" }}>指導実績：{data.experience}</p>
        )}

        {data.coaching_tags && data.coaching_tags.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {data.coaching_tags.map((tag, i) => (
              <span key={i} className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: "var(--primary)", color: "white", opacity: 0.85 }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-3 text-xs" style={{ color: "var(--muted)" }}>
          {data.sns_youtube && <a href={data.sns_youtube} target="_blank" rel="noopener noreferrer">▶ YouTube</a>}
          {data.sns_instagram && <a href={data.sns_instagram} target="_blank" rel="noopener noreferrer">📷 Instagram</a>}
          {data.sns_twitter && <a href={data.sns_twitter} target="_blank" rel="noopener noreferrer">🐦 X</a>}
        </div>

        {data.character && <SampleChatPreview characterName={data.character.name} tags={data.coaching_tags ?? []} />}

        <div>
          <h2 className="font-bold mb-3" style={{ color: "var(--primary)" }}>コンテンツ一覧</h2>
          {data.courses.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>まだ公開コンテンツがありません。</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {data.courses.map(c => (
                <Link key={c.id} href={`/courses/${c.id}`} className="card flex flex-col gap-2 hover:shadow-md transition-shadow">
                  {c.category && <span className="text-xs font-bold self-start px-2 py-0.5 rounded-full" style={{ background: "var(--example-bg, #eee)", color: "var(--accent)" }}>{c.category}</span>}
                  <p className="font-bold" style={{ color: "var(--primary)" }}>{c.title}</p>
                  {c.description && <p className="text-xs line-clamp-2" style={{ color: "var(--muted)" }}>{c.description}</p>}
                  <p className="text-sm font-bold" style={{ color: "var(--accent)" }}>
                    {c.is_free ? "無料" : `¥${c.price.toLocaleString()}`}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function SampleChatPreview({ characterName, tags }: { characterName: string; tags: string[] }) {
  const styleHint = tags[0] ? `（${tags[0]}）` : "";
  return (
    <div className="card flex flex-col gap-3">
      <p className="font-bold" style={{ color: "var(--primary)" }}>チャットのサンプル{styleHint}</p>
      <div className="flex flex-col gap-2">
        <div className="self-end max-w-[85%] rounded-2xl px-4 py-2 text-sm" style={{ background: "var(--primary)", color: "white" }}>
          最近やる気が出なくて、続けられるか不安です…
        </div>
        <div className="self-start max-w-[85%] rounded-2xl px-4 py-2 text-sm" style={{ background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)" }}>
          そう感じる時もありますよね。{characterName}が伴走するので、無理せず今日できる小さな一歩から一緒に進めていきましょう。
        </div>
      </div>
      <p className="text-xs" style={{ color: "var(--muted)" }}>※ サンプルです。実際の会話はコース購入後にご利用いただけます。</p>
    </div>
  );
}
