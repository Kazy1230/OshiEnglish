"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { AppHeader } from "@/components/AppHeader";

type ChapterDraft = { title: string; goal: string };

export default function ChapterSkeletonPage() {
  const { loading } = useRoleGuard(["creator", "admin"]);
  const params = useParams();
  const courseId = Number(params.id);
  const router = useRouter();

  const [courseTitle, setCourseTitle] = useState("");
  const [chapters, setChapters] = useState<ChapterDraft[]>([{ title: "", goal: "" }]);
  const [saving, setSaving] = useState(false);
  const [existingCount, setExistingCount] = useState(0);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (loading) return;
    Promise.all([
      api.getCurriculumMeta(courseId),
      api.listChapters(courseId),
    ]).then(([meta, existing]) => {
      setCourseTitle(meta.title || "");
      setLocked(meta.status === "published" && meta.enrollment_count > 0);
      if (existing.length > 0) {
        setExistingCount(existing.length);
        setChapters(existing.map((ch: { title: string; goal: string | null }) => ({ title: ch.title, goal: ch.goal || "" })));
      }
    }).catch(() => {});
  }, [loading, courseId]);

  function addChapter() {
    setChapters(prev => [...prev, { title: "", goal: "" }]);
  }

  function removeChapter(i: number) {
    setChapters(prev => prev.filter((_, idx) => idx !== i));
  }

  function updateChapter(i: number, field: keyof ChapterDraft, value: string) {
    setChapters(prev => prev.map((ch, idx) => idx === i ? { ...ch, [field]: value } : ch));
  }

  function moveUp(i: number) {
    if (i === 0) return;
    setChapters(prev => {
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  }

  function moveDown(i: number) {
    if (i === chapters.length - 1) return;
    setChapters(prev => {
      const next = [...prev];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next;
    });
  }

  async function handleSave() {
    const valid = chapters.filter(ch => ch.title.trim());
    if (valid.length === 0) { toast("章タイトルを1つ以上入力してください", "error"); return; }
    setSaving(true);
    try {
      const existing = await api.listChapters(courseId);
      // 既存を全部削除して再作成（シンプルな方法）
      for (const ch of existing) {
        await api.deleteChapter(courseId, ch.id);
      }
      for (let i = 0; i < valid.length; i++) {
        await api.createChapter(courseId, { title: valid[i].title, goal: valid[i].goal || null, order: i });
      }
      toast("章立てを保存しました", "success");
      router.push(`/creator/courses/${courseId}/curriculum`);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Skeleton />;

  if (locked) {
    return (
      <div className="creator-theme min-h-screen" style={{ background: "var(--bg)" }}>
        <AppHeader role="creator" title="章立てを入力" />
        <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
          <div className="card text-center py-12">
            <p className="text-sm mb-4" style={{ color: "var(--text)" }}>
              受講者がいる公開中のコースのため、章立て全体の作り直しはできません。
            </p>
            <p className="text-xs mb-6" style={{ color: "var(--muted)" }}>
              カードの内容編集はカリキュラム編集画面から行えます。
            </p>
            <button type="button" className="btn-secondary" onClick={() => router.back()}>戻る</button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="creator-theme min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" title="章立てを入力" />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="font-bold text-xl" style={{ color: "var(--text)" }}>{courseTitle || "コース"}</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            AIとの壁打ちで決めた章立てを入力してください。後から変更できます。
          </p>
          {existingCount > 0 && (
            <p className="text-xs mt-2 px-3 py-2 rounded-lg" style={{ background: "#fef3c7", color: "#92400e" }}>
              既存の {existingCount} 章があります。保存すると上書きされます。
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 mb-4">
          {chapters.map((ch, i) => (
            <div
              key={i}
              className="card flex flex-col gap-3"
              style={{ padding: "1rem" }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--primary)", color: "#fff" }}>
                  第{i + 1}章
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    className="text-xs px-2 py-1 rounded"
                    style={{ background: "var(--bg)", color: "var(--muted)", opacity: i === 0 ? 0.3 : 1 }}
                  >↑</button>
                  <button
                    type="button"
                    onClick={() => moveDown(i)}
                    disabled={i === chapters.length - 1}
                    className="text-xs px-2 py-1 rounded"
                    style={{ background: "var(--bg)", color: "var(--muted)", opacity: i === chapters.length - 1 ? 0.3 : 1 }}
                  >↓</button>
                  <button
                    type="button"
                    onClick={() => removeChapter(i)}
                    className="text-xs px-2 py-1 rounded"
                    style={{ background: "#fee2e2", color: "#dc2626" }}
                  >削除</button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>章タイトル *</label>
                <input
                  value={ch.title}
                  onChange={e => updateChapter(i, "title", e.target.value)}
                  placeholder="例：リスニング基礎を固める"
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>この章のゴール（任意）</label>
                <input
                  value={ch.goal}
                  onChange={e => updateChapter(i, "goal", e.target.value)}
                  placeholder="例：Part1〜4を安定して正解できるようになる"
                />
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addChapter}
          className="w-full py-3 rounded-xl text-sm font-medium mb-6 transition"
          style={{
            border: "2px dashed var(--border, #e5e7eb)",
            color: "var(--primary)",
            background: "transparent",
          }}
        >
          + 章を追加
        </button>

        <div className="flex gap-3">
          <button
            type="button"
            className="btn-secondary flex-1"
            onClick={() => router.back()}
          >
            戻る
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "保存中…" : "保存してカリキュラムへ"}
          </button>
        </div>
      </main>
    </div>
  );
}
