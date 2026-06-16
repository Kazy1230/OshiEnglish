"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { ArticlePreviewModal } from "@/components/ArticlePreviewModal";
import {
  parseExerciseJsonInput,
  summarizeExerciseData,
  parseArticleGenerationOutput,
  buildBlogLLMPrompt,
  buildExercisePrompt,
  buildWritingFeedbackPrompt,
  buildSpeakingFeedbackPrompt,
  buildPersonalizedLLMPrompt,
  buildWelcomePagePrompt,
  buildTemplateArticlePrompt,
  buildEducationalArticlePrompt,
  buildArticleAdaptationPrompt,
  buildExerciseBodyPrompt,
  buildExerciseAdaptationPrompt,
  buildTemplateMaterialPrompt,
  buildTemplateAdaptationPrompt,
  getCustomerDisplayName,
} from "../lib/promptBuilders";
import { hasListeningAudio } from "@/lib/exercise";

const emptyArticleForm = {
  article_type: "request", customer_id: "", character_id: "", grammar_master_id: "", title: "", content: "", tips: "", example_sentences: "", status: "draft",
  // ----- 演習問題（exercise）専用 -----
  exercise_format: "multiple_choice", exercise_category: "", exercise_data_text: "",
  // 演習問題の細分類（reading/listening/speaking/writing）：記事管理画面の15カテゴリ表示用
  exercise_subcategory: "",
  // 記述式（written_response）専用：ライティング/スピーキングの区別（exercise_data.skillに格納）
  exercise_skill: "writing",
  // 依頼記事：元になった記事リクエストメッセージ（公開時にステータス自動更新に使う）
  request_message_id: "",
  // フィードバック記事：元になった添削リクエスト（公開時にステータス自動更新に使う）
  correction_request_id: "",
  // ウェルカムページ：対象キャラ（公式キャラ専用テンプレートの場合のみ指定／空欄は汎用テンプレート）
  template_character_id: "",
  // 開封コスト（任意・未入力時はサーバー側のデフォルト計算に従う）
  unlock_cost: "",
};

// 記事管理画面の15カテゴリ
const ARTICLE_CATEGORIES: { id: string; label: string }[] = [
  { id: "stock_grammar", label: "📦 ストック：文法・トピック（①記事）" },
  { id: "stock_reading", label: "📦 ストック：リーディング問題（②演習）" },
  { id: "stock_listening", label: "📦 ストック：リスニング問題（②演習）" },
  { id: "stock_template", label: "📦 ストック：定期便（④定期便）" },
  { id: "request", label: "✉️ 依頼記事" },
  { id: "blog", label: "📰 ブログ記事" },
  { id: "exercise_reading", label: "🧩 演習問題（リーディング）" },
  { id: "exercise_listening", label: "🎧 演習問題（リスニング）" },
  { id: "exercise_speaking", label: "🗣 演習問題（スピーキング）" },
  { id: "exercise_writing", label: "✍️ 演習問題（ライティング）" },
  { id: "writing_feedback", label: "📝 ライティングFB" },
  { id: "speaking_feedback", label: "🎤 スピーキングFB" },
  { id: "welcome_official", label: "👋 ウェルカムページ（公式・デフォルト）" },
  { id: "welcome_original", label: "👋 ウェルカムページ（オリキャラ）" },
  { id: "template_pool", label: "🗂 定期便プール" },
];

// 記事 → 15カテゴリのいずれかへの分類
function getArticleCategory(a: any, characters: any[]): string {
  switch (a.article_type) {
    case "request": return "request";
    case "blog": return "blog";
    case "writing_feedback": return "writing_feedback";
    case "speaking_feedback": return "speaking_feedback";
    case "template": return "template_pool";
    case "welcome": {
      if (!a.template_character_id) return "welcome_official";
      const ch = characters.find(c => c.id === a.template_character_id);
      return ch && ch.is_preset === false ? "welcome_original" : "welcome_official";
    }
    case "exercise": {
      if (a.exercise_subcategory) return `exercise_${a.exercise_subcategory}`;
      // レガシー記事（exercise_subcategory未設定）のフォールバック判定
      if (a.exercise_format === "written_response") {
        return a.exercise_data?.skill === "speaking" ? "exercise_speaking" : "exercise_writing";
      }
      return hasListeningAudio(a.exercise_data) ? "exercise_listening" : "exercise_reading";
    }
    default: return "request";
  }
}

// カテゴリ選択時に新規作成フォームへセットするデフォルト値
function categoryFormDefaults(categoryId: string): Partial<typeof emptyArticleForm> {
  switch (categoryId) {
    case "request": return { article_type: "request" };
    case "blog": return { article_type: "blog" };
    case "writing_feedback": return { article_type: "writing_feedback" };
    case "speaking_feedback": return { article_type: "speaking_feedback" };
    case "template_pool": return { article_type: "template" };
    case "welcome_official": return { article_type: "welcome" };
    case "welcome_original": return { article_type: "welcome" };
    case "exercise_reading": return { article_type: "exercise", exercise_format: "multiple_choice", exercise_subcategory: "reading" };
    case "exercise_listening": return { article_type: "exercise", exercise_format: "multiple_choice", exercise_subcategory: "listening" };
    case "exercise_speaking": return { article_type: "exercise", exercise_format: "written_response", exercise_subcategory: "speaking", exercise_skill: "speaking" };
    case "exercise_writing": return { article_type: "exercise", exercise_format: "written_response", exercise_subcategory: "writing", exercise_skill: "writing" };
    default: return {};
  }
}

