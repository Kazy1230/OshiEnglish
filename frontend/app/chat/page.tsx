"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import {
  resolveTheme, fillTemplate,
  DEFAULT_REWARD_PROGRESS_TEMPLATE, DEFAULT_CHAT_FOOTER_NOTE,
  INTIMACY_INFO_TEXT, REWARD_INFO_TEXT,
  type CharacterTheme,
} from "@/lib/theme";

// チャット送信失敗時のエラー文言（キャラごとの口調差は出さず、常に中立な文言にする）
const CHAT_ERROR_MESSAGE = "送信に失敗しました。もう一度お試しください。";
import { useDarkMode } from "@/lib/darkMode";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { toast } from "@/components/Toast";
import { RequestArticleModal } from "@/components/RequestArticleModal";
import { CorrectionSubmissionModal } from "@/components/CorrectionSubmissionModal";

const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL || "http://localhost/api";

type Msg = {
  id: number;
  sender: "customer" | "character";
  content: string | null;
  image_url: string | null;
  is_request: boolean;
  grammar_topic: string | null;
  request_status: string | null;
  is_reward: boolean;
  suggested_action: string | null;
  created_at: string;
  my_feedback?: "good" | "bad" | null;
};

type Intimacy = {
  points: number;
  level: number;
  max_level: number;
  stage_label: string;
  stage_hint: string;
  current_level_threshold: number;
  next_level_threshold: number | null;
  points_to_next_level: number;
};

type RewardStatus = {
  published_articles: number;
  reward_interval: number;
  earned_milestones: number;
  sent_rewards: number;
  pending_rewards: number;
  articles_until_next_reward: number;
  next_reward_target: number;
};

type UnlockedRewardItem = {
  id: number;
  category: "line" | "title" | "wallpaper";
  category_label: string;
  text_content: string | null;
  icon: string | null;
  image_url: string | null;
};

const REWARD_CATEGORY_ICON: Record<UnlockedRewardItem["category"], string> = { line: "💬", title: "🏅", wallpaper: "🖼️" };

type Me = { username: string; role: string; is_password_reset_required: boolean; character_id: number | null; theme_config?: { wallpaper_url?: string } | null };

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatPageInner />
    </Suspense>
  );
}

