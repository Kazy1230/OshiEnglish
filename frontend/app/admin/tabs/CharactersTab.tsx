"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { DEFAULT_REWARD_PROGRESS_TEMPLATE, DEFAULT_CHAT_FOOTER_NOTE, DEFAULT_CHAT_ERROR_MESSAGE } from "@/lib/theme";
import {
  buildLLMPrompt,
  buildImagePrompt,
  buildCharacterDesignPrompt,
  IMAGE_SIZE_PX,
  parseExerciseJsonInput,
} from "../lib/promptBuilders";

const FONT_STYLE_OPTIONS = [
  { value: "default",     label: "デフォルト（ゴシック）" },
  { value: "rounded",     label: "rounded　— やさしい・かわいい" },
  { value: "serif",       label: "serif　— 知的・格調高い" },
  { value: "handwriting", label: "handwriting　— 親しみ・手書き感" },
  { value: "monospace",   label: "monospace　— クール・ロボット" },
];

const COLOR_PRESETS = [
  { label: "クール赤黒（サディスト系）",   value: '{"primary":"#4a0e0e","accent":"#c0392b","bg":"#fdf6f6","text":"#2c1a1a","card":"#ffffff","border":"#f0d0d0","example_bg":"#fff0f0","tips_bg":"#fce8e8"}' },
  { label: "スカイブルー（やさしい系）",   value: '{"primary":"#0369a1","accent":"#f59e0b","bg":"#f0f9ff","text":"#0c1a2e","card":"#ffffff","border":"#bae6fd","example_bg":"#fef9c3","tips_bg":"#ecfdf5"}' },
  { label: "ダークパープル（クール系）",   value: '{"primary":"#2e1065","accent":"#7c3aed","bg":"#faf5ff","text":"#1e1b4b","card":"#ffffff","border":"#ddd6fe","example_bg":"#ede9fe","tips_bg":"#f5f3ff"}' },
  { label: "フォレストグリーン（知的系）", value: '{"primary":"#14532d","accent":"#16a34a","bg":"#f0fdf4","text":"#1a2e1a","card":"#ffffff","border":"#bbf7d0","example_bg":"#dcfce7","tips_bg":"#f0fdf4"}' },
  { label: "ウォームオレンジ（元気系）",   value: '{"primary":"#7c2d12","accent":"#ea580c","bg":"#fff7ed","text":"#2c1a0e","card":"#ffffff","border":"#fed7aa","example_bg":"#ffedd5","tips_bg":"#fef3c7"}' },
];

const emptyCharForm = { name: "", description: "", greetings: "", tone_profile: "", color_scheme: "", font_style: "default", reward_progress_template: "", chat_footer_note: "", chat_error_message: "", instagram_account: "", is_preset: false, linked_customer_id: "" };

