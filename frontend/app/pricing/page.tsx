"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { resolveTheme, type CharacterTheme } from "@/lib/theme";
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

const EIKEN_GRADES = ["1級", "準1級", "2級", "準2級", "3級", "4級", "5級"] as const;
type EikenGrade = typeof EIKEN_GRADES[number];

function eikenRows(grade: EikenGrade) {
  const base = [
    { part: "リーディング（短文穴埋め・長文穴埋め・長文読解）", price: "各200クレジット" },
    { part: "リスニング", price: "200クレジット" },
  ];
  if (grade === "4級" || grade === "5級") return base;
  return [
    ...base,
    { part: "ライティング", price: "400クレジット" },
    { part: "スピーキング", price: "400クレジット" },
  ];
}

const IELTS_ROWS = [
  { part: "Reading Academic / General", price: "200クレジット" },
  { part: "Listening Section 1〜4（1セット）", price: "200クレジット" },
  { part: "Writing Task 1", price: "200クレジット" },
  { part: "Writing Task 2", price: "400クレジット" },
  { part: "Speaking Part 1〜3", price: "400クレジット" },
];

const TOEFL_TYPES = ["iBT", "ITP"] as const;
type ToeflType = typeof TOEFL_TYPES[number];

const TOEFL_IBT_ROWS = [
  { part: "Reading", price: "200クレジット" },
  { part: "Listening", price: "200クレジット" },
  { part: "Writing Integrated Task", price: "400クレジット" },
  { part: "Writing Academic Discussion", price: "200クレジット" },
  { part: "Speaking Task 1〜4", price: "400クレジット" },
];

const TOEFL_ITP_ROWS = [
  { part: "Listening", price: "200クレジット" },
  { part: "Structure and Written Expression", price: "200クレジット" },
  { part: "Reading", price: "200クレジット" },
];

const PLAN_ROWS = [
  { plan: "スタータープラン", content: "オリジナルキャラクターの作成", price: "¥500", note: "初回のみ・購入時に500クレジット付与（公式キャラクターを選ぶと無料＋20クレジット付与）" },
  { plan: "追加ユニット（記事）", content: "1本", price: "200クレジット〜", note: "種別により変動" },
  { plan: "文法記事", content: "1項目・2,500〜3,000文字", price: "200クレジット", note: "" },
  { plan: "ライティング添削", content: "1回・マニュアル評価＋キャラフィードバック", price: "400クレジット", note: "全試験共通" },
  { plan: "スピーキング評価", content: "1回・マニュアル評価＋キャラフィードバック", price: "400クレジット", note: "全試験共通" },
];

