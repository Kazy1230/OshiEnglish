"use client";
import { useEffect, useState } from "react";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { AppHeader } from "@/components/AppHeader";
import { ContentCard, ContentItem } from "@/components/ContentEmbed";

const SUBJECT_OPTIONS = [
  { key: "english", label: "英語" },
  { key: "it", label: "IT・プログラミング" },
  { key: "music", label: "音楽" },
  { key: "japanese", label: "日本語" },
];

const TAG_SUGGESTIONS = ["初心者向け", "中級", "上級", "文法", "発音", "会話", "リスニング", "単語", "試験対策", "ビジネス"];

export default function CreatorContentsPage() {
  const { loading } = useRoleGuard(["creator", "admin"]);
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [fetching, setFetching] = useState(true);

  const [url, setUrl] = useState("");
  const [subject, setSubject] = useState("english");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(true);
  const [adding, setAdding] = useState(false);

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

  function removeTag(t: string) {
    setTags(tags.filter((x) => x !== t));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setAdding(true);
    try {
      await api.createContent({ url: url.trim(), subject, tags, is_public: isPublic });
      toast("コンテンツを追加しました", "success");
      setUrl("");
      setTags([]);
      setTagInput("");
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
      setContents((prev) => prev.filter((c) => c.id !== id));
      toast("削除しました", "success");
    } catch {
      toast("削除に失敗しました", "error");
    }
  }

  async function handleLike(id: number) {
    try {
      const res = await api.toggleContentLike(id);
      setContents((prev) => prev.map((c) => c.id === id ? { ...c, liked: res.liked, like_count: res.like_count } : c));
    } catch {}
  }

  if (loading) return <Skeleton />;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" title="コンテンツプール" />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">

        {/* 追加フォーム */}
        <div className="card flex flex-col gap-4">
          <h2 style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", margin: 0 }}>コンテンツを追加</h2>
          <form onSubmit={handleAdd} className="flex flex-col gap-3">
            <div>
              <label className="text-sm font-bold" style={{ color: "var(--muted)" }}>URL</label>
              <input
                className="input w-full mt-1"
                type="url"
                placeholder="https://youtube.com/watch?v=..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                YouTube・X・Instagram・Threads・TikTok・noteのURLに対応
              </p>
            </div>

            <div>
              <label className="text-sm font-bold" style={{ color: "var(--muted)" }}>分野</label>
              <div className="flex gap-2 flex-wrap mt-1">
                {SUBJECT_OPTIONS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setSubject(s.key)}
                    className="text-sm px-3 py-1 rounded-full font-bold transition-all"
                    style={{
                      background: subject === s.key ? "var(--primary)" : "var(--card)",
                      color: subject === s.key ? "white" : "var(--muted)",
                      border: `1.5px solid ${subject === s.key ? "var(--primary)" : "var(--border)"}`,
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-bold" style={{ color: "var(--muted)" }}>タグ（任意）</label>
              <div className="flex gap-2 flex-wrap mt-1 mb-2">
                {tags.map((t) => (
                  <span key={t} style={{ fontSize: 12, padding: "2px 10px", borderRadius: 999, background: "var(--example-bg, #eee)", color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}>
                    #{t}
                    <button type="button" onClick={() => removeTag(t)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", lineHeight: 1 }}>×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder="タグを入力してEnter"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); } }}
                />
              </div>
              <div className="flex gap-1 flex-wrap mt-2">
                {TAG_SUGGESTIONS.filter((t) => !tags.includes(t)).map((t) => (
                  <button key={t} type="button" onClick={() => addTag(t)} className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--muted)", cursor: "pointer" }}>
                    +{t}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              <span className="text-sm" style={{ color: "var(--muted)" }}>公開する（トップフィードに表示）</span>
            </label>

            <button type="submit" disabled={adding || !url.trim()} className="btn-primary">
              {adding ? "取得中…" : "追加する"}
            </button>
          </form>
        </div>

        {/* コンテンツ一覧 */}
        <div className="flex flex-col gap-4">
          <h2 style={{ fontWeight: 700, fontSize: 16, color: "var(--text)" }}>
            登録済みコンテンツ（{contents.length}件）
          </h2>
          {fetching ? (
            <p style={{ color: "var(--muted)" }}>読み込み中…</p>
          ) : contents.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>まだコンテンツが登録されていません。上のフォームからURLを追加してください。</p>
          ) : (
            contents.map((c) => (
              <ContentCard key={c.id} item={c} onLike={handleLike} onDelete={handleDelete} />
            ))
          )}
        </div>
      </main>
    </div>
  );
}
