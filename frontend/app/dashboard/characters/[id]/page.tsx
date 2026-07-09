"use client";
import { AppHeader } from "@/components/AppHeader";
import { Skeleton } from "@/components/Skeleton";
import { toast } from "@/components/Toast";
import { api } from "@/lib/api";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ToneProfile = {
  first_person?: string;
  speech_style?: string;
  personality?: string;
  catchphrase?: string;
  ng_expressions?: string[];
  background?: string;
  reaction_patterns?: string;
  speaking_samples?: string[];
};

export default function EditCharacterPage() {
  const { loading } = useRoleGuard(["creator", "admin"]);
  const params = useParams();
  const router = useRouter();
  const characterId = Number(params.id);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tone, setTone] = useState<ToneProfile>({});
  const [ngText, setNgText] = useState("");
  const [loadingChar, setLoadingChar] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [samplesText, setSamplesText] = useState("");

  const [sampleText, setSampleText] = useState("仮定法過去完了は、過去の事実に反する仮定を表す表現です。");
  const [previewResult, setPreviewResult] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (loading) return;
    api.getCharacterDetail(characterId).then(c => {
      setName(c.name || "");
      setDescription(c.description || "");
      const tp: ToneProfile = c.tone_profile || {};
      setTone(tp);
      setNgText((tp.ng_expressions || []).join("、"));
      setSamplesText((tp.speaking_samples || []).join("\n"));
      setImageUrl(c.image_url || null);
    }).catch(() => toast("キャラクターの読み込みに失敗しました", "error")).finally(() => setLoadingChar(false));
  }, [loading, characterId]);

  if (loading || loadingChar) return <Skeleton />;

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const res = await api.uploadCharacterImage(characterId, file);
      setImageUrl(res.image_url);
      toast("アイコンを更新しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "アップロードに失敗しました", "error");
    } finally {
      setUploadingImage(false);
      e.target.value = "";
    }
  }

  async function handleImageDelete() {
    if (!confirm("アイコンを削除しますか？")) return;
    setUploadingImage(true);
    try {
      await api.deleteCharacterImage(characterId);
      setImageUrl(null);
      toast("アイコンを削除しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "削除に失敗しました", "error");
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleGenerate() {
    if (!name.trim()) { toast("名前を入力してください", "error"); return; }
    setGenerating(true);
    try {
      const result = await api.generateToneProfile(name, description, tone);
      setTone(prev => ({
        ...prev,
        first_person: result.first_person || prev.first_person || "",
        speech_style: [result.tone, result.sentence_ending].filter(Boolean).join("。語尾の特徴: ") || prev.speech_style || "",
        personality: result.personality || prev.personality || "",
        catchphrase: result.catchphrase || prev.catchphrase || "",
        background: result.background || prev.background || "",
        reaction_patterns: result.reaction_patterns || prev.reaction_patterns || "",
        speaking_samples: result.speaking_samples?.length ? result.speaking_samples : prev.speaking_samples,
      }));
      setNgText((result.ng_words || []).join("、"));
      if (result.speaking_samples?.length) setSamplesText(result.speaking_samples.join("\n"));
      toast("トーン設定を生成しました。内容を確認・編集して保存してください", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "生成に失敗しました。もう一度試してください", "error");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave(): Promise<boolean> {
    setSaving(true);
    try {
      const tone_profile = {
        ...tone,
        ng_expressions: ngText ? ngText.split(/[、,]/).map(s => s.trim()).filter(Boolean) : [],
        speaking_samples: samplesText ? samplesText.split("\n").map(s => s.trim()).filter(Boolean) : [],
      };
      await api.updateCharacterFull(characterId, { name, description, tone_profile });
      toast("保存しました", "success");
      return true;
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "error");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete() {
    const ok = await handleSave();
    if (ok) router.push("/dashboard");
  }

  function handleCancel() {
    router.push("/dashboard");
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
    <div className="creator-theme min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" title="キャラクター編集" />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        <div className="card flex items-center gap-4">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="w-20 h-20 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl flex-shrink-0" style={{ background: "var(--example-bg, #eee)" }}>🎭</div>
          )}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold" style={{ color: "var(--primary)" }}>アイコン画像</label>
            <p className="text-xs" style={{ color: "var(--muted)" }}>PNG / JPG / WEBP、5MBまで</p>
            <div className="flex gap-2 items-center">
              <label className="btn-primary text-xs cursor-pointer" style={{ opacity: uploadingImage ? 0.5 : 1 }}>
                {uploadingImage ? "処理中…" : imageUrl ? "変更する" : "アップロードする"}
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImageSelect} disabled={uploadingImage} className="hidden" />
              </label>
              {imageUrl && (
                <button onClick={handleImageDelete} disabled={uploadingImage} className="text-xs underline" style={{ color: "#e53e3e" }}>削除</button>
              )}
            </div>
          </div>
        </div>

        <div className="card flex flex-col gap-3">
          <label className="text-sm font-bold" style={{ color: "var(--primary)" }}>TONE_PROFILE</label>
          <button onClick={handleGenerate} disabled={generating} className="btn-primary self-start disabled:opacity-50">
            {generating ? "生成中…" : "🤖 AIで提案する"}
          </button>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>名前</label>
            <input value={name} onChange={e => setName(e.target.value)} className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>一人称</label>
            <input value={tone.first_person || ""} onChange={e => setTone(t => ({ ...t, first_person: e.target.value }))} className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>口調・話し方</label>
            <textarea value={tone.speech_style || ""} onChange={e => setTone(t => ({ ...t, speech_style: e.target.value }))} rows={2} className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>性格・特徴</label>
            <textarea value={tone.personality || ""} onChange={e => setTone(t => ({ ...t, personality: e.target.value }))} rows={2} className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>口癖・文末の癖</label>
            <input value={tone.catchphrase || ""} onChange={e => setTone(t => ({ ...t, catchphrase: e.target.value }))} className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>避けるべき表現（、区切り）</label>
            <input value={ngText} onChange={e => setNgText(e.target.value)} className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
          </div>

          <p className="text-xs font-bold mt-2" style={{ color: "var(--muted)" }}>— キャラ再現に効果的な追加設定 —</p>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>背景設定・世界観</label>
            <textarea value={tone.background || ""} onChange={e => setTone(t => ({ ...t, background: e.target.value }))} placeholder="例：元落ちこぼれ英語学習者で苦労して習得。その経験を活かして学習者を励ます" rows={2} className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>感情・リアクションパターン</label>
            <textarea value={tone.reaction_patterns || ""} onChange={e => setTone(t => ({ ...t, reaction_patterns: e.target.value }))} placeholder="例：褒められると照れて否定する。学習者が失敗すると呆れながらもフォローする" rows={2} className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>セリフサンプル（1行1例）</label>
            <textarea value={samplesText} onChange={e => setSamplesText(e.target.value)} placeholder={"例：「べ、別に教えてあげてもいいけど」\n「また間違えたの？まあ、最初はみんなそうだから」"} rows={4} className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
          </div>
        </div>

        <div className="card flex flex-col gap-3">
          <label className="text-sm font-bold" style={{ color: "var(--primary)" }}>プレビューパネル(口調変換のリアルタイム確認)</label>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>変換前のサンプル文章</label>
            <textarea value={sampleText} onChange={e => setSampleText(e.target.value)} rows={3} className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
          </div>
          <button onClick={handlePreview} disabled={previewing} className="btn-primary self-start disabled:opacity-50">
            {previewing ? "変換中…" : "🔄 プレビュー"}
          </button>
          {previewResult && (
            <p className="text-sm p-3 rounded-lg" style={{ background: "var(--example-bg, #eee)", color: "var(--text)" }}>{previewResult}</p>
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={handleCancel} className="btn-secondary flex-1">キャンセル</button>
          <button onClick={handleComplete} disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
            {saving ? "保存中…" : "完了"}
          </button>
        </div>
      </main>
    </div>
  );
}