export default function PricingPage() {
  const router = useRouter();
  const [mode, toggleMode] = useDarkMode();
  const [examTab, setExamTab] = useState<ExamTab>("TOEIC");
  const [eikenGrade, setEikenGrade] = useState<EikenGrade>("2級");
  const [toeflType, setToeflType] = useState<ToeflType>("iBT");
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
      {/* ヘッダー */}
      <header className="sticky top-0 z-20 shadow-md" style={{ background: t.primary }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push(loggedIn ? "/shelf" : "/login")} aria-label="戻る"
              className="text-white/70 hover:text-white text-sm">← 戻る</button>
            <h1 className="text-lg sm:text-xl font-black text-white">ManaVillage</h1>
          </div>
          <div className="flex items-center gap-2">
            <DarkModeToggle mode={mode} onToggle={toggleMode} variant="onColor" />
          </div>
        </div>
        <div className="h-1" style={{ background: t.accent }} />
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <h2 className="text-2xl font-black mb-2" style={{ color: t.primary }}>料金プラン</h2>
        <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
          まずはキャラクターを迎えて、最初のレッスンを始めましょう。
          その後は、必要なものを必要な分だけ追加していけます。
        </p>

        {/* 公式キャラクターのメリット */}
        <section className="mb-8 rounded-xl p-4" style={{ background: t.example_bg, border: `1px solid ${t.border}` }}>
          <h3 className="text-lg font-black mb-1" style={{ color: t.primary }}>
            公式キャラクター（白河雪菜・蒼井零）を選ぶと…
          </h3>
          <p className="text-sm mb-3" style={{ color: t.text }}>
            お申し込み時に「白河雪菜」または「蒼井零」を選択すると、以下の特典がすべて付いてきます。
          </p>
          <ul className="text-sm leading-relaxed list-disc pl-5" style={{ color: t.text }}>
            <li><strong>キャラ作成費無料</strong>：オリジナルキャラ作成費（¥500）が0円になり、さらに20クレジットが付与されます</li>
            <li><strong>すぐにチャット開始</strong>：ログイン直後からすぐにチャットできます</li>
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
                {row.note && <p className="text-xs" style={{ color: "var(--muted)" }}>{row.note}</p>}
              </div>
            ))}
          </div>
        </section>

        {/* 試験種別タブ */}
        <section className="mb-4">
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
              <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>各200クレジット・約10分</p>
              <div className="flex flex-col gap-3">
                {TOEIC_ROWS.map(row => (
                  <InfoRow key={row.part} t={t} label={row.part} value={row.content} />
                ))}
              </div>
            </>
          )}

          {examTab === "英検" && (
            <>
              <div className="flex flex-wrap gap-2 mb-3">
                {EIKEN_GRADES.map(grade => (
                  <button key={grade} type="button" onClick={() => setEikenGrade(grade)}
                    className="text-xs px-3 py-1 rounded-full font-bold transition-all"
                    style={eikenGrade === grade
                      ? { background: t.accent, color: "white" }
                      : { background: t.card, color: t.text, border: `1px solid ${t.border}` }}>
                    {grade}
                  </button>
                ))}
              </div>
              <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${t.border}` }}>
                <table className="w-full text-sm" style={{ background: t.card }}>
                  <thead>
                    <tr style={{ background: t.example_bg }}>
                      <Th t={t}>パート</Th>
                      <Th t={t}>価格</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {eikenRows(eikenGrade).map(row => (
                      <tr key={row.part} style={{ borderTop: `1px solid ${t.border}` }}>
                        <Td t={t} bold>{row.part}</Td>
                        <Td t={t} accent>{row.price}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
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
            <>
              <div className="flex flex-wrap gap-2 mb-3">
                {TOEFL_TYPES.map(type => (
                  <button key={type} type="button" onClick={() => setToeflType(type)}
                    className="text-xs px-3 py-1 rounded-full font-bold transition-all"
                    style={toeflType === type
                      ? { background: t.accent, color: "white" }
                      : { background: t.card, color: t.text, border: `1px solid ${t.border}` }}>
                    {type}
                  </button>
                ))}
              </div>
              <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${t.border}` }}>
                <table className="w-full text-sm" style={{ background: t.card }}>
                  <thead>
                    <tr style={{ background: t.example_bg }}>
                      <Th t={t}>パート</Th>
                      <Th t={t}>価格</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(toeflType === "iBT" ? TOEFL_IBT_ROWS : TOEFL_ITP_ROWS).map(row => (
                      <tr key={row.part} style={{ borderTop: `1px solid ${t.border}` }}>
                        <Td t={t} bold>{row.part}</Td>
                        <Td t={t} accent>{row.price}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        {/* クレジットの消費タイミング（2段階課金） */}
        <section className="mb-8 rounded-xl p-4" style={{ background: t.example_bg, border: `1px solid ${t.border}` }}>
          <h3 className="text-lg font-black mb-2" style={{ color: t.primary }}>
            記事・問題リクエストのクレジット消費について
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: t.text }}>
            記事・問題のリクエストは、依頼するハードルを下げるため <strong>2段階</strong> でクレジットを消費します。
          </p>
          <ul className="text-sm leading-relaxed list-disc pl-5 mt-2" style={{ color: t.text }}>
            <li><strong>依頼時</strong>：50クレジットのみ消費します</li>
            <li><strong>記事が届いて本棚で開封する時</strong>：残りのクレジット（200クレジットの記事なら150、400クレジットの記事なら350）を消費します</li>
          </ul>
          <p className="text-sm leading-relaxed mt-2" style={{ color: t.text }}>
            合計の消費クレジット数は表示されている料金と変わりません。未開封の記事は本棚で🔒マークが付き、
            開封ボタンを押すとクレジットが消費されていつでも読めるようになります。
          </p>
        </section>

        {/* 定期便（定期配布） */}
        <section className="mb-8 rounded-xl p-4" style={{ background: t.example_bg, border: `1px solid ${t.border}` }}>
          <h3 className="text-lg font-black mb-2" style={{ color: t.primary }}>
            🎁 特別記事（定期便）の定期配布
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: t.text }}>
            3〜5日ごとに1本、キャラクターが用意した「特別記事」が無料で本棚に届きます。
          </p>
          <ul className="text-sm leading-relaxed list-disc pl-5 mt-2" style={{ color: t.text }}>
            <li>記事が届くこと自体は<strong>無料</strong>です（クレジットは消費しません）</li>
            <li>本棚で読む（開封する）には<strong>50クレジット</strong>を消費します</li>
            <li>未開封の特別記事も本棚で🔒マークが付き、開封ボタンを押すと読めるようになります</li>
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
