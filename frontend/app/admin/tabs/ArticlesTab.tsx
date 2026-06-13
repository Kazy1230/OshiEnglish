"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { ArticlePreviewModal } from "@/components/ArticlePreviewModal";
import {
  parseExerciseJsonInput,
  summarizeExerciseData,
  buildBlogLLMPrompt,
  buildExercisePrompt,
  buildWritingFeedbackPrompt,
  buildSpeakingFeedbackPrompt,
  buildPersonalizedLLMPrompt,
  buildWelcomePagePrompt,
  getCustomerDisplayName,
} from "../lib/promptBuilders";

const emptyArticleForm = {
  article_type: "request", customer_id: "", character_id: "", grammar_master_id: "", title: "", content: "", tips: "", example_sentences: "", status: "draft",
  // ----- 演習問題（exercise）専用 -----
  exercise_format: "multiple_choice", exercise_category: "", exercise_data_text: "",
  // 依頼記事：元になった記事リクエストメッセージ（公開時にステータス自動更新に使う）
  request_message_id: "",
  // フィードバック記事：元になった添削リクエスト（公開時にステータス自動更新に使う）
  correction_request_id: "",
  // ウェルカムページ：対象キャラ（公式キャラ専用テンプレートの場合のみ指定／空欄は汎用テンプレート）
  template_character_id: "",
  // 開封コスト（任意・未入力時はサーバー側のデフォルト計算に従う）
  unlock_cost: "",
};

