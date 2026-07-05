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

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "今";
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}日前`;
  return new Date(iso).toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}

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
    <div style={{
      position: "relative",
      paddingBottom: isShort ? "177%" : "56.25%",
      height: 0,
      overflow: "hidden",
      borderRadius: 10,
      background: "#000",
    }}>
      <iframe
        src={`https://www.youtube.com/embed/${videoId}`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
      />
    </div>
  );
}

function InstagramEmbed({ url }: { url: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const cleanUrl = url.split("?")[0].replace(/\/$/, "");
  useEffect(() => {
    if (!ref.current) return;
    if (ref.current.querySelector("blockquote")) return;
    const bq = document.createElement("blockquote");
    bq.className = "instagram-media";
    bq.setAttribute("data-instgrm-permalink", cleanUrl + "/");
    bq.setAttribute("data-instgrm-version", "14");
    bq.style.width = "100%";
    ref.current.appendChild(bq);
    const w = window as unknown as Record<string, unknown>;
    if (w.instgrm) {
      (w.instgrm as { Embeds: { process: () => void } }).Embeds.process();
    } else {
      const script = document.createElement("script");
      script.src = "https://www.instagram.com/embed.js";
      script.async = true;
      document.body.appendChild(script);
    }
  }, [cleanUrl]);
  return <div ref={ref} style={{ minHeight: 400, width: "100%" }} />;
}

function XEmbed({ url }: { url: string }) {
  const tweetId = extractTweetId(url);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!tweetId || !ref.current) return;
    if (ref.current.querySelector("blockquote")) return;
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
  let hostname = url;
  try { hostname = new URL(url).hostname.replace("www.", ""); } catch {}
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "flex",
        borderRadius: 10,
        border: "1px solid var(--border)",
        background: "var(--bg)",
        textDecoration: "none",
        overflow: "hidden",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      {thumbnail && (
        <img
          src={thumbnail}
          alt=""
          style={{ width: 100, minHeight: 80, objectFit: "cover", flexShrink: 0 }}
          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      )}
      <div style={{ padding: "10px 12px", minWidth: 0, display: "flex", flexDirection: "column", gap: 3, justifyContent: "center" }}>
        <p style={{ fontSize: 10, color: "var(--accent)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>{hostname}</p>
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {title || url}
        </p>
        {description && (
          <p style={{ fontSize: 11, color: "var(--muted)", margin: 0, display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {description}
          </p>
        )}
      </div>
    </a>
  );
}

export function ContentEmbed({ item }: { item: ContentItem }) {
  if (item.content_type === "youtube") return <YouTubeEmbed url={item.url} />;
  if (item.content_type === "x") return <XEmbed url={item.url} />;
  if (item.content_type === "instagram") return <InstagramEmbed url={item.url} />;
  return <LinkCard url={item.url} title={item.title} thumbnail={item.thumbnail_url} description={item.description} />;
}

const SUBJECT_COLOR: Record<string, { bg: string; text: string }> = {
  english: { bg: "#dbeafe", text: "#1d4ed8" },
  it:      { bg: "#d1fae5", text: "#065f46" },
  music:   { bg: "#fce7f3", text: "#9d174d" },
  japanese:{ bg: "#fef3c7", text: "#92400e" },
};
const SUBJECT_LABEL: Record<string, string> = { english: "英語", it: "IT", music: "音楽", japanese: "日本語" };
const TYPE_ICON: Record<string, string> = { youtube: "▶", x: "𝕏", instagram: "📸", threads: "🧵", tiktok: "♪", note: "📝", other: "🔗" };

function Avatar({ name, avatarUrl, size = 36 }: { name?: string | null; avatarUrl?: string | null; size?: number }) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  }
  const initials = (name || "?").slice(0, 1).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(135deg, var(--primary), var(--accent))",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "white", fontSize: size * 0.4, fontWeight: 700,
    }}>
      {initials}
    </div>
  );
}

export function ContentCard({
  item,
  onLike,
  onDelete,
  compact = false,
}: {
  item: ContentItem;
  onLike?: (id: number) => void;
  onDelete?: (id: number) => void;
  compact?: boolean;
}) {
  const subjectStyle = SUBJECT_COLOR[item.subject] || { bg: "#f3f4f6", text: "#6b7280" };

  return (
    <article style={{
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 16,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      transition: "box-shadow 0.2s, transform 0.2s",
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 32px rgba(0,0,0,0.10)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = "";
        (e.currentTarget as HTMLElement).style.transform = "";
      }}
    >
      {/* ヘッダー */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px 0" }}>
        <Avatar name={item.creator_name} avatarUrl={item.creator_avatar} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.creator_name || "クリエイター"}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 1 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: subjectStyle.bg, color: subjectStyle.text }}>
              {SUBJECT_LABEL[item.subject] || item.subject}
            </span>
            <span style={{ fontSize: 10, color: "var(--muted)" }}>
              {TYPE_ICON[item.content_type] || "🔗"} {item.content_type}
            </span>
            {item.created_at && (
              <span style={{ fontSize: 10, color: "var(--muted)" }}>· {relativeTime(item.created_at)}</span>
            )}
          </div>
        </div>
        {onDelete && (
          <button onClick={() => onDelete(item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 16, lineHeight: 1, padding: 4, borderRadius: 4, flexShrink: 0 }} title="削除">×</button>
        )}
      </div>

      {/* タイトル */}
      <p style={{ fontWeight: 600, fontSize: 14, color: "var(--text)", margin: "10px 16px 8px", lineHeight: 1.5 }}>
        {item.title}
      </p>

      {/* エンベッド */}
      <div style={{ padding: "0 12px" }}>
        <ContentEmbed item={item} />
      </div>

      {/* フッター：タグ＋いいね */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px 14px", gap: 8 }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
          {item.tags.slice(0, compact ? 2 : 5).map(t => (
            <span key={t} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "var(--bg)", color: "var(--muted)", border: "1px solid var(--border)" }}>
              #{t}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600, textDecoration: "none", padding: "4px 10px", border: "1px solid var(--accent)", borderRadius: 999, display: "flex", alignItems: "center", gap: 3 }}>
            開く ↗
          </a>
          {onLike && (
            <button
              onClick={() => onLike(item.id)}
              style={{
                background: item.liked ? "#fff0f0" : "var(--bg)",
                border: `1px solid ${item.liked ? "#fca5a5" : "var(--border)"}`,
                cursor: "pointer",
                fontSize: 13,
                color: item.liked ? "#e53e3e" : "var(--muted)",
                display: "flex", alignItems: "center", gap: 4,
                padding: "4px 10px", borderRadius: 999,
                fontWeight: 600, transition: "all 0.15s",
              }}
            >
              {item.liked ? "♥" : "♡"}
              <span style={{ fontSize: 11 }}>{item.like_count}</span>
            </button>
          )}
          {!onLike && item.like_count > 0 && (
            <span style={{ fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 3 }}>♡ {item.like_count}</span>
          )}
        </div>
      </div>
    </article>
  );
}
