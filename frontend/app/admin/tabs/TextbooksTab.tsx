"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";

type Textbook = {
  id: number;
  name: string;
  publisher: string | null;
  type: "textbook" | "vocabulary";
  target: string | null;
  toc: string[];
  is_preset: boolean;
};

type FormState = {
  name: string;
  publisher: string;
  type: "textbook" | "vocabulary";
  target: string;
  tocText: string; // 1行1項目のテキストエリア入力
};

const EMPTY_FORM: FormState = { name: "", publisher: "", type: "textbook", target: "", tocText: "" };

function toFormState(t: Textbook): FormState {
  return {
    name: t.name,
    publisher: t.publisher ?? "",
    type: t.type,
    target: t.target ?? "",
    tocText: (t.toc || []).join("\n"),
  };
}

/** 教材プリセット管理（コース作成時にクリエイターが検索・選択できる教材カタログ） */
export function TextbooksTab() {
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);

  function reload() {
    return api.adminListTextbooks().then(setTextbooks);
  }

  useEffect(() => { reload().finally(() => setLoading(false)); }, []);

  function buildPayload(f: FormState) {
    return {
      name: f.name.trim(),
      publisher: f.publisher.trim() || null,
      type: f.type,
      target: f.target.trim() || null,
      toc: f.tocText.split("\n").map(s => s.trim()).filter(Boolean),
    };
  }

  async function handleCreate() {
    if (!form.name.trim()) { toast("教材名を入力してください", "error"); return; }
    setSaving(true);
    try {
      await api.adminCreateTextbook(buildPayload(form));
      toast("教材プリセットを登録しました", "success");
      setForm(EMPTY_FORM);
      setShowNewForm(false);
      await reload();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "登録に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(t: Textbook) {
    setEditingId(t.id);
    setForm(toFormState(t));
  }

  async function handleUpdate() {
    if (editingId == null) return;
    if (!form.name.trim()) { toast("教材名を入力してください", "error"); return; }
    setSaving(true);
    try {
      await api.adminUpdateTextbook(editingId, buildPayload(form));
      toast("更新しました", "success");
      setEditingId(null);
      setForm(EMPTY_FORM);
      await reload();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "更新に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("この教材プリセットを削除しますか？")) return;
    try {
      await api.adminDeleteTextbook(id);
      toast("削除しました", "success");
      await reload();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "削除に失敗しました（コースで使用中の可能性があります）", "error");
    }
  }

  if (loading) return <p style={{ color: "var(--muted)" }}>読み込み中…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black" style={{ color: "var(--primary)" }}>📚 教材プリセット管理</h2>
        {!showNewForm && (
          <button onClick={() => { setEditingId(null); setForm(EMPTY_FORM); setShowNewForm(true); }} className="btn-primary text-sm">
            ＋ 新規登録
          </button>
        )}
      </div>

      {showNewForm && (
        <TextbookForm
          form={form}
          setForm={setForm}
          onSubmit={handleCreate}
          onCancel={() => setShowNewForm(false)}
          saving={saving}
          submitLabel="登録する"
        />
      )}

      {textbooks.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>教材プリセットがまだありません。</p>
      ) : (
        <div className="flex flex-col gap-2">
          {textbooks.map(t => (
            <div key={t.id} className="card flex flex-col gap-3">
              {editingId === t.id ? (
                <TextbookForm
                  form={form}
                  setForm={setForm}
                  onSubmit={handleUpdate}
                  onCancel={() => setEditingId(null)}
                  saving={saving}
                  submitLabel="保存する"
                />
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{t.name}</p>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: t.type === "vocabulary" ? "var(--accent)" : "var(--primary)", color: "white" }}>
                        {t.type === "vocabulary" ? "単語帳" : "教材"}
                      </span>
                    </div>
                    <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                      {[t.publisher, t.target].filter(Boolean).join(" ・ ") || "出版社・対象範囲未設定"}
                    </p>
                    <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>目次項目数: {t.toc.length}件</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => startEdit(t)} className="text-xs font-bold underline" style={{ color: "var(--accent)" }}>編集</button>
                    <button onClick={() => handleDelete(t.id)} className="text-xs font-bold underline" style={{ color: "#e53e3e" }}>削除</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TextbookForm({
  form, setForm, onSubmit, onCancel, saving, submitLabel,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
  saving: boolean;
  submitLabel: string;
}) {
  return (
    <div className="card flex flex-col gap-3" style={{ borderColor: "var(--accent)" }}>
      <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--text)" }}>
        教材名
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例: はじめて受けるTOEFL ITP TEST総合対策【改訂版】" />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--text)" }}>
          出版社
          <input value={form.publisher} onChange={e => setForm({ ...form, publisher: e.target.value })} placeholder="例: 語研" />
        </label>
        <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--text)" }}>
          種別
          <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as "textbook" | "vocabulary" })}>
            <option value="textbook">教材（文法・リスニング・リーディング等）</option>
            <option value="vocabulary">単語帳</option>
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--text)" }}>
        対象範囲（任意）
        <input value={form.target} onChange={e => setForm({ ...form, target: e.target.value })} placeholder="例: Section 1 Listening" />
      </label>
      <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--text)" }}>
        目次項目（1行に1項目）
        <textarea
          value={form.tocText}
          onChange={e => setForm({ ...form, tocText: e.target.value })}
          className="min-h-[120px]"
          placeholder={"Section 1 Listening - Part A 攻略+練習問題(88問)\nSection 2 Structure and Written Expression 攻略+練習問題(79問)"}
        />
      </label>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-bold border" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
          キャンセル
        </button>
        <button onClick={onSubmit} disabled={saving} className="btn-primary disabled:opacity-50">
          {saving ? "保存中…" : submitLabel}
        </button>
      </div>
    </div>
  );
}