export function ArticlesTab({ pendingCorrection, onConsumePendingCorrection }: {
  pendingCorrection?: any;
  onConsumePendingCorrection?: () => void;
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
  // 依頼記事：選択中の顧客の対応中リクエスト一覧（紐付け選択用）
  const [openRequests, setOpenRequests] = useState<any[]>([]);
  // 添削記事作成：CorrectionsTabから引き渡された添削提出内容（LLMプロンプトに直接反映する）
  const [correctionSubmission, setCorrectionSubmission] = useState<any | null>(null);

  const reload = () => Promise.all([api.adminGetArticles(), api.adminGetCustomers(), api.adminGetCharacters(), api.adminGetGrammarMasters()])
    .then(([a, c, ch, g]) => { setArticles(a); setCustomers(c); setCharacters(ch); setGrammars(g); });

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
    setShowForm(true);
    onConsumePendingCorrection?.();
  }, [pendingCorrection]);

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
      exercise_data_text: a.exercise_data ? JSON.stringify(a.exercise_data, null, 2) : "",
      request_message_id: a.request_message_id ? String(a.request_message_id) : "",
      correction_request_id: a.correction_request_id ? String(a.correction_request_id) : "",
      template_character_id: a.template_character_id ? String(a.template_character_id) : "",
      unlock_cost: a.unlock_cost != null ? String(a.unlock_cost) : "",
    });
    setCorrectionSubmission(null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelForm() {
    setShowForm(false);
    setEditingArticle(null);
    setForm(emptyArticleForm);
    setIsLlmDrafted(false);
    setCorrectionSubmission(null);
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
    } else if (isTemplate) {
      // テンプレ記事プール：customer_id等はサーバー側で自動的にクリアされる
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
    return matchText && matchStatus && matchCustomer;
  });

  if (loading) return <p style={{ color: "var(--muted)" }}>読み込み中…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-black" style={{ color: "var(--primary)" }}>📝 記事管理</h2>
        <button className="btn-accent" onClick={() => showForm ? cancelForm() : setShowForm(true)}>
          {showForm ? "キャンセル" : "+ 新規記事"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card mb-6 flex flex-col gap-3">
          <h3 className="font-bold" style={{ color: "var(--primary)" }}>
            {editingArticle ? `📝 記事編集：${editingArticle.title}` : "新規記事作成"}
          </h3>

          {/* 記事タイプ切り替え */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>記事タイプ</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {([
                ["request",          "📩 依頼記事",            "var(--primary)"],
                ["blog",             "📰 ブログ記事",          "var(--accent)"],
                ["exercise",         "🧩 演習問題",            "#7b5cff"],
                ["writing_feedback", "✍️ ライティングFB",      "#e67e22"],
                ["speaking_feedback","🎤 スピーキングFB",      "#16a085"],
                ["welcome",          "🏠 ウェルカムページ",    "#2980b9"],
                ["template",         "🗂 テンプレ記事プール",  "#8e44ad"],
              ] as [string, string, string][]).map(([type, label, color]) => (
                <button key={type} type="button"
                  disabled={!!editingArticle}
                  className="text-sm py-2 px-3 rounded-xl border-2 font-bold transition-all"
                  style={form.article_type === type
                    ? { borderColor: color, background: color, color: "white" }
                    : { borderColor: "var(--border)", background: "var(--card-bg, #fff)", color: "var(--muted)" }}
                  onClick={() => setForm({ ...form, article_type: type })}>
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs mt-1.5" style={{ color: "var(--muted)" }}>
              {form.article_type === "blog"
                ? "ブログ記事：特定の顧客向けではなく、キャラクターが趣味で書いている体の簡易記事です。記事閲覧画面のサイドバーに紹介され、世界観の演出に使われます（顧客・文法マスターの指定は不要）。"
                : form.article_type === "exercise"
                ? "演習問題：TOEIC・英検・IELTS・TOEFLなどの出題形式に合わせた問題を作成します。「選択式」は解答後すぐに自動採点・解説表示、「記述式」は提出された解答がキャラクターへのチャットとして送られ、運営が手動でフィードバックします。"
                : form.article_type === "writing_feedback"
                ? "ライティングFB：記述式演習で提出されたライティング答案に対するキャラクターからのフィードバック記事です。採点・添削結果を顧客の本棚に届けます（文法マスター・演習データは不要）。"
                : form.article_type === "speaking_feedback"
                ? "スピーキングFB：記述式演習で提出されたスピーキング音声・テキストに対するキャラクターからのフィードバック記事です。評価・改善アドバイスを顧客の本棚に届けます（文法マスター・演習データは不要）。"
                : form.article_type === "welcome"
                ? "ウェルカムページ：新規登録した顧客の本棚に最初に届くテンプレート記事です。「対象キャラ」を指定すると、その公式キャラを選んだ顧客専用のテンプレートになります。空欄のまま保存すると、キャラビルダー利用者など対象キャラ未指定の顧客向けの汎用テンプレートになります。"
                : form.article_type === "template"
                ? "テンプレ記事プール：customer_idを指定せずに保管する「特別記事」のひな形です。3日ごとに1本、各顧客の本棚に無料で自動配布されます（開封には50クレジット必要・unlock_costで変更可）。"
                : "依頼記事：特定の顧客からの依頼に応じて作成する、通常の文法解説記事です。"}
              {editingArticle && "（記事タイプは作成後に変更できません）"}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>出題形式</label>
                    <select value={form.exercise_format} disabled={!!editingArticle}
                      onChange={e => setForm({ ...form, exercise_format: e.target.value })}>
                      <option value="multiple_choice">選択式（リーディング・リスニング等／自動採点）</option>
                      <option value="written_response">記述式（ライティング・スピーキング等／キャラフィードバック）</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>顧客（誰の本棚に届けるか）</label>
                    <select value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })} required>
                      <option value="">選択してください</option>
                      {customers.filter(c => !c.is_admin).map(c => <option key={c.id} value={c.id}>{c.username}</option>)}
                    </select>
                  </div>
                </div>
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
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>
                    演習問題データ（LLMが出力したJSONをそのまま貼り付けてください。コードブロック付きでもOK）
                  </label>
                  <textarea rows={10} value={form.exercise_data_text}
                    onChange={e => setForm({ ...form, exercise_data_text: e.target.value })}
                    placeholder={form.exercise_format === "multiple_choice"
                      ? '{\n  "instructions": "...",\n  "questions": [\n    { "prompt": "...", "choices": ["A","B","C","D"], "correct_index": 0,\n      "explanation_correct": "（正解した生徒向けの解説）...",\n      "explanation_incorrect": "（不正解だった生徒向けの解説）..." }\n  ],\n  "score_comments": {\n    "perfect": "（満点だった生徒へのひとこと）...",\n    "good": "（半分以上正解の生徒へのひとこと）...",\n    "encourage": "（半分未満の生徒へのひとこと）..."\n  }\n}'
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
                      submission = correctionSubmission.text_content || undefined;
                      if (correctionSubmission.media_url) {
                        const mediaNote = `※音声/動画は管理画面で確認してください: ${correctionSubmission.media_url}`;
                        submission = submission ? `${submission}\n\n${mediaNote}` : mediaNote;
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
                  <div className="text-xs p-2 rounded-lg" style={{ background: "var(--bg)", color: "var(--muted)" }}>
                    <p className="font-bold mb-1" style={{ color: "var(--primary)" }}>添削提出内容を自動反映します</p>
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
                  対象キャラ（キャラ専用テンプレートにする場合のみ選択）
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
              <select value={form.template_character_id} onChange={e => setForm({ ...form, template_character_id: e.target.value })}
                disabled={!!form.customer_id}>
                <option value="">汎用テンプレート（対象キャラを指定しない）</option>
                {characters.map(c => (
                  <option key={c.id} value={c.id}>{c.name}（{c.is_preset ? "公式" : "オリジナル"}）専用</option>
                ))}
              </select>
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
            {(form.article_type === "request" || form.article_type === "exercise" || form.article_type === "template") && (
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>
                  開封コスト（クレジット／任意）
                </label>
                <input type="number" min="0" value={form.unlock_cost}
                  onChange={e => setForm({ ...form, unlock_cost: e.target.value })}
                  placeholder={form.article_type === "template" ? "未入力で50" : "未入力でリクエスト額から自動算出"} />
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>タイトル</label>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required placeholder="例：関係代名詞の使い方（キャラ名）" />
          </div>
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
      {!showForm && (
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
        {filtered.map(a => (
          <div key={a.id} className="card" style={{ background: statusColor[a.status] }}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-bold truncate" style={{ color: "var(--primary)" }}>{a.title}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                  {a.article_type === "blog" ? (
                    <>📰 ブログ記事　🎭 {a.character_name ?? "—"}</>
                  ) : a.article_type === "exercise" ? (
                    <>🧩 {a.exercise_category ?? "演習問題"}（{a.exercise_format === "written_response" ? "記述式" : "選択式"}）　👤 {a.customer_name ?? `顧客ID:${a.customer_id}`}　🎭 {a.character_name ?? "—"}</>
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