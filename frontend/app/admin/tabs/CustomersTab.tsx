"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { buildPreviewExamplePrompt } from "@/app/admin/lib/promptBuilders";

type PreviewExampleForm = { id?: number; user_message: string; character_response: string };
const emptyPreviewExamples = (): PreviewExampleForm[] =>
  Array.from({ length: 5 }, () => ({ user_message: "", character_response: "" }));
export function CustomersTab() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [characters, setCharacters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", email: "", character_id: "", subscription_plan: "buy_once" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editCharId, setEditCharId] = useState<string>("");
  const [editPlan, setEditPlan] = useState<string>("buy_once");
  const [editActive, setEditActive] = useState<boolean>(true);
  const [editUsername, setEditUsername] = useState<string>("");
  const [editEmail, setEditEmail] = useState<string>("");
  // 「キャラクターが顧客のことを覚えている」演出用メモ（誕生日・好きなもの・エピソードなど）
  const [editNickname, setEditNickname] = useState<string>("");
  const [editBirthday, setEditBirthday] = useState<string>("");
  const [editFavorites, setEditFavorites] = useState<string>("");
  const [editEpisodes, setEditEpisodes] = useState<string>("");
  const [editToneNotes, setEditToneNotes] = useState<string>("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [reissuingId, setReissuingId] = useState<number | null>(null);
  const [reissueResult, setReissueResult] = useState<{ username: string; temporary_password: string; message: string } | null>(null);
  const [refundingId, setRefundingId] = useState<number | null>(null);
  const [refundResult, setRefundResult] = useState<{ message: string } | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [creditDelta, setCreditDelta] = useState<string>("");
  const [creditReason, setCreditReason] = useState<string>("");
  const [adjustingCreditId, setAdjustingCreditId] = useState<number | null>(null);

  // キャラクター作成後プレビュー（会話例文）
  const [previewExamples, setPreviewExamples] = useState<PreviewExampleForm[]>(emptyPreviewExamples());
  const [previewStatus, setPreviewStatus] = useState<{ preview_ready: boolean; preview_submitted: boolean }>({ preview_ready: false, preview_submitted: false });
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSavingId, setPreviewSavingId] = useState<number | null>(null);

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
        subscription_plan: form.subscription_plan,
      });
      await reload();
      setShowForm(false);
      setForm({ username: "", password: "", email: "", character_id: "", subscription_plan: "buy_once" });
      toast(`顧客「${form.username}」を追加しました`, "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "追加に失敗しました", "error");
    }
  }

  async function saveCharacter(customerId: number) {
    const updateData: any = {
      character_id: editCharId ? Number(editCharId) : null,
      subscription_plan: editPlan,
      is_active: editActive,
      character_memory: {
        nickname: editNickname.trim() || null,
        birthday: editBirthday.trim() || null,
        favorites: editFavorites.split("\n").map(s => s.trim()).filter(Boolean),
        episodes: editEpisodes.split("\n").map(s => s.trim()).filter(Boolean),
        tone_notes: editToneNotes.trim() || null,
      },
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

  async function loadPreviewExamples(customerId: number) {
    setPreviewLoading(true);
    try {
      const res = await api.adminGetPreviewExamples(customerId);
      setPreviewStatus({ preview_ready: res.preview_ready, preview_submitted: res.preview_submitted });
      const byNumber = new Map<number, any>();
      for (const e of res.examples ?? []) byNumber.set(e.example_number, e);
      setPreviewExamples(Array.from({ length: 5 }, (_, i) => {
        const e = byNumber.get(i + 1);
        return { id: e?.id, user_message: e?.user_message ?? "", character_response: e?.character_response ?? "" };
      }));
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "プレビュー例文の取得に失敗しました", "error");
    } finally {
      setPreviewLoading(false);
    }
  }

  function handleCopyPreviewPrompt(c: any) {
    const character = characters.find(ch => ch.id === c.character_id);
    if (!character) {
      toast("キャラクターが紐付けられていません", "error");
      return;
    }
    const prompt = buildPreviewExamplePrompt(character);
    navigator.clipboard.writeText(prompt);
    toast("例文生成用プロンプトをコピーしました", "success");
  }

  async function handleSavePreviewExamples(customerId: number) {
    if (previewExamples.some(e => !e.user_message.trim() || !e.character_response.trim())) {
      toast("5つすべての例文（ユーザーメッセージ・キャラ応答）を入力してください", "error");
      return;
    }
    setPreviewSavingId(customerId);
    try {
      const res = await api.adminSavePreviewExamples(customerId, previewExamples.map((e, i) => ({
        example_number: i + 1,
        user_message: e.user_message,
        character_response: e.character_response,
      })));
      setPreviewStatus({ preview_ready: res.preview_ready, preview_submitted: res.preview_submitted });
      const byNumber = new Map<number, any>();
      for (const e of res.examples ?? []) byNumber.set(e.example_number, e);
      setPreviewExamples(Array.from({ length: 5 }, (_, i) => {
        const e = byNumber.get(i + 1);
        return { id: e?.id, user_message: e?.user_message ?? "", character_response: e?.character_response ?? "" };
      }));
      toast("プレビュー例文を保存しました（顧客にメールで通知されます）", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "error");
    } finally {
      setPreviewSavingId(null);
    }
  }

  async function handleAdjustCredits(c: any) {
    const delta = Number(creditDelta);
    if (!delta) {
      toast("増減量を入力してください", "error");
      return;
    }
    setAdjustingCreditId(c.id);
    try {
      await api.adminAdjustCredits(c.id, delta, creditReason.trim() || undefined);
      await reload();
      setCreditDelta("");
      setCreditReason("");
      toast("クレジット残高を調整しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "調整に失敗しました", "error");
    } finally {
      setAdjustingCreditId(null);
    }
  }

  async function handleDelete(c: any) {
    if (!confirm(`顧客「${c.username}」を削除しますか？\n紐づくチャット・記事・アクセスログもすべて削除されます。この操作は取り消せません。`)) return;
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

  async function handleRefund(c: any) {
    if (!confirm(`顧客「${c.username}」への返金処理を行いますか？\nStripeを通じて決済額が全額返金されます。この操作は取り消せません。`)) return;
    setRefundingId(c.id);
    try {
      const result = await api.adminRefundCustomer(c.id);
      setRefundResult(result);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "返金処理に失敗しました", "error");
    } finally {
      setRefundingId(null);
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
      {refundResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="card max-w-md w-full flex flex-col gap-3" style={{ background: "var(--card-bg, #fff)" }}>
            <h3 className="font-black text-lg" style={{ color: "var(--primary)" }}>💴 返金処理が完了しました</h3>
            <p className="text-sm" style={{ color: "var(--muted)" }}>{refundResult.message}</p>
            <button className="btn-primary w-full text-center" onClick={() => setRefundResult(null)}>確認した（閉じる）</button>
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
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>初期パスワード（アプリ内チャットで通知）</label>
              <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required placeholder="••••••••" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>メールアドレス（任意）</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="example@email.com" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>プラン</label>
              <select value={form.subscription_plan} onChange={e => setForm({ ...form, subscription_plan: e.target.value })}>
                <option value="buy_once">買い切り</option>
                <option value="monthly">月額</option>
              </select>
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
        const filteredCustomers = customers.filter(c => !c.is_admin).filter(c => {
          if (!search.trim()) return true;
          const q = search.trim().toLowerCase();
          return c.username?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.display_name?.toLowerCase().includes(q);
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
                    <p className="font-bold" style={{ color: "var(--primary)" }}>{c.display_name ?? c.username}</p>
                    <span className="text-xs" style={{ color: "var(--muted)" }}>@{c.username} #{c.id}</span>
                    {c.is_password_reset_required && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#fff8e1" }}>🔑 PW未変更</span>}
                    {!c.is_active && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#fce8e8" }}>⛔ 無効</span>}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                    プラン: {c.subscription_plan}　キャラ: {charName ?? "未設定"}
                    {c.email && `　✉ ${c.email}`}
                    　📝 記事: {c.published_count ?? 0}公開 / {c.article_count ?? 0}件
                    {(c.exercise_count ?? 0) > 0 && `　🧩 演習: ${c.exercise_count}件`}
                    　🔶 クレジット: {c.credit_balance ?? 0}
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
                      setEditPlan(c.subscription_plan ?? "buy_once");
                      setEditActive(c.is_active ?? true);
                      const mem = c.character_memory ?? {};
                      setEditNickname(mem.nickname ?? "");
                      setEditBirthday(mem.birthday ?? "");
                      setEditFavorites((mem.favorites ?? []).join("\n"));
                      setEditEpisodes((mem.episodes ?? []).join("\n"));
                      setEditToneNotes(mem.tone_notes ?? "");
                      setPreviewExamples(emptyPreviewExamples());
                      setPreviewStatus({ preview_ready: false, preview_submitted: false });
                      loadPreviewExamples(c.id);
                    }
                  }}>
                    {isEditing ? "閉じる" : "編集"}
                  </button>
                  <button className="btn-ghost text-xs py-1 px-3"
                    disabled={reissuingId === c.id}
                    onClick={() => handleReissuePassword(c)}>
                    {reissuingId === c.id ? "発行中…" : "🔑 PW再発行"}
                  </button>
                  <button className="btn-ghost text-xs py-1 px-3"
                    disabled={refundingId === c.id}
                    onClick={() => handleRefund(c)}>
                    {refundingId === c.id ? "処理中…" : "💴 返金"}
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
                  {/* アカウント基本情報 */}
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
                      <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>プラン</label>
                      <select value={editPlan} onChange={e => setEditPlan(e.target.value)}>
                        <option value="buy_once">買い切り</option>
                        <option value="monthly">月額</option>
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

                  {/* クレジット残高の手動調整 */}
                  <div className="rounded-xl p-3 flex flex-col gap-2" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                    <p className="text-xs font-bold" style={{ color: "var(--accent)" }}>
                      🔶 クレジット残高調整（現在: {c.credit_balance ?? 0}）
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                      <div>
                        <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>増減量（マイナスで減算）</label>
                        <input type="number" value={creditDelta} onChange={e => setCreditDelta(e.target.value)} placeholder="例: 100 / -50" />
                      </div>
                      <div className="sm:col-span-1">
                        <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>理由（任意）</label>
                        <input value={creditReason} onChange={e => setCreditReason(e.target.value)} placeholder="例: 問い合わせ補填" />
                      </div>
                      <button className="btn-ghost text-xs py-2 px-4 disabled:opacity-50" disabled={adjustingCreditId === c.id} onClick={() => handleAdjustCredits(c)}>
                        {adjustingCreditId === c.id ? "処理中…" : "調整する"}
                      </button>
                    </div>
                  </div>

                  {/* キャラクターが顧客のことを覚えている演出用メモ */}
                  <div className="rounded-xl p-3 flex flex-col gap-2" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                    <p className="text-xs font-bold" style={{ color: "var(--accent)" }}>
                      🎁 キャラクターが覚えているメモ（記事・ブログのパーソナライズ生成に活用）
                    </p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      ここに記録した内容は、記事・ブログの自動生成プロンプトに自動で織り込まれます
                      （誕生日を覚えている・好きなものに触れる・前回のやりとりを踏まえるなど、「特別感」の演出に使用）。
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="sm:col-span-2">
                        <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>呼び名（キャラクターが呼ぶ名前・記事生成に使用）</label>
                        <input value={editNickname} onChange={e => setEditNickname(e.target.value)} placeholder="例：ゆうきさん（未入力時はユーザー名を使用）" />
                        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                          ※ ユーザー名はログインID（メールアドレス等）のため、キャラクターからの呼びかけや記事・プロンプト生成にはここで設定した呼び名が使われます。
                        </p>
                      </div>
                      <div>
                        <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>誕生日（例: 08-15）</label>
                        <input value={editBirthday} onChange={e => setEditBirthday(e.target.value)} placeholder="MM-DD" />
                      </div>
                      <div>
                        <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>口調・態度の好み（例: もっとフランクに話してほしいらしい）</label>
                        <input value={editToneNotes} onChange={e => setEditToneNotes(e.target.value)} placeholder="話してほしい口調・接し方の傾向など" />
                      </div>
                      <div>
                        <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>好きなもの・興味（1行1項目）</label>
                        <textarea rows={3} value={editFavorites} onChange={e => setEditFavorites(e.target.value)} placeholder={"ラーメン\n映画鑑賞\nサッカー"} style={{ fontSize: "0.8rem" }} />
                      </div>
                      <div>
                        <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>これまでのやりとりのエピソード・メモ（1行1項目）</label>
                        <textarea rows={3} value={editEpisodes} onChange={e => setEditEpisodes(e.target.value)} placeholder={"前回、文化祭の話で盛り上がった\n最近、模試の結果を喜んで報告してくれた"} style={{ fontSize: "0.8rem" }} />
                      </div>
                    </div>
                  </div>

                  {/* キャラクター作成後プレビュー（会話例文） */}
                  <div className="rounded-xl p-3 flex flex-col gap-2" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-xs font-bold" style={{ color: "var(--accent)" }}>
                        🎬 プレビュー例文（キャラ作成後・初回ログイン時に表示）
                      </p>
                      <div className="flex items-center gap-2">
                        {previewStatus.preview_submitted && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#e8f4fd" }}>✅ 評価済み</span>}
                        {!previewStatus.preview_submitted && previewStatus.preview_ready && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#fff8e1" }}>⏳ 評価待ち</span>}
                        {!previewStatus.preview_ready && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#fce8e8" }}>未設定</span>}
                      </div>
                    </div>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      ①「例文生成用プロンプトをコピー」→ 外部のClaude等で会話例5パターンを生成 →
                      ② 結果を以下の5つに貼り付けて「保存」。保存すると顧客にプレビュー閲覧可能メールが送信され、
                      初回ログイン時にポップアップで表示されます。
                    </p>
                    <button type="button" className="btn-ghost text-xs py-1 px-3 self-start" onClick={() => handleCopyPreviewPrompt(c)}>
                      📋 例文生成用プロンプトをコピー
                    </button>
                    {previewLoading ? (
                      <p className="text-xs" style={{ color: "var(--muted)" }}>読み込み中…</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {previewExamples.map((ex, i) => (
                          <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg p-2" style={{ background: "var(--card-bg, #fff)", border: "1px solid var(--border)" }}>
                            <div>
                              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>例文{i + 1}：ユーザーのメッセージ</label>
                              <textarea rows={2} value={ex.user_message}
                                onChange={e => setPreviewExamples(prev => prev.map((p, j) => j === i ? { ...p, user_message: e.target.value } : p))}
                                style={{ fontSize: "0.8rem" }} placeholder="例: I have went to school yesterday." />
                            </div>
                            <div>
                              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>例文{i + 1}：キャラクターの返答</label>
                              <textarea rows={2} value={ex.character_response}
                                onChange={e => setPreviewExamples(prev => prev.map((p, j) => j === i ? { ...p, character_response: e.target.value } : p))}
                                style={{ fontSize: "0.8rem" }} placeholder="例: あ〜、それは『went』じゃなくて『gone』だね！" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <button className="btn-accent text-xs py-2 px-4 self-start disabled:opacity-50" disabled={previewSavingId === c.id || previewLoading} onClick={() => handleSavePreviewExamples(c.id)}>
                      {previewSavingId === c.id ? "保存中…" : "プレビュー例文を保存"}
                    </button>
                  </div>

                  <button className="btn-accent text-xs py-2 px-4 self-start disabled:opacity-50" disabled={savingId === c.id} onClick={() => saveCharacter(c.id)}>
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