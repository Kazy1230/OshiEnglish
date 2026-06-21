"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { PromptPreviewModal } from "@/components/PromptPreviewModal";
import {
  buildLLMPrompt,
  buildCharacterGenerationPrompt,
  parseCharacterGenerationOutput,
  parseExerciseJsonInput,
} from "../lib/promptBuilders";

const FONT_STYLE_OPTIONS = [
  { value: "default",     label: "デフォルト（ゴシック）" },
  { value: "rounded",     label: "rounded　— やさしい・かわいい" },
  { value: "serif",       label: "serif　— 知的・格調高い" },
  { value: "handwriting", label: "handwriting　— 親しみ・手書き感" },
  { value: "monospace",   label: "monospace　— クール・ロボット" },
];

const emptyCharForm = { name: "", description: "", tone_profile: "", color_scheme: "", font_style: "default", creator_id: "", linked_customer_id: "", gen_personality: "", gen_reference: "" };

const GENERATION_BLOCKS: { key: string; label: string }[] = [
  { key: "DESCRIPTION", label: "説明文" },
  { key: "TONE_PROFILE", label: "TONE_PROFILE" },
  { key: "COLOR_SCHEME", label: "配色" },
  { key: "FONT_STYLE", label: "フォント" },
];
const FONT_STYLE_VALUES = new Set(["default", "rounded", "serif", "handwriting", "monospace"]);