function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [me, setMe] = useState<Me | null>(null);
  const [theme, setTheme] = useState<CharacterTheme | null>(null);
  const [charInfo, setCharInfo] = useState<{ id: number; name: string; image_url?: string } | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reward, setReward] = useState<RewardStatus | null>(null);
  const [intimacy, setIntimacy] = useState<Intimacy | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [correctionModalType, setCorrectionModalType] = useState<"writing" | "speaking" | "ask" | null>(null);
  const [mode, toggleMode] = useDarkMode();
  const [levelUpInfo, setLevelUpInfo] = useState<{ level: number; stage_label: string } | null>(null);
  const [celebratingReward, setCelebratingReward] = useState<UnlockedRewardItem | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prependingRef = useRef(false);
  const prevLevelRef = useRef<number | null>(null);

  async function handleRateMessage(messageId: number, rating: "good" | "bad") {
    const current = messages.find(m => m.id === messageId);
    const next = current?.my_feedback === rating ? null : rating;
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, my_feedback: next } : m));
    try {
      if (next) {
        await api.rateMessage(messageId, next);
      } else {
        await api.unrateMessage(messageId);
      }
    } catch (err: any) {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, my_feedback: current?.my_feedback ?? null } : m));
      toast(err.message || "評価の送信に失敗しました", "error");
    }
  }

  async function checkRewardUnlocks() {
    try {
      const rewards = await api.getMyRewards();
      const newItem = rewards.items.find((i: any) => i.unlocked && i.is_new);
      if (newItem) setCelebratingReward(newItem);
    } catch { /* 演出のチェックは失敗してもブロックしない */ }
  }

  async function load() {
    const thread = await api.getMyThread();
    setCharInfo(thread.character);
    setMessages(thread.messages);
    setHasMore(!!thread.has_more);
    setReward(thread.reward_status);
    setIntimacy(thread.intimacy ?? null);

    if (thread.intimacy) {
      if (prevLevelRef.current !== null && thread.intimacy.level > prevLevelRef.current) {
        setLevelUpInfo({ level: thread.intimacy.level, stage_label: thread.intimacy.stage_label });
      }
      prevLevelRef.current = thread.intimacy.level;
    }

    await checkRewardUnlocks();
  }

  async function dismissLevelUp() {
    setLevelUpInfo(null);
  }

  async function dismissCelebratingReward() {
    const current = celebratingReward;
    if (!current) return;
    setCelebratingReward(null);
    try { await api.ackRewardUnlock(current.id); } catch { /* 演出の確認は失敗してもブロックしない */ }
  }

  async function loadOlder() {
    if (loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    prependingRef.current = true;
    try {
      const thread = await api.getMyThread({ beforeId: messages[0].id });
      setMessages(prev => [...thread.messages, ...prev]);
      setHasMore(!!thread.has_more);
    } catch {
      toast(CHAT_ERROR_MESSAGE, "error");
    } finally { setLoadingMore(false); }
  }

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    (async () => {
      try {
        const user = await api.me();
        if (user.is_password_reset_required) { router.replace("/change-password"); return; }
        if (user.role === "admin") { router.replace("/admin"); return; }
        setMe(user);
        if (!user.character_id) { return; }
        const charTheme = await api.getCharacterTheme(user.character_id);
        setTheme(charTheme);
        await load();
      } catch {
        clearToken();
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // 本棚の「次の記事をリクエストする」から遷移してきた場合は、自動でリクエストポップアップを開く
  useEffect(() => {
    if (searchParams.get("request") === "1") {
      setShowRequestModal(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 過去ログ読み込み（loadOlder）で先頭にメッセージが追加されたときは
  // 一番下までスクロールしない（読んでいる位置が大きくジャンプしてしまうため）
  useEffect(() => {
    if (prependingRef.current) { prependingRef.current = false; return; }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, loading]);

  const t = resolveTheme(theme, mode);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    if (!text.trim()) return;
    setSending(true);
    try {
      await api.sendMyMessage({ content: text.trim() });
      setText("");
      await load();
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("クレジットが不足")) {
        toast("クレジットが不足しています。クレジットを購入してください", "error");
      } else {
        toast(CHAT_ERROR_MESSAGE, "error");
      }
    } finally { setSending(false); }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: t.bg }}>
        <p style={{ color: t.primary }}>読み込み中...</p>
      </div>
    );
  }

  if (!me?.character_id) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center" style={{ background: t.bg }}>
        <p className="text-5xl mb-4">🛠️</p>
        <h1 className="text-xl font-black mb-2" style={{ color: t.primary, fontFamily: t.fontFamily }}>
          キャラクター準備中です
        </h1>
        <p className="text-sm leading-relaxed max-w-sm" style={{ color: t.text }}>
          あなた専用のキャラクターを準備しています。完成しましたら、登録メールアドレス宛にお知らせします。
          完成までは、本棚に届いているウェルカム記事をご覧ください。
        </p>
        <button onClick={() => router.push("/shelf")}
          className="mt-6 inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-full font-bold text-white transition-all hover:shadow-md"
          style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.accent})` }}>
          📚 本棚に戻る
        </button>
      </div>
    );
  }

  const charName = charInfo?.name || theme?.name || "キャラクター";
  const charImage = charInfo?.image_url || theme?.image_url;

  const wallpaperUrl = me?.theme_config?.wallpaper_url;

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{
      background: wallpaperUrl
        ? `linear-gradient(rgba(255,255,255,0.82), rgba(255,255,255,0.82)), url(${API_ORIGIN}${wallpaperUrl})`
        : t.bg,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundAttachment: "fixed",
      fontFamily: t.fontFamily,
    }}>
      {/* ヘッダー */}
      <header className="sticky top-0 z-20 shadow-md flex-shrink-0" style={{ background: t.primary }}>
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => router.push("/shelf")} aria-label="本棚へ戻る"
              className="text-white/70 hover:text-white text-sm flex-shrink-0">← 本棚</button>
            {charImage ? (
              <img src={`${API_ORIGIN}${charImage}`} alt={charName}
                className="w-9 h-9 rounded-full object-cover border-2 border-white/40 flex-shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black text-white flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${t.accent}, ${t.primary})`, border: "2px solid rgba(255,255,255,0.4)" }}>
                {charName.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-white font-black text-sm truncate">{charName}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <DarkModeToggle mode={mode} onToggle={toggleMode} variant="onColor" />
            <button onClick={() => { clearToken(); router.push("/login"); }}
              className="text-xs text-white/50 hover:text-white transition-colors flex-shrink-0">ログアウト</button>
          </div>
        </div>
        <div className="h-1" style={{ background: t.accent }} />
      </header>

      {!me?.character_id ? (
        /* キャラ作成完了前：チャットはまだ利用できない */
        <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-16 flex items-center justify-center">
          <div className="text-center rounded-2xl px-6 py-10" style={{ background: t.card, border: `1px dashed ${t.border}` }}>
            <p className="text-4xl mb-3">🛠️</p>
            <p className="font-bold mb-2" style={{ color: t.primary, fontFamily: t.fontFamily }}>キャラクター準備中です</p>
            <p className="text-sm" style={{ color: t.accent }}>
              あなたの先生を準備しています。完成しましたらメールでお知らせしますので、もうしばらくお待ちください。
            </p>
            <button onClick={() => router.push("/shelf")}
              className="mt-6 inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-full font-bold text-white transition-all hover:shadow-md"
              style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.accent})` }}>
              ← 本棚に戻る
            </button>
          </div>
        </main>
      ) : (
      <>
      {/* ご褒美プログレス */}
      {reward && (
        <div className="max-w-3xl mx-auto w-full px-4 pt-3">
          <div className="rounded-xl px-4 py-2.5 flex items-center gap-3 text-xs"
            style={{ background: t.example_bg, border: `1px solid ${t.border}`, color: t.text }}>
            <button onClick={() => router.push("/rewards")} aria-label="ご褒美コレクション"
              className="text-lg flex-shrink-0 hover:opacity-70 transition-opacity">🎁</button>
            {reward.pending_rewards > 0 ? (
              <p className="font-bold flex-1" style={{ color: t.accent }}>
                ご褒美が届いています！メッセージをチェックしてみてね 🎉
              </p>
            ) : (
              <div className="flex-1">
                <p onClick={() => router.push("/rewards")} className="cursor-pointer hover:opacity-70 transition-opacity">
                  {(() => {
                    const tmpl = theme?.reward_progress_template || DEFAULT_REWARD_PROGRESS_TEMPLATE;
                    const filled = fillTemplate(tmpl, {
                      character: charName,
                      published: reward.published_articles,
                      remaining: reward.articles_until_next_reward,
                      target: reward.next_reward_target,
                    });
                    // 数字部分を強調表示するため、テンプレート内の数値だけを太字スタンプに置き換える
                    const parts = filled.split(new RegExp(`(${reward.published_articles}|${reward.articles_until_next_reward})`));
                    return parts.map((part, i) => {
                      if (part === String(reward.published_articles)) {
                        return <span key={i} className="font-black" style={{ color: t.primary }}>{part}</span>;
                      }
                      if (part === String(reward.articles_until_next_reward)) {
                        return <span key={i} className="font-black" style={{ color: t.accent }}>{part}</span>;
                      }
                      return <span key={i}>{part}</span>;
                    });
                  })()}
                </p>
                <div className="mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ background: t.border }}>
                  <div className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, ((reward.reward_interval - reward.articles_until_next_reward) / reward.reward_interval) * 100)}%`,
                      background: `linear-gradient(90deg, ${t.primary}, ${t.accent})`,
                    }} />
                </div>
              </div>
            )}
            <InfoTooltip text={REWARD_INFO_TEXT} theme={t} />
          </div>
        </div>
      )}

      {/* 親密度（キャラクターとの距離感） */}
      {intimacy && (
        <div className="max-w-3xl mx-auto w-full px-4 pt-2">
          <div className="rounded-xl px-4 py-2.5 flex items-center gap-3 text-xs"
            style={{ background: t.example_bg, border: `1px solid ${t.border}`, color: t.text }}>
            <span className="text-lg flex-shrink-0">💗</span>
            <div className="flex-1">
              <p>
                <span className="font-black" style={{ color: t.accent }}>{charName}</span>
                {"との関係：　"}
                <span className="font-black" style={{ color: t.primary }}>Lv.{intimacy.level}　{intimacy.stage_label}</span>
              </p>
              <div className="mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ background: t.border }}>
                <div className="h-full rounded-full transition-all"
                  style={{
                    width: intimacy.next_level_threshold != null
                      ? `${Math.min(100, Math.round(((intimacy.points - intimacy.current_level_threshold) / Math.max(1, intimacy.next_level_threshold - intimacy.current_level_threshold)) * 100))}%`
                      : "100%",
                    background: `linear-gradient(90deg, ${t.primary}, ${t.accent})`,
                  }} />
              </div>
              {intimacy.next_level_threshold != null && (
                <p className="mt-1" style={{ color: t.accent, opacity: 0.85 }}>
                  たくさんお話しすると、もっと仲良くなれるよ。
                </p>
              )}
            </div>
            <InfoTooltip text={INTIMACY_INFO_TEXT} theme={t} />
          </div>
        </div>
      )}

      {/* メッセージスレッド */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-4 overflow-y-auto">
        {messages.length === 0 && (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">💬</p>
            <p className="text-sm" style={{ color: t.accent }}>
              {charName}に話しかけてみよう。記事のリクエストもここからできるよ！
            </p>
          </div>
        )}
        {hasMore && (
          <div className="text-center mb-3">
            <button onClick={loadOlder} disabled={loadingMore}
              className="text-xs px-3 py-1.5 rounded-full font-bold transition-all disabled:opacity-50"
              style={{ background: t.example_bg, border: `1px solid ${t.border}`, color: t.accent }}>
              {loadingMore ? "読み込み中..." : "過去のメッセージを読み込む"}
            </button>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {messages.map((m) => (
            <MessageBubble key={m.id} m={m} theme={t} charName={charName} charImage={charImage}
              onSuggestedAction={() => setCorrectionModalType("ask")}
              onRate={handleRateMessage} />
          ))}
        </div>
        <div ref={bottomRef} />
      </main>

      {/* 入力エリア */}
      <footer className="flex-shrink-0 border-t transition-colors"
        style={{ background: t.card, borderColor: t.border }}>
        <div className="max-w-3xl mx-auto w-full px-4 py-3">
          <form onSubmit={handleSend} className="flex flex-col sm:flex-row items-end gap-2">
            <button type="button"
              onClick={() => setShowRequestModal(true)}
              className="text-xs px-3 py-2 rounded-xl font-bold flex-shrink-0 transition-all order-2 sm:order-1 self-start sm:self-auto"
              style={{ background: "transparent", color: t.accent, border: `1.5px solid ${t.accent}` }}>
              📋 記事をリクエスト
            </button>
            <div className="flex items-end gap-2 w-full order-1 sm:order-2 sm:flex-1">
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(e as any); } }}
                placeholder={`${charName}にメッセージを送る...`}
                rows={1}
                className="flex-1 text-sm rounded-xl px-3 py-2 outline-none resize-none"
                style={{ background: t.bg, border: `1px solid ${t.border}`, color: t.text, fontFamily: t.fontFamily, maxHeight: "6rem" }}
              />
              <button type="submit" disabled={sending || !text.trim()}
                className="text-sm px-4 py-2 rounded-xl font-bold flex-shrink-0 transition-all disabled:opacity-40"
                style={{ background: t.primary, color: "white" }}>
                {sending ? "..." : "送信"}
              </button>
            </div>
          </form>
          <p className="text-[11px] mt-1.5" style={{ color: t.accent }}>
            {theme?.chat_footer_note || DEFAULT_CHAT_FOOTER_NOTE}
          </p>
        </div>
      </footer>

      {/* 記事・問題・添削のリクエストポップアップ */}
      {showRequestModal && (
        <RequestArticleModal theme={t} onClose={() => setShowRequestModal(false)} onSent={load}
          onRequestCorrection={(type) => setCorrectionModalType(type)} />
      )}

      {/* 添削提出ポップアップ（お題不要のライティング/スピーキング添削） */}
      {correctionModalType && (
        <CorrectionSubmissionModal theme={t}
          initialType={correctionModalType === "ask" ? undefined : correctionModalType}
          onClose={() => setCorrectionModalType(null)} onSent={load}
          onBack={correctionModalType === "ask" ? undefined : () => { setCorrectionModalType(null); setShowRequestModal(true); }} />
      )}

      {/* 親密度レベルアップ演出 */}
      {!levelUpInfo && celebratingReward && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }} onClick={dismissCelebratingReward}>
          <div className="reward-unlock-pop max-w-sm w-full rounded-2xl p-6 text-center"
            style={{ background: t.card, border: `2px solid ${t.accent}` }}
            onClick={e => e.stopPropagation()}>
            <div className="text-5xl mb-3 reward-unlock-bounce">🎉</div>
            <p className="text-sm font-bold mb-1" style={{ color: "var(--muted)" }}>新しい報酬を解放しました！</p>
            <p className="text-lg font-black mb-3" style={{ color: t.primary }}>
              {REWARD_CATEGORY_ICON[celebratingReward.category]} {celebratingReward.category_label}
            </p>
            {celebratingReward.category === "line" && (
              <p className="text-sm" style={{ color: t.text }}>「{celebratingReward.text_content}」</p>
            )}
            {celebratingReward.category === "title" && (
              <p className="text-base font-bold" style={{ color: t.text }}>
                {celebratingReward.icon ? `${celebratingReward.icon} ` : ""}{celebratingReward.text_content}
              </p>
            )}
            {celebratingReward.category === "wallpaper" && celebratingReward.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`${API_ORIGIN}${celebratingReward.image_url}`} alt={celebratingReward.text_content || "壁紙"}
                className="w-full rounded-lg" style={{ maxHeight: "200px", objectFit: "cover" }} />
            )}
            <button className="btn-primary w-full mt-4" onClick={dismissCelebratingReward}>確認しました</button>
          </div>
        </div>
      )}

      {levelUpInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }} onClick={dismissLevelUp}>
          <div className="reward-unlock-pop max-w-sm w-full rounded-2xl p-6 text-center"
            style={{ background: t.card, border: `2px solid ${t.accent}` }}
            onClick={e => e.stopPropagation()}>
            <div className="text-5xl mb-3 reward-unlock-bounce">💗</div>
            <p className="text-sm font-bold mb-1" style={{ color: "var(--muted)" }}>{charName}との関係が深まりました！</p>
            <p className="text-lg font-black mb-3" style={{ color: t.primary }}>
              Lv.{levelUpInfo.level}「{levelUpInfo.stage_label}」
            </p>
            <button className="btn-primary w-full mt-4" onClick={dismissLevelUp}>確認しました</button>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes reward-unlock-pop {
          from { opacity: 0; transform: scale(0.85); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes reward-unlock-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .reward-unlock-pop { animation: reward-unlock-pop 0.3s ease-out; }
        .reward-unlock-bounce { animation: reward-unlock-bounce 0.8s ease-in-out infinite; }
      `}</style>
      </>
      )}
    </div>
  );
}

function MessageBubble({ m, theme: t, charName, charImage, onSuggestedAction, onRate }: {
  m: Msg; theme: ReturnType<typeof resolveTheme>; charName: string; charImage?: string;
  onSuggestedAction?: (action: string) => void;
  onRate?: (messageId: number, rating: "good" | "bad") => void;
}) {
  const isCustomer = m.sender === "customer";

  const requestStatusLabel: Record<string, string> = {
    pending: "⏳ 確認中", accepted: "✅ 受付済み", completed: "📚 完成して届きました",
  };

  return (
    <div className={`flex items-end gap-2 ${isCustomer ? "flex-row-reverse" : "flex-row"}`}>
      {!isCustomer && (
        charImage ? (
          <img src={`${API_ORIGIN}${charImage}`} alt={charName} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
            style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.accent})` }}>
            {charName.charAt(0)}
          </div>
        )
      )}
      <div className={`flex flex-col max-w-[75%] ${isCustomer ? "items-end" : "items-start"}`}>
        {m.is_reward && m.image_url && (
          <div className="mb-1 rounded-2xl overflow-hidden shadow-md" style={{ border: `2px solid ${t.accent}` }}>
            <div className="px-3 py-1.5 text-xs font-black text-white" style={{ background: `linear-gradient(90deg, ${t.primary}, ${t.accent})` }}>
              🎁 {charName}からのご褒美
            </div>
            <img src={`${API_ORIGIN}${m.image_url}`} alt="ご褒美" className="block max-w-full" style={{ maxHeight: "320px" }} />
          </div>
        )}
        {m.content && (
          <div className="rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words"
            style={{
              background: isCustomer ? t.primary : t.card,
              color: isCustomer ? "white" : t.text,
              border: isCustomer ? "none" : `1px solid ${t.border}`,
            }}>
            {m.content}
          </div>
        )}
        {!isCustomer && m.suggested_action === "request_correction" && (
          <button type="button" onClick={() => onSuggestedAction?.(m.suggested_action!)}
            className="mt-1 text-xs px-3 py-1.5 rounded-full font-bold transition-all"
            style={{ background: t.accent, color: "white" }}>
            📝 添削してもらう
          </button>
        )}
        {m.is_request && (
          <div className="mt-1 rounded-xl px-3 py-1.5 text-xs flex items-center gap-2"
            style={{ background: t.tips_bg, border: `1px dashed ${t.border}`, color: t.text }}>
            <span>📋 記事リクエスト：<span className="font-bold">{m.grammar_topic}</span></span>
            {m.request_status && (
              <span className="font-bold flex-shrink-0" style={{ color: t.accent }}>
                {requestStatusLabel[m.request_status] || m.request_status}
              </span>
            )}
          </div>
        )}
        <div className="flex items-center gap-1.5 mt-1 px-1">
          <p className="text-[10px]" style={{ color: t.accent, opacity: 0.7 }}>{formatTime(m.created_at)}</p>
          {!isCustomer && (
            <span className="flex items-center gap-0.5">
              <button type="button" onClick={() => onRate?.(m.id, "good")} aria-label="良い返信"
                className="text-[11px] leading-none px-0.5 transition-opacity hover:opacity-100"
                style={{ opacity: m.my_feedback === "good" ? 1 : 0.35 }}>
                👍
              </button>
              <button type="button" onClick={() => onRate?.(m.id, "bad")} aria-label="改善してほしい返信"
                className="text-[11px] leading-none px-0.5 transition-opacity hover:opacity-100"
                style={{ opacity: m.my_feedback === "bad" ? 1 : 0.35 }}>
                👎
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** 進捗バーの説明を表示するインフォアイコン（タップ/クリックで開閉） */
function InfoTooltip({ text, theme: t }: { text: string; theme: ReturnType<typeof resolveTheme> }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative flex-shrink-0 self-start">
      <button type="button"
        onClick={() => setOpen(v => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 100)}
        aria-label="説明を表示"
        className="flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold leading-none"
        style={{ background: t.border, color: t.accent }}>
        i
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-30 w-60 max-w-[70vw] rounded-lg px-3 py-2 text-[11px] leading-relaxed shadow-lg whitespace-pre-wrap"
          style={{ background: t.card, border: `1px solid ${t.border}`, color: t.text }}>
          {text}
        </div>
      )}
    </span>
  );
}
