"use client";
import { useEffect, useState } from "react";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { AppHeader } from "@/components/AppHeader";
import { ContentCard, ContentItem } from "@/components/ContentEmbed";


const TAG_SUGGESTIONS = ["初心者向け","中級","上級","文法","発音","会話","リスニング","単語","試験対策","ビジネス"];

const PLATFORM_HINTS = [
  { icon: "▶", name: "YouTube", hint: "youtube.com または youtu.be" },
  { icon: "𝕏",  name: "X (Twitter)", hint: "twitter.com または x.com" },
  { icon: "📝", name: "note", hint: "note.com" },
  { icon: "🧵", name: "Threads", hint: "threads.net" },
  { icon: "📸", name: "Instagram", hint: "instagram.com" },
  { icon: "♪",  name: "TikTok", hint: "tiktok.com" },
];

export default function CreatorContentsPage() {
  const { loading } = useRoleGuard(["creator", "admin"]);
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [fetching, setFetching] = useState(true);
  const [filterSubject, setFilterSubject] = useState("");

  const [url, setUrl] = useState("");
  const [subject, setSubject] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(true);
  const [adding, setAdding] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  function reload() {
    return api.listMyContents().then(setContents).catch(() => {});
  }

  useEffect(() => {
    if (loading) return;
    reload().finally(() => setFetching(false));
  }, [loading]);

  function addTag(t: string) {
    const clean = t.trim().replace(/^#/, "");
    if (clean && !tags.includes(clean)) setTags([...tags, clean]);
    setTagInput("");
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setAdding(true);
    try {
      await api.createContent({ url: url.trim(), subject, tags, is_public: isPublic });
      toast("コンテンツを追加しました", "success");
      setUrl(""); setTags([]); setTagInput("");
      setPanelOpen(false);
      await reload();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "追加に失敗しました", "error");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("このコンテンツを削除しますか？")) return;
    try {
      await api.deleteContent(id);
      setContents(prev => prev.filter(c => c.id !== id));
      toast("削除しました", "success");
    } catch { toast("削除に失敗しました", "error"); }
  }

  async function handleLike(id: number) {
    try {
      const res = await api.toggleContentLike(id);
      setContents(prev => prev.map(c => c.id === id ? { ...c, liked: res.liked, like_count: res.like_count } : c));
    } catch {}
  }

  const filtered = filterSubject ? contents.filter(c => c.subject === filterSubject) : contents;
  const subjectCounts = contents.reduce<Record<string, number>>((acc, c) => {
    if (c.subject) acc[c.subject] = (acc[c.subject] ?? 0) + 1;
    return acc;
  }, {});
  const uniqueSubjects = Object.keys(subjectCounts);

  if (loading) return <Skeleton />;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" title="コンテンツプール" />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">

        {/* ページヘッダー */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>コンテンツプール</h1>
            <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
              YouTube・X・noteなどのURLを登録。コースの教材として使ったり、フィードに公開できます。
            </p>
          </div>
          <button
            onClick={() => setPanelOpen(v => !v)}
            className="btn-primary flex-shrink-0"
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
            コンテンツを追加
          </button>
        </div>

        {/* 追加パネル（スライドイン風） */}
        {panelOpen && (
          <div style={{
            background: "var(--card)", border: "1px solid var(--border)",
            borderRadius: 16, padding: "20px 24px", marginBottom: 24,
            boxShadow: "0 8px 32px rgba(0,0,0,0.10)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: 0 }}>新しいコンテンツを登録</h2>
              <button onClick={() => setPanelOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 20 }}>×</button>
            </div>

            {/* 対応プラットフォーム */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {PLATFORM_HINTS.map(p => (
                <span key={p.name} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 6, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--muted)", display: "flex", gap: 4 }}>
                  {p.icon} {p.name}
                </span>
              ))}
            </div>

            <form onSubmit={handleAdd} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 6 }}>URL または埋め込みコード *</label>
                <textarea
                  className="input w-full"
                  placeholder={"https://youtube.com/watch?v=...\nまたはInstagramの埋め込みコード（<blockquote ...>）をそのまま貼り付けてください"}
                  value={url}
                  onChange={e => {
                    const val = e.target.value;
                    const match = val.match(/data-instgrm-permalink="([^"]+)"/);
                    setUrl(match ? match[1].split("?")[0].replace(/\/$/, "") : val);
                  }}
                  rows={3}
                  required
                  style={{ fontSize: 13, resize: "vertical" }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 6 }}>分野</label>
                <input
                  className="input w-full"
                  placeholder="例: マイクラ建築、料理、TOEIC、Python"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  style={{ fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 6 }}>タグ（任意）</label>
                {tags.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                    {tags.map(t => (
                      <span key={t} style={{ fontSize: 12, padding: "2px 10px", borderRadius: 999, background: "var(--bg)", color: "var(--muted)", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 4 }}>
                        #{t}
                        <button type="button" onClick={() => setTags(tags.filter(x => x !== t))} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, lineHeight: 1, color: "inherit", opacity: 0.7 }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    className="input flex-1"
                    placeholder="タグを入力してEnter"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); } }}
                    style={{ fontSize: 13 }}
                  />
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
                  {TAG_SUGGESTIONS.filter(t => !tags.includes(t)).map(t => (
                    <button key={t} type="button" onClick={() => addTag(t)} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--muted)", cursor: "pointer" }}>
                      + {t}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} style={{ width: 15, height: 15 }} />
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>公開する（トップフィードに表示）</span>
                </label>
                <button type="submit" disabled={adding || !url.trim()} className="btn-primary" style={{ fontSize: 14 }}>
                  {adding ? "取得中…" : "追加する"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* フィルター＋コンテンツグリッド */}
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>

          {/* サイドバー（デスクトップ） */}
          <aside className="hidden lg:flex" style={{ width: 160, flexShrink: 0, flexDirection: "column", gap: 4, position: "sticky", top: 72 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>分野</p>
            {["", ...uniqueSubjects].map(key => (
              <button
                key={key}
                type="button"
                onClick={() => setFilterSubject(key)}
                style={{
                  textAlign: "left", padding: "8px 12px", borderRadius: 8,
                  fontSize: 13, fontWeight: filterSubject === key ? 700 : 500,
                  background: filterSubject === key ? "var(--primary)" : "transparent",
                  color: filterSubject === key ? "white" : "var(--muted)",
                  border: "none", cursor: "pointer", transition: "all 0.15s",
                }}
              >
                {key || "すべて"}
              </button>
            ))}

            <div style={{ borderTop: "1px solid var(--border)", marginTop: 12, paddingTop: 12 }}>
              <p style={{ fontSize: 12, color: "var(--muted)" }}>{contents.length}件のコンテンツ</p>
              {uniqueSubjects.map(s => (
                <div key={s} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", padding: "2px 0" }}>
                  <span>{s}</span>
                  <span>{subjectCounts[s]}</span>
                </div>
              ))}
            </div>
          </aside>

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* モバイルフィルター */}
            <div className="flex gap-2 overflow-x-auto pb-2 lg:hidden" style={{ scrollbarWidth: "none", marginBottom: 12 }}>
              {["", ...uniqueSubjects].map(key => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilterSubject(key)}
                  className="whitespace-nowrap text-xs px-3 py-1.5 rounded-full font-bold flex-shrink-0"
                  style={{
                    background: filterSubject === key ? "var(--primary)" : "var(--card)",
                    color: filterSubject === key ? "white" : "var(--muted)",
                    border: `1px solid ${filterSubject === key ? "var(--primary)" : "var(--border)"}`,
                  }}
                >
                  {key || "すべて"}
                </button>
              ))}
            </div>

            {fetching ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                {[1,2,3].map(i => (
                  <div key={i} style={{ height: 280, borderRadius: 16, background: "var(--card)", border: "1px solid var(--border)", animation: "pulse 1.5s infinite" }} />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "64px 0", color: "var(--muted)" }}>
                <p style={{ fontSize: 40, marginBottom: 12 }}>🗂️</p>
                <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
                  {contents.length === 0 ? "まだコンテンツがありません" : "この分野のコンテンツはありません"}
                </p>
                <p style={{ fontSize: 13 }}>右上の「コンテンツを追加」からURLを登録してください。</p>
                <button
                  onClick={() => setPanelOpen(true)}
                  className="btn-primary"
                  style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  + 追加する
                </button>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                {filtered.map(c => (
                  <ContentCard key={c.id} item={c} onLike={handleLike} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
