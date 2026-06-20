"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { StreamingText } from "@/components/StreamingText";

type CharacterSummary = { id: number; name: string };
type ConsultResult = { titles: string[]; structure: string[]; target_level: string; target_audience: string };

export default function StudioPage() {
  const { loading } = useRoleGuard(["instructor", "admin"]);
  const router = useRouter();
  const [step, setStep] = useState(0);

  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [characterId, setCharacterId] = useState<number | null>(null);

  const [theme, setTheme] = useState("");
  const [consulting, setConsulting] = useState(false);
  const [consult, setConsult] = useState<ConsultResult | null>(null);
  const [title, setTitle] = useState("");
  const [structureText, setStructureText] = useState("");
  const [targetLevel, setTargetLevel] = useState("");

  const [draftId, setDraftId] = useState<number | null>(null);
  const [rawContent, setRawContent] = useState("");
  const [voicedContent, setVoicedContent] = useState("");
  const [, setScriptContent] = useState("");

  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("980");
  const [isFree, setIsFree] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading) return;
    api.listMyCharacters().then(setCharacters).catch(() => {});
  }, [loading]);

  if (loading) return <Skeleton />;

  async function handleConsult() {
    if (!theme.trim()) { toast("テーマを入力してください", "error"); return; }
    setConsulting(true);
    try {
      const result = await api.studioConsult(theme);
      setConsult(result);
      setTitle((result.titles || [])[0] || theme);
      setStructureText((result.structure || []).join("\n"));
      setTargetLevel(result.target_level || "");
      setStep(2);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "相談に失敗しました。もう一度試してください", "error");
    } finally {
      setConsulting(false);
    }
  }

  const structureList = structureText.split("\n").map(s => s.trim()).filter(Boolean);

  /** Step1の構成案(セクション数)に合わせて、口調変換済み本文を単純な文字数均等分割で複数レッスンに分ける */
  function splitIntoLessons(content: string, sections: string[]): { title: string; body: string }[] {
    if (sections.length <= 1) return [{ title: sections[0] || title, body: content }];
    const chunkSize = Math.ceil(content.length / sections.length);
    return sections.map((sectionTitle, i) => ({
      title: sectionTitle,
      body: content.slice(i * chunkSize, (i + 1) * chunkSize).trim(),
    })).filter(chunk => chunk.body.length > 0);
  }

  async function handleCreateCourse() {
    if (!characterId) { toast("キャラクターを選択してください", "error"); return; }
    if (!title.trim()) { toast("コースタイトルを入力してください", "error"); return; }
    if (!voicedContent) { toast("口調変換結果がありません", "error"); return; }
    setSaving(true);
    try {
      const course = await api.createCourse({
        character_id: characterId,
        title,
        description: consult?.target_audience || undefined,
        category: category || undefined,
        price: isFree ? 0 : Number(price) || 0,
        is_free: isFree,
      });
      const lessonChunks = splitIntoLessons(voicedContent, structureList);
      for (let i = 0; i < lessonChunks.length; i++) {
        await api.addCourseLesson(course.id, {
          title: lessonChunks[i].title,
          content_type: "text",
          body: lessonChunks[i].body,
          is_preview: i === 0,
        });
      }
      toast(`コースを作成しました(${lessonChunks.length}レッスン)。講師ダッシュボードから公開できます`, "success");
      router.push(`/courses/${course.id}`);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "コースの保存に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="px-4 sm:px-6 py-4" style={{ background: "var(--primary)" }}>
        <h1 className="text-white font-black text-lg">AIコンテンツ生成スタジオ</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        {/* Step 0: キャラクター選択 */}
        <div className="card flex flex-col gap-3">
          <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>Step 0: キャラクターを選択</p>
          {characters.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>キャラクターがまだありません。先にダッシュボードで作成してください。</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {characters.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setCharacterId(c.id); setStep(s => Math.max(s, 1)); }}
                  className="px-3 py-1 rounded-full text-xs font-bold border-2"
                  style={{ borderColor: "var(--accent)", color: characterId === c.id ? "white" : "var(--accent)", background: characterId === c.id ? "var(--accent)" : "transparent" }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Step 1: コンテンツ相談 */}
        {step >= 1 && (
          <div className="card flex flex-col gap-3">
            <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>Step 1: テーマを入力して構成案を相談</p>
            <input value={theme} onChange={e => setTheme(e.target.value)} placeholder="例: 仮定法過去完了" className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
            <button onClick={handleConsult} disabled={consulting} className="btn-primary self-start disabled:opacity-50">
              {consulting ? "相談中…" : "🤖 構成案を相談する"}
            </button>
          </div>
        )}

        {/* Step 2: 構成確認・素材生成 */}
        {step >= 2 && (
          <div className="card flex flex-col gap-3">
            <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>Step 2: 構成を確認し、素材を生成</p>
            {consult && (
              <div className="flex flex-wrap gap-2">
                {consult.titles.map(t => (
                  <button key={t} onClick={() => setTitle(t)} className="px-3 py-1 rounded-full text-xs border-2" style={{ borderColor: "var(--accent)", color: title === t ? "white" : "var(--accent)", background: title === t ? "var(--accent)" : "transparent" }}>{t}</button>
                ))}
              </div>
            )}
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="タイトル" className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
            <textarea value={structureText} onChange={e => setStructureText(e.target.value)} rows={4} placeholder="構成(1行ずつ)" className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
            <input value={targetLevel} onChange={e => setTargetLevel(e.target.value)} placeholder="対象レベル(例: 中級)" className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
            <StreamingText
              endpoint="/studio/generate/raw"
              payload={{ theme, structure: structureList, target_level: targetLevel || undefined }}
              buttonLabel="📝 素材を生成する"
              onComplete={(text, headers) => {
                setRawContent(text);
                const id = headers.get("X-Draft-Id");
                if (id) setDraftId(Number(id));
                setStep(s => Math.max(s, 3));
              }}
            />
          </div>
        )}

        {/* Step 3: 口調変換 */}
        {step >= 3 && rawContent && (
          <div className="card flex flex-col gap-3">
            <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>Step 3: キャラクターの口調に変換</p>
            <StreamingText
              endpoint="/studio/generate/voiced"
              payload={{ draft_id: draftId, character_id: characterId }}
              buttonLabel="🎭 口調変換する"
              disabled={!draftId || !characterId}
              onComplete={(text) => { setVoicedContent(text); setStep(s => Math.max(s, 4)); }}
            />
          </div>
        )}

        {/* Step 4: 台本生成(オプション) */}
        {step >= 4 && voicedContent && (
          <div className="card flex flex-col gap-3">
            <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>Step 4: YouTube台本を生成(オプション)</p>
            <StreamingText
              endpoint="/studio/generate/script"
              payload={{ draft_id: draftId, character_id: characterId }}
              buttonLabel="🎬 台本を生成する"
              disabled={!draftId || !characterId}
              onComplete={(text) => setScriptContent(text)}
            />
          </div>
        )}

        {/* Step 5: コースとして保存 */}
        {step >= 4 && voicedContent && (
          <div className="card flex flex-col gap-3">
            <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>Step 5: コースとして保存</p>
            <input value={category} onChange={e => setCategory(e.target.value)} placeholder="カテゴリ(例: 英文法)" className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
            <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text)" }}>
              <input type="checkbox" checked={isFree} onChange={e => setIsFree(e.target.checked)} />
              無料コースにする
            </label>
            {!isFree && (
              <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="価格(円)" className="text-sm p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
            )}
            <button onClick={handleCreateCourse} disabled={saving} className="btn-primary disabled:opacity-50">
              {saving ? "保存中…" : "コースを保存する"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
