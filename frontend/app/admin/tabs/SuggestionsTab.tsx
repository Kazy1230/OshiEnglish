"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { reportError } from "@/lib/reportError";
import type { Tab } from "../types";

const REACTION_CATEGORIES: { value: string; label: string }[] = [
  { value: "mistake", label: "ミスへの反応" },
  { value: "question", label: "質問への反応" },
  { value: "correct_answer", label: "正解への反応" },
  { value: "encouragement", label: "励まし" },
];

export function SuggestionsTab({ onNavigate }: { onNavigate?: (tab: Tab) => void } = {}) {
  const [characters, setCharacters] = useState<any[]>([]);
  const [characterId, setCharacterId] = useState<string>("");
  const [goodItems, setGoodItems] = useState<any[]>([]);
  const [badItems, setBadItems] = useState<any[]>([]);
  const [previewRequests, setPreviewRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [categoryChoice, setCategoryChoice] = useState<Record<number, string>>({});

  async function load() {
    setLoading(true);
    try {
      const charList = await api.adminGetCharacters();
      setCharacters(charList);
      const params: any = {};
      if (characterId) params.characterId = Number(characterId);
      const [good, bad, previewReqs] = await Promise.all([
        api.adminListMessageFeedback({ ...params, rating: "good" }),
        api.adminListMessageFeedback({ ...params, rating: "bad" }),
        api.adminListPreviewCorrectionRequests(),
      ]);
      setGoodItems(good);
      setBadItems(bad);
      setPreviewRequests(previewReqs);
    } catch (err: any) {
      reportError("admin:adminListMessageFeedback", err);
      toast(err.message || "読み込みに失敗しました", "error");
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [characterId]);

  async function handleApplyGood(item: any) {
    const category = categoryChoice[item.id];
    if (!category) { toast("追加先のカテゴリを選択してください", "error"); return; }
    setBusyId(item.id);
    try {
      await api.adminApplyMessageFeedback(item.id, category);
      toast("reaction_examplesに追加しました", "success");
      await load();
    } catch (err: any) {
      toast(err.message || "反映に失敗しました", "error");
    } finally { setBusyId(null); }
  }

  async function handleApplyBad(item: any) {
    setBusyId(item.id);
    try {
      await api.adminApplyMessageFeedback(item.id);
      toast("ng_expressionsに追加しました", "success");
      await load();
    } catch (err: any) {
      toast(err.message || "反映に失敗しました", "error");
    } finally { setBusyId(null); }
  }

  async function handleIgnore(item: any) {
    setBusyId(item.id);
    try {
      await api.adminIgnoreMessageFeedback(item.id);
      await load();
    } catch (err: any) {
      toast(err.message || "更新に失敗しました", "error");
    } finally { setBusyId(null); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-xl font-black" style={{ color: "var(--primary)" }}>👍👎 修正サジェスト一覧</h2>
        <div className="flex items-center gap-2">
          <select value={characterId} onChange={e => setCharacterId(e.target.value)}
            className="text-sm rounded-lg px-2 py-1.5" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}>
            <option value="">すべてのキャラクター</option>
            {characters.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button className="btn-ghost text-sm" onClick={load}>🔄 更新</button>
        </div>
      </div>

      {loading ? (
        <div className="card text-center py-12" style={{ color: "var(--muted)" }}>読み込み中...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-black mb-2" style={{ color: "var(--primary)" }}>👍 良い反応（{goodItems.length}）</h3>
            {goodItems.length === 0 ? (
              <div className="card text-center py-8" style={{ color: "var(--muted)" }}>対応待ちの👍評価はありません</div>
            ) : (
              <div className="flex flex-col gap-3">
                {goodItems.map((item: any) => (
                  <div key={item.id} className="card">
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                      <p className="font-bold text-sm" style={{ color: "var(--primary)" }}>
                        {item.character_name || "(キャラクター不明)"}
                        <span className="ml-2 text-xs font-normal" style={{ color: "var(--muted)" }}>
                          {item.customer_name}
                        </span>
                      </p>
                    </div>
                    <div className="text-sm p-3 rounded-lg mb-2 whitespace-pre-wrap break-words" style={{ background: "var(--bg)" }}>
                      {item.message_content}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <select value={categoryChoice[item.id] || ""} onChange={e => setCategoryChoice(prev => ({ ...prev, [item.id]: e.target.value }))}
                        className="text-xs rounded-lg px-2 py-1.5" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}>
                        <option value="">カテゴリを選択</option>
                        {REACTION_CATEGORIES.map(c => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                      <button className="btn-primary text-xs px-3 py-1.5" disabled={busyId === item.id} onClick={() => handleApplyGood(item)}>
                        reaction_examplesに追加
                      </button>
                      <button className="btn-ghost text-xs px-3 py-1.5" disabled={busyId === item.id} onClick={() => handleIgnore(item)}>
                        無視
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-black mb-2" style={{ color: "var(--primary)" }}>👎 改善してほしい反応（{badItems.length}）</h3>
            {badItems.length === 0 ? (
              <div className="card text-center py-8" style={{ color: "var(--muted)" }}>対応待ちの👎評価はありません</div>
            ) : (
              <div className="flex flex-col gap-3">
                {badItems.map((item: any) => (
                  <div key={item.id} className="card">
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                      <p className="font-bold text-sm" style={{ color: "var(--primary)" }}>
                        {item.character_name || "(キャラクター不明)"}
                        <span className="ml-2 text-xs font-normal" style={{ color: "var(--muted)" }}>
                          {item.customer_name}
                        </span>
                      </p>
                    </div>
                    <div className="text-sm p-3 rounded-lg mb-2 whitespace-pre-wrap break-words" style={{ background: "var(--bg)" }}>
                      {item.message_content}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button className="btn-primary text-xs px-3 py-1.5" disabled={busyId === item.id} onClick={() => handleApplyBad(item)}>
                        ng_expressionsに追加
                      </button>
                      <button className="btn-ghost text-xs px-3 py-1.5" disabled={busyId === item.id} onClick={() => handleIgnore(item)}>
                        無視
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && (
        <div className="mt-6">
          <h3 className="text-sm font-black mb-2" style={{ color: "var(--primary)" }}>
            🎬 プレビュー修正リクエスト一覧（{previewRequests.length}）
          </h3>
          {previewRequests.length === 0 ? (
            <div className="card text-center py-8" style={{ color: "var(--muted)" }}>修正リクエストはありません</div>
          ) : (
            <div className="flex flex-col gap-3">
              {previewRequests.map((item: any) => (
                <div key={item.id} className="card">
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                    <p className="font-bold text-sm" style={{ color: "var(--primary)" }}>
                      {item.character_name || "(キャラクター不明)"}
                      <span className="ml-2 text-xs font-normal" style={{ color: "var(--muted)" }}>
                        {item.customer_name}
                      </span>
                    </p>
                    <span className="text-xs" style={{ color: "var(--muted)" }}>
                      {item.created_at ? new Date(item.created_at).toLocaleString("ja-JP") : ""}
                    </span>
                  </div>
                  <div className="text-sm p-3 rounded-lg mb-2 whitespace-pre-wrap break-words" style={{ background: "var(--bg)" }}>
                    <p>ユーザー：「{item.user_message}」</p>
                    <p>キャラ：「{item.character_response}」</p>
                  </div>
                  <div className="text-sm p-3 rounded-lg mb-2 whitespace-pre-wrap break-words" style={{ background: "#fff8e1" }}>
                    🤔 修正内容: {item.feedback_text || "(コメントなし)"}
                  </div>
                  {onNavigate && (
                    <button className="btn-ghost text-xs px-3 py-1.5" onClick={() => onNavigate("characters")}>
                      キャラクター編集画面へ →
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
