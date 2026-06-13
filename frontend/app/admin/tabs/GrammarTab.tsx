"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
const emptyGrammarForm = { topic_name: "", exam_category: "TOEIC", part: "", description: "" };

export function GrammarTab() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [form, setForm] = useState(emptyGrammarForm);

  const reload = () => api.adminGetGrammarMasters().then(setItems);
  useEffect(() => { reload().finally(() => setLoading(false)); }, []);

  function startEdit(g: any) {
    setEditingItem(g);
    setForm({ topic_name: g.topic_name, exam_category: g.exam_category, part: g.part ?? "", description: g.description ?? "" });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelForm() { setShowForm(false); setEditingItem(null); setForm(emptyGrammarForm); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editingItem) {
        await api.adminUpdateGrammarMaster(editingItem.id, form);
        toast(`「${form.topic_name}」を更新しました`, "success");
      } else {
        await api.adminCreateGrammarMaster(form);
        toast(`「${form.topic_name}」を追加しました`, "success");
      }
      await reload();
      cancelForm();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "error");
    }
  }

  async function deleteItem(id: number, name: string) {
    if (!confirm(`「${name}」を削除しますか？\n紐付き記事がある場合は削除できません。`)) return;
    try {
      await api.adminDeleteGrammarMaster(id);
      await reload();
      toast(`「${name}」を削除しました`, "info");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "削除に失敗しました", "error");
    }
  }

  if (loading) return <p style={{ color: "var(--muted)" }}>読み込み中…</p>;

  const formFields = (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>文法項目名 *</label>
        <input value={form.topic_name} onChange={e => setForm({ ...form, topic_name: e.target.value })} required placeholder="例：関係代名詞" />
      </div>
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>試験カテゴリ</label>
        <select value={form.exam_category} onChange={e => setForm({ ...form, exam_category: e.target.value })}>
          <option>TOEIC</option><option>IELTS</option><option>英検</option><option>TOEFL</option><option>一般</option>
        </select>
      </div>
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>パート</label>
        <input value={form.part} onChange={e => setForm({ ...form, part: e.target.value })} placeholder="例：Part5" />
      </div>
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>説明（任意）</label>
        <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-black" style={{ color: "var(--primary)" }}>📚 文法マスター</h2>
        <button className="btn-accent" onClick={() => showForm ? cancelForm() : setShowForm(true)}>
          {showForm ? "キャンセル" : "+ 追加"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card mb-6 flex flex-col gap-3">
          <h3 className="font-bold" style={{ color: "var(--primary)" }}>
            {editingItem ? `✏️ 編集：${editingItem.topic_name}` : "新規文法マスター追加"}
          </h3>
          {formFields}
          <div className="flex gap-3">
            <button type="submit" className="btn-primary flex-1 text-center">
              {editingItem ? "保存する" : "追加する"}
            </button>
            <button type="button" className="btn-ghost px-6" onClick={cancelForm}>キャンセル</button>
          </div>
        </form>
      )}

      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th className="text-left py-2 font-medium" style={{ color: "var(--muted)" }}>カテゴリ</th>
              <th className="text-left py-2 font-medium" style={{ color: "var(--muted)" }}>パート</th>
              <th className="text-left py-2 font-medium" style={{ color: "var(--muted)" }}>文法項目</th>
              <th className="text-right py-2 font-medium" style={{ color: "var(--muted)" }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map(g => (
              <tr key={g.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="py-2">
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--bg)" }}>{g.exam_category}</span>
                </td>
                <td className="py-2 text-xs" style={{ color: "var(--muted)" }}>{g.part || "—"}</td>
                <td className="py-2 font-medium" style={{ color: "var(--primary)" }}>{g.topic_name}</td>
                <td className="py-2 text-right">
                  <button className="text-xs px-2 py-0.5 rounded mr-1" style={{ color: "var(--accent)", border: "1px solid var(--border)" }}
                    onClick={() => startEdit(g)}>編集</button>
                  <button className="text-xs px-2 py-0.5 rounded" style={{ color: "#c0392b" }}
                    onClick={() => deleteItem(g.id, g.topic_name)}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}