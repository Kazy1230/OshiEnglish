"use client";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { resolveTheme } from "@/lib/theme";
import { useDarkMode } from "@/lib/darkMode";
import { DarkModeToggle } from "@/components/DarkModeToggle";

export default function PolicyPage() {
  const router = useRouter();
  const [mode, toggleMode] = useDarkMode();
  const t = resolveTheme(null, mode);
  const loggedIn = !!getToken();

  return (
    <div className="min-h-screen" style={{ background: t.bg, fontFamily: t.fontFamily }}>
      <header className="sticky top-0 z-20 shadow-md" style={{ background: t.primary }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push(loggedIn ? "/shelf" : "/login")} aria-label="戻る"
              className="text-white/70 hover:text-white text-sm">← 戻る</button>
            <h1 className="text-lg sm:text-xl font-black text-white">推しEnglish</h1>
          </div>
          <div className="flex items-center gap-2">
            <DarkModeToggle mode={mode} onToggle={toggleMode} variant="onColor" />
          </div>
        </div>
        <div className="h-1" style={{ background: t.accent }} />
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <h2 className="text-2xl font-black mb-2" style={{ color: t.primary }}>📄 返金・解約ポリシー</h2>
        <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
          推しEnglishをご利用いただく前に、解約および返金に関する以下のポリシーをご確認ください。
        </p>

        <section className="mb-8 rounded-xl p-4" style={{ background: t.card, border: `1px solid ${t.border}` }}>
          <h3 className="text-lg font-black mb-3" style={{ color: t.primary }}>🚪 解約について</h3>
          <ul className="text-sm leading-relaxed list-disc pl-5" style={{ color: t.text }}>
            <li>ユーザーはいつでも退会することができます。</li>
            <li>退会後は、未使用のコンテンツにアクセスできなくなります。</li>
            <li>キャラクターとのチャット履歴は、退会後に削除されます。</li>
          </ul>
        </section>

        <section className="mb-8 rounded-xl p-4" style={{ background: t.card, border: `1px solid ${t.border}` }}>
          <h3 className="text-lg font-black mb-3" style={{ color: t.primary }}>💴 返金について</h3>
          <ul className="text-sm leading-relaxed list-disc pl-5" style={{ color: t.text }}>
            <li>キャラクター作成が完了する前であれば、全額返金が可能です。</li>
            <li>コンテンツをご購入済みの場合は、返金できません。</li>
            <li>返金はStripeを通じて自動的に処理されます。</li>
          </ul>
        </section>

        <section className="mb-4 rounded-xl p-4" style={{ background: t.tips_bg, border: `1px dashed ${t.border}` }}>
          <h3 className="text-sm font-black mb-2" style={{ color: t.primary }}>お問い合わせ</h3>
          <p className="text-sm leading-relaxed" style={{ color: t.text }}>
            解約・返金に関するご質問がございましたら、アプリ内チャットまたはお申し込み時にご登録のメールアドレス宛にご連絡ください。
          </p>
        </section>
      </main>
    </div>
  );
}
