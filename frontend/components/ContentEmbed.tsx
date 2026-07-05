"use client";
import { useEffect, useRef } from "react";

export type ContentItem = {
  id: number;
  url: string;
  title: string;
  description?: string | null;
  thumbnail_url?: string | null;
  content_type: string;
  subject: string;
  tags: string[];
  like_count: number;
  liked?: boolean;
  created_at?: string | null;
  creator_name?: string | null;
  creator_avatar?: string | null;
};

function extractYoutubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
  ];
  for (const pat of patterns) {
    const m = url.match(pat);
    if (m) return m[1];
  }
  return null;
}

function extractTweetId(url: string): string | null {
  const m = url.match(/(?:twitter|x)\.com\/\w+\/status\/(\d+)/);
  return m ? m[1] : null;
}

function YouTubeEmbed({ url }: { url: string }) {
  const videoId = extractYoutubeId(url);
  if (!videoId) return <LinkCard url={url} />;
  const isShort = url.includes("/shorts/");
  return (
    <div style={{ position: "relative", paddingBottom: isShort ? "177%" : "56.25%", height: 0, overflow: "hidden", borderRadius: 8 }}>
      <iframe
        src={`https://www.youtube.com/embed/${videoId}`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0, borderRadius: 8 }}
      />
    </div>
  );
}

function XEmbed({ url }: { url: string }) {
  const tweetId = extractTweetId(url);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tweetId || !ref.current) return;
    const existing = ref.current.querySelector("blockquote");
    if (existing) return;

    const bq = document.createElement("blockquote");
    bq.className = "twitter-tweet";
    bq.setAttribute("data-dnt", "true");
    const a = document.createElement("a");
    a.href = url;
    bq.appendChild(a);
    ref.current.appendChild(bq);

    if ((window as unknown as Record<string, unknown>).twttr) {
      (window as unknown as { twttr: { widgets: { load: (el: HTMLElement) => void } } }).twttr.widgets.load(ref.current);
    } else {
      const script = document.createElement("script");
      script.src = "https://platform.twitter.com/widgets.js";
      script.async = true;
      document.body.appendChild(script);
    }
  }, [tweetId, url]);

  if (!tweetId) return <LinkCard url={url} />;
  return <div ref={ref} style={{ minHeight: 80 }} />;
}

function LinkCard({ url, title, thumbnail, description }: { url: string; title?: string | null; thumbnail?: string | null; description?: string | null }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "flex",
        gap: 12,
        padding: 12,
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--card)",
        textDecoration: "none",
        alignItems: "flex-start",
      }}
    >
      {thumbnail && (
        <img
          src={thumbnail}
          alt=""
          style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      )}
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title || url}
        </p>
        {description && (
          <p style={{ fontSize: 11, color: "var(--muted)", margin: "4px 0 0", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {description}
          </p>
        )}
        <p style={{ fontSize: 11, color: "var(--accent)", margin: "4px 0 0" }}>{new URL(url).hostname}</p>
      </div>
    </a>
  );
}

export function ContentEmbed({ item }: { item: ContentItem }) {
  if (item.content_type === "youtube") {
    return <YouTubeEmbed url={item.url} />;
  }
  if (item.content_type === "x") {
    return <XEmbed url={item.url} />;
  }
  return (
    <LinkCard
      url={item.url}
      title={item.title}
      thumbnail={item.thumbnail_url}
      description={item.description}
    />
  );
}

const SUBJECT_LABEL: Record<string, string> = {
  english: "英語", it: "IT", music: "音楽", japanese: "日本語",
};
const TYPE_ICON: Record<string, string> = {
  youtube: "▶", x: "𝕏", instagram: "📸", threads: "🧵", tiktok: "🎵", note: "📝", other: "🔗",
};

export function ContentCard({
  item,
  onLike,
  onDelete,
}: {
  item: ContentItem;
  onLike?: (id: number) => void;
  onDelete?: (id: number) => void;
}) {
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 13 }}>{TYPE_ICON[item.content_type] || "🔗"}</span>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>{SUBJECT_LABEL[item.subject] || item.subject}</span>
          {item.creator_name && (
            <span style={{ fontSize: 11, color: "var(--muted)" }}>· {item.creator_name}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {onDelete && (
            <button onClick={() => onDelete(item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 14 }} title="削除">✕</button>
          )}
          {onLike && (
            <button
              onClick={() => onLike(item.id)}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: item.liked ? "#e53e3e" : "var(--muted)", display: "flex", alignItems: "center", gap: 3 }}
            >
              {item.liked ? "♥" : "♡"} <span style={{ fontSize: 11 }}>{item.like_count}</span>
            </button>
          )}
        </div>
      </div>

      <p style={{ fontWeight: 500, fontSize: 14, color: "var(--text)", margin: 0 }}>{item.title}</p>

      <ContentEmbed item={item} />

      {item.tags.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {item.tags.map((t) => (
            <span key={t} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "var(--example-bg, #eee)", color: "var(--muted)" }}>#{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}
