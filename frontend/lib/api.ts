export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost/api";

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("yt_token") : null;
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  // 401: トークン期限切れ or 無効 → 自動ログアウト
  if (res.status === 401 && typeof window !== "undefined") {
    localStorage.removeItem("yt_token");
    window.location.href = "/login";
    throw new Error("セッションが切れました。再度ログインしてください");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "エラーが発生しました" }));
    throw new Error(err.detail || `エラーが発生しました (${res.status})`);
  }
  return res.json();
}

/** ファイルアップロード用（Content-Typeを自動設定させるためJSON用apiFetchとは別経路にする） */
async function apiUpload(path: string, formData: FormData) {
  const token = typeof window !== "undefined" ? localStorage.getItem("yt_token") : null;
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: formData,
  });
  if (res.status === 401 && typeof window !== "undefined") {
    localStorage.removeItem("yt_token");
    window.location.href = "/login";
    throw new Error("セッションが切れました。再度ログインしてください");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "エラーが発生しました" }));
    throw new Error(err.detail || `エラーが発生しました (${res.status})`);
  }
  return res.json();
}

export const api = {
  login: (username: string, password: string) =>
    apiFetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username, password }),
    }),
  // 管理者ログインの二段階認証コード（メール送信）を検証してアクセストークンを取得する
  verify2FA: (username: string, code: string) =>
    apiFetch("/auth/verify-2fa", {
      method: "POST",
      body: JSON.stringify({ username, code }),
    }),
  signup: (email: string, password: string) =>
    apiFetch("/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => apiFetch("/auth/me"),
  changePassword: (current_password: string, new_password: string) =>
    apiFetch("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password, new_password }),
    }),
  forgotPassword: (email: string) =>
    apiFetch("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, new_password: string) =>
    apiFetch("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, new_password }),
    }),
  getCharacterTheme: (id: number) => apiFetch(`/characters/theme/${id}`),

  // 退会
  withdraw: () => apiFetch("/customers/me/withdraw", { method: "POST" }),

  // マーケットプレイス：クリエイター
  listCreators: () => apiFetch("/creators/"),
  getCreator: (id: number) => apiFetch(`/creators/${id}`),

  // クリエイター申請・プロフィール
  applyAsCreator: (data: object) => apiFetch("/creators/apply", { method: "POST", body: JSON.stringify(data) }),
  applyAsCreatorPublic: (data: object) => apiFetch("/creators/apply-public", { method: "POST", body: JSON.stringify(data) }),
  getMyCreatorProfile: () => apiFetch("/creators/me"),
  updateMyCreatorProfile: (data: object) => apiFetch("/creators/me", { method: "PUT", body: JSON.stringify(data) }),
  generateCreatorIntro: () => apiFetch("/creators/me/generate-intro", { method: "POST" }),

  // AIインタビュー（人格収集）
  startInterview: (baseType?: string, gender?: string, subject?: string) =>
    apiFetch("/interview/start", { method: "POST", body: JSON.stringify({ base_type: baseType ?? null, gender: gender ?? null, subject: subject ?? null }) }),
  submitInterviewAnswer: (answer: string) => apiFetch("/interview/answer", { method: "POST", body: JSON.stringify({ answer }) }),
  generatePersonalityProfile: () => apiFetch("/interview/generate-profile", { method: "POST" }),
  getPersonalityProfile: () => apiFetch("/interview/profile"),
  updatePersonalityProfile: (profile: object) => apiFetch("/interview/profile", { method: "PUT", body: JSON.stringify({ profile }) }),

  // マーケットプレイス：お気に入り
  addFavorite: (creatorId: number) => apiFetch(`/favorites/${creatorId}`, { method: "POST" }),
  removeFavorite: (creatorId: number) => apiFetch(`/favorites/${creatorId}`, { method: "DELETE" }),
  listFavorites: () => apiFetch("/favorites/"),

  // 分野・カテゴリ
  getSubjectChoices: (): Promise<{ subjects: { key: string; label: string }[]; category_map: Record<string, string[]> }> =>
    apiFetch("/subjects"),
  getDefaultDiagnosisQuestions: (subject: string): Promise<{ questions: unknown[] }> =>
    apiFetch(`/subjects/${subject}/default-diagnosis-questions`),

  // マーケットプレイス：コース・レッスン
  listCourses: (category?: string) => apiFetch(`/courses${category ? `?category=${encodeURIComponent(category)}` : ""}`),
  getPublicStats: () => apiFetch("/stats/public"),
  listCreatorCourses: (creatorId: number) => apiFetch(`/creators/${creatorId}/courses`),
  getCourseDetail: (id: number) => apiFetch(`/courses/${id}`),
  createCourse: (data: object) => apiFetch("/courses", { method: "POST", body: JSON.stringify(data) }),
  updateCourse: (id: number, data: object) => apiFetch(`/courses/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  submitCourseForReview: (id: number) => apiFetch(`/courses/${id}/submit-for-review`, { method: "POST" }),
  getCourseQualityCheck: (id: number) => apiFetch(`/courses/${id}/quality-check`),
  getMyCreatedCourses: () => apiFetch("/courses/me/created"),
  listCourseEnrollments: (courseId: number) => apiFetch(`/courses/${courseId}/enrollments`),
  addCourseLesson: (courseId: number, data: object) =>
    apiFetch(`/courses/${courseId}/lessons`, { method: "POST", body: JSON.stringify(data) }),
  updateLesson: (lessonId: number, data: object) =>
    apiFetch(`/lessons/${lessonId}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteLesson: (lessonId: number) => apiFetch(`/lessons/${lessonId}`, { method: "DELETE" }),
  reorderLessons: (courseId: number, lessonIds: number[]) =>
    apiFetch(`/courses/${courseId}/lessons/reorder`, { method: "PUT", body: JSON.stringify({ lesson_ids: lessonIds }) }),

  // 30日伴走コース：自動生成・日単位編集
  generateCourseDays: (courseId: number) => apiFetch(`/courses/${courseId}/generate-days`, { method: "POST" }),
  getCourseGenerationStatus: (courseId: number) => apiFetch(`/courses/${courseId}/generation-status`),
  listCourseDays: (courseId: number) => apiFetch(`/courses/${courseId}/days`),
  updateCourseDay: (courseId: number, dayNumber: number, data: object) =>
    apiFetch(`/courses/${courseId}/days/${dayNumber}`, { method: "PUT", body: JSON.stringify(data) }),

  // 30日伴走コース：参考資料
  listCourseMaterials: (courseId: number) => apiFetch(`/courses/${courseId}/materials`),
  addCourseMaterial: (courseId: number, data: object) =>
    apiFetch(`/courses/${courseId}/materials`, { method: "POST", body: JSON.stringify(data) }),
  deleteCourseMaterial: (materialId: number) => apiFetch(`/materials/${materialId}`, { method: "DELETE" }),

  // Day1診断：カスタム質問
  listDiagnosisQuestions: (courseId: number) => apiFetch(`/courses/${courseId}/diagnosis-questions`),
  addDiagnosisQuestion: (courseId: number, data: object) =>
    apiFetch(`/courses/${courseId}/diagnosis-questions`, { method: "POST", body: JSON.stringify(data) }),
  addDiagnosisQuestionsBulk: (courseId: number, questions: object[]) =>
    apiFetch(`/courses/${courseId}/diagnosis-questions/bulk`, { method: "POST", body: JSON.stringify({ questions }) }),
  updateDiagnosisQuestion: (questionId: number, data: object) =>
    apiFetch(`/diagnosis-questions/${questionId}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteDiagnosisQuestion: (questionId: number) => apiFetch(`/diagnosis-questions/${questionId}`, { method: "DELETE" }),

  // 教材ベースのコース作成：プリセット教材検索・コースへの紐付け・日程割り当て
  searchTextbooks: (query?: string) => apiFetch(`/textbooks${query ? `?query=${encodeURIComponent(query)}` : ""}`),
  listCourseTextbooks: (courseId: number) => apiFetch(`/courses/${courseId}/textbooks`),
  addCourseTextbook: (courseId: number, data: object) =>
    apiFetch(`/courses/${courseId}/textbooks`, { method: "POST", body: JSON.stringify(data) }),
  updateCourseTextbook: (courseTextbookId: number, data: object) =>
    apiFetch(`/course-textbooks/${courseTextbookId}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCourseTextbook: (courseTextbookId: number) => apiFetch(`/course-textbooks/${courseTextbookId}`, { method: "DELETE" }),
  setTextbookDayAssignments: (courseTextbookId: number, assignments: { toc_item: string; day_number: number | null }[]) =>
    apiFetch(`/course-textbooks/${courseTextbookId}/day-assignments`, { method: "PUT", body: JSON.stringify({ assignments }) }),
  planCourseTextbooks: (courseId: number, description: string, qaHistory: { question: string; answer: string }[]) =>
    apiFetch(`/courses/${courseId}/textbooks/plan`, { method: "POST", body: JSON.stringify({ description, qa_history: qaHistory }) }),
  applyCourseTextbookPlan: (courseId: number, plans: object[]) =>
    apiFetch(`/courses/${courseId}/textbooks/plan/apply`, { method: "POST", body: JSON.stringify({ plans }) }),
  parseTocChat: (courseId: number, textbookName: string, message: string, history: { role: string; content: string }[]) =>
    apiFetch(`/courses/${courseId}/textbooks/parse-toc`, { method: "POST", body: JSON.stringify({ textbook_name: textbookName, message, history }) }),

  // マーケットプレイス：コース購入（Stripe Payment Intent）
  checkoutCourse: (courseId: number) =>
    apiFetch("/payments/checkout", { method: "POST", body: JSON.stringify({ course_id: courseId }) }),

  // 30日伴走コース：月額サブスクリプション（Tier A / Tier B）
  subscribeToCourse: (courseId: number, tier: "A" | "B") =>
    apiFetch("/payments/subscribe", { method: "POST", body: JSON.stringify({ course_id: courseId, tier }) }),
  cancelSubscription: (subscriptionId: number) =>
    apiFetch(`/payments/subscriptions/${subscriptionId}/cancel`, { method: "POST" }),
  changeSubscriptionTier: (subscriptionId: number, tier: "A" | "B") =>
    apiFetch(`/payments/subscriptions/${subscriptionId}/change-tier`, { method: "POST", body: JSON.stringify({ tier }) }),

  // 講師ダッシュボード：自分のキャラクター
  listMyCharacters: () => apiFetch("/characters/"),
  getCharacterDetail: (id: number) => apiFetch(`/characters/${id}`),
  createCharacterFull: (data: object) => apiFetch("/characters/", { method: "POST", body: JSON.stringify(data) }),
  updateCharacterFull: (id: number, data: object) => apiFetch(`/characters/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  previewCharacterVoice: (id: number, sampleText: string) =>
    apiFetch(`/characters/${id}/preview`, { method: "POST", body: JSON.stringify({ sample_text: sampleText }) }),
  uploadCharacterImage: (id: number, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiUpload(`/characters/${id}/image`, formData);
  },
  deleteCharacterImage: (id: number) => apiFetch(`/characters/${id}/image`, { method: "DELETE" }),

  // AIコンテンツ生成スタジオ：Step0/Step1（非ストリーミング）・下書き管理
  generateCharacterConcept: (characterConcept: string) =>
    apiFetch("/studio/generate/character", { method: "POST", body: JSON.stringify({ character_concept: characterConcept }) }),
  generateToneProfile: (name: string, description: string, toneProfile: Record<string, unknown>) =>
    apiFetch("/studio/generate/tone-profile", { method: "POST", body: JSON.stringify({ name, description, tone_profile: toneProfile }) }),
  studioConsult: (theme: string) =>
    apiFetch("/studio/consult", { method: "POST", body: JSON.stringify({ theme }) }),
  studioIdeas: (format: string, characterId: number, durationSec?: number, charLimit?: number, subject?: string) =>
    apiFetch("/studio/ideas", { method: "POST", body: JSON.stringify({ format, character_id: characterId, duration_sec: durationSec, char_limit: charLimit, subject: subject ?? "english" }) }),
  studioAngles: (ideaTitle: string, ideaHook: string, format: string, characterId: number, subject?: string) =>
    apiFetch("/studio/angles", { method: "POST", body: JSON.stringify({ idea_title: ideaTitle, idea_hook: ideaHook, format, character_id: characterId, subject: subject ?? "english" }) }),
  listDrafts: () => apiFetch("/studio/drafts"),
  getDraft: (id: number) => apiFetch(`/studio/drafts/${id}`),
  deleteDraft: (id: number) => apiFetch(`/studio/drafts/${id}`, { method: "DELETE" }),
  saveDraft: (id: number, memo?: string) => apiFetch(`/studio/drafts/${id}/save`, { method: "PUT", body: JSON.stringify({ memo }) }),
  listSavedDrafts: () => apiFetch("/studio/saved-drafts"),
  listIdeaPool: () => apiFetch("/studio/idea-pool"),
  createIdeaPool: (text: string) => apiFetch("/studio/idea-pool", { method: "POST", body: JSON.stringify({ text }) }),
  updateIdeaPool: (id: number, text: string) => apiFetch(`/studio/idea-pool/${id}`, { method: "PUT", body: JSON.stringify({ text }) }),
  deleteIdeaPool: (id: number) => apiFetch(`/studio/idea-pool/${id}`, { method: "DELETE" }),
  getMarketingStrategy: () => apiFetch("/studio/marketing-strategy"),
  updateMarketingStrategy: (content: string) => apiFetch("/studio/marketing-strategy", { method: "PUT", body: JSON.stringify({ content }) }),
  marketingStrategyChat: (message: string, currentStrategy?: string) => apiFetch("/studio/marketing-strategy/chat", { method: "POST", body: JSON.stringify({ message, current_strategy: currentStrategy }) }),

  // コンテンツプール
  listMyContents: () => apiFetch("/contents/my"),
  listPublicContents: (subject?: string, limit = 20, offset = 0) =>
    apiFetch(`/contents/?limit=${limit}&offset=${offset}${subject ? `&subject=${subject}` : ""}`),
  listPublicContentsNoAuth: (subject?: string, limit = 20, offset = 0) =>
    fetch(`${API_BASE}/contents/public?limit=${limit}&offset=${offset}${subject ? `&subject=${subject}` : ""}`).then((r) => r.json()),
  getContentRecommendations: (subject: string, limit = 10) =>
    apiFetch(`/contents/recommendations?subject=${subject}&limit=${limit}`),
  createContent: (data: { url: string; subject: string; tags?: string[]; is_public?: boolean }) =>
    apiFetch("/contents/", { method: "POST", body: JSON.stringify(data) }),
  deleteContent: (id: number) => apiFetch(`/contents/${id}`, { method: "DELETE" }),
  toggleContentLike: (id: number) => apiFetch(`/contents/${id}/like`, { method: "POST" }),

  // リテンション機能：通知
  listNotifications: () => apiFetch("/notifications/"),
  markNotificationRead: (id: number) => apiFetch(`/notifications/${id}/read`, { method: "PUT" }),
  markAllNotificationsRead: () => apiFetch("/notifications/read-all", { method: "PUT" }),

  // リテンション機能：学習進捗
  getMyPurchasedCourses: () => apiFetch("/courses/me/purchased"),
  getCourseProgress: (courseId: number) => apiFetch(`/courses/${courseId}/progress`),
  completeLesson: (lessonId: number) => apiFetch(`/lessons/${lessonId}/complete`, { method: "PUT" }),

  // Day1初回診断・ロードマップ生成
  getDiagnosisQuestions: (courseId: number) => apiFetch(`/diagnosis/${courseId}/questions`),
  getWelcomeMessage: (courseId: number) => apiFetch(`/diagnosis/${courseId}/welcome`, { method: "POST" }),
  submitDiagnosis: (courseId: number, data: object) =>
    apiFetch(`/diagnosis/${courseId}/submit`, { method: "POST", body: JSON.stringify(data) }),
  getRoadmap: (courseId: number) => apiFetch(`/diagnosis/${courseId}/roadmap`),
  listLearnerCourseDays: (courseId: number) => apiFetch(`/diagnosis/${courseId}/learner-days`),
  getNotificationSettings: (courseId: number) => apiFetch(`/diagnosis/${courseId}/notification-settings`),
  updateNotificationSettings: (courseId: number, data: object) =>
    apiFetch(`/diagnosis/${courseId}/notification-settings`, { method: "PUT", body: JSON.stringify(data) }),
  getReviews: (courseId: number) => apiFetch(`/diagnosis/${courseId}/reviews`),

  // 30日伴走コース：日次学習ログ
  listDayLogs: (courseId: number) => apiFetch(`/courses/${courseId}/day-logs`),
  completeDayLog: (courseId: number, dayNumber: number, memo?: string, completedItemIndices?: number[]) =>
    apiFetch(`/courses/${courseId}/day-logs/${dayNumber}/complete`, {
      method: "PUT",
      body: JSON.stringify({ memo: memo ?? null, completed_item_indices: completedItemIndices ?? null }),
    }),

  // デイリー伴走チャット
  askChatQuestion: (courseId: number, body: string) =>
    apiFetch(`/chat/${courseId}/ask`, { method: "POST", body: JSON.stringify({ body }) }),
  getChatHistory: (courseId: number) => apiFetch(`/chat/${courseId}/history`),
  getTodayMessage: (courseId: number, type: "morning" | "evening") =>
    apiFetch(`/chat/${courseId}/today-message?type=${type}`),
  getGreeting: (courseId: number) => apiFetch(`/chat/${courseId}/greeting`),
  postDailySummary: (courseId: number) => apiFetch(`/chat/${courseId}/daily-summary`, { method: "POST" }),

  // クリエイター向け：Tier B未回答質問の承認
  listPendingQuestions: () => apiFetch("/chat/creator/pending"),
  respondToQuestion: (questionId: number, body?: string) =>
    apiFetch(`/chat/creator/questions/${questionId}/respond`, { method: "POST", body: JSON.stringify({ body: body ?? null }) }),
  getPendingOverdueCount: () => apiFetch("/chat/creator/pending/overdue-count"),

  // クリエイター向け：質問分析ダッシュボード
  getQuestionAnalytics: () => apiFetch("/chat/creator/analytics"),
  getCategoryQuestions: (categoryId: number) => apiFetch(`/chat/creator/categories/${categoryId}/questions`),
  addCategoryContent: (categoryId: number, data: object) =>
    apiFetch(`/chat/creator/categories/${categoryId}/contents`, { method: "POST", body: JSON.stringify(data) }),
  deleteCategoryContent: (contentId: number) => apiFetch(`/chat/creator/contents/${contentId}`, { method: "DELETE" }),
  getPendingCategories: () => apiFetch("/chat/creator/categories/pending"),
  approveCategory: (categoryId: number) => apiFetch(`/chat/creator/categories/${categoryId}/approve`, { method: "PUT" }),
  rejectCategory: (categoryId: number) => apiFetch(`/chat/creator/categories/${categoryId}/reject`, { method: "PUT" }),

  // クリエイター向け：収益ダッシュボード
  getMyRevenue: () => apiFetch("/creators/me/revenue"),

  // 通報（学習者向け）
  submitReport: (data: object) => apiFetch("/admin/reports", { method: "POST", body: JSON.stringify(data) }),

  // 管理者機能
  adminListCreatorApplications: () => apiFetch("/admin/creator-applications"),
  adminApproveCreatorApplication: (profileId: number) => apiFetch(`/admin/creator-applications/${profileId}/approve`, { method: "PUT" }),
  adminRejectCreatorApplication: (profileId: number, reason?: string) =>
    apiFetch(`/admin/creator-applications/${profileId}/reject`, { method: "PUT", body: JSON.stringify({ reason: reason ?? null }) }),
  adminListAllCourses: () => apiFetch("/admin/courses"),
  adminSuspendCourse: (courseId: number, reason: string) =>
    apiFetch(`/admin/courses/${courseId}/suspend`, { method: "PUT", body: JSON.stringify({ reason }) }),
  adminUnsuspendCourse: (courseId: number) => apiFetch(`/admin/courses/${courseId}/unsuspend`, { method: "PUT" }),
  adminApproveCourse: (courseId: number) => apiFetch(`/admin/courses/${courseId}/approve`, { method: "PUT" }),
  adminRejectCourse: (courseId: number, reason?: string) =>
    apiFetch(`/admin/courses/${courseId}/reject`, { method: "PUT", body: JSON.stringify({ reason: reason ?? null }) }),
  adminDeleteCourse: (courseId: number) => apiFetch(`/admin/courses/${courseId}`, { method: "DELETE" }),
  adminListReports: () => apiFetch("/admin/reports"),
  adminResolveReport: (reportId: number) => apiFetch(`/admin/reports/${reportId}/resolve`, { method: "PUT" }),
  adminListTierBOverdue: () => apiFetch("/admin/tier-b-overdue"),
  adminListTextbooks: () => apiFetch("/admin/textbooks"),
  adminCreateTextbook: (data: object) => apiFetch("/admin/textbooks", { method: "POST", body: JSON.stringify(data) }),
  adminUpdateTextbook: (id: number, data: object) => apiFetch(`/admin/textbooks/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  adminDeleteTextbook: (id: number) => apiFetch(`/admin/textbooks/${id}`, { method: "DELETE" }),
  adminListAllCreators: () => apiFetch("/admin/creators"),
  adminSuspendCreator: (profileId: number) => apiFetch(`/admin/creators/${profileId}/suspend`, { method: "PUT" }),
  adminReactivateCreator: (profileId: number) => apiFetch(`/admin/creators/${profileId}/reactivate`, { method: "PUT" }),

  // 管理者機能：ユーザー（顧客）管理
  adminListCustomers: () => apiFetch("/customers/"),
  adminUpdateCustomer: (customerId: number, data: object) =>
    apiFetch(`/customers/${customerId}`, { method: "PATCH", body: JSON.stringify(data) }),
  adminReissuePassword: (customerId: number) => apiFetch(`/customers/${customerId}/reissue-password`, { method: "POST" }),
  adminDeleteCustomer: (customerId: number) => apiFetch(`/customers/${customerId}`, { method: "DELETE" }),

  // カリキュラム（章/カード構造 v2.0）
  getCurriculumMeta: (courseId: number) => apiFetch(`/courses/${courseId}`),
  updateCurriculumMeta: (courseId: number, data: object) =>
    apiFetch(`/courses/${courseId}/curriculum-meta`, { method: "PUT", body: JSON.stringify(data) }),
  uploadCourseThumbnail: (courseId: number, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiUpload(`/courses/${courseId}/thumbnail`, formData);
  },
  getCurriculumPrompt: (courseId: number) => apiFetch(`/courses/${courseId}/curriculum-prompt`),
  listChapters: (courseId: number) => apiFetch(`/courses/${courseId}/chapters`),
  createChapter: (courseId: number, data: object) =>
    apiFetch(`/courses/${courseId}/chapters`, { method: "POST", body: JSON.stringify(data) }),
  updateChapter: (courseId: number, chapterId: number, data: object) =>
    apiFetch(`/courses/${courseId}/chapters/${chapterId}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteChapter: (courseId: number, chapterId: number) =>
    apiFetch(`/courses/${courseId}/chapters/${chapterId}`, { method: "DELETE" }),
  createCard: (courseId: number, chapterId: number, data: object) =>
    apiFetch(`/courses/${courseId}/chapters/${chapterId}/cards`, { method: "POST", body: JSON.stringify(data) }),
  updateCard: (courseId: number, chapterId: number, cardId: number, data: object) =>
    apiFetch(`/courses/${courseId}/chapters/${chapterId}/cards/${cardId}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCard: (courseId: number, chapterId: number, cardId: number) =>
    apiFetch(`/courses/${courseId}/chapters/${chapterId}/cards/${cardId}`, { method: "DELETE" }),
  reorderChapters: (courseId: number, ids: number[]) =>
    apiFetch(`/courses/${courseId}/chapters/reorder`, { method: "PUT", body: JSON.stringify({ ids }) }),
  reorderCards: (courseId: number, chapterId: number, ids: number[]) =>
    apiFetch(`/courses/${courseId}/chapters/${chapterId}/cards/reorder`, { method: "PUT", body: JSON.stringify({ ids }) }),
  duplicateCard: (courseId: number, chapterId: number, cardId: number) =>
    apiFetch(`/courses/${courseId}/chapters/${chapterId}/cards/${cardId}/duplicate`, { method: "POST" }),
  getYoutubeMeta: (courseId: number, chapterId: number, cardId: number) =>
    apiFetch(`/courses/${courseId}/chapters/${chapterId}/cards/${cardId}/youtube-meta`),
  submitCurriculumForReview: (courseId: number) =>
    apiFetch(`/courses/${courseId}/submit-for-review`, { method: "POST" }),
  youtubeCheck: (courseId: number) =>
    apiFetch(`/courses/${courseId}/youtube-check`, { method: "POST" }),
  // 学習者向け
  getLearnerCurriculum: (courseId: number) => apiFetch(`/courses/${courseId}/curriculum`),
  setPace: (courseId: number, pace: string) =>
    apiFetch(`/courses/${courseId}/pace`, { method: "POST", body: JSON.stringify({ pace }) }),
  completeCard: (cardId: number) =>
    apiFetch(`/cards/${cardId}/complete`, { method: "POST" }),
  getLearnerProgress: (courseId: number) => apiFetch(`/courses/${courseId}/progress`),
  graduateCourse: (courseId: number) =>
    apiFetch(`/courses/${courseId}/graduate`, { method: "POST" }),

  // レビュー
  listCourseReviews: (courseId: number) =>
    apiFetch(`/courses/${courseId}/reviews`),
  getMyReview: (courseId: number) =>
    apiFetch(`/courses/${courseId}/reviews/mine`),
  createReview: (courseId: number, data: { content_rating: number; coaching_rating: number; body?: string }) =>
    apiFetch(`/courses/${courseId}/reviews`, { method: "POST", body: JSON.stringify(data) }),
};
