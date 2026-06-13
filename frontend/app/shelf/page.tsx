"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import { resolveTheme, pickGreeting, maskEmail, type CharacterTheme } from "@/lib/theme";
import { ShelfSkeleton } from "@/components/Skeleton";
import { useDarkMode } from "@/lib/darkMode";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { reportError } from "@/lib/reportError";
import { toast } from "@/components/Toast";
import { RequestArticleModal } from "@/components/RequestArticleModal";
import { CorrectionSubmissionModal } from "@/components/CorrectionSubmissionModal";

type Article = {
  id: number; title: string; character_id: number;
  article_type?: string;
  exercise_format?: "multiple_choice" | "written_response" | null;
  exercise_category?: string | null;
};
type Me = {
  username: string; display_name?: string; is_admin: boolean; is_password_reset_required: boolean; character_id: number | null;
  theme_config?: { wallpaper_url?: string } | null;
  email?: string | null; free_content_claimed?: boolean;
};

export default function ShelfPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [theme, setTheme] = useState<CharacterTheme | null>(null);
  const [greeting, setGreeting] = useState<string | undefined>(undefined);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mode, toggleMode] = useDarkMode();
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [correctionModalType, setCorrectionModalType] = useState<"writing" | "speaking" | null>(null);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    (async () => {
      try {
        const user = await api.me();
        if (user.is_password_reset_required) { router.replace("/change-password"); return; }
        if (user.is_admin) { router.replace("/admin"); return; }
        setMe(user);
        const [data, charTheme] = await Promise.all([
          api.getMyArticles(),
          user.character_id ? api.getCharacterTheme(user.character_id) : Promise.resolve(null),
        ]);
        setArticles(data);
        setTheme(charTheme);
        setGreeting(pickGreeting(charTheme));
      } catch {
        clearToken();
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  // LINE風の未読バッジ：チャットの未読件数を取得（本棚を開くたび、およびタブが見えている間だけ定期的に更新）
  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    async function loadUnread() {
      try {
        const res = await api.getMyUnreadCount();
        if (!cancelled) setUnread(res.unread || 0);
      } catch (err) { reportError("shelf:getMyUnreadCount", err); }
    }
    loadUnread();

    let interval: ReturnType<typeof setInterval> | null = null;
    function startPolling() {
      if (interval) return;
      interval = setInterval(loadUnread, 30000);
    }
    function stopPolling() {
      if (interval) { clearInterval(interval); interval = null; }
    }
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        loadUnread();
        startPolling();
      } else {
        stopPolling();
      }
    }

    if (document.visibilityState === "visible") startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", loadUnread);

    return () => {
      cancelled = true;
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", loadUnread);
    };
  }, []);

  const t = resolveTheme(theme, mode);

  if (loading) return <ShelfSkeleton />;

  async function handleWithdraw() {
    setWithdrawing(true);
    try {
      await api.withdraw();
      clearToken();
      router.push("/login?withdrawn=1");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "退会処理に失敗しました", "error");
      setWithdrawing(false);
    }
  }

  const wallpaperUrl = me?.theme_config?.wallpaper_url;
  const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL || "http://localhost/api";

  return (
    <div className="min-h-screen" style={{
      background: wallpaperUrl
        ? `linear-gradient(rgba(255,255,255,0.82), rgba(255,255,255,0.82)), url(${API_ORIGIN}${wallpaperUrl})`
        : t.bg,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundAttachment: "fixed",
      fontFamily: t.fontFamily,
    }}>
      {/* 透かし */}
      <div className="watermark"><span style={{ color: t.primary }}>{me?.display_name || me?.username}</span></div>

      {/* ヘッダー */}
      <header className="sticky top-0 z-20 shadow-md" style={{ background: t.primary }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-lg sm:text-xl font-black text-white" style={{ fontFamily: t.fontFamily }}>推しEnglish</h1>
            {theme?.name && (
              <span className="hidden sm:inline-block text-xs px-2 py-0.5 rounded-full font-bold text-white/80"
                style={{ background: "rgba(255,255,255,0.15)" }}>
                {theme.name} ver.
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <button onClick={() => router.push("/rewards")} aria-label="ご褒美コレクション"
              className="text-xs sm:text-sm text-white/80 hover:text-white transition-colors">🎁 ご褒美</button>
            <button onClick={() => router.push("/purchases")} aria-label="購入履歴"
              className="text-xs sm:text-sm text-white/80 hover:text-white transition-colors">🧾 購入履歴</button>
            <DarkModeToggle mode={mode} onToggle={toggleMode} variant="onColor" />
            <span className="hidden sm:inline text-sm text-white/70">{me?.display_name || me?.username} さん</span>
            <button onClick={() => { clearToken(); router.push("/login"); }}
              aria-label="ログアウト"
              className="text-xs sm:text-sm text-white/50 hover:text-white transition-colors">ログアウト</button>
          </div>
        </div>
        <div className="h-1" style={{ background: t.accent }} />
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 relative z-10">

        {/* ウェルカムカード：
            ・オリジナルキャラ（キャラ未割り当て）の間は中立的な案内を表示
            ・公式キャラは「最初の1つ無料」を受け取るまで表示 */}
        {(!me?.character_id || (theme?.is_preset && !me?.free_content_claimed)) && (
          <WelcomeCard theme={t} email={me?.email} freeContentClaimed={!!me?.free_content_claimed}
            pending={!me?.character_id}
            onClaimed={(article) => {
              setArticles(prev => [...prev, { id: article.id, title: article.title, character_id: 0, article_type: article.article_type }]);
              setMe(prev => prev ? { ...prev, free_content_claimed: true } : prev);
            }} />
        )}

        {/* キャラクターバナー（リッチ版） */}
        {theme && (
          <div className="rounded-2xl overflow-hidden shadow-md mb-8" style={{ border: `2px solid ${t.accent}` }}>
            {/* カラー帯 */}
            <div className="h-2" style={{ background: `linear-gradient(90deg, ${t.primary}, ${t.accent})` }} />
            <div className="flex flex-wrap items-center gap-4 sm:gap-5 px-4 sm:px-6 py-4" style={{ background: t.card }}>
              {/* アバター */}
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black text-white shadow-md flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.accent})` }}>
                {theme.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-[140px]">
                <p className="text-xs font-bold mb-0.5" style={{ color: t.accent }}>あなたの担当キャラクター</p>
                <p className="text-lg font-black" style={{ color: t.primary, fontFamily: t.fontFamily }}>{theme.name}</p>
                {theme.description && (
                  <p className="text-sm mt-0.5 italic" style={{ color: t.accent }}>「{theme.description}」</p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-3xl font-black" style={{ color: t.primary }}>{articles.length}</p>
                <p className="text-xs" style={{ color: t.accent }}>冊の参考書</p>
              </div>
            </div>
            {/* キャラクターからの一言＋お話するボタン */}
            {greeting && (
              <div className="px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-start gap-3" style={{ background: t.example_bg, borderTop: `1px dashed ${t.border}` }}>
                <div className="flex items-start gap-3 flex-1">
                  <span className="text-lg flex-shrink-0">💬</span>
                  <p className="text-sm leading-relaxed" style={{ color: t.text, fontFamily: t.fontFamily }}>
                    <span className="font-bold" style={{ color: t.accent }}>{theme.name}より：</span>
                    「{greeting}」
                  </p>
                </div>
                <button onClick={() => router.push("/chat")}
                  className="relative self-start sm:self-auto text-xs px-3 py-1.5 rounded-full font-bold text-white transition-all hover:shadow-md flex items-center gap-1.5 flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.accent})` }}>
                  💬 {theme?.name ? `${theme.name}とお話する` : "キャラクターとお話する"}
                  {unread > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center text-[11px] font-black text-white shadow-md"
                      style={{ background: "#ff3b30", border: "2px solid white" }}>
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </button>
              </div>
            )}
            {/* 公式キャラクターのInstagramアカウント案内 */}
            {theme.is_preset && theme.instagram_account && (
              <a href={`https://www.instagram.com/${theme.instagram_account}`} target="_blank" rel="noopener noreferrer"
                className="px-4 sm:px-6 py-2.5 flex items-center gap-3 text-xs transition-colors"
                style={{ background: t.example_bg, borderTop: `1px dashed ${t.border}`, color: t.text }}>
                <span className="text-lg flex-shrink-0">📷</span>
                <span className="flex-1">
                  <span className="font-bold" style={{ color: t.accent }}>{theme.name}</span>
                  の公式Instagramをフォローしよう！
                </span>
                <span style={{ color: t.accent }}>→</span>
              </a>
            )}
            {/* 下部カラー帯 */}
            <div className="h-1" style={{ background: t.accent, opacity: 0.4 }} />
          </div>
        )}

        {/* タイトル */}
        <div className="mb-6">
          <h2 className="text-2xl font-black" style={{ color: t.primary }}>📚 あなたの本棚</h2>
          <p className="text-sm mt-1" style={{ color: t.accent }}>
            {articles.length > 0 ? `${articles.length}冊の参考書が届いています` : "まだ記事がありません"}
          </p>
        </div>

        {articles.length === 0 && (
          <div className="text-center py-12 px-4 sm:px-8 rounded-2xl border-2 border-dashed mb-6" style={{ borderColor: t.border, background: t.card }}>
            <p className="text-5xl mb-4">📖</p>
            <p className="font-bold" style={{ color: t.primary, fontFamily: t.fontFamily }}>本棚はまだ空です</p>
            <p className="text-sm mt-2" style={{ color: t.accent }}>
              通常、お申し込みから2〜3日ほどで最初の1冊目が届きます。届くまで今しばらくお待ちください。
            </p>

            {greeting && (
              <div className="mt-6 max-w-md mx-auto rounded-xl p-4 text-left" style={{ background: t.example_bg, border: `1px dashed ${t.border}` }}>
                <p className="text-xs font-bold mb-1" style={{ color: t.accent }}>
                  💬 {theme?.name ? `${theme.name}より` : "キャラクターより"}：
                </p>
                <p className="text-sm leading-relaxed" style={{ color: t.text, fontFamily: t.fontFamily }}>「{greeting}」</p>
              </div>
            )}

            {me?.character_id && (
              <button onClick={() => router.push("/chat")}
                className="relative mt-6 inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-full font-bold text-white transition-all hover:shadow-md"
                style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.accent})` }}>
                💬 {theme?.name ? `${theme.name}とお話する` : "キャラクターとお話する"}
                {unread > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center text-[11px] font-black text-white shadow-md"
                    style={{ background: "#ff3b30", border: "2px solid white" }}>
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </button>
            )}
          </div>
        )}

        {articles.length > 0 && (
          /* 本棚の色分けルールの凡例 */
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 text-xs" style={{ color: t.accent }}>
            <span className="font-bold" style={{ color: t.primary }}>表紙の色の見方：</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "hsl(265,60%,55%)" }} />
              🧩 演習問題（解いて提出）
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "hsl(210,60%,55%)" }} />
              📰 ブログ（読みもの）
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "hsl(30,60%,55%)" }} />
              文法解説記事（その他の色）
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
          {articles.map((article, i) => (
            <BookCard key={article.id} article={article} index={i} theme={t}
              onClick={() => router.push(`/articles/${article.id}`)} />
          ))}
          {/* 次の記事・問題・添削依頼カード（オリジナルキャラのキャラ作成完了前は非表示） */}
          {me?.character_id && (
            <RequestCard theme={t} onClick={() => setShowRequestModal(true)} />
          )}
        </div>

        {/* 退会リンク */}
        <div className="mt-12 text-center">
          <button onClick={() => setShowWithdrawModal(true)}
            className="text-xs underline transition-colors" style={{ color: t.accent }}>
            退会する
          </button>
        </div>
      </main>

      {/* 記事・問題・添削のリクエストポップアップ */}
      {showRequestModal && (
        <RequestArticleModal theme={t} onClose={() => setShowRequestModal(false)}
          onRequestCorrection={(type) => setCorrectionModalType(type)} />
      )}

      {/* 添削提出ポップアップ（お題不要のライティング/スピーキング添削） */}
      {correctionModalType && (
        <CorrectionSubmissionModal theme={t} initialType={correctionModalType}
          onClose={() => setCorrectionModalType(null)} />
      )}

      {/* 退会確認モーダル */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="card max-w-md w-full flex flex-col gap-3" style={{ background: "var(--card-bg, #fff)" }}>
            <h3 className="font-black text-lg" style={{ color: "var(--primary)" }}>🚪 退会の確認</h3>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              本当に退会しますか？退会すると以下の点にご注意ください。
            </p>
            <ul className="text-sm leading-relaxed list-disc pl-5" style={{ color: "var(--muted)" }}>
              <li>未使用のコンテンツにアクセスできなくなります</li>
              <li>キャラクターとのチャット履歴は削除されます</li>
              <li>この操作は取り消せません</li>
            </ul>
            <div className="flex gap-2 mt-2">
              <button className="btn-ghost flex-1 text-center" disabled={withdrawing}
                onClick={() => setShowWithdrawModal(false)}>
                キャンセル
              </button>
              <button className="flex-1 text-center text-white rounded-lg py-2 font-bold transition-colors disabled:opacity-60"
                style={{ background: "#c0392b" }} disabled={withdrawing}
                onClick={handleWithdraw}>
                {withdrawing ? "処理中…" : "退会する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BookCard({ article, index, theme: t, onClick }: {
  article: Article; index: number;
  theme: ReturnType<typeof resolveTheme>;
  onClick: () => void;
}) {
  const hues = [210, 30, 150, 280, 50, 170, 340, 90];
  // 演習問題は紫系の色味で統一し、ひと目で「解く」コンテンツだと分かるようにする
  const isExercise = article.article_type === "exercise";
  const isBlog = article.article_type === "blog";
  const hue = isExercise ? 265 : hues[index % hues.length];
  const actionLabel = isExercise ? "解く →" : isBlog ? "読む →" : "読む →";
  const badgeIcon = isExercise ? "🧩" : isBlog ? "📰" : null;
  const badgeText = isExercise ? (article.exercise_category || "演習問題") : isBlog ? "ブログ" : null;

  return (
    <button onClick={onClick}
      aria-label={`記事を開く: ${article.title}`}
      className="group relative flex flex-col rounded-2xl shadow-md hover:shadow-xl transition-all duration-200 hover:-translate-y-2 overflow-hidden text-left w-full"
      style={{ minHeight: "200px", background: t.card, border: `1px solid ${t.border}` }}>
      <div className="h-3 w-full flex-shrink-0" style={{ background: `hsl(${hue},60%,55%)` }} />
      <div className="absolute left-0 top-0 bottom-0 w-2" style={{ background: `hsl(${hue},60%,40%)` }} />
      <div className="p-4 pt-3 flex flex-col flex-1 pl-5">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-xs font-bold" style={{ color: `hsl(${hue},50%,45%)` }}>
            #{article.id.toString().padStart(3, "0")}
          </p>
          {badgeText && (
            <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
              style={{ background: `hsl(${hue},60%,92%)`, color: `hsl(${hue},55%,38%)` }}>
              {badgeIcon} {badgeText}
            </span>
          )}
        </div>
        <p className="font-bold text-sm leading-snug flex-1" style={{ color: t.primary, fontFamily: t.fontFamily }}>
          {article.title}
        </p>
        <div className="mt-3">
          <span className="text-xs px-2 py-1 rounded-full font-bold"
            style={{ background: `hsl(${hue},60%,55%)`, color: "white" }}>
            {actionLabel}
          </span>
        </div>
      </div>
    </button>
  );
}

function RequestCard({ theme: t, onClick }: {
  theme: ReturnType<typeof resolveTheme>;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      aria-label="次の記事・問題・添削をリクエストする"
      className="group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-2 text-center w-full p-4"
      style={{ minHeight: "200px", borderColor: t.border, background: t.example_bg }}>
      <p className="text-3xl mb-2">＋</p>
      <p className="font-bold text-sm leading-snug" style={{ color: t.primary, fontFamily: t.fontFamily }}>
        次の記事・問題・添削を<br />リクエストする
      </p>
      <p className="text-xs mt-2" style={{ color: t.accent }}>
        気になるテーマがあれば伝えてみよう
      </p>
    </button>
  );
}

function WelcomeCard({ theme: t, email, freeContentClaimed, pending, onClaimed }: {
  theme: ReturnType<typeof resolveTheme>;
  email?: string | null;
  freeContentClaimed: boolean;
  /** true: オリジナルキャラ（キャラクタービルダー使用・キャラ未割り当て）, false: 公式キャラ（キャラ割り当て済み） */
  pending: boolean;
  onClaimed: (article: { id: number; title: string; article_type: string }) => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleClaim() {
    setSubmitting(true);
    try {
      const article = await api.claimWelcomeArticle();
      onClaimed(article);
      toast("無料記事を本棚に追加しました！", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "コンテンツの作成に失敗しました", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl overflow-hidden shadow-md mb-8" style={{ border: `2px solid ${t.accent}` }}>
      <div className="h-2" style={{ background: `linear-gradient(90deg, ${t.primary}, ${t.accent})` }} />
      <div className="p-4 sm:p-6" style={{ background: t.card }}>
        {/* 1. サービス説明 */}
        <h2 className="text-xl font-black mb-2" style={{ color: t.primary, fontFamily: t.fontFamily }}>
          ようこそ、推しEnglishへ 🎉
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: t.text }}>
          推しEnglishは、あなただけの「推し」キャラクターが英語学習のパートナーになって、
          記事や演習問題を届けたり、チャットで励ましてくれるサービスです。
        </p>

        {pending && (
          <div className="mt-3 rounded-xl p-3 flex items-start gap-3" style={{ background: t.example_bg, border: `1px dashed ${t.border}` }}>
            <span className="text-lg flex-shrink-0">🎨</span>
            <p className="text-sm leading-relaxed" style={{ color: t.text, fontFamily: t.fontFamily }}>
              あなたの先生を準備しています。もうしばらくお待ちください。
            </p>
          </div>
        )}

        {/* 2. 無料キャンペーンの案内（公式キャラのみ。オリジナルキャラはキャラ未割り当てのため対象外） */}
        {!pending && (
          <div className="mt-6 rounded-xl p-4" style={{ background: t.example_bg, border: `2px solid ${t.accent}` }}>
            <p className="text-xs font-black inline-block px-2 py-0.5 rounded-full text-white mb-2"
              style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.accent})` }}>
              🎁 最初の1つ無料！
            </p>
            <p className="text-sm mb-3" style={{ color: t.text }}>
              ボタンを押すと、あなたの「推し」キャラクターからのウェルカム記事を1つ本棚に届けます。
            </p>

            {freeContentClaimed ? (
              <p className="text-sm font-bold" style={{ color: t.accent }}>
                ✅ 無料コンテンツは利用済みです。本棚をご確認ください。
              </p>
            ) : (
              <button onClick={handleClaim} disabled={submitting}
                className="self-start text-sm px-4 py-2 rounded-full font-bold text-white transition-all hover:shadow-md disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.accent})` }}>
                {submitting ? "受け取り中…" : "無料で受け取る"}
              </button>
            )}
          </div>
        )}

        {/* 3. キャラ完成通知の説明（オリジナルキャラのみ） */}
        {pending && (
          <div className="mt-6 rounded-xl p-3 flex items-start gap-3" style={{ background: t.example_bg, border: `1px dashed ${t.border}` }}>
            <span className="text-lg flex-shrink-0">📩</span>
            <p className="text-sm leading-relaxed" style={{ color: t.text }}>
              キャラクターが完成しましたら、登録メールアドレス宛にお知らせします。
              {email && (
                <>
                  <br />
                  <span className="font-bold" style={{ color: t.accent }}>登録メールアドレス：{maskEmail(email)}</span>
                </>
              )}
            </p>
          </div>
        )}

        {/* 4. チャットへの導線（公式キャラのみ。オリジナルキャラはキャラ準備中のため非表示） */}
        {!pending && (
          <button onClick={() => router.push("/chat")}
            className="mt-6 inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-full font-bold text-white transition-all hover:shadow-md"
            style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.accent})` }}>
            💬 チャット画面を見る
          </button>
        )}
      </div>
    </div>
  );
}
