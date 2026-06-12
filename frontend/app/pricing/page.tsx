"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { resolveTheme } from "@/lib/theme";
import { useDarkMode } from "@/lib/darkMode";
import { DarkModeToggle } from "@/components/DarkModeToggle";

const EXAM_TABS = ["TOEIC", "英検", "IELTS", "TOEFL"] as const;
type ExamTab = typeof EXAM_TABS[number];

const TOEIC_ROWS = [
  { part: "Part 1", content: "6問＋解説（写真描写）" },
  { part: "Part 2", content: "6問＋解説（応答問題）" },
  { part: "Part 3", content: "2セット（6問）＋解説（会話問題）" },
  { part: "Part 4", content: "2セット（6問）＋解説（説明文問題）" },
  { part: "Part 5", content: "5問＋解説（短文穴埋め）" },
  { part: "Part 6", content: "2セット（8問）＋解説（長文穴埋め）" },
  { part: "Part 7", content: "1セット＋解説（長文読解）" },
];

const IELTS_ROWS = [
  { part: "Reading Academic / General", price: "¥500" },
  { part: "Listening Section 1〜4", price: "各¥500" },
  { part: "Writing Task 1", price: "¥500" },
  { part: "Writing Task 2", price: "¥1,000" },
  { part: "Speaking Part 1〜3", price: "¥1,000" },
];

const TOEFL_ROWS = [
  { part: "Reading", price: "¥500" },
  { part: "Listening", price: "¥500" },
  { part: "Writing Integrated Task", price: "¥1,000" },
  { part: "Writing Academic Discussion", price: "¥500" },
  { part: "Speaking Task 1〜4", price: "¥1,000" },
];

const PLAN_ROWS = [
  { plan: "スタータープラン", content: "キャラ作成＋記事1本", price: "¥2,000", note: "初回のみ" },
  { plan: "追加ユニット（記事）", content: "1本", price: "¥500〜", note: "種別により変動" },
  { plan: "ライティング添削", content: "1回・マニュアル評価＋キャラフィードバック", price: "¥1,000", note: "全試験共通" },
  { plan: "スピーキング評価", content: "1回・マニュアル評価＋キャラフィードバック", price: "¥1,000", note: "全試験共通" },
];

