"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";

type CustomQuestion = {
  id: number;
  question_text: string;
  answer_type: "text" | "number" | "single" | "multi";
  options?: string[] | null;
  is_required: boolean;
};

type Roadmap = {
  level_analysis: Record<string, unknown>;
  roadmap_reason: string;
  weekly_plan: { theme: string; weeks: string; milestone: string; focus_reason: string }[];
  day1_tasks: string[];
  creator_message: string;
};

type TextbookQuestion = { course_textbook_id: number; name: string; target_laps: number };
type TextbookProgressAnswer = { status: "not_started" | "in_progress" | "completed"; lap_number?: number; percent?: number };

type Phase = "loading" | "welcome" | "questions" | "textbook_progress" | "generating" | "result" | "detail" | "notif" | "today" | "done";

export default function DiagnosisPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = Number(params.id);

  const [phase, setPhase] = useState<Phase>("loading");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [questions, setQuestions] = useState<CustomQuestion[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [multiAnswers, setMultiAnswers] = useState<Record<number, string[]>>({});

  const [textbookQuestions, setTextbookQuestions] = useState<TextbookQuestion[]>([]);
  const [tbIndex, setTbIndex] = useState(0);
  const [textbookAnswers, setTextbookAnswers] = useState<Record<number, TextbookProgressAnswer>>({});

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
        setQuestions(qs.custom_questions || []);
        setTextbookQuestions(qs.textbook_questions || []);
        setPhase("welcome");
      } catch (err: unknown) {
        toast(err instanceof Error ? err.message : "読み込みに失敗しました", "error");
        router.replace(`/courses/${courseId}`);
      }
    }
    init();
  }, [courseId, router]);

  function startQuestions() {
    if (questions.length > 0) {
      setPhase("questions");
    } else if (textbookQuestions.length > 0) {
      setPhase("textbook_progress");
    } else {
      submitAll();
    }
  }

  function setAnswer(questionId: number, value: string) {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  }

  function toggleMultiAnswer(questionId: number, opt: string) {
    setMultiAnswers(prev => {
      const current = prev[questionId] ?? [];
      const next = current.includes(opt) ? current.filter(o => o !== opt) : [...current, opt];
      return { ...prev, [questionId]: next };
    });
  }

  async function submitAll() {
    setPhase("generating");
    try {
      const customAnswers = questions
        .map(q => {
          const value = q.answer_type === "multi" ? (multiAnswers[q.id] ?? []).join("、") : (answers[q.id] ?? "");
          return { question_id: q.id, answer: value };
        })
        .filter(a => a.answer.trim() !== "");

      const data = await api.submitDiagnosis(courseId, {
        custom_answers: customAnswers,
        textbook_progress: textbookQuestions.map(q => ({
          course_textbook_id: q.course_textbook_id,
          ...(textbookAnswers[q.course_textbook_id] ?? { status: "not_started" as const }),
        })),
      });
      setRoadmap(data);
      setPhase("result");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "ロードマップの生成に失敗しました", "error");
      setPhase(questions.length > 0 ? "questions" : "textbook_progress");
    }
  }

  function nextQuestion() {
    if (qIndex < questions.length - 1) {
      setQIndex(qIndex + 1);
    } else if (textbookQuestions.length > 0) {
      setTbIndex(0);
      setPhase("textbook_progress");
    } else {
      submitAll();
    }
  }

  function setTextbookAnswer(courseTextbookId: number, answer: TextbookProgressAnswer) {
    setTextbookAnswers(prev => ({ ...prev, [courseTextbookId]: answer }));
  }

  function nextTextbookQuestion() {
    if (tbIndex < textbookQuestions.length - 1) {
      setTbIndex(tbIndex + 1);
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
            <button onClick={startQuestions} className="btn-primary self-end">
              {questions.length > 0 || textbookQuestions.length > 0 ? "質問に答える" : "始める"}
            </button>
          </div>
        )}

        {phase === "questions" && questions.length > 0 && (
          <CustomQuestionCard
            question={questions[qIndex]}
            index={qIndex}
            total={questions.length}
            value={answers[questions[qIndex].id] ?? ""}
            setValue={v => setAnswer(questions[qIndex].id, v)}
            multiValue={multiAnswers[questions[qIndex].id] ?? []}
            toggleMultiValue={opt => toggleMultiAnswer(questions[qIndex].id, opt)}
            onNext={nextQuestion}
          />
        )}

        {phase === "textbook_progress" && textbookQuestions.length > 0 && (
          <TextbookProgressCard
            question={textbookQuestions[tbIndex]}
            index={tbIndex}
            total={textbookQuestions.length}
            answer={textbookAnswers[textbookQuestions[tbIndex].course_textbook_id]}
            setAnswer={a => setTextbookAnswer(textbookQuestions[tbIndex].course_textbook_id, a)}
            onNext={nextTextbookQuestion}
          />
        )}

        {phase === "generating" && (
          <div className="card flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-3xl animate-pulse">🧠</p>
            <p className="text-sm" style={{ color: "var(--muted)" }}>あなたの状況を分析しています…</p>
            <p className="text-sm" style={{ color: "var(--muted)" }}>あなた専用の学習プランを作成中です…</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>20〜25秒ほどお待ちください…</p>
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
            <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>30日ロードマップ（週単位）</p>
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

function CustomQuestionCard({
  question, index, total, value, setValue, multiValue, toggleMultiValue, onNext,
}: {
  question: CustomQuestion;
  index: number;
  total: number;
  value: string;
  setValue: (v: string) => void;
  multiValue: string[];
  toggleMultiValue: (opt: string) => void;
  onNext: () => void;
}) {
  function canProceed(): boolean {
    if (!question.is_required) return true;
    if (question.answer_type === "multi") return multiValue.length > 0;
    return value.trim() !== "";
  }

  return (
    <div className="card flex flex-col gap-4">
      <p className="text-xs" style={{ color: "var(--muted)" }}>質問 {index + 1} / {total}</p>
      <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{question.question_text}</p>

      {question.answer_type === "text" && (
        <textarea value={value} onChange={e => setValue(e.target.value)} className="min-h-[80px]" placeholder="回答を入力してください" />
      )}

      {question.answer_type === "number" && (
        <input type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="数値を入力" />
      )}

      {question.answer_type === "single" && (
        <div className="flex flex-wrap gap-2">
          {(question.options || []).map(opt => (
            <button key={opt} onClick={() => setValue(opt)}
              className="px-3 py-2 rounded-full text-sm font-bold border transition-colors"
              style={{ borderColor: "var(--border)", background: value === opt ? "var(--ink)" : "var(--card)", color: value === opt ? "white" : "var(--text)" }}>
              {opt}
            </button>
          ))}
        </div>
      )}

      {question.answer_type === "multi" && (
        <div className="flex flex-wrap gap-2">
          {(question.options || []).map(opt => {
            const selected = multiValue.includes(opt);
            return (
              <button key={opt} onClick={() => toggleMultiValue(opt)}
                className="px-3 py-2 rounded-full text-sm font-bold border transition-colors"
                style={{ borderColor: "var(--border)", background: selected ? "var(--ink)" : "var(--card)", color: selected ? "white" : "var(--text)" }}>
                {opt}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex justify-end gap-2">
        {!question.is_required && (
          <button onClick={() => { setValue(""); onNext(); }}
            className="px-4 py-2 rounded-lg text-sm font-bold border" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
            スキップ
          </button>
        )}
        <button onClick={onNext} disabled={!canProceed()} className="btn-primary disabled:opacity-50">
          次へ
        </button>
      </div>
    </div>
  );
}

function TextbookProgressCard({
  question, index, total, answer, setAnswer, onNext,
}: {
  question: TextbookQuestion;
  index: number;
  total: number;
  answer: TextbookProgressAnswer | undefined;
  setAnswer: (a: TextbookProgressAnswer) => void;
  onNext: () => void;
}) {
  const status = answer?.status ?? "not_started";
  const lapNumber = answer?.lap_number ?? 1;
  const percent = answer?.percent ?? 0;

  function canProceed(): boolean {
    return status === "not_started" || status === "completed" || (status === "in_progress" && lapNumber >= 1);
  }

  return (
    <div className="card flex flex-col gap-4">
      <p className="text-xs" style={{ color: "var(--muted)" }}>教材の進捗 {index + 1} / {total}</p>
      <p className="text-sm font-bold" style={{ color: "var(--text)" }}>
        このコースでは「{question.name}」を使います。今どのくらい進んでいますか？
      </p>
      <p className="text-xs" style={{ color: "var(--muted)" }}>完了条件：{question.target_laps}周</p>

      <div className="flex flex-wrap gap-2">
        {([
          { key: "not_started", label: "未着手" },
          { key: "in_progress", label: "途中" },
          { key: "completed", label: `${question.target_laps}周済み` },
        ] as const).map(opt => (
          <button key={opt.key}
            onClick={() => setAnswer({ status: opt.key, lap_number: lapNumber, percent })}
            className="px-3 py-2 rounded-full text-sm font-bold border transition-colors"
            style={{ borderColor: "var(--border)", background: status === opt.key ? "var(--ink)" : "var(--card)", color: status === opt.key ? "white" : "var(--text)" }}>
            {opt.label}
          </button>
        ))}
      </div>

      {status === "in_progress" && (
        <div className="flex flex-col gap-3">
          {question.target_laps > 1 && (
            <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--text)" }}>
              今、何周目ですか？
              <select value={lapNumber} onChange={e => setAnswer({ status, lap_number: Number(e.target.value), percent })}>
                {Array.from({ length: question.target_laps }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>{n}周目</option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--text)" }}>
            その周の進捗（約何%）
            <input type="number" min={0} max={100} value={percent}
              onChange={e => setAnswer({ status, lap_number: lapNumber, percent: Number(e.target.value) })} />
          </label>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={onNext} disabled={!canProceed()} className="btn-primary disabled:opacity-50">
          次へ
        </button>
      </div>
    </div>
  );
}
