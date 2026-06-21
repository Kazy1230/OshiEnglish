"use client";
import { useEffect, useState } from "react";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";

type Profile = {
  communication: { tone?: string; first_person?: string; sentence_ending?: string; catchphrase?: string };
  coaching_style: { strictness?: string; encouragement?: string; feedback_method?: string };
  learning_philosophy: { core_value?: string; priority?: string; judgment_criteria?: string };
  thinking_style: { analogy_tendency?: string; explanation_method?: string; problem_solving?: string };
};

const FIELD_LABELS: Record<string, Record<string, string>> = {
  communication: { tone: "口調", first_person: "一人称", sentence_ending: "語尾", catchphrase: "口癖・決め台詞" },
  coaching_style: { strictness: "厳しさ", encouragement: "励まし方", feedback_method: "フィードバック方法" },
  learning_philosophy: { core_value: "重視する考え方", priority: "優先順位", judgment_criteria: "判断基準" },
  thinking_style: { analogy_tendency: "例え話の癖", explanation_method: "説明方法", problem_solving: "問題解決アプローチ" },
};

const CATEGORY_LABELS: Record<string, string> = {
  communication: "コミュニケーション",
  coaching_style: "指導スタイル",
  learning_philosophy: "学習哲学",
  thinking_style: "思考特性",
};

export default function CreatorProfilePage() {
  const { loading } = useRoleGuard(["creator", "admin"]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Profile | null>(null);
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading) return;
    api.getPersonalityProfile().then(res => setProfile(res.profile)).catch(() => {}).finally(() => setFetching(false));
  }, [loading]);

  function startEdit() {
    setDraft(JSON.parse(JSON.stringify(profile)));
    setEditing(true);
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await api.updatePersonalityProfile(draft);
      setProfile(res.profile);
      setEditing(false);
      toast("人格プロファイルを更新しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "更新に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading || fetching) return <Skeleton />;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="px-4 sm:px-6 py-4 flex items-center justify-between" style={{ background: "var(--primary)" }}>
        <h1 className="text-white font-black text-lg">人格プロファイル</h1>
        {profile && !editing && (
          <button className="text-white/80 text-sm" onClick={startEdit}>編集</button>
        )}
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4">
        {!profile ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            まだ人格プロファイルがありません。<a href="/creator/interview" style={{ color: "var(--accent)" }}>AIインタビュー</a>を完了させてください。
          </p>
        ) : (
          <>
            {Object.entries(editing && draft ? draft : profile).map(([category, fields]) => (
              <div key={category} className="card flex flex-col gap-3">
                <h2 className="font-bold" style={{ color: "var(--primary)" }}>{CATEGORY_LABELS[category] ?? category}</h2>
                {Object.entries(fields as Record<string, string>).map(([key, value]) => (
                  <div key={key}>
                    <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>
                      {FIELD_LABELS[category]?.[key] ?? key}
                    </label>
                    {editing ? (
                      <textarea rows={2} value={value ?? ""} onChange={e => {
                        setDraft(d => d ? { ...d, [category]: { ...(d as any)[category], [key]: e.target.value } } : d);
                      }} />
                    ) : (
                      <p className="text-sm" style={{ color: "var(--text)" }}>{value}</p>
                    )}
                  </div>
                ))}
              </div>
            ))}
            {editing && (
              <div className="flex gap-3">
                <button className="btn-primary flex-1 text-center" disabled={saving} onClick={handleSave}>
                  {saving ? "保存中…" : "保存する"}
                </button>
                <button className="btn-ghost px-6" onClick={() => setEditing(false)}>キャンセル</button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
