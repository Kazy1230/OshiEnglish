"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { StreamingText } from "@/components/StreamingText";
import { AppHeader } from "@/components/AppHeader";

type CharacterSummary = { id: number; name: string };
type ConsultResult = { titles: string[]; structure: string[]; target_level: string; target_audience: string };

export default function StudioPage() {
  const { loading } = useRoleGuard(["creator", "admin"]);
  const router = useRouter();
  const [step, setStep] = useState(0);

  // 1クリエイター=1人格(キャラクター)のため、選択UIは不要で自動的に決まる
  const [character, setCharacter] = useState<CharacterSummary | null>(null);
  const [loadingCharacter, setLoadingCharacter] = useState(true);
  const characterId = character?.id ?? null;

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
    api.listMyCharacters().then(list => {
      if (list.length > 0) {
        setCharacter(list[0]);
        setStep(s => Math.max(s, 1));
      }
    }).catch(() => {}).finally(() => setLoadingCharacter(false));
  }, [loading]);

  if (loading || loadingCharacter) return <Skeleton />;

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
    if (!title.trim()) { toast("コースタイトルを入力してください", "error"); return; }
    if (!voicedContent) { toast("口調変換結果がありません", "error"); return; }
    setSaving(true);
    try {
      const course = await api.createCourse({
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
      toast(`コースを作成しました(${lessonChunks.length}レッスン)。クリエイターダッシュボードから公開できます`, "success");
      router.push(`/courses/${course.id}`);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "コースの保存に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader role="creator" title="AIコンテンツ生成スタジオ" />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        {/* あなたのキャラクター（1クリエイター=1人格のため選択は不要） */}
        <div className="card flex flex-col gap-2">
          {character ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              🎭 あなたのキャラクター: <span className="font-bold" style={{ color: "var(--primary)" }}>{character.name}</span>
            </p>
          ) : (
            <>
              <p className="text-sm" style={{ color: "var(--muted)" }}>まだキャラクター(人格)が作成されていません。先にAIインタビューを完了してください。</p>
              <Link href="/creator/interview" className="btn-primary self-start">AIインタビューへ</Link>
            </>
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
