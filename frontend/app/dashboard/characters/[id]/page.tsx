"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";

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
      <header className="flex items-center justify-between px-4 sm:px-6 py-4" style={{ background: "var(--primary)" }}>
        <Link href="/dashboard" className="text-white/80 text-sm">← ダッシュボード</Link>
        <h1 className="text-white font-black text-lg">キャラクター編集</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
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
