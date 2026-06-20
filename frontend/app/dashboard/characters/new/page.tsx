"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";

type ToneForm = {
  first_person: string;
  speech_style: string;
  personality: string;
  catchphrase: string;
  ng_expressions: string;
};

const EMPTY_TONE: ToneForm = { first_person: "", speech_style: "", personality: "", catchphrase: "", ng_expressions: "" };

export default function NewCharacterPage() {
  const { loading } = useRoleGuard(["instructor", "admin"]);
  const router = useRouter();
  const [concept, setConcept] = useState("");
  const [generating, setGenerating] = useState(false);
  const [nameSuggestions, setNameSuggestions] = useState<string[]>([]);
  const [sampleLines, setSampleLines] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tone, setTone] = useState<ToneForm>(EMPTY_TONE);
  const [saving, setSaving] = useState(false);

  if (loading) return <Skeleton />;

  async function handleGenerate() {
    if (!concept.trim()) { toast("キャラクターのイメージを入力してください", "error"); return; }
    setGenerating(true);
    try {
      const result = await api.generateCharacterConcept(concept);
      setNameSuggestions(result.name_suggestions || []);
      setSampleLines(result.sample_lines || []);
      setName((result.name_suggestions || [])[0] || "");
      setDescription(concept);
      setTone({
        first_person: result.first_person || "",
        speech_style: [result.tone, result.sentence_ending].filter(Boolean).join("。語尾の特徴: "),
        personality: result.personality || "",
        catchphrase: result.catchphrase || "",
        ng_expressions: (result.ng_words || []).join("、"),
      });
      toast("AIがキャラクター設定を提案しました。内容を確認・編集してください", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "生成に失敗しました。もう一度試してください", "error");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) { toast("名前を入力してください", "error"); return; }
    setSaving(true);
    try {
      const tone_profile = {
        first_person: tone.first_person || undefined,
        speech_style: tone.speech_style || undefined,
        personality: tone.personality || undefined,
        catchphrase: tone.catchphrase || undefined,
        ng_expressions: tone.ng_expressions ? tone.ng_expressions.split(/[、,]/).map(s => s.trim()).filter(Boolean) : undefined,
      };
      const char = await api.createCharacterFull({ name, description: description || undefined, tone_profile });
      toast("キャラクターを作成しました", "success");
      router.push(`/dashboard/characters/${char.id}`);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="px-4 sm:px-6 py-4" style={{ background: "var(--primary)" }}>
        <h1 className="text-white font-black text-lg">キャラクタービルダー</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        <div className="card flex flex-col gap-3">
          <label className="text-sm font-bold" style={{ color: "var(--primary)" }}>① キャラクターのイメージを入力</label>
          <textarea
            value={concept}
            onChange={e => setConcept(e.target.value)}
            placeholder="例: ツンデレな女性先輩キャラ。英語が得意で少し上から目線だが根は優しい"
            rows={3}
            className="w-full text-sm p-3 rounded-lg"
            style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
          <button onClick={handleGenerate} disabled={generating} className="btn-primary self-start disabled:opacity-50">
            {generating ? "生成中…" : "🤖 AIで提案する"}
          </button>
        </div>

        {nameSuggestions.length > 0 && (
          <div className="card flex flex-col gap-3">
            <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>名前案</p>
            <div className="flex flex-wrap gap-2">
              {nameSuggestions.map(n => (
                <button
                  key={n}
                  onClick={() => setName(n)}
                  className="px-3 py-1 rounded-full text-xs font-bold border-2"
                  style={{ borderColor: "var(--accent)", color: name === n ? "white" : "var(--accent)", background: name === n ? "var(--accent)" : "transparent" }}
                >
                  {n}
                </button>
              ))}
            </div>
            {sampleLines.length > 0 && (
              <ul className="text-xs flex flex-col gap-1" style={{ color: "var(--muted)" }}>
                {sampleLines.map((l, i) => <li key={i}>「{l}」</li>)}
              </ul>
            )}
          </div>
        )}

        <div className="card flex flex-col gap-3">
          <label className="text-sm font-bold" style={{ color: "var(--primary)" }}>② TONE_PROFILE(編集可)</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="名前" className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="説明" rows={2} className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
          <input value={tone.first_person} onChange={e => setTone(t => ({ ...t, first_person: e.target.value }))} placeholder="一人称(例: 私、僕、俺)" className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
          <textarea value={tone.speech_style} onChange={e => setTone(t => ({ ...t, speech_style: e.target.value }))} placeholder="口調・話し方" rows={2} className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
          <textarea value={tone.personality} onChange={e => setTone(t => ({ ...t, personality: e.target.value }))} placeholder="性格・特徴" rows={2} className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
          <input value={tone.catchphrase} onChange={e => setTone(t => ({ ...t, catchphrase: e.target.value }))} placeholder="口癖・文末の癖" className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
          <input value={tone.ng_expressions} onChange={e => setTone(t => ({ ...t, ng_expressions: e.target.value }))} placeholder="避けるべき表現(、区切り)" className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
        </div>

        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
          {saving ? "保存中…" : "保存する"}
        </button>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          保存後、編集画面でプレビュー(口調変換の確認)ができます。
        </p>
      </main>
    </div>
  );
}
