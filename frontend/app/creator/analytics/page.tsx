"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { LogoutButton } from "@/components/LogoutButton";

type Content = { id: number; content_type: string; title: string; url: string };
type Category = { id: number; name: string; question_count: number; contents: Content[] };
type PendingCategory = { id: number; name: string; question_count: number; created_at: string };

export default function CreatorAnalyticsPage() {
  const { loading } = useRoleGuard(["creator", "admin"]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pending, setPending] = useState<PendingCategory[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [questions, setQuestions] = useState<{ id: number; body: string; created_at: string }[]>([]);
  const [forms, setForms] = useState<Record<number, { content_type: string; title: string; url: string }>>({});
  const [submitting, setSubmitting] = useState(false);

  function load() {
    return Promise.all([api.getQuestionAnalytics(), api.getPendingCategories()]).then(([c, p]) => {
      setCategories(c);
      setPending(p);
    });
  }

  useEffect(() => {
    if (loading) return;
    load().finally(() => setLoadingData(false));
  }, [loading]);

  async function handleApproveCategory(categoryId: number) {
    try {
      await api.approveCategory(categoryId);
      await load();
      toast("カテゴリを承認しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "承認に失敗しました", "error");
    }
  }

  async function handleRejectCategory(categoryId: number) {
    if (!confirm("このカテゴリ候補を却下しますか？")) return;
    try {
      await api.rejectCategory(categoryId);
      await load();
      toast("却下しました", "info");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "却下に失敗しました", "error");
    }
  }

  async function toggleExpand(categoryId: number) {
    if (expanded === categoryId) { setExpanded(null); return; }
    setExpanded(categoryId);
    try {
      const qs = await api.getCategoryQuestions(categoryId);
      setQuestions(qs);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "質問の取得に失敗しました", "error");
    }
  }

  function updateForm(categoryId: number, field: "content_type" | "title" | "url", value: string) {
    setForms(prev => {
      const current = prev[categoryId] ?? { content_type: "video", title: "", url: "" };
      return { ...prev, [categoryId]: { ...current, [field]: value } };
    });
  }

  async function handleAddContent(categoryId: number) {
    const form = forms[categoryId];
    if (!form?.title || !form?.url) { toast("タイトルとURLを入力してください", "error"); return; }
    setSubmitting(true);
    try {
      await api.addCategoryContent(categoryId, form);
      setForms(prev => ({ ...prev, [categoryId]: { content_type: "video", title: "", url: "" } }));
      await load();
      toast("コンテンツを紐付けました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "登録に失敗しました", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteContent(contentId: number) {
    if (!confirm("この紐付けを削除しますか？")) return;
    try {
      await api.deleteCategoryContent(contentId);
      await load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "削除に失敗しました", "error");
    }
  }

  if (loading || loadingData) return <Skeleton />;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="px-4 sm:px-6 py-4 flex items-center justify-between" style={{ background: "var(--primary)" }}>
        <h1 className="text-white font-black text-lg">質問分析ダッシュボード</h1>
        <LogoutButton variant="onColor" />
      </header>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4">
        {pending.length > 0 && (
          <div className="card flex flex-col gap-3" style={{ borderColor: "var(--accent)" }}>
            <p className="font-bold" style={{ color: "var(--primary)" }}>🆕 AIが提案した新規カテゴリ候補（承認待ち）</p>
            {pending.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-3">
                <span className="text-sm" style={{ color: "var(--text)" }}>{p.name}（{p.question_count}件）</span>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => handleApproveCategory(p.id)} className="btn-primary text-xs py-1 px-3">承認する</button>
                  <button onClick={() => handleRejectCategory(p.id)} className="text-xs underline" style={{ color: "var(--muted)" }}>却下</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {categories.length === 0 ? (
          <div className="card flex flex-col gap-2">
            <p className="text-sm" style={{ color: "var(--muted)" }}>まだ質問が蓄積されていません。</p>
            <Link href="/dashboard" className="btn-ghost self-start">ダッシュボードに戻る</Link>
          </div>
        ) : (
          categories.map((c, i) => (
            <div key={c.id} className="card flex flex-col gap-3">
              <button onClick={() => toggleExpand(c.id)} className="flex items-center justify-between text-left">
                <span className="font-bold" style={{ color: "var(--text)" }}>
                  {i + 1}位: {c.name}（{c.question_count}件）
                </span>
                <span className="text-xs" style={{ color: "var(--muted)" }}>{expanded === c.id ? "閉じる" : "詳細"}</span>
              </button>

              {expanded === c.id && (
                <div className="flex flex-col gap-3 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                  <div className="flex flex-col gap-1">
                    {questions.map(q => (
                      <p key={q.id} className="text-xs" style={{ color: "var(--text)" }}>・{q.body}</p>
                    ))}
                  </div>

                  <p className="text-xs font-bold mt-2" style={{ color: "var(--primary)" }}>紐付けコンテンツ</p>
                  {c.contents.length === 0 ? (
                    <p className="text-xs" style={{ color: "var(--muted)" }}>まだ紐付けられていません。</p>
                  ) : (
                    c.contents.map(ct => (
                      <div key={ct.id} className="flex items-center justify-between text-xs">
                        <span style={{ color: "var(--text)" }}>[{ct.content_type}] {ct.title}</span>
                        <button onClick={() => handleDeleteContent(ct.id)} className="underline" style={{ color: "var(--muted)" }}>削除</button>
                      </div>
                    ))
                  )}

                  <div className="flex flex-col gap-2 mt-2">
                    <select value={forms[c.id]?.content_type ?? "video"} onChange={e => updateForm(c.id, "content_type", e.target.value)}>
                      <option value="video">動画</option>
                      <option value="article">記事</option>
                      <option value="pdf">PDF</option>
                    </select>
                    <input placeholder="タイトル" value={forms[c.id]?.title ?? ""} onChange={e => updateForm(c.id, "title", e.target.value)} />
                    <input placeholder="URL" value={forms[c.id]?.url ?? ""} onChange={e => updateForm(c.id, "url", e.target.value)} />
                    <button onClick={() => handleAddContent(c.id)} disabled={submitting} className="btn-primary disabled:opacity-50">
                      コンテンツを紐付ける
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </main>
    </div>
  );
}
