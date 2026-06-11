"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
const emptyServiceItemForm = { category: "", name: "", description: "", price_label: "", fulfillment: "", sort_order: 0, is_active: true };

export function ServiceMenuTab() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [form, setForm] = useState<any>(emptyServiceItemForm);

  const [intimacySettings, setIntimacySettings] = useState<any | null>(null);
  const [intimacySaving, setIntimacySaving] = useState(false);

  const reload = () => api.adminListAllServiceItems().then(setItems);
  useEffect(() => {
    reload().finally(() => setLoading(false));
    api.adminGetIntimacySettings().then(setIntimacySettings).catch(() => {});
  }, []);

  async function saveIntimacySettings() {
    if (!intimacySettings) return;
    setIntimacySaving(true);
    try {
      const updated = await api.adminUpdateIntimacySettings({
        points_per_message: Number(intimacySettings.points_per_message) || 0,
        points_per_purchase: Number(intimacySettings.points_per_purchase) || 0,
        points_per_login: Number(intimacySettings.points_per_login) || 0,
        points_per_exercise_submit: Number(intimacySettings.points_per_exercise_submit) || 0,
      });
      setIntimacySettings(updated);
      toast("親密度ポイントの設定を保存しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "error");
    } finally {
      setIntimacySaving(false);
    }
  }

  function startEdit(s: any) {
    setEditingItem(s);
    setForm({
      category: s.category, name: s.name, description: s.description ?? "",
      price_label: s.price_label, fulfillment: s.fulfillment ?? "",
      sort_order: s.sort_order, is_active: s.is_active,
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelForm() { setShowForm(false); setEditingItem(null); setForm(emptyServiceItemForm); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      description: form.description.trim() ? form.description.trim() : null,
      fulfillment: form.fulfillment.trim() ? form.fulfillment.trim() : null,
      sort_order: Number(form.sort_order) || 0,
    };
    try {
      if (editingItem) {
        await api.adminUpdateServiceItem(editingItem.id, payload);
        toast(`「${form.name}」を更新しました`, "success");
      } else {
        await api.adminCreateServiceItem(payload);
        toast(`「${form.name}」を追加しました`, "success");
      }
      await reload();
      cancelForm();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "error");
    }
  }

  async function deleteItem(id: number, name: string) {
    if (!confirm(`「${name}」を削除しますか？`)) return;
    try {
      await api.adminDeleteServiceItem(id);
      await reload();
      toast(`「${name}」を削除しました`, "info");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "削除に失敗しました", "error");
    }
  }

  async function toggleActive(s: any) {
    try {
      await api.adminUpdateServiceItem(s.id, { is_active: !s.is_active });
      await reload();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "更新に失敗しました", "error");
    }
  }

  if (loading) return <p style={{ color: "var(--muted)" }}>読み込み中…</p>;

  // カテゴリごとにグルーピングして表示（顧客向けページと同じ並び順）
  const grouped: Record<string, any[]> = {};
  for (const it of items) {
    (grouped[it.category] ||= []).push(it);
  }

  const formFields = (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>カテゴリ *</label>
        <input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} required placeholder="例：TOEIC" />
      </div>
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>項目名 *</label>
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="例：Part 5" />
      </div>
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>説明（任意）</label>
        <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="例：5問＋解説" />
      </div>
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>価格表示 *</label>
        <input value={form.price_label} onChange={e => setForm({ ...form, price_label: e.target.value })} required placeholder="例：500円" />
      </div>
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>提供方法（任意）</label>
        <input value={form.fulfillment} onChange={e => setForm({ ...form, fulfillment: e.target.value })} placeholder="例：自動 / マニュアル＋キャラフィードバック" />
      </div>
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>表示順</label>
        <input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: e.target.value })} />
      </div>
      <div className="flex items-center gap-2 pt-5">
        <input id="svc-active" type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
        <label htmlFor="svc-active" className="text-sm" style={{ color: "var(--muted)" }}>顧客向けページに掲載する</label>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-black" style={{ color: "var(--primary)" }}>💴 料金・サービスメニュー</h2>
        <button className="btn-accent" onClick={() => showForm ? cancelForm() : setShowForm(true)}>
          {showForm ? "キャンセル" : "+ 追加"}
        </button>
      </div>
      <p className="text-xs mb-6" style={{ color: "var(--muted)" }}>
        ここで管理する料金・メニュー情報は、顧客向けページには表示されません（あえて公開していません）。
        キャラクター（運営）がチャットの会話の流れの中で自然に商品・サービスへ誘導する「接客」スタイルを取るため、
        この一覧は運営側が金額・提供内容を把握し、チャットでの案内に役立てるための内部資料として使ってください。
      </p>

      <div className="card mb-6">
        <h3 className="font-bold mb-1" style={{ color: "var(--primary)" }}>💖 親密度ポイントの自動加算設定</h3>
        <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
          以下のイベントが発生したときに、自動で加算される親密度ポイント数を設定できます。
          手動での増減は引き続きチャット画面の「親密度を調整」から行えます。
        </p>
        {!intimacySettings ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>読み込み中…</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>メッセージ送信時</label>
                <input type="number" min={0} value={intimacySettings.points_per_message}
                  onChange={e => setIntimacySettings({ ...intimacySettings, points_per_message: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>コンテンツ購入時</label>
                <input type="number" min={0} value={intimacySettings.points_per_purchase}
                  onChange={e => setIntimacySettings({ ...intimacySettings, points_per_purchase: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>ログイン時（1日1回）</label>
                <input type="number" min={0} value={intimacySettings.points_per_login}
                  onChange={e => setIntimacySettings({ ...intimacySettings, points_per_login: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>演習問題提出時</label>
                <input type="number" min={0} value={intimacySettings.points_per_exercise_submit}
                  onChange={e => setIntimacySettings({ ...intimacySettings, points_per_exercise_submit: e.target.value })} />
              </div>
            </div>
            <div className="mt-3">
              <button className="btn-primary" disabled={intimacySaving} onClick={saveIntimacySettings}>
                {intimacySaving ? "保存中…" : "保存する"}
              </button>
            </div>
          </>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card mb-6 flex flex-col gap-3">
          <h3 className="font-bold" style={{ color: "var(--primary)" }}>
            {editingItem ? `✏️ 編集：${editingItem.name}` : "新規メニュー項目を追加"}
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

      {Object.entries(grouped).map(([category, list]) => (
        <div key={category} className="card mb-4">
          <h3 className="font-bold mb-2" style={{ color: "var(--primary)" }}>{category}</h3>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="text-left py-2 font-medium" style={{ color: "var(--muted)" }}>項目</th>
                <th className="text-left py-2 font-medium" style={{ color: "var(--muted)" }}>説明</th>
                <th className="text-left py-2 font-medium" style={{ color: "var(--muted)" }}>価格</th>
                <th className="text-left py-2 font-medium" style={{ color: "var(--muted)" }}>提供方法</th>
                <th className="text-center py-2 font-medium" style={{ color: "var(--muted)" }}>掲載</th>
                <th className="text-right py-2 font-medium" style={{ color: "var(--muted)" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map(s => (
                <tr key={s.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="py-2 font-medium" style={{ color: "var(--primary)" }}>{s.name}</td>
                  <td className="py-2 text-xs" style={{ color: "var(--muted)" }}>{s.description || "—"}</td>
                  <td className="py-2 text-xs">{s.price_label}</td>
                  <td className="py-2 text-xs" style={{ color: "var(--muted)" }}>{s.fulfillment || "—"}</td>
                  <td className="py-2 text-center">
                    <button onClick={() => toggleActive(s)}
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={s.is_active
                        ? { background: "var(--accent)", color: "#fff" }
                        : { background: "var(--bg)", color: "var(--muted)", border: "1px solid var(--border)" }}>
                      {s.is_active ? "掲載中" : "非掲載"}
                    </button>
                  </td>
                  <td className="py-2 text-right">
                    <button className="text-xs px-2 py-0.5 rounded mr-1" style={{ color: "var(--accent)", border: "1px solid var(--border)" }}
                      onClick={() => startEdit(s)}>編集</button>
                    <button className="text-xs px-2 py-0.5 rounded" style={{ color: "#c0392b" }}
                      onClick={() => deleteItem(s.id, s.name)}>削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {items.length === 0 && <p className="text-sm" style={{ color: "var(--muted)" }}>メニュー項目がまだありません。「+ 追加」から登録してください。</p>}
    </div>
  );
}