export function CharactersTab() {
  const [characters, setCharacters] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingChar, setEditingChar] = useState<any | null>(null);
  const [form, setForm] = useState(emptyCharForm);
  const [previewColors, setPreviewColors] = useState<any>(null);
  const [toneProfileError, setToneProfileError] = useState(false);
  const [colorSchemeError, setColorSchemeError] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Record<number, boolean>>({});
  // LLMプロンプト生成時に対象生徒を指定するためのステート（キャラクターIDをキーとする）
  const [promptCustomerIdByChar, setPromptCustomerIdByChar] = useState<Record<number, string>>({});

  function toggleExpanded(id: number) {
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  }

  const reload = () => Promise.all([api.adminGetCharacters(), api.adminGetCustomers(), api.adminGetArticles()])
    .then(([chars, custs, arts]) => { setCharacters(chars); setCustomers(custs.filter((c: any) => !c.is_admin)); setArticles(arts); });
  useEffect(() => { reload().finally(() => setLoading(false)); }, []);

  const welcomeArticles = articles.filter((a: any) => a.is_welcome_template);

  async function handleWelcomeTemplateChange(charId: number, newArticleId: string) {
    const current = welcomeArticles.find((a: any) => a.template_character_id === charId);
    try {
      if (current && String(current.id) !== newArticleId) {
        await api.adminUpdateArticle(current.id, { clear_template_character_id: true });
      }
      if (newArticleId) {
        await api.adminUpdateArticle(Number(newArticleId), { template_character_id: charId });
      }
      await reload();
      toast("ウェルカムページの設定を更新しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "更新に失敗しました", "error");
    }
  }

  function handleColorSchemeChange(val: string) {
    setForm(f => ({ ...f, color_scheme: val }));
    if (!val.trim()) { setPreviewColors(null); setColorSchemeError(false); return; }
    try {
      setPreviewColors(parseExerciseJsonInput(val));
      setColorSchemeError(false);
    } catch {
      setPreviewColors(null);
      setColorSchemeError(true);
    }
  }

  function handleToneProfileChange(val: string) {
    setForm(f => ({ ...f, tone_profile: val }));
    if (!val.trim()) { setToneProfileError(false); return; }
    try { parseExerciseJsonInput(val); setToneProfileError(false); }
    catch { setToneProfileError(true); }
  }

  function startEdit(c: any) {
    setEditingChar(c);
    setForm({
      name: c.name ?? "",
      description: c.description ?? "",
      greetings: (c.greetings && c.greetings.length > 0) ? c.greetings.join("\n") : (c.greeting ?? ""),
      tone_profile: c.tone_profile ? JSON.stringify(c.tone_profile, null, 2) : "",
      color_scheme: c.color_scheme ? JSON.stringify(c.color_scheme) : "",
      font_style: c.font_style ?? "default",
      reward_progress_template: c.reward_progress_template ?? "",
      chat_footer_note: c.chat_footer_note ?? "",
      chat_error_message: c.chat_error_message ?? "",
      instagram_account: c.instagram_account ?? "",
      is_preset: !!c.is_preset,
      linked_customer_id: "",
    });
    try { setPreviewColors(c.color_scheme); } catch { setPreviewColors(null); }
    setToneProfileError(false);
    setColorSchemeError(false);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelForm() {
    setShowForm(false);
    setEditingChar(null);
    setForm(emptyCharForm);
    setPreviewColors(null);
    setToneProfileError(false);
    setColorSchemeError(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    let tone_profile = null;
    let color_scheme = null;
    try { tone_profile = form.tone_profile ? parseExerciseJsonInput(form.tone_profile) : null; }
    catch { toast("tone_profileはJSON形式で入力してください", "error"); return; }
    try { color_scheme = form.color_scheme ? parseExerciseJsonInput(form.color_scheme) : null; }
    catch { toast("color_schemeはJSON形式で入力してください", "error"); return; }
    const greetingsList = form.greetings.split("\n").map(s => s.trim()).filter(Boolean);
    const payload = {
      name: form.name,
      description: form.description,
      greeting: greetingsList[0] || null,       // 後方互換用に先頭を単一フィールドにも保存
      greetings: greetingsList.length > 0 ? greetingsList : null,
      tone_profile, color_scheme, font_style: form.font_style,
      reward_progress_template: form.reward_progress_template.trim() || null,
      chat_footer_note: form.chat_footer_note.trim() || null,
      chat_error_message: form.chat_error_message.trim() || null,
      instagram_account: form.instagram_account.trim() || null,
      is_preset: form.is_preset,
    };
    try {
      if (editingChar) {
        await api.adminUpdateCharacter(editingChar.id, payload);
        toast(`「${form.name}」を更新しました`, "success");
      } else {
        const created = await api.adminCreateCharacter(payload);
        if (!form.is_preset && form.linked_customer_id) {
          await api.adminUpdateCustomer(Number(form.linked_customer_id), { character_id: created.id });
        }
        toast(`「${form.name}」を追加しました`, "success");
      }
      await reload();
      cancelForm();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "error");
    }
  }

  async function deleteCharacter(id: number, name: string) {
    if (!confirm(`「${name}」を削除しますか？\n紐付き顧客のキャラクターが未設定になります。`)) return;
    try {
      await api.adminDeleteCharacter(id);
      await reload();
      toast(`「${name}」を削除しました`, "info");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "削除に失敗しました", "error");
    }
  }

  const [uploadingId, setUploadingId] = useState<number | null>(null);

  async function handleImageUpload(charId: number, file: File | null) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast("画像サイズは5MB以下にしてください", "error"); return; }
    setUploadingId(charId);
    try {
      await api.adminUploadCharacterImage(charId, file);
      await reload();
      toast("画像をアップロードしました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "アップロードに失敗しました", "error");
    } finally {
      setUploadingId(null);
    }
  }

  async function handleImageDelete(charId: number, name: string) {
    if (!confirm(`「${name}」の画像を削除しますか？`)) return;
    try {
      await api.adminDeleteCharacterImage(charId);
      await reload();
      toast("画像を削除しました", "info");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "削除に失敗しました", "error");
    }
  }

  if (loading) return <p style={{ color: "var(--muted)" }}>読み込み中…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-black" style={{ color: "var(--primary)" }}>🎭 キャラクター管理</h2>
        <button className="btn-accent" onClick={() => showForm ? cancelForm() : setShowForm(true)}>
          {showForm ? "キャンセル" : "+ 追加"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card mb-6 flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-bold" style={{ color: "var(--primary)" }}>
              {editingChar ? `✏️ 編集：${editingChar.name}` : "新規キャラクター追加"}
            </h3>
            <button
              type="button"
              className="text-xs px-2 py-1 rounded-lg border transition-all hover:shadow"
              style={{ borderColor: "var(--border)", color: "var(--accent)" }}
              onClick={() => {
                if (!form.name && !form.description) {
                  toast("先に「キャラクター名」か「説明」をざっくりでいいので入力すると、より具体的な提案プロンプトになります", "info");
                }
                navigator.clipboard.writeText(buildCharacterDesignPrompt(form.name, form.description));
                toast("キャラクター設計支援プロンプトをコピーしました（tone_profile・一言バリエーション・配色まで一括提案）", "success");
              }}>
              🧩 設計支援プロンプトをコピー
            </button>
          </div>
          <p className="text-xs -mt-2" style={{ color: "var(--muted)" }}>
            「キャラクター名」と「説明」をざっくり入力した状態でこのボタンを押すと、
            tone_profile・本棚の一言（8パターン）・配色・フォント・画像のヒントまで
            LLMにまとめて提案してもらえるプロンプトをコピーできます。著作権配慮の指示も含まれています。
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>キャラクター名 *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="例：鬼島先輩" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>フォントスタイル</label>
              <select value={form.font_style} onChange={e => setForm({ ...form, font_style: e.target.value })}>
                {FONT_STYLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>説明（顧客のバナーに表示）</label>
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="例：ため息をつきながら教えてくれる、少しサディスティックなお姉さん先輩。" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>公式Instagramアカウント（@なし）</label>
              <input value={form.instagram_account} onChange={e => setForm({ ...form, instagram_account: e.target.value })}
                placeholder="例：shirakawa_yukina._.a" disabled={!form.is_preset} />
              {!form.is_preset && (
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>「公式キャラクターにする」にチェックすると入力できます</p>
              )}
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm font-medium pb-1" style={{ color: "var(--text)" }}>
                <input type="checkbox" checked={form.is_preset}
                  onChange={e => setForm({ ...form, is_preset: e.target.checked, instagram_account: e.target.checked ? form.instagram_account : "" })} />
                公式キャラクターにする
              </label>
            </div>
          </div>
          {form.is_preset && (
            <p className="text-xs -mt-2" style={{ color: "var(--muted)" }}>
              公式キャラクターは、選択時にキャラ作成費無料・即日チャット開始・限定称号/壁紙・隠しセリフ多数（最大{15}件）などの特典が適用されます。
            </p>
          )}
          {!form.is_preset && !editingChar && (
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>紐づけアカウント（オリジナルキャラを依頼した顧客）</label>
              <select value={form.linked_customer_id} onChange={e => setForm({ ...form, linked_customer_id: e.target.value })}>
                <option value="">指定なし（後で紐づける）</option>
                {customers.map(cu => (
                  <option key={cu.id} value={cu.id}>
                    {cu.username}{cu.character_id ? "（既にキャラ割当済み）" : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                選択すると、作成したキャラクターをこの顧客に割り当て、完成案内メールを送信します。
              </p>
            </div>
          )}

          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>
              本棚に表示する「キャラクターからの一言」（1行に1パターン・複数登録推奨）
            </label>
            <textarea rows={5} value={form.greetings} onChange={e => setForm({ ...form, greetings: e.target.value })}
              placeholder={"例（1行ずつ別パターンとして登録される）：\nしょうがないなあ。今日もぼくと一緒に頑張ろう！\nさあ、また勉強の時間だよ。一緒に頑張ろうね。\nのび太くんも、こうやって続けていれば必ず力がつくよ！\n大丈夫、わからないところは何度でも聞いていいんだからね。"} />
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              顧客が本棚を開くたびに、ここに登録した中からランダムに1つ選んで
              「{form.name || "キャラクター名"}より：「（ここに表示）」」という形で表示します。
              語尾・言い回し・記号（！？…など）にバリエーションをつけて<strong>5〜10個程度</strong>登録すると、
              長期間同じ一言が連続表示されにくくなります。tone_profileと違い顧客にそのまま見えるメッセージです。
            </p>
          </div>

          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>
              チャット画面：ご褒美の進捗メッセージ（キャラごとに変更可・空欄なら共通デフォルト）
            </label>
            <input value={form.reward_progress_template}
              onChange={e => setForm({ ...form, reward_progress_template: e.target.value })}
              placeholder={DEFAULT_REWARD_PROGRESS_TEMPLATE} />
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              使えるプレースホルダー：<code>{"{character}"}</code>＝キャラ名、<code>{"{published}"}</code>＝公開記事数、
              <code>{"{remaining}"}</code>＝次のご褒美まであと何冊、<code>{"{target}"}</code>＝次のご褒美の目標冊数。
              例：「{DEFAULT_REWARD_PROGRESS_TEMPLATE}」
            </p>
          </div>

          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>
              チャット画面：入力欄の下に表示する注意書き（キャラごとに変更可・空欄なら共通デフォルト）
            </label>
            <input value={form.chat_footer_note}
              onChange={e => setForm({ ...form, chat_footer_note: e.target.value })}
              placeholder={DEFAULT_CHAT_FOOTER_NOTE} />
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              世界観に合わせて語尾や言い回しを変えると、より「{form.name || "キャラクター"}」らしさが出ます。
              例：「{DEFAULT_CHAT_FOOTER_NOTE}」
            </p>
          </div>

          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>
              チャット画面：メッセージ送信に失敗した時に表示するエラー文言（キャラごとに変更可・空欄なら共通デフォルト）
            </label>
            <input value={form.chat_error_message}
              onChange={e => setForm({ ...form, chat_error_message: e.target.value })}
              placeholder={DEFAULT_CHAT_ERROR_MESSAGE} />
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              キャラの口調に合わせると世界観が崩れません。
              例：「…送信に失敗しました。もう一度試してください」
            </p>
          </div>

          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>
              tone_profile（JSON）— LLMに渡すプロンプトの核心
            </label>
            <textarea rows={4} value={form.tone_profile} onChange={e => handleToneProfileChange(e.target.value)}
              placeholder={'{"speech_style":"...", "keywords":["..."], "personality":"..."}'} style={{ fontFamily: "monospace", fontSize: "0.8rem" }} />
            {toneProfileError && (
              <p className="text-xs mt-1" style={{ color: "#c0392b" }}>⚠️ JSON形式として読み取れません。カンマの付け忘れや引用符の閉じ忘れがないか確認してください</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>color_scheme（JSON）— ページの配色</label>
              {previewColors && (
                <div className="flex items-center gap-1">
                  {["primary","accent","bg","example_bg","tips_bg"].map(k => (
                    <div key={k} title={k} className="w-5 h-5 rounded-full border border-white shadow-sm"
                      style={{ background: previewColors[k] ?? "#eee" }} />
                  ))}
                  <span className="text-xs ml-1" style={{ color: "var(--muted)" }}>プレビュー</span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              {COLOR_PRESETS.map(p => (
                <button key={p.label} type="button"
                  className="text-xs px-2 py-1 rounded-full border transition-all hover:shadow"
                  style={{ borderColor: "var(--border)", color: "var(--text)" }}
                  onClick={() => handleColorSchemeChange(p.value)}>
                  {p.label}
                </button>
              ))}
            </div>
            <textarea rows={3} value={form.color_scheme} onChange={e => handleColorSchemeChange(e.target.value)}
              placeholder={'{"primary":"#4a0e0e","accent":"#c0392b","bg":"#fdf6f6",...}'} style={{ fontFamily: "monospace", fontSize: "0.8rem" }} />
            {colorSchemeError && (
              <p className="text-xs mt-1" style={{ color: "#c0392b" }}>⚠️ JSON形式として読み取れません。カンマの付け忘れや引用符の閉じ忘れがないか確認してください</p>
            )}
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              キー: primary / accent / bg / text / card / border / example_bg / tips_bg
            </p>
          </div>

          <div className="flex gap-3">
            <button type="submit" className="btn-primary flex-1 text-center">
              {editingChar ? "保存する" : "追加する"}
            </button>
            <button type="button" className="btn-ghost px-6" onClick={cancelForm}>キャンセル</button>
          </div>
        </form>
      )}

      {/* キャラクター一覧 */}
      <div className="flex flex-col gap-3">
        {characters.map(c => {
          const cs = c.color_scheme ?? {};
          const accentColor = cs.primary || cs.accent || "var(--border)";
          const tintBg = cs.example_bg || cs.bg;
          const expanded = !!expandedIds[c.id];
          return (
            <div key={c.id} className="card overflow-hidden !p-0" style={{ borderLeft: `4px solid ${accentColor}` }}>
              {/* ヘッダー（クリックで折り畳み開閉） */}
              <div role="button" tabIndex={0} onClick={() => toggleExpanded(c.id)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExpanded(c.id); } }}
                className="w-full text-left px-4 sm:px-5 py-3 flex items-start justify-between gap-3 transition-colors cursor-pointer"
                style={{ background: tintBg ? `${tintBg}` : "transparent" }}
                aria-expanded={expanded}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs flex-shrink-0 transition-transform" style={{ color: accentColor, display: "inline-block", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                    {c.color_scheme && (
                      <div className="flex gap-1">
                        {["primary","accent","bg","example_bg","tips_bg"].map((k: string) => (
                          <div key={k} title={k} className="w-4 h-4 rounded-full border border-gray-200"
                            style={{ background: cs[k] ?? "#eee" }} />
                        ))}
                      </div>
                    )}
                    <p className="font-bold" style={{ color: accentColor }}>{c.name}</p>
                    {c.is_preset && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-bold text-white" style={{ background: accentColor }}>
                        公式
                      </span>
                    )}
                    {c.font_style && c.font_style !== "default" && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--card)", color: "var(--muted)" }}>
                        {c.font_style}
                      </span>
                    )}
                  </div>
                  {c.description && <p className="text-sm mt-1 truncate" style={{ color: "var(--muted)" }}>{c.description}</p>}
                </div>
                <div className="flex gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <button className="btn-ghost text-xs py-1 px-3" onClick={() => startEdit(c)}>編集</button>
                  <button className="text-xs py-1 px-3 rounded-lg" style={{ color: "#c0392b" }}
                    onClick={() => deleteCharacter(c.id, c.name)}>削除</button>
                </div>
              </div>

              {expanded && (
                <div className="px-4 sm:px-5 pb-4">
                  <div className="mt-3">
                    <div className="flex flex-col gap-2 mb-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-xs font-medium" style={{ color: "var(--accent)" }}>tone_profile（LLMプロンプト用）</p>
                        <button
                          className="text-xs px-2 py-0.5 rounded-lg border transition-all hover:shadow flex-shrink-0"
                          style={{ borderColor: "var(--border)", color: "var(--accent)" }}
                          onClick={() => {
                            if (!c.tone_profile) {
                              toast("先に「編集」から tone_profile（口調・性格）を設定すると、より精度の高いプロンプトになります", "info");
                            }
                            const cu = promptCustomerIdByChar[c.id] ? customers.find(cs => String(cs.id) === promptCustomerIdByChar[c.id]) : undefined;
                            const topic = window.prompt("今回依頼された文法トピックを入力してください（空欄でもOK）", "") || undefined;
                            const prompt = buildLLMPrompt(c, topic, cu);
                            navigator.clipboard.writeText(prompt);
                            const lvMsg = cu?.intimacy ? `💗 Lv${cu.intimacy.level}「${cu.intimacy.stage_label}」を反映` : "汎用プロンプト";
                            toast(`LLMプロンプトをコピーしました — ${lvMsg}`, "success");
                          }}>
                          📋 LLMプロンプトをコピー
                          {promptCustomerIdByChar[c.id] && (() => {
                            const cu = customers.find(cs => String(cs.id) === promptCustomerIdByChar[c.id]);
                            return cu?.intimacy ? ` — 💗 Lv${cu.intimacy.level}「${cu.intimacy.stage_label}」` : "";
                          })()}
                        </button>
                      </div>
                      {/* 対象生徒（省略可）セレクター */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="text-xs flex-shrink-0" style={{ color: "var(--muted)" }}>👤 対象生徒（省略可）</label>
                        <select
                          className="text-xs flex-1"
                          style={{ minWidth: "9rem", maxWidth: "15rem" }}
                          value={promptCustomerIdByChar[c.id] ?? ""}
                          onChange={e => setPromptCustomerIdByChar(prev => ({ ...prev, [c.id]: e.target.value }))}>
                          <option value="">指定なし（汎用）</option>
                          {customers.map(cu => (
                            <option key={cu.id} value={cu.id}>
                              {cu.username}{cu.intimacy ? ` 💗Lv${cu.intimacy.level}「${cu.intimacy.stage_label}」` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {c.tone_profile ? (
                      <pre className="text-xs p-2 rounded overflow-x-auto" style={{ background: "var(--bg)", fontFamily: "monospace" }}>
                        {JSON.stringify(c.tone_profile, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-xs p-2 rounded" style={{ background: "var(--bg)", color: "var(--muted)" }}>
                        未設定です。「編集」ボタンから口調・性格（tone_profile）を入力すると、LLMプロンプトの精度が上がります。今のままでもコピーは可能です。
                      </p>
                    )}
                  </div>

                  {/* ウェルカムページ設定（公式キャラのみ） */}
                  {c.is_preset && (
                    <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                      <p className="text-xs font-medium mb-1" style={{ color: "var(--accent)" }}>🏠 ウェルカムページ</p>
                      <select
                        value={String(welcomeArticles.find((a: any) => a.template_character_id === c.id)?.id ?? "")}
                        onChange={e => handleWelcomeTemplateChange(c.id, e.target.value)}>
                        <option value="">未設定（汎用ウェルカムページを使用）</option>
                        {welcomeArticles.map((a: any) => (
                          <option key={a.id} value={a.id}>{a.title}</option>
                        ))}
                      </select>
                      <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                        この公式キャラを選んで申し込んだ顧客の本棚に最初に届くウェルカムページです。
                        記事管理画面で記事タイプ「🏠 ウェルカムページ」を作成し、対象キャラに「{c.name}」を指定すると、ここに選択肢として表示されます。
                        未設定のままだと、対象キャラ未指定（汎用）のウェルカムページが使われます。
                      </p>
                    </div>
                  )}

                  {/* 画像管理 */}
                  <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium" style={{ color: "var(--accent)" }}>プロフィール画像（記事ページに表示）</p>
                      <button
                        type="button"
                        className="text-xs px-2 py-0.5 rounded-lg border transition-all hover:shadow"
                        style={{ borderColor: "var(--border)", color: "var(--accent)" }}
                        onClick={() => {
                          navigator.clipboard.writeText(buildImagePrompt(c));
                          toast("画像生成プロンプトをコピーしました（著作権配慮・サイズ指定込み）", "success");
                        }}>
                        🎨 画像生成プロンプトをコピー
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      {c.image_url ? (
                        <img src={`${(process.env.NEXT_PUBLIC_API_URL || "http://localhost/api")}${c.image_url}`}
                          alt={`${c.name}のプロフィール画像`}
                          className="w-16 h-16 rounded-xl object-cover shadow-sm flex-shrink-0"
                          style={{ border: "1px solid var(--border)" }} />
                      ) : (
                        <div className="w-16 h-16 rounded-xl flex items-center justify-center text-xs flex-shrink-0"
                          style={{ background: "var(--bg)", color: "var(--muted)", border: "1px dashed var(--border)" }}>
                          未設定
                        </div>
                      )}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs px-3 py-1.5 rounded-lg border cursor-pointer text-center transition-all hover:shadow"
                          style={{ borderColor: "var(--border)", color: "var(--text)" }}>
                          {uploadingId === c.id ? "アップロード中…" : "📤 画像をアップロード"}
                          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                            disabled={uploadingId === c.id}
                            onChange={e => { handleImageUpload(c.id, e.target.files?.[0] ?? null); e.target.value = ""; }} />
                        </label>
                        {c.image_url && (
                          <button type="button" className="text-xs px-3 py-1 rounded-lg" style={{ color: "#c0392b" }}
                            onClick={() => handleImageDelete(c.id, c.name)}>画像を削除</button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs mt-1.5" style={{ color: "var(--muted)" }}>
                      PNG/JPG/WEBP・5MBまで。「🎨 画像生成プロンプトをコピー」で著作権に配慮した画像生成用プロンプト
                      （{IMAGE_SIZE_PX}x{IMAGE_SIZE_PX}px指定）を取得し、AI画像生成ツールで作成した画像をアップロードしてください。
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}