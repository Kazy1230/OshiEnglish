"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { Format, FORMATS } from "@/lib/contentFormats";

type Idea = { id: number; text: string; updated_at: string | null };

function previewText(text: string): string {
  return text.length > 30 ? text.slice(0, 30) + "…" : text;
}

export function IdeaPoolPanel({ onSendToStudio }: { onSendToStudio: (format: Format, paramVal: number, ideaText: string) => void }) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [fetching, setFetching] = useState(true);

  // テキスト入力モーダル（作成・編集共通）
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editorText, setEditorText] = useState("");
  const [saving, setSaving] = useState(false);

  // 「スタジオで作る」フォーマット選択モーダル
  const [pickerIdea, setPickerIdea] = useState<Idea | null>(null);
  const [pickerFormat, setPickerFormat] = useState<Format | null>(null);
  const [pickerParamVal, setPickerParamVal] = useState(0);

  function reload() {
    return api.listIdeaPool().then(setIdeas).catch(() => {});
  }

  useEffect(() => {
    reload().finally(() => setFetching(false));
  }, []);

  function openCreate() {
    setEditingId(null);
    setEditorText("");
    setEditorOpen(true);
  }

  function openEdit(idea: Idea) {
    setEditingId(idea.id);
    setEditorText(idea.text);
    setEditorOpen(true);
  }

  async function handleEditorComplete() {
    if (!editorText.trim()) { toast("内容を入力してください", "error"); return; }
    setSaving(true);
    try {
      if (editingId) {
        await api.updateIdeaPool(editingId, editorText.trim());
      } else {
        await api.createIdeaPool(editorText.trim());
      }
      setEditorOpen(false);
      await reload();
      toast("保存しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("このアイデアを削除しますか？")) return;
    try {
      await api.deleteIdeaPool(id);
      setIdeas(prev => prev.filter(i => i.id !== id));
      toast("削除しました", "success");
    } catch { toast("削除に失敗しました", "error"); }
  }

  function openPicker(idea: Idea) {
    setPickerIdea(idea);
    setPickerFormat(null);
    setPickerParamVal(0);
  }

  function selectPickerFormat(f: Format) {
    setPickerFormat(f);
    setPickerParamVal(f.defaultVal);
  }

  function handlePickerNext() {
    if (!pickerIdea || !pickerFormat) return;
    onSendToStudio(pickerFormat, pickerParamVal, pickerIdea.text);
    setPickerIdea(null);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>アイデアプール</h1>
          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
            思いついたネタをメモして貯めておき、いつでもコンテンツ作成に使えます。
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary flex-shrink-0" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
          作成
        </button>
      </div>

      {fetching ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 64, borderRadius: 14, background: "var(--card)", border: "1px solid var(--border)", animation: "pulse 1.5s infinite" }} />
          ))}
        </div>
      ) : ideas.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 0", color: "var(--muted)" }}>
          <p style={{ fontSize: 40, marginBottom: 12 }}>💡</p>
          <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>まだアイデアがありません</p>
          <p style={{ fontSize: 13 }}>右上の「+作成」から思いついたネタをメモしましょう。</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {ideas.map(idea => (
            <div key={idea.id} className="card" style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px" }}>
              <p style={{ flex: 1, minWidth: 0, fontSize: 14, color: "var(--text)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {previewText(idea.text)}
              </p>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button onClick={() => openEdit(idea)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--muted)" }}>編集</button>
                <button onClick={() => openPicker(idea)} className="text-xs px-3 py-1.5 rounded-lg font-bold" style={{ background: "var(--primary)", color: "white" }}>スタジオで作る</button>
                <button onClick={() => handleDelete(idea.id)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "#fee2e2", color: "#dc2626" }}>削除</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* テキスト入力モーダル（作成・編集） */}
      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="card max-w-lg w-full flex flex-col gap-4">
            <h2 className="font-bold" style={{ color: "var(--primary)" }}>{editingId ? "アイデアを編集" : "新しいアイデア"}</h2>
            <textarea
              autoFocus
              className="w-full text-sm p-3 rounded-lg"
              style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)", minHeight: 140, resize: "vertical" }}
              placeholder="思いついたネタ・切り口・キーワードなどを自由に書いてください"
              value={editorText}
              onChange={e => setEditorText(e.target.value)}
            />
            <div className="flex gap-3">
              <button onClick={() => setEditorOpen(false)} className="btn-secondary flex-1">キャンセル</button>
              <button onClick={handleEditorComplete} disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
                {saving ? "保存中…" : "完了"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* フォーマット選択モーダル（スタジオで作る） */}
      {pickerIdea && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="card max-w-lg w-full flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-bold" style={{ color: "var(--primary)" }}>どのフォーマットで作りますか？</h2>
              <button onClick={() => setPickerIdea(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 20, lineHeight: 1 }}>×</button>
            </div>
            <p className="text-xs" style={{ color: "var(--muted)" }}>{previewText(pickerIdea.text)}</p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {FORMATS.map(f => (
                <button key={f.key} onClick={() => selectPickerFormat(f)} className="card p-3 flex flex-col gap-1 text-left"
                  style={{ background: pickerFormat?.key === f.key ? "var(--primary)" : "var(--card)", border: pickerFormat?.key === f.key ? "1px solid var(--primary)" : "1px solid var(--border)" }}>
                  <span className="text-xl">{f.icon}</span>
                  <span className="text-xs font-bold" style={{ color: pickerFormat?.key === f.key ? "white" : "var(--text)" }}>{f.label}</span>
                  <span className="text-[11px] leading-tight" style={{ color: pickerFormat?.key === f.key ? "rgba(255,255,255,0.85)" : "var(--muted)" }}>{f.hint}</span>
                </button>
              ))}
            </div>

            {pickerFormat && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                <span className="text-sm font-bold" style={{ color: "var(--text)" }}>{pickerFormat.mediaType === "video" ? "尺" : "文字数"}</span>
                <input
                  type="number"
                  value={pickerParamVal}
                  min={pickerFormat.minVal}
                  max={pickerFormat.maxVal}
                  onChange={e => setPickerParamVal(Number(e.target.value))}
                  className="w-24 text-sm px-2 py-1 rounded-lg text-center"
                  style={{ background: "var(--card)", border: "1.5px solid var(--border)", color: "var(--text)" }}
                />
                <span className="text-sm" style={{ color: "var(--muted)" }}>{pickerFormat.unit}</span>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setPickerIdea(null)} className="btn-secondary flex-1">キャンセル</button>
              <button onClick={handlePickerNext} disabled={!pickerFormat} className="btn-primary flex-1 disabled:opacity-50">次へ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
