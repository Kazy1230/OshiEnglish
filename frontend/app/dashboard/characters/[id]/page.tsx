"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { AppHeader } from "@/components/AppHeader";

type ToneProfile = {
  first_person?: string;
  speech_style?: string;
  personality?: string;
  catchphrase?: string;
  ng_expressions?: string[];
};

export default function EditCharacterPage() {
  const { loading } = useRoleGuard(["creator", "admin"]);
  const params = useParams();
  const characterId = Number(params.id);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tone, setTone] = useState<ToneProfile>({});
  const [ngText, setNgText] = useState("");
  const [loadingChar, setLoadingChar] = useState(true);
  const [saving, setSaving] = useState(false);

  const [sampleText, setSampleText] = useState("仮定法過去完了は、過去の事実に反する仮定を表す表現です。");
  const [previewResult, setPreviewResult] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const [concept, setConcept] = useState("");
  const [generating, setGenerating] = useState(false);
  const [nameSuggestions, setNameSuggestions] = useState<string[]>([]);
  const [sampleLines, setSampleLines] = useState<string[]>([]);

  useEffect(() => {
    if (loading) return;
    api.getCharacterDetail(characterId).then(c => {
      setName(c.name || "");
      setDescription(c.description || "");
      const tp: ToneProfile = c.tone_profile || {};
      setTone(tp);
      setNgText((tp.ng_expressions || []).join("、"));
    }).catch(() => toast("キャラクターの読み込みに失敗しました", "error")).finally(() => setLoadingChar(false));
  }, [loading, characterId]);

  if (loading || loadingChar) return <Skeleton />;

  async function handleGenerate() {
    if (!concept.trim()) { toast("キャラクターのイメージを入力してください", "error"); return; }
    setGenerating(true);
    try {
      const result = await api.generateCharacterConcept(concept);
      setNameSuggestions(result.name_suggestions || []);
      setSampleLines(result.sample_lines || []);
      if ((result.name_suggestions || [])[0]) setName(result.name_suggestions[0]);
      setDescription(concept);
      setTone({
        first_person: result.first_person || "",
        speech_style: [result.tone, result.sentence_ending].filter(Boolean).join("。語尾の特徴: "),
        personality: result.personality || "",
        catchphrase: result.catchphrase || "",
      });
      setNgText((result.ng_words || []).join("、"));
      toast("AIがキャラクター設定を提案しました。内容を確認・編集して保存してください", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "生成に失敗しました。もう一度試してください", "error");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const tone_profile = {
        ...tone,
        ng_expressions: ngText ? ngText.split(/[、,]/).map(s => s.trim()).filter(Boolean) : [],
      };
      await api.updateCharacterFull(characterId, { name, description, tone_profile });
      toast("保存しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handlePreview() {
    setPreviewing(true);
    setPreviewResult(null);
    try {
      const res = await api.previewCharacterVoice(characterId, sampleText);
      setPreviewResult(res.previewed);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "プレビューに失敗しました", "error");
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" title="キャラクター編集" />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        <div className="card flex flex-col gap-3">
          <label className="text-sm font-bold" style={{ color: "var(--primary)" }}>AIにキャラクター設定を提案してもらう（任意）</label>
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
          {nameSuggestions.length > 0 && (
            <div className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
              <p className="text-xs font-bold" style={{ color: "var(--primary)" }}>名前案</p>
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
        </div>

        <div className="card flex flex-col gap-3">
          <label className="text-sm font-bold" style={{ color: "var(--primary)" }}>TONE_PROFILE</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="名前" className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="説明" rows={2} className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
          <input value={tone.first_person || ""} onChange={e => setTone(t => ({ ...t, first_person: e.target.value }))} placeholder="一人称" className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
          <textarea value={tone.speech_style || ""} onChange={e => setTone(t => ({ ...t, speech_style: e.target.value }))} placeholder="口調・話し方" rows={2} className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
          <textarea value={tone.personality || ""} onChange={e => setTone(t => ({ ...t, personality: e.target.value }))} placeholder="性格・特徴" rows={2} className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
          <input value={tone.catchphrase || ""} onChange={e => setTone(t => ({ ...t, catchphrase: e.target.value }))} placeholder="口癖・文末の癖" className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
          <input value={ngText} onChange={e => setNgText(e.target.value)} placeholder="避けるべき表現(、区切り)" className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
          <button onClick={handleSave} disabled={saving} className="btn-primary self-start disabled:opacity-50">
            {saving ? "保存中…" : "保存する"}
          </button>
        </div>

        <div className="card flex flex-col gap-3">
          <label className="text-sm font-bold" style={{ color: "var(--primary)" }}>プレビューパネル(口調変換のリアルタイム確認)</label>
          <textarea value={sampleText} onChange={e => setSampleText(e.target.value)} rows={3} className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
          <button onClick={handlePreview} disabled={previewing} className="btn-primary self-start disabled:opacity-50">
            {previewing ? "変換中…" : "🔄 プレビュー"}
          </button>
          {previewResult && (
            <p className="text-sm p-3 rounded-lg" style={{ background: "var(--example-bg, #eee)", color: "var(--text)" }}>{previewResult}</p>
          )}
        </div>
      </main>
    </div>
  );
}
