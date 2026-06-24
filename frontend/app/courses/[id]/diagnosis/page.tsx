"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";

type Question = {
  key: string;
  question: string;
  type: "number_or_unattempted" | "number" | "choice" | "multi_choice" | "text";
  options?: string[];
  required?: boolean;
};

type Roadmap = {
  level_analysis: Record<string, unknown>;
  roadmap_reason: string;
  weekly_plan: { theme: string; weeks: string; milestone: string; focus_reason: string }[];
  day1_tasks: string[];
  creator_message: string;
};

type Phase = "loading" | "welcome" | "questions" | "generating" | "result" | "detail" | "notif" | "today" | "done";

export default function DiagnosisPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = Number(params.id);

  const [phase, setPhase] = useState<Phase>("loading");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [qIndex, setQIndex] = useState(0);

  const [currentScore, setCurrentScore] = useState("");
  const [hasTakenBefore, setHasTakenBefore] = useState(true);
  const [targetScore, setTargetScore] = useState("");
  const [examDate, setExamDate] = useState("");
  const [dailyStudyTime, setDailyStudyTime] = useState("");
  const [weakAreas, setWeakAreas] = useState<string[]>([]);
  const [studyHistory, setStudyHistory] = useState("");
  const [materials, setMaterials] = useState("");
  const [textDraft, setTextDraft] = useState("");

  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [morningTime, setMorningTime] = useState("07:00");
  const [eveningTime, setEveningTime] = useState("21:00");
  const [savingNotif, setSavingNotif] = useState(false);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const detail = await api.getCourseDetail(courseId);
        if (!(detail.is_purchased || detail.is_free)) {
          toast("このコースを購入してから診断を開始してください", "error");
          router.replace(`/courses/${courseId}`);
          return;
        }
        const existing = await api.getRoadmap(courseId).catch(() => null);
        if (existing) {
          setRoadmap(existing);
          setPhase("result");
          return;
        }
        const [welcome, qs] = await Promise.all([
          api.getWelcomeMessage(courseId),
          api.getDiagnosisQuestions(courseId),
        ]);
        setWelcomeMessage(welcome.message);
        setQuestions(qs.questions);
        setPhase("welcome");
      } catch (err: unknown) {
        toast(err instanceof Error ? err.message : "読み込みに失敗しました", "error");
        router.replace(`/courses/${courseId}`);
      }
    }
    init();
  }, [courseId, router]);

  function startQuestions() {
    setPhase("questions");
  }

  function toggleWeakArea(opt: string) {
    setWeakAreas(prev => prev.includes(opt) ? prev.filter(w => w !== opt) : [...prev, opt]);
  }

  async function submitAll() {
    setPhase("generating");
    try {
      const data = await api.submitDiagnosis(courseId, {
        current_score: hasTakenBefore && currentScore ? Number(currentScore) : null,
        has_taken_before: hasTakenBefore,
        target_score: Number(targetScore),
        exam_date: examDate,
        daily_study_time: dailyStudyTime,
        weak_areas: weakAreas,
        study_history: studyHistory || null,
        materials: materials || null,
      });
      setRoadmap(data);
      setPhase("result");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "ロードマップの生成に失敗しました", "error");
      setPhase("questions");
    }
  }

  function nextQuestion() {
    if (qIndex < questions.length - 1) {
      setQIndex(qIndex + 1);
      setTextDraft("");
    } else {
      submitAll();
    }
  }

  async function saveNotifAndContinue(skip: boolean) {
    setSavingNotif(true);
    try {
      const data = skip
        ? { morning_time: "07:00", evening_time: "21:00", is_enabled: true }
        : { morning_time: morningTime, evening_time: eveningTime, is_enabled: true };
      await api.updateNotificationSettings(courseId, data);
      setMorningTime(data.morning_time);
      setEveningTime(data.evening_time);
      setPhase("today");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "通知設定の保存に失敗しました", "error");
    } finally {
      setSavingNotif(false);
    }
  }

  async function completeDay1() {
    setCompleting(true);
    try {
      await api.completeDayLog(courseId, 1, "Day1診断完了");
      setPhase("done");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "完了の記録に失敗しました", "error");
    } finally {
      setCompleting(false);
    }
  }

  if (phase === "loading") {
    return <p className="p-8" style={{ color: "var(--muted)" }}>読み込み中…</p>;
  }

  return (
    <div>
      <div className="px-4 sm:px-6 pt-4">
        <Link href={`/courses/${courseId}`} className="text-sm" style={{ color: "var(--accent)" }}>← コースページに戻る</Link>
      </div>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4">
        {phase === "welcome" && (
          <div className="card flex flex-col gap-4">
            <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--text)" }}>{welcomeMessage}</p>
            <button onClick={startQuestions} className="btn-primary self-end">質問に答える</button>
          </div>
        )}

        {phase === "questions" && questions.length > 0 && (
          <QuestionCard
            question={questions[qIndex]}
            index={qIndex}
            total={questions.length}
            currentScore={currentScore} setCurrentScore={setCurrentScore}
            hasTakenBefore={hasTakenBefore} setHasTakenBefore={setHasTakenBefore}
            targetScore={targetScore} setTargetScore={setTargetScore}
            examDate={examDate} setExamDate={setExamDate}
            dailyStudyTime={dailyStudyTime} setDailyStudyTime={setDailyStudyTime}
            weakAreas={weakAreas} toggleWeakArea={toggleWeakArea}
            studyHistory={studyHistory} setStudyHistory={setStudyHistory}
            materials={materials} setMaterials={setMaterials}
            textDraft={textDraft} setTextDraft={setTextDraft}
            onNext={nextQuestion}
          />
        )}

        {phase === "generating" && (
          <div className="card flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-3xl animate-pulse">🧠</p>
            <p className="text-sm" style={{ color: "var(--muted)" }}>あなたの状況を分析しています…</p>
            <p className="text-sm" style={{ color: "var(--muted)" }}>90日間の学習計画を作成しています…</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>もう少しお待ちください…</p>
          </div>
        )}

        {phase === "result" && roadmap && (
          <div className="card flex flex-col gap-4">
            <div>
              <p className="text-xs font-bold" style={{ color: "var(--accent)" }}>【あなたの現在地分析】</p>
              <pre className="text-sm whitespace-pre-wrap mt-1" style={{ color: "var(--text)", fontFamily: "inherit" }}>
                {Object.entries(roadmap.level_analysis).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join("・") : String(v)}`).join("\n")}
              </pre>
            </div>
            <div>
              <p className="text-xs font-bold" style={{ color: "var(--accent)" }}>【このプランの理由】</p>
              <p className="text-sm mt-1" style={{ color: "var(--text)" }}>{roadmap.roadmap_reason}</p>
            </div>
            <div>
              <p className="text-xs font-bold" style={{ color: "var(--accent)" }}>クリエイターからのメッセージ</p>
              <p className="text-sm mt-1 whitespace-pre-wrap" style={{ color: "var(--text)" }}>{roadmap.creator_message}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 mt-2">
              <button onClick={() => setPhase("notif")} className="btn-primary flex-1">この計画で始める</button>
              <button onClick={() => setPhase("detail")} className="px-4 py-2 rounded-lg text-sm font-bold border" style={{ borderColor: "var(--border)", color: "var(--text)" }}>計画の詳細を見る</button>
            </div>
          </div>
        )}

        {phase === "detail" && roadmap && (
          <div className="card flex flex-col gap-4">
            <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>90日ロードマップ（週単位）</p>
            <div className="flex flex-col gap-3">
              {roadmap.weekly_plan.map((w, i) => (
                <div key={i} className="border-l-4 pl-3" style={{ borderColor: "var(--accent)" }}>
                  <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{w.theme}</p>
                  <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>マイルストーン: {w.milestone}</p>
                  <p className="text-xs mt-1" style={{ color: "var(--text)" }}>{w.focus_reason}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="text-sm font-bold mt-2" style={{ color: "var(--primary)" }}>【今日のタスク（Day1）】</p>
              <ul className="text-sm mt-1 list-disc pl-5" style={{ color: "var(--text)" }}>
                {roadmap.day1_tasks.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
            <button onClick={() => setPhase("notif")} className="btn-primary self-end">この計画で始める</button>
          </div>
        )}

        {phase === "notif" && (
          <div className="card flex flex-col gap-4">
            <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>通知時刻の設定</p>
            <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--text)" }}>
              朝の声かけ（通勤・通学の時間帯に合わせたデフォルトです）
              <input type="time" value={morningTime} onChange={e => setMorningTime(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--text)" }}>
              夜のリマインド（就寝前の振り返りに合わせたデフォルトです）
              <input type="time" value={eveningTime} onChange={e => setEveningTime(e.target.value)} />
            </label>
            <div className="flex gap-2 mt-2">
              <button onClick={() => saveNotifAndContinue(false)} disabled={savingNotif} className="btn-primary flex-1 disabled:opacity-50">設定する</button>
              <button onClick={() => saveNotifAndContinue(true)} disabled={savingNotif} className="px-4 py-2 rounded-lg text-sm font-bold border" style={{ borderColor: "var(--border)", color: "var(--text)" }}>後で設定する</button>
            </div>
          </div>
        )}

        {phase === "today" && roadmap && (
          <div className="card flex flex-col gap-4">
            <p className="text-sm font-bold" style={{ color: "var(--accent)" }}>設定完了！</p>
            <p className="text-sm" style={{ color: "var(--text)" }}>毎日 {morningTime} に声かけします。学習報告は {eveningTime} にリマインドするね。</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>いつでもマイページから変更できるよ。</p>
            <div>
              <p className="text-sm font-bold mt-2" style={{ color: "var(--primary)" }}>【今日のタスク】</p>
              <ul className="text-sm mt-1 list-disc pl-5" style={{ color: "var(--text)" }}>
                {roadmap.day1_tasks.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
            <button onClick={completeDay1} disabled={completing} className="btn-primary self-end disabled:opacity-50">
              {completing ? "記録中…" : "完了！"}
            </button>
          </div>
        )}

        {phase === "done" && (
          <div className="card flex flex-col gap-4 text-center py-10">
            <p className="text-4xl">🎉</p>
            <p className="text-sm font-bold" style={{ color: "var(--accent)" }}>お疲れ様！初日をやり切ったね。</p>
            <p className="text-sm" style={{ color: "var(--text)" }}>この調子で続けましょう。明日も一緒に頑張ろう！</p>
            <Link href={`/courses/${courseId}`} className="btn-primary self-center">コースページへ戻る</Link>
          </div>
        )}
      </main>
    </div>
  );
}

function QuestionCard(props: {
  question: Question; index: number; total: number;
  currentScore: string; setCurrentScore: (v: string) => void;
  hasTakenBefore: boolean; setHasTakenBefore: (v: boolean) => void;
  targetScore: string; setTargetScore: (v: string) => void;
  examDate: string; setExamDate: (v: string) => void;
  dailyStudyTime: string; setDailyStudyTime: (v: string) => void;
  weakAreas: string[]; toggleWeakArea: (opt: string) => void;
  studyHistory: string; setStudyHistory: (v: string) => void;
  materials: string; setMaterials: (v: string) => void;
  textDraft: string; setTextDraft: (v: string) => void;
  onNext: () => void;
}) {
  const { question: q, index, total } = props;

  function canProceed(): boolean {
    switch (q.key) {
      case "current_score": return !props.hasTakenBefore || props.currentScore.trim() !== "";
      case "target_score": return props.targetScore.trim() !== "";
      case "exam_date": return props.examDate !== "";
      case "daily_study_time": return props.dailyStudyTime !== "";
      case "weak_areas": return props.weakAreas.length > 0;
      case "study_history": return props.textDraft.trim() !== "";
      case "materials": return true;
      default: return false;
    }
  }

  function handleNext() {
    if (q.key === "study_history") props.setStudyHistory(props.textDraft);
    if (q.key === "materials") props.setMaterials(props.textDraft);
    props.onNext();
  }

  return (
    <div className="card flex flex-col gap-4">
      <p className="text-xs" style={{ color: "var(--muted)" }}>質問 {index + 1} / {total}</p>
      <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{q.question}</p>

      {q.key === "current_score" && (
        <div className="flex flex-col gap-2">
          <input type="number" value={props.currentScore} disabled={!props.hasTakenBefore}
            onChange={e => props.setCurrentScore(e.target.value)} placeholder="例: 580" className="disabled:opacity-50" />
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text)" }}>
            <input type="checkbox" checked={!props.hasTakenBefore}
              onChange={e => props.setHasTakenBefore(!e.target.checked)} />
            まだ受けたことがない
          </label>
        </div>
      )}

      {q.key === "target_score" && (
        <input type="number" value={props.targetScore} onChange={e => props.setTargetScore(e.target.value)} placeholder="例: 800" />
      )}

      {(q.key === "exam_date" || q.key === "daily_study_time") && (
        <div className="flex flex-wrap gap-2">
          {q.options?.map(opt => {
            const selected = q.key === "exam_date" ? props.examDate === opt : props.dailyStudyTime === opt;
            return (
              <button key={opt}
                onClick={() => q.key === "exam_date" ? props.setExamDate(opt) : props.setDailyStudyTime(opt)}
                className="px-3 py-2 rounded-full text-sm font-bold border transition-colors"
                style={{ borderColor: "var(--border)", background: selected ? "var(--primary)" : "var(--card)", color: selected ? "white" : "var(--text)" }}>
                {opt}
              </button>
            );
          })}
        </div>
      )}

      {q.key === "weak_areas" && (
        <div className="flex flex-wrap gap-2">
          {q.options?.map(opt => {
            const selected = props.weakAreas.includes(opt);
            return (
              <button key={opt} onClick={() => props.toggleWeakArea(opt)}
                className="px-3 py-2 rounded-full text-sm font-bold border transition-colors"
                style={{ borderColor: "var(--border)", background: selected ? "var(--primary)" : "var(--card)", color: selected ? "white" : "var(--text)" }}>
                {opt}
              </button>
            );
          })}
        </div>
      )}

      {(q.key === "study_history" || q.key === "materials") && (
        <textarea value={props.textDraft} onChange={e => props.setTextDraft(e.target.value)}
          placeholder={q.key === "materials" ? "例: 金フレ、公式問題集（任意）" : "これまでの学習内容を教えてください"}
          className="min-h-[80px]" />
      )}

      <div className="flex justify-end gap-2">
        {q.key === "materials" && (
          <button onClick={() => { props.setMaterials(""); props.setTextDraft(""); props.onNext(); }}
            className="px-4 py-2 rounded-lg text-sm font-bold border" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
            スキップ
          </button>
        )}
        <button onClick={handleNext} disabled={!canProceed()} className="btn-primary disabled:opacity-50">
          次へ
        </button>
      </div>
    </div>
  );
}
