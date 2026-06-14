"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { buildRewardWallpaperPrompt, buildRewardIdeaPrompt, parseExerciseJsonInput } from "../lib/promptBuilders";

const CATEGORY_LABELS: Record<string, string> = { line: "隠しセリフ", title: "称号", wallpaper: "壁紙" };
const CATEGORY_ICONS: Record<string, string> = { line: "✏️", title: "🏅", wallpaper: "🖼️" };
const TRIGGER_LABELS: Record<string, string> = { intimacy: "親密度レベル", article_count: "記事依頼回数" };
const INTIMACY_LEVELS = [1, 2, 3, 4, 5];

const emptyForm = {
  category: "line",
  trigger_type: "intimacy",
  threshold: 1,
  text_content: "",
  icon: "",
  sort_order: 0,
  official_only: false,
};

export function RewardsTab({ initialCharacterId, onConsumeInitialCharacterId }: {
  initialCharacterId?: number | null;
  onConsumeInitialCharacterId?: () => void;
} = {}) {
  const [characters, setCharacters] = useState<any[]>([]);
  const [characterId, setCharacterId] = useState<number | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFor, setUploadingFor] = useState<number | null>(null);
  const [showIdeaPaste, setShowIdeaPaste] = useState(false);
  const [ideaJsonText, setIdeaJsonText] = useState("");
  const [applyingIdeas, setApplyingIdeas] = useState(false);

  const [intimacySettings, setIntimacySettings] = useState<any | null>(null);
  const [intimacySaving, setIntimacySaving] = useState(false);

  useEffect(() => {
    api.adminGetCharacters().then((cs: any[]) => {
      setCharacters(cs);
      if (cs.length > 0) setCharacterId(cs[0].id);
    }).finally(() => setLoading(false));
    api.adminGetIntimacySettings().then(setIntimacySettings).catch(() => {});
  }, []);

  // 受注リストの「報酬・成長ループを設定」ボタンから遷移してきた場合、対象キャラクターを選択する
  useEffect(() => {
    if (initialCharacterId == null) return;
    setCharacterId(initialCharacterId);
    onConsumeInitialCharacterId?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCharacterId]);

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

  const reload = () => {
    if (characterId == null) return Promise.resolve();
    return api.adminListRewardItems(characterId).then(setItems);
  };

  useEffect(() => {
    if (characterId != null) {
      setLoading(true);
      reload().finally(() => setLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId]);

  function cancelForm() { setShowForm(false); setEditingItem(null); setForm(emptyForm); }

  // ロードマップの「+ 追加」ショートカット：トリガー種別・到達条件を入力済みの状態で新規フォームを開く
  function openAddForm(trigger_type: string, threshold: number, category?: string) {
    setEditingItem(null);
    setForm({ ...emptyForm, trigger_type, threshold, ...(category ? { category } : {}) });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startEdit(item: any) {
    setEditingItem(item);
    setForm({
      category: item.category,
      trigger_type: item.trigger_type,
      threshold: item.threshold,
      text_content: item.text_content ?? "",
      icon: item.icon ?? "",
      sort_order: item.sort_order,
      official_only: !!item.official_only,
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (characterId == null) return;
    const payload: any = {
      category: form.category,
      trigger_type: form.trigger_type,
      threshold: Number(form.threshold) || 0,
      text_content: form.text_content.trim() ? form.text_content.trim() : null,
      icon: form.icon.trim() ? form.icon.trim() : null,
      sort_order: Number(form.sort_order) || 0,
      official_only: !!form.official_only,
    };
    try {
      if (editingItem) {
        await api.adminUpdateRewardItem(editingItem.id, payload);
        toast("報酬を更新しました", "success");
      } else {
        await api.adminCreateRewardItem({ ...payload, character_id: characterId });
        toast("報酬を追加しました", "success");
      }
      await reload();
      cancelForm();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "error");
    }
  }

  async function deleteItem(item: any) {
    if (!confirm(`この報酬（${CATEGORY_LABELS[item.category]}）を削除しますか？`)) return;
    try {
      await api.adminDeleteRewardItem(item.id);
      await reload();
      toast("削除しました", "info");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "削除に失敗しました", "error");
    }
  }

  function triggerImageUpload(itemId: number) {
    setUploadingFor(itemId);
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || uploadingFor == null) return;
    try {
      await api.adminUploadRewardImage(uploadingFor, file);
      await reload();
      toast("壁紙画像をアップロードしました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "アップロードに失敗しました", "error");
    } finally {
      setUploadingFor(null);
    }
  }

  if (loading && characters.length === 0) return <p style={{ color: "var(--muted)" }}>読み込み中…</p>;

  // intimacy / article_count ごとにグルーピング
  const intimacyItems = items.filter(i => i.trigger_type === "intimacy").sort((a, b) => a.threshold - b.threshold);
  const articleItems = items.filter(i => i.trigger_type === "article_count").sort((a, b) => a.threshold - b.threshold);
  const currentCharacter = characters.find(c => c.id === characterId);
  const lineItemCount = items.filter(i => i.category === "line").length;
  const lineItemLimit = currentCharacter?.is_preset ? 15 : 5;
  const unsetIntimacyLevels = INTIMACY_LEVELS.filter(level => !intimacyItems.some(i => i.threshold === level));
  const nextArticleThreshold = (articleItems[articleItems.length - 1]?.threshold ?? 0) + 1;

  function copyIdeaPrompt() {
    if (!currentCharacter) return;
    const prompt = buildRewardIdeaPrompt(currentCharacter, unsetIntimacyLevels, Math.max(0, lineItemLimit - lineItemCount), nextArticleThreshold);
    navigator.clipboard.writeText(prompt);
    setShowIdeaPaste(true);
    toast("LLMへの相談プロンプトをコピーしました。回答をもらったら下の欄に貼り付けてください", "success");
  }

  async function applyIdeaJson() {
    if (characterId == null) return;
    let parsed: any;
    try {
      parsed = parseExerciseJsonInput(ideaJsonText);
    } catch {
      toast("JSONを解析できませんでした。LLMの回答をそのまま貼り付けてください", "error");
      return;
    }
    if (!Array.isArray(parsed)) {
      toast("JSON配列の形式で貼り付けてください", "error");
      return;
    }
    setApplyingIdeas(true);
    try {
      for (const idea of parsed) {
        if (!idea || typeof idea !== "object") continue;
        await api.adminCreateRewardItem({
          character_id: characterId,
          category: idea.category,
          trigger_type: idea.trigger_type,
          threshold: Number(idea.threshold) || 0,
          text_content: idea.text_content ? String(idea.text_content).trim() : null,
          icon: idea.icon ? String(idea.icon).trim() : null,
          sort_order: 0,
          official_only: !!idea.official_only,
        });
      }
      await reload();
      setIdeaJsonText("");
      setShowIdeaPaste(false);
      toast("LLMのアイデアを報酬として登録しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "登録に失敗しました", "error");
    } finally {
      setApplyingIdeas(false);
    }
  }

  const formFields = (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>カテゴリ *</label>
        <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
          <option value="line">隠しセリフ</option>
          <option value="title">称号</option>
          <option value="wallpaper">壁紙</option>
        </select>
      </div>
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>解放トリガー *</label>
        <select value={form.trigger_type} onChange={e => setForm({ ...form, trigger_type: e.target.value })}>
          <option value="intimacy">親密度レベル到達</option>
          <option value="article_count">記事依頼回数到達</option>
        </select>
      </div>
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>
          {form.trigger_type === "intimacy" ? "到達レベル（1〜5） *" : "記事依頼回数（累計） *"}
        </label>
        <input type="number" min={1} max={form.trigger_type === "intimacy" ? 5 : undefined}
          value={form.threshold} onChange={e => setForm({ ...form, threshold: e.target.value })} required />
      </div>
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>表示順</label>
        <input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: e.target.value })} />
      </div>
      <div className="flex items-end sm:col-span-2">
        <label className="flex items-center gap-2 text-sm font-medium pb-1" style={{ color: "var(--text)" }}>
          <input type="checkbox" checked={form.official_only}
            onChange={e => setForm({ ...form, official_only: e.target.checked })} />
          公式キャラクター限定の報酬にする（公式キャラを選んだ顧客のみ解放可能）
        </label>
      </div>
      {form.category === "line" && (
        <div className="sm:col-span-2">
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>隠しセリフ本文 *</label>
          <textarea rows={3} value={form.text_content} onChange={e => setForm({ ...form, text_content: e.target.value })}
            placeholder="解放時にキャラクターから届く特別なセリフ" required />
          {!editingItem && (
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              現在 {lineItemCount} / {lineItemLimit} 件登録済み
              {currentCharacter?.is_preset ? "（公式キャラは最大15件まで登録できます）" : "（オリジナルキャラは最大5件まで登録できます）"}
            </p>
          )}
        </div>
      )}
      {form.category === "title" && (
        <>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>称号名 *</label>
            <input value={form.text_content} onChange={e => setForm({ ...form, text_content: e.target.value })}
              placeholder="例：相棒" required />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>アイコン（絵文字など）</label>
            <input value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} placeholder="例：🏅" />
          </div>
        </>
      )}
      {form.category === "wallpaper" && (
        <div className="sm:col-span-2">
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>壁紙名（任意・管理用）</label>
          <input value={form.text_content} onChange={e => setForm({ ...form, text_content: e.target.value })} placeholder="例：桜の小道" />
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>画像は保存後、一覧の「画像をアップロード」から登録してください。</p>
        </div>
      )}
    </div>
  );

  function renderTable(title: string, list: any[], thresholdLabel: (t: number) => string) {
    return (
      <div className="card mb-4">
        <h3 className="font-bold mb-2" style={{ color: "var(--primary)" }}>{title}</h3>
        {list.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>登録されている報酬はありません。</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="text-left py-2 font-medium" style={{ color: "var(--muted)" }}>条件</th>
                <th className="text-left py-2 font-medium" style={{ color: "var(--muted)" }}>カテゴリ</th>
                <th className="text-left py-2 font-medium" style={{ color: "var(--muted)" }}>内容</th>
                <th className="text-right py-2 font-medium" style={{ color: "var(--muted)" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map(item => (
                <tr key={item.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="py-2 font-medium" style={{ color: "var(--primary)" }}>{thresholdLabel(item.threshold)}</td>
                  <td className="py-2 text-xs">
                    {CATEGORY_LABELS[item.category]}
                    {item.official_only && (
                      <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full font-bold text-white" style={{ background: "var(--accent)" }}>
                        公式限定
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-xs" style={{ color: "var(--muted)" }}>
                    {item.category === "wallpaper" ? (
                      item.image_url ? (
                        <span className="inline-flex items-center gap-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost/api"}${item.image_url}`}
                            alt="" className="w-10 h-10 object-cover rounded" />
                          {item.text_content || "（画像登録済み）"}
                        </span>
                      ) : (item.text_content || "（画像未登録）")
                    ) : item.category === "title" ? (
                      `${item.icon ? item.icon + " " : ""}${item.text_content || "（未設定）"}`
                    ) : (
                      item.text_content ? (item.text_content.length > 30 ? item.text_content.slice(0, 30) + "…" : item.text_content) : "（未設定）"
                    )}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {item.category === "wallpaper" && (
                      <>
                        <button className="text-xs px-2 py-0.5 rounded mr-1" style={{ color: "var(--accent)", border: "1px solid var(--border)" }}
                          onClick={() => triggerImageUpload(item.id)}>画像を{item.image_url ? "変更" : "アップロード"}</button>
                        <button className="text-xs px-2 py-0.5 rounded mr-1" style={{ color: "var(--accent)", border: "1px solid var(--border)" }}
                          onClick={() => {
                            if (!currentCharacter) return;
                            navigator.clipboard.writeText(buildRewardWallpaperPrompt(currentCharacter));
                            toast("ご褒美の壁紙の画像生成プロンプトをコピーしました（著作権配慮・サイズ指定込み）", "success");
                          }}>🎨 プロンプトをコピー</button>
                      </>
                    )}
                    <button className="text-xs px-2 py-0.5 rounded mr-1" style={{ color: "var(--accent)", border: "1px solid var(--border)" }}
                      onClick={() => startEdit(item)}>編集</button>
                    <button className="text-xs px-2 py-0.5 rounded" style={{ color: "#c0392b" }}
                      onClick={() => deleteItem(item)}>削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  return (
    <div>
      <input ref={fileInputRef} type="file" accept=".png,.jpg,.jpeg,.webp" className="hidden" onChange={handleFileChange} />
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-black" style={{ color: "var(--primary)" }}>🎁 成長ループ・報酬管理</h2>
        <div className="flex gap-2">
          <button className="text-sm px-3 py-2 rounded-xl font-bold border-2" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
            onClick={copyIdeaPrompt} disabled={characterId == null}>
            🤖 LLMにアイデアを相談
          </button>
          <button className="btn-accent" onClick={() => showForm ? cancelForm() : setShowForm(true)} disabled={characterId == null}>
            {showForm ? "キャンセル" : "+ 報酬を追加"}
          </button>
        </div>
      </div>

      {showIdeaPaste && (
        <div className="card mb-4 flex flex-col gap-2">
          <h3 className="font-bold" style={{ color: "var(--primary)" }}>🤖 LLMの回答を貼り付けて反映</h3>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            コピーしたプロンプトをChatGPT / Claudeに貼り付けて出てきたJSONを、そのままここに貼り付けてください。
            「反映する」を押すと、未設定の報酬が自動で登録されます。
          </p>
          <textarea rows={6} className="text-xs w-full" style={{ fontFamily: "monospace" }}
            value={ideaJsonText} onChange={e => setIdeaJsonText(e.target.value)}
            placeholder='[{"trigger_type":"intimacy","threshold":1,"category":"line","text_content":"..."}]' />
          <div className="flex gap-2">
            <button className="btn-primary text-sm px-4 py-1.5" disabled={!ideaJsonText.trim() || applyingIdeas} onClick={applyIdeaJson}>
              {applyingIdeas ? "登録中…" : "📥 反映する"}
            </button>
            <button className="btn-ghost text-sm px-4 py-1.5" onClick={() => { setShowIdeaPaste(false); setIdeaJsonText(""); }}>閉じる</button>
          </div>
        </div>
      )}
      <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
        親密度レベル到達（Lv1→2: 隠しセリフ／Lv2→3: 称号／Lv3→4: 壁紙／Lv4→5: ミックス）と、
        記事依頼回数到達の2系統で報酬を自動解放します。解放前は顧客にカテゴリ名のみ表示され、内容は伏せられます。
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

      <div className="mb-4">
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>キャラクター</label>
        <select value={characterId ?? ""} onChange={e => setCharacterId(Number(e.target.value))}>
          {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* 設定状況の一覧：レベルごとに報酬が設定済みかひとめで分かる + 未設定箇所をすぐ追加できる */}
      {!loading && characterId != null && (
        <div className="card mb-4 flex flex-col gap-3">
          <h3 className="font-bold" style={{ color: "var(--primary)" }}>📊 設定状況</h3>

          {/* 隠しセリフの登録件数（上限あり） */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1" style={{ color: "var(--muted)" }}>
              <span>✏️ 隠しセリフ登録数</span>
              <span>{lineItemCount} / {lineItemLimit} 件</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg)" }}>
              <div className="h-full rounded-full" style={{
                width: `${Math.min(100, Math.round((lineItemCount / lineItemLimit) * 100))}%`,
                background: lineItemCount >= lineItemLimit ? "#c0392b" : "var(--accent)",
              }} />
            </div>
          </div>

          {/* 親密度レベル到達報酬：Lv1→2〜Lv4→5の各段階で設定済みか確認できる */}
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: "var(--muted)" }}>親密度レベル到達報酬</p>
            <div className="flex flex-col gap-1.5">
              {INTIMACY_LEVELS.map(level => {
                const levelItems = intimacyItems.filter(i => i.threshold === level);
                return (
                  <div key={level} className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="font-bold flex-shrink-0" style={{ color: "var(--primary)", minWidth: "5.5rem" }}>
                      Lv.{level - 1} → Lv.{level}
                    </span>
                    {levelItems.length === 0 ? (
                      <>
                        <span style={{ color: "var(--muted)", opacity: 0.6 }}>未設定</span>
                        <button className="px-2 py-0.5 rounded border" style={{ borderColor: "var(--border)", color: "var(--accent)" }}
                          onClick={() => openAddForm("intimacy", level)}>+ 追加</button>
                      </>
                    ) : (
                      <>
                        {levelItems.map(item => (
                          <span key={item.id} className="px-2 py-0.5 rounded-full" style={{ background: "var(--bg)", color: "var(--text)" }}>
                            {CATEGORY_ICONS[item.category]} {CATEGORY_LABELS[item.category]}
                            {item.official_only && " 🔒"}
                          </span>
                        ))}
                        <button className="px-2 py-0.5 rounded border" style={{ borderColor: "var(--border)", color: "var(--accent)" }}
                          onClick={() => openAddForm("intimacy", level)}>+ 追加</button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>🔒 = 公式キャラクター限定の報酬</p>
          </div>

          {/* 記事依頼回数到達報酬：登録済みの回数一覧 */}
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: "var(--muted)" }}>記事依頼回数到達報酬</p>
            {articleItems.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--muted)", opacity: 0.6 }}>登録されている報酬はありません</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 text-xs">
                {articleItems.map(item => (
                  <span key={item.id} className="px-2 py-0.5 rounded-full" style={{ background: "var(--bg)", color: "var(--text)" }}>
                    累計{item.threshold}件 → {CATEGORY_ICONS[item.category]} {CATEGORY_LABELS[item.category]}
                    {item.official_only && " 🔒"}
                  </span>
                ))}
              </div>
            )}
            <button className="text-xs px-2 py-0.5 rounded border mt-2" style={{ borderColor: "var(--border)", color: "var(--accent)" }}
              onClick={() => openAddForm("article_count", (articleItems[articleItems.length - 1]?.threshold ?? 0) + 1)}>
              + 新しい回数で追加
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card mb-6 flex flex-col gap-3">
          <h3 className="font-bold" style={{ color: "var(--primary)" }}>
            {editingItem ? "✏️ 報酬を編集" : "新しい報酬を追加"}
          </h3>
          {formFields}
          <div className="flex gap-3">
            <button type="submit" className="btn-primary flex-1 text-center">{editingItem ? "保存する" : "追加する"}</button>
            <button type="button" className="btn-ghost px-6" onClick={cancelForm}>キャンセル</button>
          </div>
        </form>
      )}

      {loading ? <p style={{ color: "var(--muted)" }}>読み込み中…</p> : (
        <>
          {renderTable("親密度レベル到達報酬", intimacyItems, t => `Lv.${t - 1} → Lv.${t}`)}
          {renderTable("記事依頼回数到達報酬", articleItems, t => `累計 ${t} 件到達`)}
        </>
      )}
    </div>
  );
}
