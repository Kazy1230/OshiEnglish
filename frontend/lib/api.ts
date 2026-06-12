const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost/api";

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
  getMyArticles: () => apiFetch("/articles/"),
  getArticle: (id: number) => apiFetch(`/articles/${id}`),
  submitMultipleChoiceExercise: (id: number, answers: (number | null)[]) =>
    apiFetch(`/articles/${id}/submit-mc`, { method: "POST", body: JSON.stringify({ answers }) }),
  checkExerciseAnswer: (id: number, questionIndex: number, chosenIndex: number | null) =>
    apiFetch(`/articles/${id}/check-answer`, { method: "POST", body: JSON.stringify({ question_index: questionIndex, chosen_index: chosenIndex }) }),
  submitWrittenExercise: (id: number, answer: string) =>
    apiFetch(`/articles/${id}/submit-written`, { method: "POST", body: JSON.stringify({ answer }) }),
  getCharacterTheme: (id: number) => apiFetch(`/characters/theme/${id}`),
  claimFreeContent: (data: { kind: "article" | "exercise"; exam_category: string; part?: string; exercise_format?: string }) =>
    apiFetch("/articles/me/free-content", { method: "POST", body: JSON.stringify(data) }),
  getCharacterBlogPosts: (characterId: number) => apiFetch(`/articles/character/${characterId}/blog-posts`),

  // 顧客：チャット（キャラクターとのメッセージ）
  getMyThread: (params?: { beforeId?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.beforeId != null) qs.set("before_id", String(params.beforeId));
    if (params?.limit != null) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return apiFetch(`/messages/me${q ? `?${q}` : ""}`);
  },
  sendMyMessage: (data: { content?: string; grammar_topic?: string }) =>
    apiFetch("/messages/me", { method: "POST", body: JSON.stringify(data) }),
  getMyRewardStatus: () => apiFetch("/messages/me/reward-status"),
  getMyUnreadCount: () => apiFetch("/messages/me/unread-count"),

  // 管理者：記事
  adminGetArticles: () => apiFetch("/articles/admin/all"),
  adminCreateArticle: (data: object) => apiFetch("/articles/admin/", { method: "POST", body: JSON.stringify(data) }),
  adminUpdateArticle: (id: number, data: object) => apiFetch(`/articles/admin/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  adminDeleteArticle: (id: number) => apiFetch(`/articles/admin/${id}`, { method: "DELETE" }),
  adminGenerateContent: (data: {
    article_type: string; character_id: number; theme?: string; level?: string;
    exercise_format?: string; exercise_category?: string;
  }) => apiFetch("/articles/admin/generate", { method: "POST", body: JSON.stringify(data) }),

  // 管理者：顧客
  adminGetCustomers: () => apiFetch("/customers/"),
  adminCreateCustomer: (data: object) => apiFetch("/customers/", { method: "POST", body: JSON.stringify(data) }),
  adminUpdateCustomer: (id: number, data: object) => apiFetch(`/customers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  adminDeleteCustomer: (id: number) => apiFetch(`/customers/${id}`, { method: "DELETE" }),
  adminReissuePassword: (id: number) => apiFetch(`/customers/${id}/reissue-password`, { method: "POST" }),
  adminGetCustomerProgress: (id: number) => apiFetch(`/customers/${id}/progress-stats`),
  adminRefundCustomer: (id: number) => apiFetch(`/payments/refund/${id}`, { method: "POST" }),

  // 退会
  withdraw: () => apiFetch("/customers/me/withdraw", { method: "POST" }),

  // 購入履歴・領収書
  getMyOrders: () => apiFetch("/orders/me"),
  downloadReceipt: async (orderId: number) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("yt_token") : null;
    const res = await fetch(`${API_BASE}/orders/${orderId}/receipt`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "領収書の取得に失敗しました" }));
      throw new Error(err.detail || "領収書の取得に失敗しました");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipt_${orderId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  // 管理者：受注
  adminGetOrders: () => apiFetch("/orders/"),
  adminCreateOrder: (data: object) => apiFetch("/orders/", { method: "POST", body: JSON.stringify(data) }),
  adminUpdateOrder: (id: number, data: object) => apiFetch(`/orders/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  adminDeleteOrder: (id: number) => apiFetch(`/orders/${id}`, { method: "DELETE" }),
  adminLinkOrderToCustomer: (orderId: number, customerId: number | null) =>
    apiFetch(`/orders/${orderId}/link-customer`, { method: "POST", body: JSON.stringify({ customer_id: customerId }) }),

  // 管理者：アクセスログ
  adminGetAccessLogs: () => apiFetch("/access-logs/"),
  adminGetCustomerLogs: (id: number) => apiFetch(`/access-logs/customer/${id}`),
  adminCleanupAccessLogs: (olderThanDays: number) =>
    apiFetch(`/access-logs/cleanup?older_than_days=${olderThanDays}`, { method: "DELETE" }),

  // 管理者：キャラクター
  adminGetCharacters: () => apiFetch("/characters/"),
  adminCreateCharacter: (data: object) => apiFetch("/characters/", { method: "POST", body: JSON.stringify(data) }),
  adminUpdateCharacter: (id: number, data: object) => apiFetch(`/characters/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  adminDeleteCharacter: (id: number) => apiFetch(`/characters/${id}`, { method: "DELETE" }),
  adminUploadCharacterImage: (id: number, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return apiUpload(`/characters/${id}/image`, fd);
  },
  adminDeleteCharacterImage: (id: number) => apiFetch(`/characters/${id}/image`, { method: "DELETE" }),

  // 管理者：チャット（メッセージ）
  adminListThreads: (params?: { assignedAdminId?: number | null; unassigned?: boolean; priority?: string; sort?: string }) => {
    const qs = new URLSearchParams();
    if (params?.unassigned) qs.set("unassigned", "true");
    else if (params?.assignedAdminId != null) qs.set("assigned_admin_id", String(params.assignedAdminId));
    if (params?.priority) qs.set("priority", params.priority);
    if (params?.sort) qs.set("sort", params.sort);
    const q = qs.toString();
    return apiFetch(`/messages/admin/threads${q ? `?${q}` : ""}`);
  },
  adminListOperators: () => apiFetch("/messages/admin/operators"),
  adminUpdateAssignment: (customerId: number, data: { assigned_admin_id?: number | null; priority?: string }) =>
    apiFetch(`/messages/admin/${customerId}/assignment`, { method: "PATCH", body: JSON.stringify(data) }),
  adminGetThread: (customerId: number, params?: { beforeId?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.beforeId != null) qs.set("before_id", String(params.beforeId));
    if (params?.limit != null) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return apiFetch(`/messages/admin/${customerId}${q ? `?${q}` : ""}`);
  },
  adminReplyMessage: (customerId: number, content: string) =>
    apiFetch(`/messages/admin/${customerId}/reply`, { method: "POST", body: JSON.stringify({ content }) }),
  adminDraftReply: (customerId: number) =>
    apiFetch(`/messages/admin/${customerId}/draft-reply`, { method: "POST" }),
  adminListExerciseSubmissions: () => apiFetch("/messages/admin/exercise-submissions"),
  adminDraftExerciseFeedback: (messageId: number) =>
    apiFetch(`/messages/admin/exercise-submissions/${messageId}/draft-feedback`, { method: "POST" }),
  adminUpdateRequestStatus: (messageId: number, status: string) =>
    apiFetch(`/messages/admin/request/${messageId}?status=${encodeURIComponent(status)}`, { method: "PATCH" }),
  adminGetCustomerRequests: (customerId: number) =>
    apiFetch(`/messages/admin/requests/${customerId}`),
  adminAdjustIntimacy: (customerId: number, delta: number, reason?: string) =>
    apiFetch(`/messages/admin/${customerId}/intimacy/adjust`, { method: "POST", body: JSON.stringify({ delta, reason }) }),
  adminEditMessage: (messageId: number, content: string) =>
    apiFetch(`/messages/admin/message/${messageId}`, { method: "PATCH", body: JSON.stringify({ content }) }),
  adminDeleteMessage: (messageId: number) =>
    apiFetch(`/messages/admin/message/${messageId}`, { method: "DELETE" }),
  adminSendReward: (customerId: number, file: File, message?: string) => {
    const fd = new FormData();
    fd.append("file", file);
    if (message) fd.append("message", message);
    return apiUpload(`/messages/admin/${customerId}/reward`, fd);
  },

  // 管理者：文法マスター
  adminGetGrammarMasters: () => apiFetch("/grammar-masters/"),
  adminCreateGrammarMaster: (data: object) => apiFetch("/grammar-masters/", { method: "POST", body: JSON.stringify(data) }),
  adminUpdateGrammarMaster: (id: number, data: object) => apiFetch(`/grammar-masters/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  adminDeleteGrammarMaster: (id: number) => apiFetch(`/grammar-masters/${id}`, { method: "DELETE" }),

  // 管理者：料金・サービスメニュー
  // （顧客向けの公開一覧はあえて用意していない。キャラクターがチャットで自然に誘導する方針のため）
  adminListAllServiceItems: () => apiFetch("/service-items/admin/all"),
  adminCreateServiceItem: (data: object) => apiFetch("/service-items/admin/", { method: "POST", body: JSON.stringify(data) }),
  adminUpdateServiceItem: (id: number, data: object) => apiFetch(`/service-items/admin/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  adminDeleteServiceItem: (id: number) => apiFetch(`/service-items/admin/${id}`, { method: "DELETE" }),

  // 管理者：親密度ポイント自動加算設定
  adminGetIntimacySettings: () => apiFetch("/intimacy-settings/admin/"),
  adminUpdateIntimacySettings: (data: object) => apiFetch("/intimacy-settings/admin/", { method: "PATCH", body: JSON.stringify(data) }),

  // 公開：決済（Stripe）
  createCheckoutSession: (orderId: number) =>
    apiFetch("/payments/create-checkout-session", { method: "POST", body: JSON.stringify({ order_id: orderId }) }),
  getPaymentSession: (sessionId: string) => apiFetch(`/payments/session/${encodeURIComponent(sessionId)}`),

  // 管理者：報酬コンテンツ管理
  adminListRewardItems: (characterId?: number) =>
    apiFetch(`/rewards/admin/items${characterId != null ? `?character_id=${characterId}` : ""}`),
  adminCreateRewardItem: (data: object) => apiFetch("/rewards/admin/items", { method: "POST", body: JSON.stringify(data) }),
  adminUpdateRewardItem: (id: number, data: object) => apiFetch(`/rewards/admin/items/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  adminDeleteRewardItem: (id: number) => apiFetch(`/rewards/admin/items/${id}`, { method: "DELETE" }),
  adminUploadRewardImage: (id: number, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return apiUpload(`/rewards/admin/items/${id}/image`, fd);
  },

  // 顧客：報酬・ご褒美
  getMyRewards: () => apiFetch("/rewards/me"),
  ackRewardUnlock: (id: number) => apiFetch(`/rewards/me/${id}/ack`, { method: "POST" }),
  applyWallpaper: (id: number) => apiFetch(`/rewards/me/wallpaper/${id}/apply`, { method: "POST" }),
  clearWallpaper: () => apiFetch("/rewards/me/wallpaper", { method: "DELETE" }),
};