export function CharactersTab() {
  const [characters, setCharacters] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingChar, setEditingChar] = useState<any | null>(null);
  const [form, setForm] = useState(emptyCharForm);
  const [previewColors, setPreviewColors] = useState<any>(null);
  const [toneProfileError, setToneProfileError] = useState(false);
  const [colorSchemeError, setColorSchemeError] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Record<number, boolean>>({});
  // 新規キャラクター設定のLLM自動生成用（LLMに貼り付けるプロンプトをコピーし、出力をここに貼り付ける方式）
  const [showGenPanel, setShowGenPanel] = useState(false);
  const [genPasteText, setGenPasteText] = useState("");
  // LLMプロンプト生成時に対象生徒を指定するためのステート（キャラクターIDをキーとする）
  const [promptCustomerIdByChar, setPromptCustomerIdByChar] = useState<Record<number, string>>({});
  // プロンプトプレビュー・編集モーダル
  const [promptPreview, setPromptPreview] = useState<{ title: string; text: string } | null>(null);

  function toggleExpanded(id: number) {
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  }

  const reload = () => Promise.all([api.adminGetCharacters(), api.adminGetCustomers()])
    .then(([chars, custs]) => { setCharacters(chars); setCustomers(custs.filter((c: any) => c.role !== "admin")); });
  useEffect(() => { reload().finally(() => setLoading(false)); }, []);

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

  /** LLM生成結果（パース済み）を各入力欄に反映する。自動保存はしない。 */
  function applyGeneratedResult(result: any) {
    if (result.description) setForm(f => ({ ...f, description: result.description }));
    if (result.tone_profile) {
      const tp = result.article_sample
        ? { ...result.tone_profile, article_sample: result.article_sample }
        : result.tone_profile;
      handleToneProfileChange(JSON.stringify(tp, null, 2));
    } else if (result.article_sample) {
      setForm(f => {
        let tp: any = {};
        try { tp = JSON.parse(f.tone_profile || "{}"); } catch { /* ignore */ }
        return { ...f, tone_profile: JSON.stringify({ ...tp, article_sample: result.article_sample }, null, 2) };
      });
    }
    if (result.color_scheme) {
      handleColorSchemeChange(JSON.stringify(result.color_scheme));
    }
    if (result.font_style && FONT_STYLE_VALUES.has(result.font_style)) {
      setForm(f => ({ ...f, font_style: result.font_style }));
    }
  }

  /** 指定したブロックのみ再生成するプロンプトをコピーする（他の欄の内容は一貫性参考としてプロンプトに含める）。 */
  function copyGenPrompt(blocks: string[]) {
    const existing: any = {};
    if (!blocks.includes("DESCRIPTION") && form.description) existing.description = form.description;
    if (!blocks.includes("TONE_PROFILE") && form.tone_profile) {
      try { existing.tone_profile = parseExerciseJsonInput(form.tone_profile); } catch { /* ignore */ }
    }
    if (!blocks.includes("COLOR_SCHEME") && form.color_scheme) {
      try { existing.color_scheme = parseExerciseJsonInput(form.color_scheme); } catch { /* ignore */ }
    }
    if (!blocks.includes("FONT_STYLE") && form.font_style) existing.font_style = form.font_style;

    const prompt = buildCharacterGenerationPrompt({
      character_name: form.name,
      character_description: form.description,
      user_requested_personality: form.gen_personality,
      reference_character: form.gen_reference,
      blocks,
      existing,
    });
    const blockLabels = blocks.map(b => GENERATION_BLOCKS.find(g => g.key === b)?.label ?? b).join("・");
    setPromptPreview({ title: `キャラクター生成プロンプト（${blockLabels}）`, text: prompt });
  }

  /** 「反映」ボタン：貼り付けられたLLMの出力をパースして各入力欄に反映する */
  function applyGenPasteText() {
    if (!genPasteText.trim()) { toast("LLMの出力を貼り付けてください", "error"); return; }
    const result = parseCharacterGenerationOutput(genPasteText);
    if (Object.keys(result).length === 0) {
      toast("出力を解析できませんでした。===DESCRIPTION===などの区切りを含む形式で貼り付けてください", "error");
      return;
    }
    applyGeneratedResult(result);
    setGenPasteText("");
    toast("入力欄に反映しました（内容を確認・編集してから保存してください）", "success");
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
      tone_profile: c.tone_profile ? JSON.stringify(c.tone_profile, null, 2) : "",
      color_scheme: c.color_scheme ? JSON.stringify(c.color_scheme) : "",
      font_style: c.font_style ?? "default",
      creator_id: c.creator_id != null ? String(c.creator_id) : "",
      linked_customer_id: "",
      gen_personality: "",
      gen_reference: "",
    });
    try { setPreviewColors(c.color_scheme); } catch { setPreviewColors(null); }
    setToneProfileError(false);
    setColorSchemeError(false);
    setShowGenPanel(false);
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
    setShowGenPanel(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    let tone_profile = null;
    let color_scheme = null;
    try { tone_profile = form.tone_profile ? parseExerciseJsonInput(form.tone_profile) : null; }
    catch { toast("tone_profileはJSON形式で入力してください", "error"); return; }
    try { color_scheme = form.color_scheme ? parseExerciseJsonInput(form.color_scheme) : null; }
    catch { toast("color_schemeはJSON形式で入力してください", "error"); return; }
    const payload = {
      name: form.name,
      description: form.description,
      tone_profile, color_scheme, font_style: form.font_style,
      creator_id: form.creator_id ? Number(form.creator_id) : null,
    };
    try {
      if (editingChar) {
        await api.adminUpdateCharacter(editingChar.id, payload);
        toast(`「${form.name}」を更新しました`, "success");
      } else {
        const created = await api.adminCreateCharacter(payload);
        if (!form.creator_id && form.linked_customer_id) {
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

  /** 個別ブロックだけ再生成するプロンプトをコピーするための小さなボタン（生成パネルを開いている時のみ表示） */
  function RegenButton({ block, label }: { block: string; label: string }) {
    if (!showGenPanel) return null;
    return (
      <button type="button"
        className="text-xs px-1.5 py-0.5 rounded-lg border transition-all hover:shadow"
        style={{ borderColor: "var(--border)", color: "var(--accent)" }}
        onClick={() => copyGenPrompt([block])}>
        {`↻ ${label}を再生成するプロンプトをコピー`}
      </button>
    );
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
          </div>

          <div className="rounded-xl border-2 p-3 flex flex-col gap-2" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs font-bold" style={{ color: "var(--primary)" }}>
                🤖 LLMで生成・反映
              </p>
              <div className="flex gap-2 flex-wrap">
                <button type="button"
                  className="text-xs px-2 py-1 rounded-lg font-bold transition-all hover:opacity-80"
                  style={{ background: "var(--accent)", color: "white" }}
                  onClick={() => copyGenPrompt(GENERATION_BLOCKS.map(b => b.key))}>
                  📋 生成プロンプトをコピー
                </button>
                <button type="button"
                  className="text-xs px-2 py-1 rounded-lg border transition-all hover:shadow"
                  style={{ borderColor: "var(--border)", color: "var(--accent)" }}
                  onClick={() => setShowGenPanel(v => !v)}>
                  {showGenPanel ? "出力反映欄を閉じる" : "出力を反映する"}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>希望のキャラクター設定（任意）</label>
                <textarea rows={2} value={form.gen_personality}
                  onChange={e => setForm({ ...form, gen_personality: e.target.value })}
                  placeholder="例：ツンデレな先輩、実は優しい、語尾に「〜じゃん」を使う…" />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>参考キャラクター（任意）</label>
                <input value={form.gen_reference}
                  onChange={e => setForm({ ...form, gen_reference: e.target.value })}
                  placeholder="例：ハガレンのロイ・マスタング" />
              </div>
            </div>
            {showGenPanel && (
              <>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  上の「📋 生成プロンプトをコピー」でプロンプトをコピーし、LLM（claude-sonnet-4-6）に貼り付けて実行してください。
                  その出力を下の欄に貼り付けて「反映」を押すと各入力欄に反映されます
                  （保存はされません。内容を確認・編集してから「保存」を押してください）。
                  個別の項目だけ再生成したい場合は、各入力欄の下にある「↻ 再生成するプロンプトをコピー」ボタンを使ってください。
                </p>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>
                    LLMの出力をここに貼り付け
                  </label>
                  <textarea rows={6} value={genPasteText} onChange={e => setGenPasteText(e.target.value)}
                    placeholder="===DESCRIPTION=== から始まるLLMの出力をそのまま貼り付けてください" />
                </div>
                <button type="button"
                  className="text-xs font-bold py-2 px-3 rounded-xl transition-all hover:opacity-80 self-start"
                  style={{ background: "var(--accent)", color: "white" }}
                  onClick={applyGenPasteText}>
                  ⬇️ 反映する
                </button>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>キャラクター名 *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="例：鬼島先輩" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>フォントスタイル</label>
                <RegenButton block="FONT_STYLE" label="フォント" />
              </div>
              <select value={form.font_style} onChange={e => setForm({ ...form, font_style: e.target.value })}>
                {FONT_STYLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>説明（クリエイターページに表示）</label>
              <RegenButton block="DESCRIPTION" label="説明文" />
            </div>
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="例：ため息をつきながら教えてくれる、少しサディスティックなお姉さん先輩。" />
          </div>

          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>クリエイタープロフィールID（creator_profiles.id）</label>
            <input type="number" min="1" value={form.creator_id}
              onChange={e => setForm({ ...form, creator_id: e.target.value })}
              placeholder="例：1（未入力なら未割り当て）" />
          </div>
          {!form.creator_id && !editingChar && (
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>紐づけアカウント（オリジナルキャラを依頼した顧客） *</label>
              <select value={form.linked_customer_id} onChange={e => setForm({ ...form, linked_customer_id: e.target.value })} required>
                <option value="">選択してください</option>
                {customers.map(cu => (
                  <option key={cu.id} value={cu.id}>
                    {cu.username}{cu.character_id ? "（既にキャラ割当済み）" : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                作成したキャラクターをこの顧客に割り当てます。
              </p>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>
                tone_profile（JSON）— LLMに渡すプロンプトの核心
              </label>
              <RegenButton block="TONE_PROFILE" label="TONE_PROFILE" />
            </div>
            <textarea rows={16} value={form.tone_profile} onChange={e => handleToneProfileChange(e.target.value)}
              placeholder={'{\n  "keywords": ["", "", "", "", ""],\n  "personality": "",\n  "speech_style": "",\n  "ng_expressions": ["", "", ""],\n  "reaction_examples": {\n    "mistake": ["", "", "", ""],\n    "question": ["", "", "", ""],\n    "correct_answer": ["", "", "", ""],\n    "encouragement": ["", "", "", ""]\n  },\n  "conversation_rules": ["", "", "", "", "", "", "", ""],\n  "intimacy_variations": { "low": "", "high": "" },\n  "article_style": ""\n}'}
              style={{ fontFamily: "monospace", fontSize: "0.8rem" }} />
            {toneProfileError && (
              <p className="text-xs mt-1" style={{ color: "#c0392b" }}>⚠️ JSON形式として読み取れません。カンマの付け忘れや引用符の閉じ忘れがないか確認してください</p>
            )}
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              ng_expressions（NG表現）・reaction_examples（状況別の返答例）・conversation_rules（会話の基本ルール）・
              intimacy_variations（親密度low/highでの口調変化）・article_style（記事執筆時のトーン指示）などを
              JSON構造で記述します。生成AIに作ってもらったJSONをそのまま貼り付けることもできます。
            </p>
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
              <RegenButton block="COLOR_SCHEME" label="配色" />
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
                    {c.creator_id != null && (
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
                            setPromptPreview({ title: `「${c.name}」LLMプロンプト`, text: prompt });
                          }}>
                          📋 LLMプロンプトをコピー
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
                            <option key={cu.id} value={cu.id}>{cu.username}</option>
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
                </div>
              )}
            </div>
          );
        })}
      </div>
      {promptPreview && (
        <PromptPreviewModal
          title={promptPreview.title}
          promptText={promptPreview.text}
          onClose={() => setPromptPreview(null)}
        />
      )}
    </div>
  );
}