export function ArticlesTab({ pendingCorrection, onConsumePendingCorrection, pendingArticleRequest, onConsumePendingArticleRequest, pendingWelcomePage, onConsumePendingWelcomePage }: {
  pendingCorrection?: any;
  onConsumePendingCorrection?: () => void;
  pendingArticleRequest?: any;
  onConsumePendingArticleRequest?: () => void;
  pendingWelcomePage?: any;
  onConsumePendingWelcomePage?: () => void;
} = {}) {
  const [articles, setArticles] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [characters, setCharacters] = useState<any[]>([]);
  const [grammars, setGrammars] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingArticle, setEditingArticle] = useState<any | null>(null);
  const [previewArticle, setPreviewArticle] = useState<any | null>(null);
  const [form, setForm] = useState(emptyArticleForm);
  // フィルター
  const [filterText, setFilterText] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCustomer, setFilterCustomer] = useState("");
  // ブログ記事LLMプロンプト用：オプションで特定の生徒を意識した文体を反映する
  const [blogPromptCustomerId, setBlogPromptCustomerId] = useState("");
  // 外部LLMの下書きをもとに作成したかどうか（コピー用プロンプト → 外部LLM → 貼り戻しのフローを使った場合にチェック）
  const [isLlmDrafted, setIsLlmDrafted] = useState(false);
  // リスニング演習問題：音声ファイルアップロード中フラグ
  const [audioUploading, setAudioUploading] = useState(false);
  // 依頼記事：選択中の顧客の対応中リクエスト一覧（紐付け選択用）
  const [openRequests, setOpenRequests] = useState<any[]>([]);
  // 添削記事作成：CorrectionsTabから引き渡された添削提出内容（LLMプロンプトに直接反映する）
  const [correctionSubmission, setCorrectionSubmission] = useState<any | null>(null);
  // スピーキング添削：音声/動画を運営が手動で文字起こしした結果（FBプロンプトの提出内容に使う）
  const [transcriptText, setTranscriptText] = useState("");
  const [transcriptSaving, setTranscriptSaving] = useState(false);
  // LLMの出力を貼り付けて「本文／例文／Tips」欄に反映するための一時テキスト
  const [genPasteText, setGenPasteText] = useState("");

  // ①記事作成2段階化：教育記事ストック（キャラ非依存の素材記事）
  const [articleTemplates, setArticleTemplates] = useState<any[]>([]);
  const [stockTopic, setStockTopic] = useState("");
  const [stockDifficulty, setStockDifficulty] = useState("medium");
  const [stockPasteText, setStockPasteText] = useState("");
  const [selectedArticleTemplateId, setSelectedArticleTemplateId] = useState("");

  // ②演習問題2段階化：問題本体ストック（キャラ非依存の問題本体）
  const [exerciseTemplates, setExerciseTemplates] = useState<any[]>([]);
  const [exStockCategory, setExStockCategory] = useState("");
  const [exStockDifficulty, setExStockDifficulty] = useState("medium");
  const [exStockTopic, setExStockTopic] = useState("");
  const [exStockPasteText, setExStockPasteText] = useState("");
  const [selectedExerciseTemplateId, setSelectedExerciseTemplateId] = useState("");
  const [exAdaptationPasteText, setExAdaptationPasteText] = useState("");

  // ④定期便プール2段階化：定期便素材ストック（キャラ非依存の素材記事）
  const [templateArticleTemplates, setTemplateArticleTemplates] = useState<any[]>([]);
  const [templateStockTopic, setTemplateStockTopic] = useState("");
  const [templateStockDifficulty, setTemplateStockDifficulty] = useState("medium");
  const [templateStockPasteText, setTemplateStockPasteText] = useState("");
  const [selectedTemplateStockId, setSelectedTemplateStockId] = useState("");
  const [templateAdaptCharacterId, setTemplateAdaptCharacterId] = useState("");
  const [templateAdaptationPasteText, setTemplateAdaptationPasteText] = useState("");

  // 記事管理：15カテゴリのうちどれを表示しているか
  const [selectedCategory, setSelectedCategory] = useState("request");

  const reload = () => Promise.all([api.adminGetArticles(), api.adminGetCustomers(), api.adminGetCharacters(), api.adminGetGrammarMasters(), api.adminListArticleTemplates(), api.adminListExerciseTemplates(), api.adminListTemplateArticleTemplates()])
    .then(([a, c, ch, g, at, et, tat]) => { setArticles(a); setCustomers(c); setCharacters(ch); setGrammars(g); setArticleTemplates(at); setExerciseTemplates(et); setTemplateArticleTemplates(tat); });

  // ①素材記事ストックに保存（第1段階のLLM出力を貼り付けて登録）
  async function saveArticleTemplate() {
    if (!stockTopic.trim()) { toast("トピックを入力してください", "error"); return; }
    if (!stockPasteText.trim()) { toast("LLMの出力を貼り付けてください", "error"); return; }
    try {
      const created = await api.adminCreateArticleTemplate({ topic: stockTopic.trim(), difficulty: stockDifficulty, content: stockPasteText.trim() });
      setArticleTemplates(prev => [created, ...prev]);
      setStockPasteText("");
      toast("教育記事ストックに保存しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "error");
    }
  }

  async function deleteArticleTemplate(id: number) {
    if (!confirm("このストックを削除しますか？")) return;
    try {
      await api.adminDeleteArticleTemplate(id);
      setArticleTemplates(prev => prev.filter(t => t.id !== id));
      toast("削除しました", "info");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "削除に失敗しました", "error");
    }
  }

  // ②問題本体ストックに保存（第1段階のLLM出力＝JSONを貼り付けて登録）
  async function saveExerciseTemplate(exerciseSubcategory: "reading" | "listening") {
    if (!exStockCategory.trim()) { toast("出題カテゴリを入力してください", "error"); return; }
    if (!exStockPasteText.trim()) { toast("LLMの出力を貼り付けてください", "error"); return; }
    let parsed: any;
    try {
      parsed = parseExerciseJsonInput(exStockPasteText);
    } catch {
      toast("JSONの解析に失敗しました。出力全体をそのまま貼り付けてください", "error");
      return;
    }
    try {
      const created = await api.adminCreateExerciseTemplate({ exercise_category: exStockCategory.trim(), exercise_subcategory: exerciseSubcategory, difficulty: exStockDifficulty, exercise_data: parsed });
      setExerciseTemplates(prev => [created, ...prev]);
      setExStockPasteText("");
      toast("問題本体ストックに保存しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "error");
    }
  }

  async function deleteExerciseTemplate(id: number) {
    if (!confirm("このストックを削除しますか？")) return;
    try {
      await api.adminDeleteExerciseTemplate(id);
      setExerciseTemplates(prev => prev.filter(t => t.id !== id));
      toast("削除しました", "info");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "削除に失敗しました", "error");
    }
  }

  // ④定期便素材ストックに保存（第1段階のLLM出力を貼り付けて登録）
  async function saveTemplateArticleTemplate() {
    if (!templateStockPasteText.trim()) { toast("LLMの出力を貼り付けてください", "error"); return; }
    const result = parseArticleGenerationOutput(templateStockPasteText);
    if (!result.content) { toast("LLMの出力を解析できませんでした。出力全体をそのまま貼り付けてください", "error"); return; }
    try {
      const created = await api.adminCreateTemplateArticleTemplate({
        topic: templateStockTopic.trim() || undefined,
        difficulty: templateStockDifficulty,
        content: result.content,
        example_sentences: result.example_sentences ? result.example_sentences.split("\n").filter(Boolean) : undefined,
        tips: result.tips ? result.tips.split("\n").filter(Boolean) : undefined,
      });
      setTemplateArticleTemplates(prev => [created, ...prev]);
      setTemplateStockPasteText("");
      toast("定期便ストックに保存しました", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "error");
    }
  }

  async function deleteTemplateArticleTemplate(id: number) {
    if (!confirm("このストックを削除しますか？")) return;
    try {
      await api.adminDeleteTemplateArticleTemplate(id);
      setTemplateArticleTemplates(prev => prev.filter(t => t.id !== id));
      toast("削除しました", "info");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "削除に失敗しました", "error");
    }
  }

  // ④定期便：選択中の定期便ストック＋キャラ適応出力を「本文／例文／Tips」欄に反映し、
  // 定期便プールとして保存できる状態にする
  function applyTemplateAdaptation() {
    const template = templateArticleTemplates.find(t => String(t.id) === selectedTemplateStockId);
    if (!template) { toast("先に定期便ストックを選択してください", "error"); return; }
    if (!templateAdaptationPasteText.trim()) { toast("キャラ適応LLMの出力を貼り付けてください", "error"); return; }
    const result = parseArticleGenerationOutput(templateAdaptationPasteText);
    if (!result.content && !result.example_sentences && !result.tips) {
      toast("LLMの出力を解析できませんでした。出力全体をそのまま貼り付けてください", "error");
      return;
    }
    setSelectedCategory("template_pool");
    setForm(f => ({
      ...f,
      ...categoryFormDefaults("template_pool"),
      character_id: templateAdaptCharacterId || f.character_id,
      title: f.title || (template.topic ? `定期便：${template.topic}` : f.title),
      content: result.content ?? f.content,
      example_sentences: result.example_sentences ?? f.example_sentences,
      tips: result.tips ?? f.tips,
    }));
    setShowForm(true);
    setTemplateAdaptationPasteText("");
    toast("定期便プールの作成フォームに反映しました。内容を確認して保存してください", "success");
  }

  // ②演習問題：選択中の問題本体ストック＋キャラ適応出力（解説・score_comments）をマージして
  // exercise_data_textに反映する
  function applyExerciseAdaptation() {
    const template = exerciseTemplates.find(t => String(t.id) === selectedExerciseTemplateId);
    if (!template) { toast("先に問題本体ストックを選択してください", "error"); return; }
    if (!exAdaptationPasteText.trim()) { toast("キャラ適応LLMの出力を貼り付けてください", "error"); return; }
    let adaptation: any;
    try {
      adaptation = parseExerciseJsonInput(exAdaptationPasteText);
    } catch {
      toast("JSONの解析に失敗しました。出力全体をそのまま貼り付けてください", "error");
      return;
    }
    const baseData = template.exercise_data || {};
    const baseQuestions = baseData.questions || [];
    const adaptedQuestions = adaptation.questions || [];
    const merged = {
      ...baseData,
      questions: baseQuestions.map((q: any, i: number) => ({ ...q, ...(adaptedQuestions[i] || {}) })),
      score_comments: adaptation.score_comments ?? baseData.score_comments,
    };
    setForm(f => ({ ...f, exercise_data_text: JSON.stringify(merged, null, 2) }));
    setExAdaptationPasteText("");
    toast(`問題本体ストック「${template.exercise_category}」に解説・コメントを反映しました`, "success");
  }

  useEffect(() => { reload().finally(() => setLoading(false)); }, []);

  // CorrectionsTabから「添削記事を作成」で遷移してきた場合、フォームに自動入力する
  useEffect(() => {
    if (!pendingCorrection) return;
    setForm(f => ({
      ...emptyArticleForm,
      article_type: pendingCorrection.correction_type === "writing" ? "writing_feedback" : "speaking_feedback",
      customer_id: String(pendingCorrection.customer_id),
      character_id: pendingCorrection.character_id ? String(pendingCorrection.character_id) : f.character_id,
      correction_request_id: String(pendingCorrection.id),
    }));
    setCorrectionSubmission(pendingCorrection);
    setTranscriptText(pendingCorrection.transcript || "");
    setShowForm(true);
    onConsumePendingCorrection?.();
  }, [pendingCorrection]);

  // OrdersTabから「記事を作成」で遷移してきた場合、フォームに自動入力する
  useEffect(() => {
    if (!pendingArticleRequest) return;
    const { order, request, targetCategory } = pendingArticleRequest;
    const cat = targetCategory ?? "request";
    setSelectedCategory(cat);
    const catDefaults = categoryFormDefaults(cat);
    setForm(f => ({
      ...emptyArticleForm,
      ...catDefaults,
      customer_id: order.customer_id ? String(order.customer_id) : "",
      character_id: order.customer_character_id ? String(order.customer_character_id) : f.character_id,
      request_message_id: request?.id ? String(request.id) : "",
    }));
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
    onConsumePendingArticleRequest?.();
  }, [pendingArticleRequest]);

  // OrdersTabから「ウェルカムページを作成」で遷移してきた場合、フォームに自動入力する
  useEffect(() => {
    if (!pendingWelcomePage) return;
    setForm(f => ({
      ...emptyArticleForm,
      article_type: "welcome",
      template_character_id: pendingWelcomePage.character_id ? String(pendingWelcomePage.character_id) : f.template_character_id,
    }));
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
    onConsumePendingWelcomePage?.();
  }, [pendingWelcomePage]);

  // 依頼記事フォームで顧客が選択されたら、その顧客の対応中リクエスト一覧を取得する
  useEffect(() => {
    if ((form.article_type === "request" || form.article_type === "exercise") && form.customer_id) {
      api.adminGetCustomerRequests(Number(form.customer_id)).then(setOpenRequests).catch(() => setOpenRequests([]));
    } else {
      setOpenRequests([]);
    }
  }, [form.article_type, form.customer_id]);

  function startEdit(a: any) {
    setEditingArticle(a);
    setForm({
      article_type: a.article_type ?? "request",
      customer_id: a.customer_id ? String(a.customer_id) : "",
      character_id: String(a.character_id),
      grammar_master_id: a.grammar_master_id ? String(a.grammar_master_id) : "",
      title: a.title,
      content: a.content,
      tips: (a.tips ?? []).join("\n"),
      example_sentences: (a.example_sentences ?? []).join("\n"),
      status: a.status,
      exercise_format: a.exercise_format ?? "multiple_choice",
      exercise_category: a.exercise_category ?? "",
      exercise_subcategory: a.exercise_subcategory ?? "",
      exercise_data_text: a.exercise_data ? JSON.stringify(a.exercise_data, null, 2) : "",
      exercise_skill: a.exercise_data?.skill === "speaking" ? "speaking" : "writing",
      request_message_id: a.request_message_id ? String(a.request_message_id) : "",
      correction_request_id: a.correction_request_id ? String(a.correction_request_id) : "",
      template_character_id: a.template_character_id ? String(a.template_character_id) : "",
      unlock_cost: a.unlock_cost != null ? String(a.unlock_cost) : "",
    });
    setSelectedCategory(getArticleCategory(a, characters));
    setCorrectionSubmission(null);
    setTranscriptText("");
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // カテゴリ選択時の新規作成フォーム初期値を組み立てる
  // welcome_original は「対象キャラ」必須（公式キャラのような汎用テンプレート選択肢が無い）ため、
  // 最初のオリキャラを自動選択しておく
  function formForCategory(cat: string) {
    const merged = { ...emptyArticleForm, ...categoryFormDefaults(cat) };
    if (cat === "welcome_original") {
      const original = characters.find(c => c.is_preset === false);
      if (original) merged.template_character_id = String(original.id);
    }
    return merged;
  }

  function cancelForm() {
    setShowForm(false);
    setEditingArticle(null);
    setForm(emptyArticleForm);
    setIsLlmDrafted(false);
    setCorrectionSubmission(null);
    setTranscriptText("");
    setGenPasteText("");
  }

  // 上のプロンプトコピー → 外部LLM → 貼り戻しのフローで得たLLMの出力を、
  // 「本文」「例文」「Tips」欄に反映する
  function applyGenPasteText() {
    if (!genPasteText.trim()) {
      toast("LLMの出力を貼り付けてください", "error");
      return;
    }
    const result = parseArticleGenerationOutput(genPasteText);
    if (!result.content && !result.example_sentences && !result.tips) {
      toast("LLMの出力を解析できませんでした。出力全体をそのまま貼り付けてください", "error");
      return;
    }
    setForm(f => ({
      ...f,
      ...(result.title           ? { title: result.title }                         : {}),
      ...(result.content         ? { content: result.content }                     : {}),
      ...(result.example_sentences ? { example_sentences: result.example_sentences } : {}),
      ...(result.tips            ? { tips: result.tips }                           : {}),
    }));
    setIsLlmDrafted(true);
    setGenPasteText("");
    toast("LLMの出力を反映しました", "success");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const isBlog = form.article_type === "blog";
    const isExercise = form.article_type === "exercise";
    const isFeedback = form.article_type === "writing_feedback" || form.article_type === "speaking_feedback";
    const isWelcome = form.article_type === "welcome";
    const isTemplate = form.article_type === "template";
    const payload: any = {
      article_type: form.article_type,
      // ウェルカムページ：「対象キャラ」が空欄（汎用テンプレート）の場合は、
      // 記事データ上の必須項目を埋めるための内部値として最初のキャラクターを使う
      // （顧客への表示には影響しない。表示上の紐付けは template_character_id で制御する）
      character_id: isWelcome
        ? Number(form.template_character_id || characters[0]?.id)
        : Number(form.character_id),
      title: form.title,
      content: form.content,
      status: form.status,
      tips: form.tips ? form.tips.split("\n").filter(Boolean) : [],
      example_sentences: form.example_sentences ? form.example_sentences.split("\n").filter(Boolean) : [],
      is_llm_drafted: isLlmDrafted,
    };
    if (isExercise) {
      payload.customer_id = Number(form.customer_id);
      payload.exercise_format = form.exercise_format;
      payload.exercise_category = form.exercise_category;
      payload.exercise_subcategory = form.exercise_subcategory;
      payload.request_message_id = form.request_message_id ? Number(form.request_message_id) : null;
      if (!form.exercise_data_text.trim()) {
        toast("演習問題データ（JSON）を入力・読み込みしてください", "error");
        return;
      }
      try {
        payload.exercise_data = parseExerciseJsonInput(form.exercise_data_text);
      } catch {
        toast("演習問題データのJSONを解析できませんでした。形式を確認してください", "error");
        return;
      }
      if (form.exercise_format === "written_response") {
        payload.exercise_data = { ...payload.exercise_data, skill: form.exercise_skill };
      }
    } else if (isTemplate) {
      // 定期便プール：customer_id等はサーバー側で自動的にクリアされる
    } else if (isFeedback) {
      // ライティング/スピーキングFB：顧客は必須、文法マスター不要
      payload.customer_id = Number(form.customer_id);
      if (form.correction_request_id) {
        payload.correction_request_id = Number(form.correction_request_id);
      }
    } else if (isWelcome) {
      if (form.customer_id) {
        // 対象顧客を指定した場合：テンプレートではなく、その顧客の本棚に直接届く個別ウェルカムページになる
        payload.customer_id = Number(form.customer_id);
      } else {
        // ウェルカムページ：対象キャラを指定した場合のみ公式キャラ専用テンプレートになる（空欄は汎用テンプレート）
        if (form.template_character_id) {
          payload.template_character_id = Number(form.template_character_id);
        } else if (editingArticle) {
          payload.clear_template_character_id = true;
        }
      }
    } else if (!isBlog) {
      payload.customer_id = Number(form.customer_id);
      payload.grammar_master_id = Number(form.grammar_master_id);
      payload.request_message_id = form.request_message_id ? Number(form.request_message_id) : null;
    }
    if (form.unlock_cost !== "") {
      payload.unlock_cost = Number(form.unlock_cost);
    }
    try {
      if (editingArticle) {
        await api.adminUpdateArticle(editingArticle.id, payload);
        toast("記事を保存しました", "success");
      } else {
        await api.adminCreateArticle(payload);
        toast("記事を作成しました", "success");
      }
      await reload();
      cancelForm();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "保存に失敗しました", "error");
    }
  }

  async function changeStatus(id: number, status: string) {
    try {
      const result = await api.adminUpdateArticle(id, { status });
      setArticles(prev => prev.map(a => a.id === id ? { ...a, status } : a));
      const label: Record<string, string> = { draft: "下書き", review: "確認中", published: "公開" };
      if (status === "published" && result?.notification_sent) {
        toast(`「${label[status]}」に変更しました ✅ 顧客への通知チャットを自動送信しました`, "success");
      } else {
        toast(`ステータスを「${label[status]}」に変更しました`, "success");
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "更新に失敗しました", "error");
    }
  }

  async function deleteArticle(id: number) {
    if (!confirm("この記事を削除しますか？")) return;
    try {
      await api.adminDeleteArticle(id);
      setArticles(prev => prev.filter(a => a.id !== id));
      toast("記事を削除しました", "info");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "削除に失敗しました", "error");
    }
  }

  const statusColor: Record<string, string> = { draft: "#f5f5f5", review: "#fff8e1", published: "#e8fdf0" };
  const statusLabel: Record<string, string> = { draft: "下書き", review: "確認中", published: "公開中" };

  // フィルタリング
  const filtered = articles.filter(a => {
    const matchText = !filterText ||
      a.title.toLowerCase().includes(filterText.toLowerCase()) ||
      (a.customer_name ?? "").toLowerCase().includes(filterText.toLowerCase()) ||
      (a.character_name ?? "").toLowerCase().includes(filterText.toLowerCase()) ||
      (a.grammar_topic ?? "").toLowerCase().includes(filterText.toLowerCase());
    const matchStatus = !filterStatus || a.status === filterStatus;
    const matchCustomer = !filterCustomer || String(a.customer_id) === filterCustomer;
    const matchCategory = getArticleCategory(a, characters) === selectedCategory;
    return matchText && matchStatus && matchCustomer && matchCategory;
  });

  const isStockCategory = selectedCategory.startsWith("stock_");

  if (loading) return <p style={{ color: "var(--muted)" }}>読み込み中…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h2 className="text-xl font-black" style={{ color: "var(--primary)" }}>📝 記事管理</h2>
        <div className="flex items-center gap-2">
          <select
            value={selectedCategory}
            onChange={e => {
              const cat = e.target.value;
              cancelForm();
              setSelectedCategory(cat);
              if (!cat.startsWith("stock_")) {
                setForm(formForCategory(cat));
              }
            }}>
            {ARTICLE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          {!isStockCategory && (
            <button className="btn-accent" onClick={() => {
              if (showForm) { cancelForm(); return; }
              setForm(formForCategory(selectedCategory));
              setShowForm(true);
            }}>
              {showForm ? "キャンセル" : "+ 新規記事"}
            </button>
          )}
        </div>
      </div>

      {selectedCategory === "stock_grammar" && (
        <div className="card mb-6 flex flex-col gap-4">
          <h3 className="font-bold" style={{ color: "var(--primary)" }}>📦 2段階生成ストック管理：文法・トピック（①記事）</h3>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            第1段階（キャラ非依存の素材）をまとめて作っておき、第2段階（キャラへの適応）で使い回すためのストックです。
            ここで作成したストックは、「依頼記事」作成フォームの「②キャラに適応プロンプトをコピー」で選択して利用します。
          </p>
          <div className="rounded-xl border-2 p-3 flex flex-col gap-2" style={{ borderColor: "var(--border)" }}>
            <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>📄 教育記事ストック（①記事作成・第1段階）</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input value={stockTopic} onChange={e => setStockTopic(e.target.value)} placeholder="トピック（例：関係代名詞）" />
              <select value={stockDifficulty} onChange={e => setStockDifficulty(e.target.value)}>
                <option value="easy">easy（初級）</option>
                <option value="medium">medium（中級）</option>
                <option value="hard">hard（上級）</option>
              </select>
            </div>
            <button type="button"
              className="text-xs font-bold py-2 px-3 rounded-xl border-2 transition-all hover:opacity-80 self-start"
              style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "var(--card-bg, #fff)" }}
              onClick={() => {
                navigator.clipboard.writeText(buildEducationalArticlePrompt(stockTopic.trim() || undefined, stockDifficulty));
                toast("第1段階（素材記事生成）プロンプトをコピーしました", "success");
              }}>
              📋 第1段階プロンプトをコピー
            </button>
            <textarea rows={5} value={stockPasteText} onChange={e => setStockPasteText(e.target.value)}
              placeholder="LLMの出力（CONTENT/EXAMPLES/TIPS）をここに貼り付け"
              style={{ fontFamily: "monospace", fontSize: "0.8rem" }} />
            <button type="button" className="btn-ghost text-xs py-1.5 px-3 self-start" onClick={saveArticleTemplate}>
              💾 ストックに保存
            </button>
            {articleTemplates.length > 0 && (
              <div className="flex flex-col gap-1 mt-1">
                {articleTemplates.map(t => (
                  <div key={t.id} className="flex items-center justify-between text-xs px-2 py-1 rounded-lg" style={{ background: "var(--bg)" }}>
                    <span>📄 {t.topic}（{t.difficulty}）#{t.id}</span>
                    <button className="text-xs px-2" style={{ color: "#c0392b" }} onClick={() => deleteArticleTemplate(t.id)}>削除</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {(selectedCategory === "stock_reading" || selectedCategory === "stock_listening") && (() => {
        const subcategory = selectedCategory === "stock_listening" ? "listening" : "reading";
        const label = selectedCategory === "stock_listening" ? "リスニング" : "リーディング";
        const filteredExerciseTemplates = exerciseTemplates.filter(t => t.exercise_subcategory === subcategory);
        return (
          <div className="card mb-6 flex flex-col gap-4">
            <h3 className="font-bold" style={{ color: "var(--primary)" }}>📦 2段階生成ストック管理：{label}問題（②演習）</h3>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              第1段階（キャラ非依存の問題本体）をまとめて作っておき、第2段階（キャラへの適応）で使い回すためのストックです。
              ここで作成したストックは、「演習問題（{label}）」作成フォームの「②キャラに適応プロンプトをコピー」で選択して利用します。
            </p>
            <div className="rounded-xl border-2 p-3 flex flex-col gap-2" style={{ borderColor: "var(--border)" }}>
              <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>🧩 問題本体ストック（②演習問題・第1段階）</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input value={exStockCategory} onChange={e => setExStockCategory(e.target.value)} placeholder="出題カテゴリ（例：TOEIC Part 5）" />
                <select value={exStockDifficulty} onChange={e => setExStockDifficulty(e.target.value)}>
                  <option value="easy">easy（初級）</option>
                  <option value="medium">medium（中級）</option>
                  <option value="hard">hard（上級）</option>
                </select>
                <input value={exStockTopic} onChange={e => setExStockTopic(e.target.value)} placeholder="トピック（任意）" />
              </div>
              <button type="button"
                className="text-xs font-bold py-2 px-3 rounded-xl border-2 transition-all hover:opacity-80 self-start"
                style={{ borderColor: "#7b5cff", color: "#7b5cff", background: "var(--card-bg, #fff)" }}
                onClick={() => {
                  navigator.clipboard.writeText(buildExerciseBodyPrompt(exStockCategory.trim() || undefined, exStockDifficulty, exStockTopic.trim() || undefined));
                  toast("第1段階（問題本体生成）プロンプトをコピーしました", "success");
                }}>
                📋 第1段階プロンプトをコピー
              </button>
              <textarea rows={6} value={exStockPasteText} onChange={e => setExStockPasteText(e.target.value)}
                placeholder="LLMの出力（JSON：instructions/questions等）をここに貼り付け"
                style={{ fontFamily: "monospace", fontSize: "0.8rem" }} />
              <button type="button" className="btn-ghost text-xs py-1.5 px-3 self-start"
                onClick={() => saveExerciseTemplate(subcategory)}>
                💾 ストックに保存
              </button>
              {filteredExerciseTemplates.length > 0 && (
                <div className="flex flex-col gap-1 mt-1">
                  {filteredExerciseTemplates.map(t => (
                    <div key={t.id} className="flex items-center justify-between text-xs px-2 py-1 rounded-lg" style={{ background: "var(--bg)" }}>
                      <span>🧩 {t.exercise_category}（{t.difficulty}・{(t.exercise_data?.questions ?? []).length}問）#{t.id}</span>
                      <button className="text-xs px-2" style={{ color: "#c0392b" }} onClick={() => deleteExerciseTemplate(t.id)}>削除</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {selectedCategory === "stock_template" && (
        <div className="card mb-6 flex flex-col gap-4">
          <h3 className="font-bold" style={{ color: "var(--primary)" }}>📦 2段階生成ストック管理：定期便（④定期便）</h3>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            第1段階（キャラ非依存の素材）をまとめて作っておき、第2段階（キャラへの適応）で「定期便プール」に登録するためのストックです。
          </p>
          <div className="rounded-xl border-2 p-3 flex flex-col gap-2" style={{ borderColor: "var(--border)" }}>
            <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>📄 定期便ストック（①素材生成・第1段階）</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input value={templateStockTopic} onChange={e => setTemplateStockTopic(e.target.value)} placeholder="トピック（任意・例：道案内の表現）" />
              <select value={templateStockDifficulty} onChange={e => setTemplateStockDifficulty(e.target.value)}>
                <option value="easy">easy（初級）</option>
                <option value="medium">medium（中級）</option>
                <option value="hard">hard（上級）</option>
              </select>
            </div>
            <button type="button"
              className="text-xs font-bold py-2 px-3 rounded-xl border-2 transition-all hover:opacity-80 self-start"
              style={{ borderColor: "#8e44ad", color: "#8e44ad", background: "var(--card-bg, #fff)" }}
              onClick={() => {
                navigator.clipboard.writeText(buildTemplateMaterialPrompt(templateStockTopic.trim() || undefined, templateStockDifficulty));
                toast("第1段階（定期便素材生成）プロンプトをコピーしました", "success");
              }}>
              📋 第1段階プロンプトをコピー
            </button>
            <textarea rows={5} value={templateStockPasteText} onChange={e => setTemplateStockPasteText(e.target.value)}
              placeholder="LLMの出力（CONTENT/EXAMPLES/TIPS）をここに貼り付け"
              style={{ fontFamily: "monospace", fontSize: "0.8rem" }} />
            <button type="button" className="btn-ghost text-xs py-1.5 px-3 self-start" onClick={saveTemplateArticleTemplate}>
              💾 ストックに保存
            </button>
            {templateArticleTemplates.length > 0 && (
              <div className="flex flex-col gap-1 mt-1">
                {templateArticleTemplates.map(t => (
                  <div key={t.id} className="flex items-center justify-between text-xs px-2 py-1 rounded-lg" style={{ background: "var(--bg)" }}>
                    <span>📄 {t.topic || "（トピック未設定）"}（{t.difficulty}）#{t.id}</span>
                    <button className="text-xs px-2" style={{ color: "#c0392b" }} onClick={() => deleteTemplateArticleTemplate(t.id)}>削除</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border-2 p-3 flex flex-col gap-2" style={{ borderColor: "#8e44ad" }}>
            <p className="text-sm font-bold" style={{ color: "#8e44ad" }}>🏭 2段階生成：定期便ストックからキャラに適応</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select value={selectedTemplateStockId} onChange={e => setSelectedTemplateStockId(e.target.value)}>
                <option value="">定期便ストックを選択…</option>
                {templateArticleTemplates.map(t => (
                  <option key={t.id} value={t.id}>📄 {t.topic || "（トピック未設定）"}（{t.difficulty}）#{t.id}</option>
                ))}
              </select>
              <select value={templateAdaptCharacterId} onChange={e => setTemplateAdaptCharacterId(e.target.value)}>
                <option value="">キャラクターを選択…</option>
                {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <button type="button"
              className="text-xs font-bold py-2 px-3 rounded-xl border-2 transition-all hover:opacity-80 self-start"
              style={{ borderColor: "#8e44ad", color: "#8e44ad", background: "var(--card-bg, #fff)" }}
              disabled={!templateAdaptCharacterId || !selectedTemplateStockId}
              onClick={() => {
                const c = characters.find(ch => String(ch.id) === templateAdaptCharacterId);
                const template = templateArticleTemplates.find(t => String(t.id) === selectedTemplateStockId);
                if (!c || !template) { toast("キャラクターと定期便ストックを選択してください", "error"); return; }
                navigator.clipboard.writeText(buildTemplateAdaptationPrompt(
                  c,
                  template.content,
                  (template.example_sentences ?? []).join("\n"),
                  (template.tips ?? []).join("\n"),
                  template.topic ?? undefined,
                ));
                toast("第2段階（キャラ適応）プロンプトをコピーしました", "success");
              }}>
              📋 第2段階プロンプトをコピー
              {(!templateAdaptCharacterId || !selectedTemplateStockId) && "（先にキャラクターとストックを選択）"}
            </button>
            <textarea rows={5} value={templateAdaptationPasteText} onChange={e => setTemplateAdaptationPasteText(e.target.value)}
              placeholder="キャラ適応LLMの出力（CONTENT/EXAMPLES/TIPS）をここに貼り付け"
              style={{ fontFamily: "monospace", fontSize: "0.8rem" }} />
            <button type="button" className="btn-ghost text-xs py-1.5 px-3 self-start" onClick={applyTemplateAdaptation}>
              ✅ 定期便プールの作成フォームに反映する
            </button>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              反映すると「定期便プール」カテゴリの新規作成フォームが開き、本文・例文・Tips・キャラクターが自動入力されます。内容を確認して保存してください。
            </p>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card mb-6 flex flex-col gap-3">
          <h3 className="font-bold" style={{ color: "var(--primary)" }}>
            {editingArticle ? `📝 記事編集：${editingArticle.title}` : "新規記事作成"}
          </h3>

          {/* カテゴリの説明 */}
          <div>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {selectedCategory === "blog"
                ? "ブログ記事：特定の顧客向けではなく、キャラクターが趣味で書いている体の簡易記事です。記事閲覧画面のサイドバーに紹介され、世界観の演出に使われます（顧客・文法マスターの指定は不要）。"
                : selectedCategory === "exercise_reading"
                ? "演習問題（リーディング）：選択式の読解問題です。解答後すぐに自動採点・解説表示されます。"
                : selectedCategory === "exercise_listening"
                ? "演習問題（リスニング）：選択式のリスニング問題です。解答後すぐに自動採点・解説表示されます。"
                : selectedCategory === "exercise_speaking"
                ? "演習問題（スピーキング）：記述式（音声/動画提出）の問題です。提出された解答はキャラクターへのチャットとして送られ、運営が手動でスピーキングFBを作成します。"
                : selectedCategory === "exercise_writing"
                ? "演習問題（ライティング）：記述式（テキスト提出）の問題です。提出された解答はキャラクターへのチャットとして送られ、運営が手動でライティングFBを作成します。"
                : selectedCategory === "writing_feedback"
                ? "ライティングFB：記述式演習で提出されたライティング答案に対するキャラクターからのフィードバック記事です。採点・添削結果を顧客の本棚に届けます（文法マスター・演習データは不要）。"
                : selectedCategory === "speaking_feedback"
                ? "スピーキングFB：記述式演習で提出されたスピーキング音声・テキストに対するキャラクターからのフィードバック記事です。評価・改善アドバイスを顧客の本棚に届けます（文法マスター・演習データは不要）。"
                : selectedCategory === "welcome_official"
                ? "ウェルカムページ（公式・デフォルト）：新規登録した顧客の本棚に最初に届くテンプレート記事です。「対象キャラ」を公式キャラに指定するとその顧客専用、空欄のまま保存すると汎用テンプレートになります。"
                : selectedCategory === "welcome_original"
                ? "ウェルカムページ（オリキャラ）：キャラビルダーで作成したオリジナルキャラクターが割り当てられた顧客に届くウェルカムページです。「対象キャラ」でオリジナルキャラを選択してください。"
                : selectedCategory === "template_pool"
                ? "定期便プール：customer_idを指定せずに保管する「特別記事」のひな形です。3〜5日に1本のランダムな間隔で、各顧客の本棚に無料で自動配布されます（開封には50クレジット必要・unlock_costで変更可）。"
                : "依頼記事：特定の顧客からの依頼に応じて作成する、通常の文法解説記事です。"}
              {editingArticle && "（カテゴリは作成後に変更できません）"}
            </p>
            {(form.article_type === "request" || form.article_type === "blog" || form.article_type === "exercise") && (
              <label className="mt-2 flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
                <input type="checkbox" checked={isLlmDrafted} onChange={e => setIsLlmDrafted(e.target.checked)} />
                外部LLMの下書きをもとに作成した（コピー用プロンプトを使って生成 → 確認・編集して入力）
              </label>
            )}
            {form.article_type === "blog" && (
              <div className="mt-2 flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="text-xs font-medium flex-shrink-0" style={{ color: "var(--muted)" }}>
                    👤 対象生徒（省略可）
                  </label>
                  <select
                    className="text-xs flex-1 min-w-0"
                    style={{ minWidth: "10rem", maxWidth: "16rem" }}
                    value={blogPromptCustomerId}
                    onChange={e => setBlogPromptCustomerId(e.target.value)}>
                    <option value="">指定なし（汎用プロンプト）</option>
                    {customers.filter(c => !c.is_admin).map(c => (
                      <option key={c.id} value={c.id}>
                        {c.username}{c.intimacy ? ` 💗Lv${c.intimacy.level}「${c.intimacy.stage_label}」` : ""}
                      </option>
                    ))}
                  </select>
                  {blogPromptCustomerId && (() => {
                    const cu = customers.find(c => String(c.id) === blogPromptCustomerId);
                    return cu ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: "var(--accent)", color: "white" }}>
                        💗 Lv{cu.intimacy?.level ?? 0}「{cu.intimacy?.stage_label ?? "敬語期"}」反映
                      </span>
                    ) : null;
                  })()}
                </div>
                <button type="button"
                  className="text-xs font-bold py-2 px-3 rounded-xl border-2 transition-all hover:opacity-80 self-start"
                  style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "var(--card-bg, #fff)" }}
                  disabled={!form.character_id}
                  onClick={() => {
                    const c = characters.find(ch => String(ch.id) === String(form.character_id));
                    if (!c) { toast("先にキャラクターを選択してください", "error"); return; }
                    const cu = blogPromptCustomerId ? customers.find(cs => String(cs.id) === blogPromptCustomerId) : undefined;
                    const theme = window.prompt("今回のブログのテーマ・お題を入力してください（空欄でもOK）", "") || undefined;
                    navigator.clipboard.writeText(buildBlogLLMPrompt(c, theme, cu));
                    const lvMsg = cu?.intimacy ? `💗 Lv${cu.intimacy.level}「${cu.intimacy.stage_label}」の距離感を反映` : "汎用プロンプトをコピー";
                    toast(`ブログ用LLMプロンプトをコピーしました — ${lvMsg}`, "success");
                  }}>
                  📋 ブログ用LLMプロンプトをコピー
                  {!form.character_id
                    ? "（先にキャラクターを選択）"
                    : blogPromptCustomerId
                      ? (() => { const cu = customers.find(c => String(c.id) === blogPromptCustomerId); return cu?.intimacy ? ` — 💗 Lv${cu.intimacy.level}「${cu.intimacy.stage_label}」` : ""; })()
                      : " — 汎用"}
                </button>
              </div>
            )}
            {form.article_type === "exercise" && (
              <div className="mt-2 flex flex-col gap-3">
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>顧客（誰の本棚に届けるか）</label>
                  <select value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })} required>
                    <option value="">選択してください</option>
                    {customers.filter(c => !c.is_admin).map(c => <option key={c.id} value={c.id}>{c.username}</option>)}
                  </select>
                </div>
                {(selectedCategory === "exercise_speaking" || selectedCategory === "exercise_writing") && (
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    顧客が解答を提出すると、{selectedCategory === "exercise_speaking" ? "スピーキング" : "ライティング"}の添削リクエストが自動作成され、添削タブ・このタブのFB作成画面に連携されます。
                  </p>
                )}
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>
                    出題カテゴリ（料金・メニュー表に対応／例：「TOEIC Part 5」「英検2級 ライティング」「IELTS Reading Academic」）
                  </label>
                  <input value={form.exercise_category} onChange={e => setForm({ ...form, exercise_category: e.target.value })}
                    placeholder="例：TOEIC Part 5" />
                </div>
                <button type="button"
                  className="text-xs font-bold py-2 px-3 rounded-xl border-2 transition-all hover:opacity-80 self-start"
                  style={{ borderColor: "#7b5cff", color: "#7b5cff", background: "var(--card-bg, #fff)" }}
                  disabled={!form.character_id}
                  onClick={() => {
                    const c = characters.find(ch => String(ch.id) === String(form.character_id));
                    const cu = form.customer_id ? customers.find(cs => String(cs.id) === String(form.customer_id)) : undefined;
                    if (!c) { toast("先にキャラクターを選択してください", "error"); return; }
                    const topic = window.prompt("追加で指定したいトピック・希望があれば入力してください（空欄でもOK）", "") || undefined;
                    navigator.clipboard.writeText(buildExercisePrompt(c, form.exercise_format as any, form.exercise_category || undefined, topic, cu));
                    const lvLabel = cu?.intimacy ? `💗 Lv${cu.intimacy.level}「${cu.intimacy.stage_label}」を反映` : "（顧客を選択すると親密度も反映されます）";
                    toast(`演習問題作成用LLMプロンプトをコピーしました — ${lvLabel}`, "success");
                  }}>
                  📋 演習問題作成用LLMプロンプトをコピー
                  {!form.character_id
                    ? "（先にキャラクターを選択）"
                    : (() => { const cu = customers.find(cs => String(cs.id) === String(form.customer_id)); return cu?.intimacy ? ` — 💗 Lv${cu.intimacy.level}「${cu.intimacy.stage_label}」` : ""; })()}
                </button>
                {form.exercise_format === "multiple_choice" && (
                  <div className="rounded-xl border-2 p-3 flex flex-col gap-2" style={{ borderColor: "#7b5cff" }}>
                    <p className="text-xs font-bold" style={{ color: "#7b5cff" }}>
                      🏭 2段階生成：問題本体ストックからキャラに適応
                    </p>
                    <select value={selectedExerciseTemplateId} onChange={e => setSelectedExerciseTemplateId(e.target.value)}>
                      <option value="">問題本体ストックを選択…</option>
                      {exerciseTemplates.filter(t => t.exercise_subcategory === form.exercise_subcategory).map(t => (
                        <option key={t.id} value={t.id}>
                          🧩 {t.exercise_category}（{t.difficulty}・{(t.exercise_data?.questions ?? []).length}問）#{t.id}
                        </option>
                      ))}
                    </select>
                    <button type="button"
                      className="text-xs font-bold py-2 px-3 rounded-xl border-2 transition-all hover:opacity-80 self-start"
                      style={{ borderColor: "#7b5cff", color: "#7b5cff", background: "var(--card-bg, #fff)" }}
                      disabled={!form.character_id || !selectedExerciseTemplateId}
                      onClick={() => {
                        const c = characters.find(ch => String(ch.id) === String(form.character_id));
                        const cu = form.customer_id ? customers.find(cs => String(cs.id) === String(form.customer_id)) : undefined;
                        const template = exerciseTemplates.find(t => String(t.id) === selectedExerciseTemplateId);
                        if (!c || !template) { toast("キャラクターと問題本体ストックを選択してください", "error"); return; }
                        navigator.clipboard.writeText(buildExerciseAdaptationPrompt(c, cu, template.exercise_data, template.exercise_category));
                        toast("第2段階（キャラ適応）プロンプトをコピーしました", "success");
                      }}>
                      📋 第2段階プロンプトをコピー
                      {(!form.character_id || !selectedExerciseTemplateId) && "（先にキャラクターとストックを選択）"}
                    </button>
                    <textarea rows={5} value={exAdaptationPasteText} onChange={e => setExAdaptationPasteText(e.target.value)}
                      placeholder="キャラ適応LLMの出力（JSON：questions[].explanation_*, score_comments）をここに貼り付け"
                      style={{ fontFamily: "monospace", fontSize: "0.8rem" }} />
                    <button type="button" className="btn-ghost text-xs py-1.5 px-3 self-start" onClick={applyExerciseAdaptation}>
                      ✅ 問題本体に反映する
                    </button>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      問題本体ストックの questions（prompt/choices/correct_index、音声情報含む）に、
                      キャラ適応LLMが生成した解説・score_commentsをマージして「演習問題データ」欄に出力します。
                    </p>
                  </div>
                )}
                {selectedCategory === "exercise_listening" && (
                  <div className="rounded-xl border-2 p-3 flex flex-col gap-2" style={{ borderColor: "var(--border)" }}>
                    <p className="text-xs font-bold" style={{ color: "var(--primary)" }}>
                      🎧 リスニング音声
                    </p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      音声ファイル（mp3/wav/m4a/webm/ogg）をアップロードすると、貼り付け用のコードがクリップボードにコピーされます。
                      <br />
                      ・設問全体で共通の音声 → 下のJSONの <code>audio_url</code> にURL部分だけ貼り付け
                      <br />
                      ・設問ごとに別音声 → 各 <code>questions[].audio_url</code> にURL部分だけ貼り付け
                      <br />
                      ・<code>instructions</code>（リスニング本文）や <code>questions[].prompt</code> の好きな位置に音声を置きたい場合 →
                      コピーされた <code>{"[[audio:URL]]"}</code> をそのテキスト中の置きたい場所にそのまま貼り付けてください
                      （その位置に音声プレーヤーが表示されます。<code>{"[[audio:URL|ラベルA]]"}</code> のように <code>|</code> でラベルを付けることもできます）。
                    </p>
                    <input type="file" accept="audio/*" disabled={audioUploading}
                      onChange={async e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setAudioUploading(true);
                        try {
                          const res = await api.adminUploadExerciseAudio(file);
                          await navigator.clipboard.writeText(`[[audio:${res.audio_url}]]`).catch(() => {});
                          toast(`音声をアップロードしました（[[audio:${res.audio_url}]] をコピーしました）`, "success");
                        } catch (err: unknown) {
                          toast(err instanceof Error ? err.message : "音声のアップロードに失敗しました", "error");
                        } finally {
                          setAudioUploading(false);
                          e.target.value = "";
                        }
                      }} />
                    {audioUploading && <p className="text-xs" style={{ color: "var(--muted)" }}>アップロード中…</p>}
                  </div>
                )}
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>
                    演習問題データ（LLMが出力したJSONをそのまま貼り付けてください。コードブロック付きでもOK）
                  </label>
                  <textarea rows={10} value={form.exercise_data_text}
                    onChange={e => setForm({ ...form, exercise_data_text: e.target.value })}
                    placeholder={form.exercise_format === "multiple_choice"
                      ? '{\n  "instructions": "...（リーディングの長文や、リスニングのパート説明文。[[audio:URL]] を文中に置くとその位置に音声プレーヤーが表示される）",\n  "audio_url": "/static/exercise_audio/xxxxx.mp3",\n  "listening_script": "（リスニング問題の場合：音声のスクリプト。解答後に確認用として表示）",\n  "questions": [\n    { "prompt": "...（[[audio:URL]] を埋め込むことも可能）", "choices": ["A","B","C","D"], "correct_index": 0,\n      "explanation_correct": "（正解した生徒向けの解説）...",\n      "explanation_incorrect": "（不正解だった生徒向けの解説）..." }\n  ],\n  "score_comments": {\n    "perfect": "（満点だった生徒へのひとこと）...",\n    "good": "（半分以上正解の生徒へのひとこと）...",\n    "encourage": "（半分未満の生徒へのひとこと）..."\n  }\n}'
                      : '{\n  "instructions": "...",\n  "prompt": "...",\n  "evaluation_notes": "..."\n}'}
                    style={{ fontFamily: "monospace", fontSize: "0.8rem" }} />
                  <div className="flex items-center gap-3 mt-1.5">
                    <button type="button" className="btn-ghost text-xs py-1.5 px-3"
                      onClick={() => {
                        if (!form.exercise_data_text.trim()) { toast("先にJSONを貼り付けてください", "error"); return; }
                        try {
                          const parsed = parseExerciseJsonInput(form.exercise_data_text);
                          setForm({ ...form, exercise_data_text: JSON.stringify(parsed, null, 2) });
                          const summary = summarizeExerciseData(form.exercise_format, parsed);
                          toast(`JSONを読み込みました：${summary}`, "success");
                        } catch {
                          toast("JSONの解析に失敗しました。コードブロックの中身がJSONとして正しいか確認してください", "error");
                        }
                      }}>
                      🔍 JSONを検証・整形する
                    </button>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      ※選択式は questions（質問・選択肢・正解、および正解時用 explanation_correct／不正解時用 explanation_incorrect の解説）、
                      記述式は prompt（お題）と evaluation_notes（評価観点メモ）を含むJSONが必要です。
                      解説を正解・不正解で出し分けることで、採点結果に応じてキャラクターの反応が変わり、世界観を保てます。
                      リスニング問題の場合は、上でアップロードした音声のURLを <code>audio_url</code>（設問ごとに音声が異なる場合は各
                      <code>questions[].audio_url</code>）に設定し、音声のスクリプトを <code>listening_script</code> に入れると、
                      生徒は音声を聞いて解答し、採点後にスクリプトで確認できます。
                      パート分けされた長いリスニング問題など、本文中の特定の位置に音声を置きたい場合は、
                      <code>instructions</code> や <code>questions[].prompt</code> の文中に <code>{"[[audio:URL]]"}</code> を直接書き込んでください。
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── フィードバック記事（ライティング / スピーキング）専用セクション ── */}
          {(form.article_type === "writing_feedback" || form.article_type === "speaking_feedback") && (
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>
                  顧客（誰の本棚に届けるか）
                </label>
                <select value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })} required>
                  <option value="">選択してください</option>
                  {customers.filter(c => !c.is_admin).map(c => (
                    <option key={c.id} value={c.id}>
                      {c.username}{c.intimacy ? ` 💗Lv${c.intimacy.level}「${c.intimacy.stage_label}」` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <button type="button"
                  className="text-xs font-bold py-2 px-3 rounded-xl border-2 transition-all hover:opacity-80 self-start"
                  style={{ borderColor: form.article_type === "writing_feedback" ? "#e67e22" : "#16a085", color: form.article_type === "writing_feedback" ? "#e67e22" : "#16a085", background: "var(--card-bg, #fff)" }}
                  disabled={!form.character_id}
                  onClick={async () => {
                    const c = characters.find(ch => String(ch.id) === String(form.character_id));
                    const cu = form.customer_id ? customers.find(cs => String(cs.id) === String(form.customer_id)) : undefined;
                    if (!c) { toast("先にキャラクターを選択してください", "error"); return; }
                    let originalPrompt: string | undefined;
                    let submission: string | undefined;
                    if (correctionSubmission) {
                      if (correctionSubmission.source_article_title || correctionSubmission.source_article_prompt) {
                        originalPrompt = [correctionSubmission.source_article_title, correctionSubmission.source_article_prompt]
                          .filter(Boolean).join("\n\n") || undefined;
                      }
                      if (form.article_type === "speaking_feedback") {
                        // スピーキングは音声/動画そのものをLLMに渡せないため、運営が手動で文字起こしした内容を使う
                        submission = transcriptText.trim() || undefined;
                        if (!submission && correctionSubmission.note) submission = correctionSubmission.note;
                        if (!submission) {
                          toast("文字起こしを入力・保存してから実行してください", "error");
                          return;
                        }
                      } else {
                        submission = correctionSubmission.text_content || undefined;
                      }
                    } else {
                      originalPrompt = window.prompt("【任意】元の演習問題のお題・設問文を貼り付けてください（空欄でもOK）", "") || undefined;
                      submission = window.prompt(
                        form.article_type === "writing_feedback"
                          ? "顧客が提出したライティングの答案を貼り付けてください（空欄でもOK）"
                          : "顧客が提出したスピーキングのテキスト／メモを貼り付けてください（空欄でもOK）",
                        ""
                      ) || undefined;
                    }
                    const promptText = form.article_type === "writing_feedback"
                      ? buildWritingFeedbackPrompt(c, cu, originalPrompt, submission)
                      : buildSpeakingFeedbackPrompt(c, cu, originalPrompt, submission);
                    navigator.clipboard.writeText(promptText);
                    const typeLabel = form.article_type === "writing_feedback" ? "ライティングFB" : "スピーキングFB";
                    const lvLabel = cu?.intimacy ? `💗 Lv${cu.intimacy.level}「${cu.intimacy.stage_label}」を反映` : "（顧客を選択すると親密度も反映されます）";
                    toast(`${typeLabel}用LLMプロンプトをコピーしました — ${lvLabel}`, "success");
                  }}>
                  📋 {form.article_type === "writing_feedback" ? "ライティングFB" : "スピーキングFB"}用LLMプロンプトをコピー
                  {!form.character_id
                    ? "（先にキャラクターを選択）"
                    : (() => { const cu = customers.find(cs => String(cs.id) === String(form.customer_id)); return cu?.intimacy ? ` — 💗 Lv${cu.intimacy.level}「${cu.intimacy.stage_label}」` : ""; })()}
                </button>
                {correctionSubmission ? (
                  <div className="text-xs p-2 rounded-lg flex flex-col gap-2" style={{ background: "var(--bg)", color: "var(--muted)" }}>
                    <div>
                      <p className="font-bold mb-1" style={{ color: "var(--primary)" }}>添削提出内容を自動反映します</p>
                      {(correctionSubmission.source_article_title || correctionSubmission.source_article_prompt) && (
                        <div className="mb-1.5 p-1.5 rounded" style={{ background: "var(--card-bg, #fff)" }}>
                          <p className="font-bold" style={{ color: "var(--accent, var(--primary))" }}>📝 元のお題（{correctionSubmission.source_article_title}）</p>
                          {correctionSubmission.source_article_prompt && (
                            <p className="whitespace-pre-wrap">{correctionSubmission.source_article_prompt}</p>
                          )}
                        </div>
                      )}
                      {correctionSubmission.text_content && (
                        <p className="whitespace-pre-wrap">{correctionSubmission.text_content}</p>
                      )}
                      {correctionSubmission.media_url && (
                        correctionSubmission.media_type === "video" ? (
                          <video controls src={correctionSubmission.media_url} className="w-full rounded-lg max-h-48 mt-1" />
                        ) : (
                          <audio controls src={correctionSubmission.media_url} className="w-full mt-1" />
                        )
                      )}
                      {correctionSubmission.note && (
                        <p className="mt-1"><strong>メモ：</strong>{correctionSubmission.note}</p>
                      )}
                    </div>
                    {form.article_type === "speaking_feedback" && (
                      <div>
                        <label className="text-xs font-bold block mb-1" style={{ color: "var(--primary)" }}>
                          🎙️ 文字起こし（音声/動画を運営が手動で書き起こした内容を貼り付けてください）
                        </label>
                        <textarea rows={5} value={transcriptText} onChange={e => setTranscriptText(e.target.value)}
                          placeholder="ここに音声/動画の文字起こしを貼り付けてください…"
                          className="w-full text-xs rounded-lg px-2 py-1.5 outline-none"
                          style={{ border: "1px solid var(--border)", background: "var(--card-bg, #fff)", color: "var(--text)" }} />
                        <button type="button" className="btn-ghost text-xs py-1 px-2 mt-1" disabled={transcriptSaving}
                          onClick={async () => {
                            setTranscriptSaving(true);
                            try {
                              const updated = await api.adminUpdateCorrectionTranscript(correctionSubmission.id, transcriptText);
                              setCorrectionSubmission(updated);
                              toast("文字起こしを保存しました", "success");
                            } catch (err: unknown) {
                              toast(err instanceof Error ? err.message : "文字起こしの保存に失敗しました", "error");
                            } finally {
                              setTranscriptSaving(false);
                            }
                          }}>
                          {transcriptSaving ? "保存中…" : "💾 文字起こしを保存"}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs mt-1.5" style={{ color: "var(--muted)" }}>
                    ボタンを押すと「元のお題」と「顧客の提出答案」を入力するダイアログが開き、
                    キャラクターの世界観・<strong>現在の親密度レベルに応じた距離感</strong>を織り込んだフィードバック生成プロンプトをクリップボードにコピーします。
                    LLMの出力を「本文」欄に貼り付けてください。
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── ウェルカムページ専用セクション ── */}
          {form.article_type === "welcome" && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>
                  対象キャラ{selectedCategory === "welcome_official" ? "（キャラ専用テンプレートにする場合のみ選択）" : "（オリキャラ専用ウェルカムページの対象キャラ）"}
                </label>
                <button
                  type="button"
                  className="text-xs px-2 py-0.5 rounded-lg border transition-all hover:shadow flex-shrink-0"
                  style={{ borderColor: "var(--border)", color: "var(--accent)" }}
                  onClick={() => {
                    const char = characters.find(c => String(c.id) === form.template_character_id);
                    navigator.clipboard.writeText(buildWelcomePagePrompt(char));
                    toast(char ? `「${char.name}」向けウェルカムページ作成プロンプトをコピーしました` : "汎用ウェルカムページ作成プロンプトをコピーしました", "success");
                  }}>
                  📋 ウェルカムページ作成プロンプトをコピー
                </button>
              </div>
              {(() => {
                const candidates = characters.filter(c => selectedCategory === "welcome_original" ? c.is_preset === false : c.is_preset !== false);
                if (selectedCategory === "welcome_original" && candidates.length === 0) {
                  return (
                    <p className="text-xs" style={{ color: "#c0392b" }}>
                      オリジナルキャラクターがまだ作成されていません。キャラビルダーでオリキャラが作成されると、ここで選択できるようになります。
                    </p>
                  );
                }
                return (
                  <select value={form.template_character_id} onChange={e => setForm({ ...form, template_character_id: e.target.value })}
                    disabled={!!form.customer_id} required={selectedCategory === "welcome_original"}>
                    {selectedCategory === "welcome_official" && <option value="">汎用テンプレート（対象キャラを指定しない）</option>}
                    {candidates.map(c => (
                      <option key={c.id} value={c.id}>{c.name}（{c.is_preset ? "公式" : "オリジナル"}）専用</option>
                    ))}
                  </select>
                );
              })()}
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                キャラを選択すると、そのキャラが割り当てられた顧客専用のウェルカムページになります
                （公式キャラ：申し込み時に選択した顧客 / オリジナルキャラ：キャラ作成完了時にそのキャラが割り当てられた顧客）。
                汎用テンプレートは、キャラ未割り当ての顧客（キャラビルダーでの作成中など）に届きます。
                各キャラ・汎用ごとに1件まで設定できます（同じ対象を選んだ既存のテンプレートがある場合は、後から保存した方が優先されます）。
                上の「プロンプトをコピー」ボタンで、選択中のキャラに合わせたウェルカムページ文章のLLM作成用プロンプトをコピーできます。
              </p>

              <label className="text-xs font-medium block mt-3 mb-1" style={{ color: "var(--muted)" }}>
                対象顧客（特定の顧客に直接届ける場合のみ選択）
              </label>
              <select value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })}>
                <option value="">指定なし（テンプレートとして登録）</option>
                {customers.filter(c => !c.is_admin).map(c => <option key={c.id} value={c.id}>{c.username}</option>)}
              </select>
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                顧客を選択すると、テンプレートではなくその顧客の本棚に直接届く個別ウェルカムページとして登録されます。
                「最初の1つ無料」を既に利用済みでテンプレートが自動配布されない既存顧客に、後からウェルカムページを届けたい場合に使用してください。
              </p>
            </div>
          )}

          {/* ── 定期便（テンプレートプール）専用セクション ── */}
          {form.article_type === "template" && (
            <div>
              <button type="button"
                className="text-xs font-bold py-2 px-3 rounded-xl border-2 transition-all hover:opacity-80 self-start"
                style={{ borderColor: "#8e44ad", color: "#8e44ad", background: "var(--card-bg, #fff)" }}
                disabled={!form.character_id}
                onClick={() => {
                  const c = characters.find(ch => String(ch.id) === String(form.character_id));
                  if (!c) { toast("先にキャラクターを選択してください", "error"); return; }
                  const topic = window.prompt("今回取り上げたいテーマ・表現があれば入力してください（空欄でもOK）", "") || undefined;
                  navigator.clipboard.writeText(buildTemplateArticlePrompt(c, topic));
                  toast("定期便用LLMプロンプトをコピーしました", "success");
                }}>
                📋 定期便用LLMプロンプトをコピー
                {!form.character_id && "（先にキャラクターを選択）"}
              </button>
              <p className="text-xs mt-1.5" style={{ color: "var(--muted)" }}>
                通常の依頼記事より軽い（日本語800〜1200文字程度・1ページ構成）記事を作成するためのプロンプトです。
                LLMの出力を「本文」「例文」「Tips」欄に分割して貼り付けてください。
              </p>
              <p className="text-xs mt-1.5" style={{ color: "var(--muted)" }}>
                開封コストは「料金・メニュー」タブの料金設定で一括管理されます（この画面では設定しません）。
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {form.article_type === "request" && (
              <>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>顧客</label>
                  <select value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })} required>
                    <option value="">選択してください</option>
                    {customers.filter(c => !c.is_admin).map(c => <option key={c.id} value={c.id}>{c.username}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>文法マスター</label>
                  <select value={form.grammar_master_id} onChange={e => setForm({ ...form, grammar_master_id: e.target.value })} required>
                    <option value="">選択してください</option>
                    {grammars.map(g => <option key={g.id} value={g.id}>[{g.exam_category}] {g.topic_name}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>
                    対応するリクエスト（公開時にステータスを自動で「対応済み」にします／任意）
                  </label>
                  <select value={form.request_message_id} onChange={e => setForm({ ...form, request_message_id: e.target.value })}>
                    <option value="">紐付けない</option>
                    {openRequests.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.grammar_topic ? `[${r.grammar_topic}] ` : ""}{r.content}
                      </option>
                    ))}
                  </select>
                  {!form.customer_id && (
                    <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>※顧客を選択するとリクエスト一覧が表示されます</p>
                  )}
                  {form.customer_id && openRequests.length === 0 && (
                    <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>この顧客の対応中リクエストはありません</p>
                  )}
                </div>
              </>
            )}
            {form.article_type === "exercise" && (
              <div className="sm:col-span-2">
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>
                  対応するリクエスト（公開時にステータスを自動で「対応済み」にします／任意）
                </label>
                <select value={form.request_message_id} onChange={e => setForm({ ...form, request_message_id: e.target.value })}>
                  <option value="">紐付けない</option>
                  {openRequests.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.grammar_topic ? `[${r.grammar_topic}] ` : ""}{r.content}
                    </option>
                  ))}
                </select>
                {!form.customer_id && (
                  <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>※顧客を選択するとリクエスト一覧が表示されます</p>
                )}
                {form.customer_id && openRequests.length === 0 && (
                  <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>この顧客の対応中リクエストはありません</p>
                )}
              </div>
            )}
            {form.article_type === "request" && (
              <div className="sm:col-span-2">
                <button type="button"
                  className="text-xs font-bold py-2 px-3 rounded-xl border-2 transition-all hover:opacity-80"
                  style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "var(--card-bg, #fff)" }}
                  disabled={!form.character_id || !form.customer_id}
                  onClick={async () => {
                    const c = characters.find(ch => String(ch.id) === String(form.character_id));
                    const cu = customers.find(cs => String(cs.id) === String(form.customer_id));
                    if (!c || !cu) { toast("先にキャラクターと顧客を選択してください", "error"); return; }
                    const topic = window.prompt("今回依頼された文法トピックを入力してください（空欄でもOK）", "") || undefined;
                    let progress: any = null;
                    try { progress = await api.adminGetCustomerProgress(cu.id); } catch { /* 進捗データが取得できなくても続行 */ }
                    navigator.clipboard.writeText(buildPersonalizedLLMPrompt(c, cu, topic, progress));
                    const lvLabel = cu.intimacy ? `Lv${cu.intimacy.level}「${cu.intimacy.stage_label}」` : "";
                    toast(`「${getCustomerDisplayName(cu)}さん」専用プロンプトをコピーしました（${lvLabel}・覚えているメモ・進捗を反映）`, "success");
                  }}>
                  🎁 この生徒専用のパーソナライズLLMプロンプトをコピー
                  {(!form.character_id || !form.customer_id)
                    ? "（先にキャラクターと顧客を選択）"
                    : (() => { const cu = customers.find(cs => String(cs.id) === String(form.customer_id)); return cu?.intimacy ? ` — 💗 Lv${cu.intimacy.level}「${cu.intimacy.stage_label}」` : ""; })()}
                </button>
                <p className="text-xs mt-1.5" style={{ color: "var(--muted)" }}>
                  覚えているメモ（誕生日・好きなもの・エピソード）・直近の学習の進捗に加え、
                  <strong>現在の親密度レベル</strong>に応じた呼び方・距離感の書き方指示が自動で織り込まれます。
                  親密度が上がるほど、キャラクターの語りかけ方が「敬語」→「タメ口」→「あだ名」と変化します。
                </p>
                <div className="rounded-xl border-2 p-3 flex flex-col gap-2 mt-2" style={{ borderColor: "var(--accent)" }}>
                  <p className="text-xs font-bold" style={{ color: "var(--accent)" }}>
                    🏭 2段階生成：教育記事ストックからキャラに適応
                  </p>
                  <select value={selectedArticleTemplateId} onChange={e => setSelectedArticleTemplateId(e.target.value)}>
                    <option value="">教育記事ストックを選択…</option>
                    {articleTemplates.map(t => (
                      <option key={t.id} value={t.id}>📄 {t.topic}（{t.difficulty}）#{t.id}</option>
                    ))}
                  </select>
                  <button type="button"
                    className="text-xs font-bold py-2 px-3 rounded-xl border-2 transition-all hover:opacity-80 self-start"
                    style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "var(--card-bg, #fff)" }}
                    disabled={!form.character_id || !selectedArticleTemplateId}
                    onClick={() => {
                      const c = characters.find(ch => String(ch.id) === String(form.character_id));
                      const cu = customers.find(cs => String(cs.id) === String(form.customer_id));
                      const template = articleTemplates.find(t => String(t.id) === selectedArticleTemplateId);
                      if (!c || !template) { toast("キャラクターと教育記事ストックを選択してください", "error"); return; }
                      navigator.clipboard.writeText(buildArticleAdaptationPrompt(c, cu, template.content, template.topic));
                      toast("第2段階（キャラ適応）プロンプトをコピーしました", "success");
                    }}>
                    📋 第2段階プロンプトをコピー
                    {(!form.character_id || !selectedArticleTemplateId) && "（先にキャラクターとストックを選択）"}
                  </button>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    出力結果は下の「📥 LLMの出力を貼り付けて反映」欄に貼り付けてください（本文・例文・Tipsに自動で振り分けられます）。
                  </p>
                </div>
              </div>
            )}
            {form.article_type !== "welcome" && (
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>キャラクター</label>
                <select value={form.character_id} onChange={e => setForm({ ...form, character_id: e.target.value })} required>
                  <option value="">選択してください</option>
                  {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>ステータス</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option value="draft">下書き</option>
                <option value="review">確認中</option>
                <option value="published">公開</option>
              </select>
            </div>
            {(form.article_type === "request" || form.article_type === "exercise") && (
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>
                  開封コスト（クレジット／任意）
                </label>
                <input type="number" min="0" value={form.unlock_cost}
                  onChange={e => setForm({ ...form, unlock_cost: e.target.value })}
                  placeholder="未入力でリクエスト額から自動算出" />
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>タイトル</label>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required placeholder="例：関係代名詞の使い方（キャラ名）" />
          </div>
          {form.article_type !== "exercise" && (
            <div className="rounded-xl border-2 p-3 flex flex-col gap-2" style={{ borderColor: "var(--border)" }}>
              <p className="text-xs font-bold" style={{ color: "var(--primary)" }}>
                📥 LLMの出力を貼り付けて反映
              </p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                上のコピー用ボタンでプロンプトをコピー → 外部LLMに入力 → 得られた回答をそのまま（コードブロック付きでもOK）下の欄に貼り付けて
                「反映する」を押すと、本文・例文・Tips欄に自動で振り分けられます。
              </p>
              <textarea
                value={genPasteText}
                onChange={e => setGenPasteText(e.target.value)}
                rows={4}
                placeholder="LLMの回答をここにそのまま貼り付け"
                className="text-xs font-mono"
              />
              <button type="button"
                className="text-xs font-bold py-2 px-3 rounded-xl border-2 transition-all hover:opacity-80 self-start"
                style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "var(--card-bg, #fff)" }}
                disabled={!genPasteText.trim()}
                onClick={applyGenPasteText}>
                ✅ 反映する
              </button>
            </div>
          )}
          {form.article_type !== "exercise" && (
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>本文（Markdown可）</label>
              <textarea rows={10} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} required placeholder="記事本文をここに入力…" style={{ fontFamily: "monospace", fontSize: "0.85rem" }} />
            </div>
          )}
          {form.article_type === "exercise" && (
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>補足メモ（任意・本文として表示されます）</label>
              <textarea rows={4} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })}
                placeholder="この問題についての一言コメントなど（空欄でもOK。問題そのものは下のJSONデータから表示されます）"
                style={{ fontFamily: "monospace", fontSize: "0.85rem" }} />
            </div>
          )}
          {form.article_type !== "exercise" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>例文（1行1文 / で英文と和訳を区切る）</label>
                <textarea rows={5} value={form.example_sentences} onChange={e => setForm({ ...form, example_sentences: e.target.value })} placeholder={"If I were you, I would study harder. / 私があなたなら、もっと勉強するのに。\n例文2 / 和訳2"} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>Tips（1行1項目）</label>
                <textarea rows={5} value={form.tips} onChange={e => setForm({ ...form, tips: e.target.value })} placeholder={"Tips1\nTips2"} />
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <button type="submit" className="btn-primary flex-1 text-center">
              {editingArticle ? "保存する" : "作成する"}
            </button>
            <button type="button" className="btn-ghost px-6" onClick={cancelForm}>キャンセル</button>
          </div>
        </form>
      )}

      {/* 検索・フィルターバー */}
      {!isStockCategory && !showForm && (
        <div className="flex flex-wrap gap-2 mb-4 p-3 rounded-xl" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
          <input className="flex-1 min-w-40 text-sm py-1.5 px-3 rounded-lg" style={{ border: "1px solid var(--border)" }}
            placeholder="タイトル・顧客・キャラ・文法で検索…"
            value={filterText} onChange={e => setFilterText(e.target.value)} />
          <select className="text-sm py-1.5 px-2 rounded-lg" style={{ border: "1px solid var(--border)", background: "white", width: "auto" }}
            value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">全ステータス</option>
            <option value="draft">下書き</option>
            <option value="review">確認中</option>
            <option value="published">公開中</option>
          </select>
          <select className="text-sm py-1.5 px-2 rounded-lg" style={{ border: "1px solid var(--border)", background: "white", width: "auto" }}
            value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)}>
            <option value="">全顧客</option>
            {customers.filter(c => !c.is_admin).map(c => <option key={c.id} value={c.id}>{c.username}</option>)}
          </select>
          {(filterText || filterStatus || filterCustomer) && (
            <button className="text-xs px-3 py-1.5 rounded-lg" style={{ color: "var(--accent)", border: "1px solid var(--border)" }}
              onClick={() => { setFilterText(""); setFilterStatus(""); setFilterCustomer(""); }}>
              クリア ✕
            </button>
          )}
          <span className="text-xs self-center" style={{ color: "var(--muted)" }}>
            {filtered.length} / {articles.length} 件
          </span>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {!isStockCategory && filtered.map(a => (
          <div key={a.id} className="card" style={{ background: statusColor[a.status] }}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-bold truncate" style={{ color: "var(--primary)" }}>{a.title}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                  {a.article_type === "blog" ? (
                    <>📰 ブログ記事　🎭 {a.character_name ?? "—"}</>
                  ) : a.article_type === "exercise" ? (
                    <>{a.exercise_format === "multiple_choice" && hasListeningAudio(a.exercise_data) ? "🎧" : "🧩"} {a.exercise_category ?? "演習問題"}（{a.exercise_format === "written_response" ? "記述式" : hasListeningAudio(a.exercise_data) ? "選択式・リスニング" : "選択式"}）　👤 {a.customer_name ?? `顧客ID:${a.customer_id}`}　🎭 {a.character_name ?? "—"}</>
                  ) : a.article_type === "writing_feedback" ? (
                    <>✍️ ライティングFB　👤 {a.customer_name ?? `顧客ID:${a.customer_id}`}　🎭 {a.character_name ?? "—"}</>
                  ) : a.article_type === "speaking_feedback" ? (
                    <>🎤 スピーキングFB　👤 {a.customer_name ?? `顧客ID:${a.customer_id}`}　🎭 {a.character_name ?? "—"}</>
                  ) : a.article_type === "welcome" ? (
                    a.customer_id ? (
                      <>🏠 ウェルカムページ（個別）　👤 {a.customer_name ?? `顧客ID:${a.customer_id}`}</>
                    ) : (
                      <>🏠 ウェルカムページ　{a.template_character_id ? `🎭 ${characters.find(c => c.id === a.template_character_id)?.name ?? `キャラID:${a.template_character_id}`}専用` : "汎用"}</>
                    )
                  ) : (
                    <>👤 {a.customer_name ?? `顧客ID:${a.customer_id}`}　🎭 {a.character_name ?? "—"}　📚 {a.grammar_topic ?? "—"}</>
                  )}
                  　#{a.id}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {a.article_type === "blog" && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#e0f0ff", color: "#2962a8" }}>
                    📰 ブログ
                  </span>
                )}
                {a.article_type === "exercise" && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#ece4ff", color: "#5d3fd3" }}>
                    🧩 演習問題
                  </span>
                )}
                {a.article_type === "writing_feedback" && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#fff0e0", color: "#b85a00" }}>
                    ✍️ ライティングFB
                  </span>
                )}
                {a.article_type === "speaking_feedback" && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#e0f7f4", color: "#0d6e5f" }}>
                    🎤 スピーキングFB
                  </span>
                )}
                {a.article_type === "welcome" && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#dceefb", color: "#1f618d" }}>
                    🏠 ウェルカム
                  </span>
                )}
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(0,0,0,0.08)" }}>
                  {statusLabel[a.status]}
                </span>
                <button className="btn-ghost text-xs py-1 px-2" title="顧客側のプレビュー"
                  onClick={() => setPreviewArticle(a)}>👁</button>
                <button className="btn-ghost text-xs py-1 px-2" onClick={() => startEdit(a)}>編集</button>
                {a.status === "draft" && <button className="btn-ghost text-xs py-1 px-2" onClick={() => changeStatus(a.id, "review")}>確認へ</button>}
                {a.status === "review" && <button className="btn-accent text-xs py-1 px-2" onClick={() => changeStatus(a.id, "published")}>公開</button>}
                {a.status === "published" && <button className="btn-ghost text-xs py-1 px-2" onClick={() => changeStatus(a.id, "draft")}>下書きへ</button>}
                <button className="text-xs py-1 px-2 rounded-lg" style={{ color: "#c0392b" }} onClick={() => deleteArticle(a.id)}>削除</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* プレビューモーダル */}
      {previewArticle && (
        <ArticlePreviewModal
          article={previewArticle}
          character={characters.find(c => c.id === previewArticle.character_id) ?? null}
          onClose={() => setPreviewArticle(null)}
        />
      )}
    </div>
  );
}