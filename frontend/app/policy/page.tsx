"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { resolveTheme, type CharacterTheme } from "@/lib/theme";
import { useDarkMode } from "@/lib/darkMode";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { PublicHeader } from "@/components/PublicHeader";

export default function PolicyPage() {
  const router = useRouter();
  const [mode, toggleMode] = useDarkMode();
  const [theme, setTheme] = useState<CharacterTheme | null>(null);
  const t = resolveTheme(theme, mode);
  const loggedIn = !!getToken();

  useEffect(() => {
    if (!loggedIn) return;
    (async () => {
      try {
        const user = await api.me();
        if (user.character_id) {
          const charTheme = await api.getCharacterTheme(user.character_id);
          setTheme(charTheme);
        }
      } catch {
        // テーマ取得に失敗してもデフォルトテーマで表示を継続する
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen" style={{ background: t.bg, fontFamily: t.fontFamily }}>
      <PublicHeader />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <h2 className="text-2xl font-black mb-2" style={{ color: t.primary }}>📄 返金・解約ポリシー</h2>
        <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
          ManaVillageをご利用いただく前に、解約および返金に関する以下のポリシーをご確認ください。
        </p>

        <section className="mb-8 rounded-xl p-4" style={{ background: t.card, border: `1px solid ${t.border}` }}>
          <h3 className="text-lg font-black mb-3" style={{ color: t.primary }}>🚪 解約について</h3>
          <ul className="text-sm leading-relaxed list-disc pl-5" style={{ color: t.text }}>
            <li>ユーザーはいつでも退会することができます。</li>
            <li>退会すると、アカウント情報・キャラクターとのチャット履歴・記事などのデータはすべて削除され、復元できません。</li>
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
