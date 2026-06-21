"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";

export function CustomersTab() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [characters, setCharacters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", email: "", character_id: "" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editCharId, setEditCharId] = useState<string>("");
  const [editActive, setEditActive] = useState<boolean>(true);
  const [editUsername, setEditUsername] = useState<string>("");
  const [editEmail, setEditEmail] = useState<string>("");
  const [editRole, setEditRole] = useState<string>("learner");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [reissuingId, setReissuingId] = useState<number | null>(null);
  const [reissueResult, setReissueResult] = useState<{ username: string; temporary_password: string; message: string } | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const reload = () => Promise.all([api.adminGetCustomers(), api.adminGetCharacters()])
    .then(([c, ch]) => { setCustomers(c); setCharacters(ch); });

  useEffect(() => { reload().finally(() => setLoading(false)); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.adminCreateCustomer({
        username: form.username,
        password: form.password,
        email: form.email.trim() || null,
        character_id: form.character_id ? Number(form.character_id) : null,
      });
      await reload();
      setShowForm(false);
      setForm({ username: "", password: "", email: "", character_id: "" });
      toast(`顧客「${form.username}」を追加しました`, "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "追加に失敗しました", "error");
    }
  }

  async function saveCustomer(customerId: number) {
    const updateData: any = {
      character_id: editCharId ? Number(editCharId) : null,
      is_active: editActive,
      role: editRole,
    };
    const currentCustomer = customers.find(c => c.id === customerId);
    if (editUsername.trim() && editUsername.trim() !== currentCustomer?.username) {
      updateData.username = editUsername.trim();
    }
    updateData.email = editEmail.trim() || null;
    setSavingId(customerId);
    try {
      await api.adminUpdateCustomer(customerId, updateData);
      await reload();
      setEditingId(null);
      toast("顧客情報を更新しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "更新に失敗しました", "error");
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(c: any) {
    if (!confirm(`顧客「${c.username}」を削除しますか？この操作は取り消せません。`)) return;
    setDeletingId(c.id);
    try {
      await api.adminDeleteCustomer(c.id);
      setCustomers(prev => prev.filter(x => x.id !== c.id));
      toast(`顧客「${c.username}」を削除しました`, "info");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "削除に失敗しました", "error");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleReissuePassword(c: any) {
    if (!confirm(`顧客「${c.username}」のパスワードを再発行しますか？\n現在のパスワードは無効になり、新しい一時パスワードが発行されます。`)) return;
    setReissuingId(c.id);
    try {
      const result = await api.adminReissuePassword(c.id);
      setReissueResult(result);
      await reload();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "再発行に失敗しました", "error");
    } finally {
      setReissuingId(null);
    }
  }

  if (loading) return <p style={{ color: "var(--muted)" }}>読み込み中…</p>;

  return (
    <div>
      {reissueResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="card max-w-md w-full flex flex-col gap-3" style={{ background: "var(--card-bg, #fff)" }}>
            <h3 className="font-black text-lg" style={{ color: "var(--primary)" }}>🔑 一時パスワードを発行しました</h3>
            <p className="text-sm" style={{ color: "var(--muted)" }}>{reissueResult.message}</p>
            <div className="rounded-lg p-3 flex flex-col gap-1" style={{ background: "#fff8e1" }}>
              <p className="text-xs" style={{ color: "var(--muted)" }}>ユーザー名</p>
              <p className="font-mono font-bold">{reissueResult.username}</p>
              <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>新しい一時パスワード（この画面を閉じると二度と表示できません）</p>
              <p className="font-mono font-bold text-lg select-all">{reissueResult.temporary_password}</p>
            </div>
            <button className="btn-primary w-full text-center" onClick={() => setReissueResult(null)}>確認した（閉じる）</button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="text-xl font-black" style={{ color: "var(--primary)" }}>👤 顧客管理</h2>
        <button className="btn-accent" onClick={() => setShowForm(!showForm)}>
          {showForm ? "キャンセル" : "+ 顧客を追加"}
        </button>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 ユーザー名・メールアドレスで検索"
        className="mb-6 w-full sm:w-72" />

      {showForm && (
        <form onSubmit={handleCreate} className="card mb-6 flex flex-col gap-3">
          <h3 className="font-bold" style={{ color: "var(--primary)" }}>新規顧客追加</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>ユーザー名</label>
              <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} required placeholder="username" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>初期パスワード</label>
              <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required placeholder="••••••••" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>メールアドレス（任意）</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="example@email.com" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>紐付けキャラクター（後から変更可）</label>
              <select value={form.character_id} onChange={e => setForm({ ...form, character_id: e.target.value })}>
                <option value="">なし（後で設定）</option>
                {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>※ 初回ログイン時にパスワード変更が強制されます</p>
          <button type="submit" className="btn-primary w-full text-center">追加する</button>
        </form>
      )}

      {(() => {
        const filteredCustomers = customers.filter(c => {
          if (!search.trim()) return true;
          const q = search.trim().toLowerCase();
          return c.username?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q);
        });
        if (filteredCustomers.length === 0) {
          return <p className="text-sm" style={{ color: "var(--muted)" }}>該当する顧客が見つかりません</p>;
        }
        return (
      <div className="flex flex-col gap-3">
        {filteredCustomers.map(c => {
          const charName = characters.find(ch => ch.id === c.character_id)?.name;
          const isEditing = editingId === c.id;
          return (
            <div key={c.id} className="card flex flex-col gap-2">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold" style={{ color: "var(--primary)" }}>{c.username}</p>
                    <span className="text-xs" style={{ color: "var(--muted)" }}>#{c.id}　{c.role}</span>
                    {c.is_password_reset_required && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#fff8e1" }}>🔑 PW未変更</span>}
                    {!c.is_active && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#fce8e8" }}>⛔ 無効</span>}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                    キャラ: {charName ?? "未設定"}
                    {c.email && `　✉ ${c.email}`}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button className="btn-ghost text-xs py-1 px-3" onClick={() => {
                    const opening = !isEditing;
                    setEditingId(opening ? c.id : null);
                    if (opening) {
                      setEditUsername(c.username ?? "");
                      setEditEmail(c.email ?? "");
                      setEditCharId(String(c.character_id ?? ""));
                      setEditActive(c.is_active ?? true);
                      setEditRole(c.role ?? "learner");
                    }
                  }}>
                    {isEditing ? "閉じる" : "編集"}
                  </button>
                  <button className="btn-ghost text-xs py-1 px-3"
                    disabled={reissuingId === c.id}
                    onClick={() => handleReissuePassword(c)}>
                    {reissuingId === c.id ? "発行中…" : "🔑 PW再発行"}
                  </button>
                  <button className="text-xs py-1 px-3 rounded-lg" style={{ color: "#c0392b" }}
                    disabled={deletingId === c.id}
                    onClick={() => handleDelete(c)}>
                    {deletingId === c.id ? "削除中…" : "削除"}
                  </button>
                </div>
              </div>

              {isEditing && (
                <div className="flex flex-col gap-3 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>ユーザー名</label>
                      <input value={editUsername} onChange={e => setEditUsername(e.target.value)} placeholder="username" />
                    </div>
                    <div>
                      <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>メールアドレス（任意）</label>
                      <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="example@email.com" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>紐付けキャラクター</label>
                      <select value={editCharId} onChange={e => setEditCharId(e.target.value)}>
                        <option value="">なし</option>
                        {characters.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>ロール</label>
                      <select value={editRole} onChange={e => setEditRole(e.target.value)}>
                        <option value="learner">learner</option>
                        <option value="creator">creator</option>
                        <option value="admin">admin</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>アカウント状態</label>
                      <select value={editActive ? "active" : "inactive"} onChange={e => setEditActive(e.target.value === "active")}>
                        <option value="active">✅ 有効</option>
                        <option value="inactive">⛔ 無効化（ログイン不可）</option>
                      </select>
                    </div>
                  </div>

                  <button className="btn-accent text-xs py-2 px-4 self-start disabled:opacity-50" disabled={savingId === c.id} onClick={() => saveCustomer(c.id)}>
                    {savingId === c.id ? "保存中…" : "保存"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
        );
      })()}
    </div>
  );
}