export default function PricingPage() {
  const router = useRouter();
  const [mode, toggleMode] = useDarkMode();
  const [examTab, setExamTab] = useState<ExamTab>("TOEIC");
  const t = resolveTheme(null, mode);
  const loggedIn = !!getToken();

  return (
    <div className="min-h-screen" style={{ background: t.bg, fontFamily: t.fontFamily }}>
      {/* ヘッダー */}
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
        <h2 className="text-2xl font-black mb-2" style={{ color: t.primary }}>💴 料金プラン</h2>
        <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
          推しEnglishの料金体系のご案内です。まずはスタータープランでキャラクターと最初の記事をお届けします。
          その後は、必要なユニットを必要な分だけ追加していただけます。
        </p>

        {/* 公式キャラクターのメリット */}
        <section className="mb-8 rounded-xl p-4" style={{ background: t.example_bg, border: `1px solid ${t.border}` }}>
          <h3 className="text-lg font-black mb-1" style={{ color: t.primary }}>
            ⭐ 公式キャラクター（白河雪菜・蒼井零）を選ぶと…
          </h3>
          <p className="text-sm mb-3" style={{ color: t.text }}>
            お申し込み時に「白河雪菜」または「蒼井零」を選択すると、以下の特典がすべて付いてきます。
          </p>
          <ul className="text-sm leading-relaxed list-disc pl-5" style={{ color: t.text }}>
            <li><strong>キャラ作成費無料</strong>：オリジナルキャラ作成費（¥1,500）が0円になります</li>
            <li><strong>即日チャット開始</strong>：すでにDB登録済みのため、ログイン直後からすぐにチャットできます</li>
            <li><strong>限定称号・壁紙あり</strong>：公式キャラを選んだ方だけが解放できる称号・壁紙が用意されています</li>
            <li><strong>隠しセリフ多数</strong>：オリジナルキャラより多くの隠しセリフが用意されています</li>
            <li><strong>公式Instagramあり</strong>：チャット画面・本棚から各キャラクターの公式Instagramをフォローできます</li>
          </ul>
        </section>

        {/* プラン */}
        <section className="mb-8">
          <h3 className="text-lg font-black mb-3" style={{ color: t.primary }}>プラン</h3>
          <div className="flex flex-col gap-3">
            {PLAN_ROWS.map(row => (
              <div key={row.plan} className="rounded-xl p-4" style={{ background: t.card, border: `1px solid ${t.border}` }}>
                <div className="flex items-start justify-between gap-3 mb-1">
                  <p className="text-sm font-black" style={{ color: t.primary }}>{row.plan}</p>
                  <p className="text-lg font-black whitespace-nowrap" style={{ color: t.accent }}>{row.price}</p>
                </div>
                <p className="text-sm mb-1" style={{ color: t.text }}>{row.content}</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>{row.note}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 試験種別タブ */}
        <section className="mb-8">
          <h3 className="text-lg font-black mb-3" style={{ color: t.primary }}>試験対策ユニット</h3>
          <div className="flex flex-wrap gap-2 mb-4">
            {EXAM_TABS.map(tab => (
              <button key={tab} type="button" onClick={() => setExamTab(tab)}
                className="text-sm px-4 py-1.5 rounded-full font-bold transition-all"
                style={examTab === tab
                  ? { background: `linear-gradient(135deg, ${t.primary}, ${t.accent})`, color: "white" }
                  : { background: t.card, color: t.text, border: `1px solid ${t.border}` }}>
                {tab}
              </button>
            ))}
          </div>

          {examTab === "TOEIC" && (
            <>
              <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>各¥500・約10分</p>
              <div className="flex flex-col gap-3">
                {TOEIC_ROWS.map(row => (
                  <InfoRow key={row.part} t={t} label={row.part} value={row.content} />
                ))}
              </div>
            </>
          )}

          {examTab === "英検" && (
            <div className="flex flex-col gap-3">
              <InfoRow t={t} label="リーディング" value="短文穴埋め・長文穴埋め・長文読解（各¥500）" />
              <InfoRow t={t} label="リスニング" value="級別に問題数が異なる（各¥500）" />
              <InfoRow t={t} label="ライティング・スピーキング" value="各¥1,000（マニュアル＋キャラフィードバック）" />
            </div>
          )}

          {examTab === "IELTS" && (
            <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${t.border}` }}>
              <table className="w-full text-sm" style={{ background: t.card }}>
                <thead>
                  <tr style={{ background: t.example_bg }}>
                    <Th t={t}>パート</Th>
                    <Th t={t}>価格</Th>
                  </tr>
                </thead>
                <tbody>
                  {IELTS_ROWS.map(row => (
                    <tr key={row.part} style={{ borderTop: `1px solid ${t.border}` }}>
                      <Td t={t} bold>{row.part}</Td>
                      <Td t={t} accent>{row.price}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {examTab === "TOEFL" && (
            <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${t.border}` }}>
              <table className="w-full text-sm" style={{ background: t.card }}>
                <thead>
                  <tr style={{ background: t.example_bg }}>
                    <Th t={t}>パート</Th>
                    <Th t={t}>価格</Th>
                  </tr>
                </thead>
                <tbody>
                  {TOEFL_ROWS.map(row => (
                    <tr key={row.part} style={{ borderTop: `1px solid ${t.border}` }}>
                      <Td t={t} bold>{row.part}</Td>
                      <Td t={t} accent>{row.price}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 文法記事 */}
        <section className="mb-8">
          <h3 className="text-lg font-black mb-3" style={{ color: t.primary }}>文法記事</h3>
          <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${t.border}` }}>
            <table className="w-full text-sm" style={{ background: t.card }}>
              <thead>
                <tr style={{ background: t.example_bg }}>
                  <Th t={t}>種別</Th>
                  <Th t={t}>規模</Th>
                  <Th t={t}>価格</Th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderTop: `1px solid ${t.border}` }}>
                  <Td t={t} bold>文法記事</Td>
                  <Td t={t}>1項目・2,500〜3,000文字</Td>
                  <Td t={t} accent>¥500</Td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 共通設定 */}
        <section className="mb-4 rounded-xl p-4" style={{ background: t.tips_bg, border: `1px dashed ${t.border}` }}>
          <h3 className="text-sm font-black mb-2" style={{ color: t.primary }}>共通設定</h3>
          <ul className="text-sm leading-relaxed list-disc pl-5" style={{ color: t.text }}>
            <li>リスニング音声：ニュートラルTTS（キャラなし・OpenAI TTS）</li>
            <li>支払い方法：Stripe（クレジットカード・Apple Pay・Google Pay）</li>
            <li>キャラ提案：ヒアリング結果をもとにキャラが次のユニットを提案</li>
          </ul>
        </section>
      </main>
    </div>
  );
}

function Th({ t, children }: { t: ReturnType<typeof resolveTheme>; children: React.ReactNode }) {
  return (
    <th className="text-left px-3 py-2 font-bold text-sm" style={{ color: t.primary }}>
      {children}
    </th>
  );
}

function Td({ t, children, bold, accent }: { t: ReturnType<typeof resolveTheme>; children: React.ReactNode; bold?: boolean; accent?: boolean }) {
  return (
    <td className={`px-3 py-2 text-sm ${bold ? "font-bold" : ""}`}
      style={{ color: accent ? t.accent : t.text, fontWeight: accent ? 800 : undefined }}>
      {children}
    </td>
  );
}

function InfoRow({ t, label, value }: { t: ReturnType<typeof resolveTheme>; label: string; value: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: t.card, border: `1px solid ${t.border}` }}>
      <p className="text-sm font-bold mb-1" style={{ color: t.primary }}>{label}</p>
      <p className="text-sm" style={{ color: t.text }}>{value}</p>
    </div>
  );
}
