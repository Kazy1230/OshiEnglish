"use client";
import React, { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { STEP1, STEP2, STEP3 } from "@/lib/charCopy";
import type { GK, RK, PK, CharCopyTable } from "@/lib/charCopy";

// ─── アクセシビリティ／パフォーマンス用フック ─────────────────────────────────

/**
 * OSの「視差効果を減らす」設定（prefers-reduced-motion）と、
 * 画面幅がモバイルサイズかどうかを判定するフック。
 * 演出系コンポーネント（霧・光芒・スポットライト・背景パターン等）は
 * これらを参照して、低スペック端末や設定済みユーザーへの負荷を抑える。
 */
function useReducedMotionAndViewport(): { reduceMotion: boolean; isMobile: boolean } {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const widthQuery = window.matchMedia("(max-width: 640px)");
    const updateMotion = () => setReduceMotion(motionQuery.matches);
    const updateWidth = () => setIsMobile(widthQuery.matches);
    updateMotion();
    updateWidth();
    motionQuery.addEventListener("change", updateMotion);
    widthQuery.addEventListener("change", updateWidth);
    return () => {
      motionQuery.removeEventListener("change", updateMotion);
      widthQuery.removeEventListener("change", updateWidth);
    };
  }, []);

  return { reduceMotion, isMobile };
}

// ─── 型定義 ──────────────────────────────────────────────────────────────────

type Gender       = "male" | "female" | "any";
type Relationship = "teacher" | "senpai" | "kohai" | "other";
type Personality  = "gentle" | "strict" | "cool" | "energetic" | "tsundere" | "other";
type CharChoice   = "builder" | "custom" | "preset";
type BuilderStep  = 1 | 2 | 3;
type PresetCharId = "yukina" | "rei";

interface ThemeVars {
  bg: string; card: string; primary: string; accent: string;
  accentLight: string; border: string; text: string; muted: string;
  gradA: string; gradB: string;
  fontFamily: string; radius: string; inputRadius: string;
  tagline: string; submitLabel: string;
  letterSpacing: string; fontWeight: string; isDark: boolean;
  cardShadow: string; heroPaddingV: string;
  showSectionAccent: boolean; blobOpacity: number;
}

// ─── テーマ定義 ──────────────────────────────────────────────────────────────

const BASE: ThemeVars = {
  bg: "#f4f3ee", card: "#ffffff", primary: "#2e4057", accent: "#048a81",
  accentLight: "#e0f5f4", border: "#e0ddd5", text: "#2d2d2d", muted: "#888888",
  gradA: "#2e4057", gradB: "#048a81",
  fontFamily: '"Hiragino Kaku Gothic ProN","Meiryo",sans-serif',
  radius: "16px", inputRadius: "10px",
  tagline: "あなただけのキャラクターと、英語を学ぼう。",
  submitLabel: "申し込む →",
  letterSpacing: "normal", fontWeight: "400", isDark: false,
  cardShadow: "0 2px 12px rgba(0,0,0,0.06)",
  heroPaddingV: "3.5rem 1.5rem 4.5rem",
  showSectionAccent: false, blobOpacity: 0.45,
};

const GENDER_PALETTE: Record<Gender, Partial<ThemeVars>> = {
  male:   { bg: "#edf1f8", card: "#f8faff", primary: "#1e3a5f", accent: "#2563eb", accentLight: "#dbeafe", border: "#c7d4e8", text: "#1e2d42", muted: "#607590", gradA: "#1e3a5f", gradB: "#2563eb" },
  female: { bg: "#fdf3ff", card: "#fff8ff", primary: "#6b21a8", accent: "#c026d3", accentLight: "#fae8ff", border: "#e8c8f0", text: "#3d1255", muted: "#9a5cb4", gradA: "#6b21a8", gradB: "#c026d3" },
  any:    { bg: "#f0f7ee", card: "#f7fff4", primary: "#2d5a27", accent: "#16a34a", accentLight: "#dcfce7", border: "#c8dfc4", text: "#1a3318", muted: "#5a8054", gradA: "#2d5a27", gradB: "#16a34a" },
};

const RELATIONSHIP_STYLE: Record<Relationship, Partial<ThemeVars>> = {
  teacher: { fontFamily: '"Georgia","游明朝","Yu Mincho",serif', letterSpacing: "0.04em", fontWeight: "500", radius: "8px", inputRadius: "4px", showSectionAccent: true, cardShadow: "0 2px 8px rgba(0,0,0,0.08)" },
  senpai:  { fontFamily: '"Hiragino Kaku Gothic ProN","Meiryo",sans-serif', letterSpacing: "0.01em" },
  kohai:   { fontFamily: '"Hiragino Maru Gothic ProN","丸ゴシック","BIZ UDPGothic",sans-serif', letterSpacing: "0.05em", radius: "28px", inputRadius: "20px", cardShadow: "0 4px 20px rgba(0,0,0,0.07)", blobOpacity: 0.55 },
  other:   {},
};

const PERSONALITY_DETAIL: Record<Personality, Partial<ThemeVars>> = {
  gentle:   { radius: "30px", inputRadius: "22px", tagline: "一緒に、やさしく丁寧に進めていこう。", submitLabel: "よろしくお願いします 🌸", cardShadow: "0 6px 32px rgba(244,114,182,0.22)", heroPaddingV: "4.5rem 1.5rem 5.5rem", blobOpacity: 0.6 },
  strict:   { radius: "4px", inputRadius: "2px", tagline: "結果を出したいなら、甘えは禁物だ。", submitLabel: "申し込む", letterSpacing: "0.07em", fontWeight: "600", cardShadow: "none", heroPaddingV: "2.5rem 1.5rem 3rem", blobOpacity: 0.25 },
  cool:     { bg: "#191c25", card: "#21252f", primary: "#7ba8d8", accent: "#3fc5b8", accentLight: "#1a3535", border: "#343840", text: "#e2e4ea", muted: "#9a9ea8", gradA: "#0f1117", gradB: "#1e2a38", radius: "6px", inputRadius: "4px", fontWeight: "300", tagline: "……始めるの？", submitLabel: "送信する", isDark: true, cardShadow: "0 4px 24px rgba(0,0,0,0.45)", heroPaddingV: "2.8rem 1.5rem 3.2rem", blobOpacity: 0.3 },
  energetic:{ radius: "30px", inputRadius: "22px", tagline: "やる気MAX！一緒にがんばろー！🎉", submitLabel: "申し込む！！ 🔥", cardShadow: "0 6px 28px rgba(251,146,60,0.2)", heroPaddingV: "5rem 1.5rem 6rem", blobOpacity: 0.65 },
  tsundere: { tagline: "べ、べつにあなたのためじゃないけど……申し込むなら受け付けてあげる。", submitLabel: "申し込む（べつに何でもないけど）", cardShadow: "0 4px 20px rgba(251,191,36,0.18)", heroPaddingV: "3.5rem 1.5rem 4rem" },
  other:    {},
};

function buildTheme(g: Gender | null, r: Relationship | null, p: Personality | null): ThemeVars {
  let t = { ...BASE };
  if (g)               t = { ...t, ...GENDER_PALETTE[g] };
  if (r && r !== "other") t = { ...t, ...RELATIONSHIP_STYLE[r] };
  if (p && p !== "other") t = { ...t, ...PERSONALITY_DETAIL[p] };
  return t;
}

// ─── 共通ラベル ──────────────────────────────────────────────────────────────

const REL_LABEL:  Record<Relationship, string> = { teacher: "先生", senpai: "先輩", kohai: "後輩", other: "その他" };
const PERS_LABEL: Record<Personality, string>  = { gentle: "優しい", strict: "厳しい", cool: "クール", energetic: "元気・明るい", tsundere: "ツンデレ", other: "その他" };

// ─── 推しEnglish プリセットキャラクター ──────────────────────────────────────

interface PresetCharacter {
  id: PresetCharId;
  name: string; reading: string;
  gender: Gender; relationship: Relationship; personality: Personality;
  hobby: string; quote: string;
  instagram: string;
  themeOverride: Partial<ThemeVars>;
}

const PRESET_CHARACTERS: PresetCharacter[] = [
  {
    id: "yukina", name: "白河雪菜", reading: "しらかわ ゆきな",
    gender: "female", relationship: "senpai", personality: "tsundere",
    hobby: "映画鑑賞・音楽鑑賞",
    quote: "「べ、別にあなたのために教えてるわけじゃないですから」",
    instagram: "https://www.instagram.com/shirakawa_yukina._.a",
    // ピンク・紫・白系
    themeOverride: {
      bg: "#fdf4ff", card: "#fffbff", primary: "#9d174d", accent: "#d946ef",
      accentLight: "#fae8ff", border: "#f6d4ee", text: "#4a154b", muted: "#b87bb8",
      gradA: "#9d174d", gradB: "#e879f9",
    },
  },
  {
    id: "rei", name: "蒼井零", reading: "あおい れい",
    gender: "male", relationship: "kohai", personality: "cool",
    hobby: "読書・天文",
    quote: "「……先輩のことは、まあ、認めてますよ」",
    instagram: "https://www.instagram.com/aoi_rei_aoi",
    // 青・黒・グレー系
    themeOverride: {
      bg: "#10141c", card: "#1a1f2b", primary: "#9db8e0", accent: "#5b8ad1",
      accentLight: "#1e2a3d", border: "#2c3445", text: "#e3e8f1", muted: "#8590a3",
      gradA: "#0b0e15", gradB: "#2c3e5c", isDark: true,
    },
  },
];

function buildPresetTheme(g: Gender | null, r: Relationship | null, p: Personality | null, presetChar: PresetCharId | null): ThemeVars {
  const base = buildTheme(g, r, p);
  if (!presetChar) return base;
  const preset = PRESET_CHARACTERS.find(c => c.id === presetChar);
  return preset ? { ...base, ...preset.themeOverride } : base;
}

// ─── 動的コピー ───────────────────────────────────────────────────────────────

type G3 = { male: string; female: string; any: string };
const byG = (g: Gender | null, v: G3) => v[g ?? "any"];

interface DynamicCopy {
  relCards: Record<Relationship, string>;
  persSectionTitle: string; persHint: string;
  persQuotes: Record<Exclude<Personality, "other">, string>;
  successBody: string;
}

// 「テキストで自由に定義する」は性別選択を伴わない独立フローのため、
// gender state の残り値に左右されない固定文言を使う。
const CUSTOM_CHAR_COPY = {
  label: "このキャラはどんな人ですか？",
  hint: "口調・性格・こだわりを自由に書いてください。詳しいほど再現度が上がります！",
  placeholder: "例：少し口が悪いけど本当は優しいタイプ。\n「ったく、しょうがないな」が口癖。ため口。\n間違えたときは厳しめ、できたときは素直に褒めてほしい。",
};

function getDynamicCopy(g: Gender | null, r: Relationship | null): DynamicCopy {
  const gk = g ?? "any";
  const rk = r ?? "other";

  const relCards: Record<Relationship, string> = {
    teacher: byG(g, { male: "知識と経験で導く男性教師", female: "優雅で頼りになる女性教師", any: "丁寧に指導してくれる先生" }),
    senpai:  byG(g, { male: "キャラが年上。兄貴として引っ張ってくれる", female: "キャラが年上。お姉さんとして支えてくれる", any: "キャラが年上。頼りになる先輩" }),
    kohai:   byG(g, { male: "キャラが年下。あなたを慕う後輩くん", female: "キャラが年下。あなたに懐く後輩ちゃん", any: "キャラが年下。先輩と慕ってくれる後輩" }),
    other:   "自由に関係性を設定する",
  };

  const persTitleMap: Record<Relationship, G3> = {
    teacher: { male: "先生の指導スタイルは？", female: "先生の指導スタイルは？", any: "先生の指導スタイルは？" },
    senpai:  { male: "先輩はどんな兄貴キャラ？", female: "先輩はどんなお姉さんキャラ？", any: "先輩はどんな性格？" },
    kohai:   { male: "あなたの後輩くん、どんなタイプ？", female: "あなたの後輩ちゃん、どんなタイプ？", any: "あなたの後輩、どんなタイプ？" },
    other:   { male: "性格は？", female: "性格は？", any: "性格は？" },
  };

  const persHintMap: Record<Relationship, G3> = {
    teacher: { male: "彼の指導スタイルは？選ぶとページ全体が変わります。", female: "彼女の指導スタイルは？選ぶとページ全体が変わります。", any: "どんな指導スタイル？" },
    senpai:  { male: "あなたへの接し方に表れます。", female: "あなたへの接し方に表れます。", any: "あなたへの接し方に表れます。" },
    kohai:   { male: "あなたを「先輩」と慕う後輩くん。選ぶとページ全体が変わります。", female: "あなたを「先輩」と慕う後輩ちゃん。選ぶとページ全体が変わります。", any: "あなたを「先輩」と慕う後輩。" },
    other:   { male: "選ぶとページ全体が変わります。", female: "選ぶとページ全体が変わります。", any: "選ぶとページ全体が変わります。" },
  };

  const persQuotes: Record<Exclude<Personality, "other">, string> = {
    gentle:   rk === "kohai" ? ({ male: "「先輩！一緒に頑張りましょう！」", female: "「先輩、私も頑張ります♪」", any: "「先輩、一緒に頑張りましょう！」" })[gk] : ({ male: "「焦らなくていい。ゆっくりやろう」", female: "「大丈夫、一緒に頑張ろうね♪」", any: "「大丈夫、一緒に頑張ろう」" })[gk],
    strict:   rk === "kohai" ? ({ male: "「先輩！僕、絶対上達します！」", female: "「先輩に認めてもらえるよう頑張ります！」", any: "「先輩に認めてもらえるよう頑張ります！」" })[gk] : ({ male: "「甘えは禁物。でも実力はつけてやる」", female: "「甘えは許さないわよ。でも結果は出してあげる」", any: "「甘えは禁物。でも実力はつく」" })[gk],
    cool:     rk === "kohai" ? ({ male: "「……先輩のことは、まあ、認めてますよ」", female: "「……先輩だから、ついてきてあげてもいいです」", any: "「……先輩のことは特別だと思ってます」" })[gk] : ({ male: "「……まあ、付き合ってやるよ」", female: "「……別に教えてあげてもいいけど」", any: "「……始めるの？」" })[gk],
    energetic:rk === "kohai" ? ({ male: "「先輩！絶対一緒に上達しましょう🔥」", female: "「先輩先輩！一緒にやりましょーっ🌟」", any: "「先輩！絶対一緒に上達できます🎉」" })[gk] : ({ male: "「やろうぜ！一緒に上り詰めようぜ🔥」", female: "「絶対できる！一緒にがんばろー！🌟」", any: "「絶対できる！一緒にやろー！」" })[gk],
    tsundere: rk === "kohai" ? ({ male: "「べ、別に先輩のためじゃないですから！」", female: "「先輩のためじゃなく自分のためです！勘違いしないでください！」", any: "「別に先輩だから特別扱いしてるわけじゃ…」" })[gk] : ({ male: "「お、お前のために言ってるんじゃないからな！」", female: "「べ、べつにあなたのためじゃないし！」", any: "「べ、別に心配してるわけじゃ…」" })[gk],
  };

  return {
    relCards,
    persSectionTitle: persTitleMap[rk][gk],
    persHint:         persHintMap[rk][gk],
    persQuotes,
    successBody: byG(g, {
      male:   "理想の彼との英語学習をご準備します。\nアカウント発行後はアプリ内チャットにてご連絡いたしますので、\nしばらくお待ちください ✨",
      female: "理想の彼女との英語学習をご準備します。\nアカウント発行後はアプリ内チャットにてご連絡いたしますので、\nしばらくお待ちください ✨",
      any:    "ご申し込みありがとうございます。\nアカウント発行後はアプリ内チャットにてご連絡いたしますので、\nしばらくお待ちください ✨",
    }),
  };
}

// ─── グローバル CSS ───────────────────────────────────────────────────────────

const GLOBAL_CSS = `
  @keyframes yt-slide-up   { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
  @keyframes yt-pop        { 0%{opacity:0;transform:scale(.92)} 60%{transform:scale(1.04)} 100%{opacity:1;transform:scale(1)} }
  @keyframes yt-check-in   { 0%{transform:scale(0)rotate(-15deg);opacity:0} 65%{transform:scale(1.35)rotate(5deg)} 100%{transform:scale(1)rotate(0);opacity:1} }
  @keyframes yt-flash      { 0%{opacity:0} 18%{opacity:.28} 100%{opacity:0} }
  @keyframes yt-shimmer    { 0%{opacity:.3;filter:blur(2px);transform:translateY(4px)} 100%{opacity:1;filter:blur(0);transform:translateY(0)} }
  @keyframes yt-fade       { from{opacity:0} to{opacity:1} }
  @keyframes yt-pattern-in { from{opacity:0} to{opacity:1} }
  @keyframes yt-progress   { from{width:0} to{width:var(--pw)} }

  /* 後輩：霧・もや */
  @keyframes yt-fog-1 {
    0%,100%{ transform:translate(0,0) scale(1); }
    30%    { transform:translate(18px,-12px) scale(1.06); }
    65%    { transform:translate(-10px,9px) scale(0.96); }
  }
  @keyframes yt-fog-2 {
    0%,100%{ transform:translate(0,0) scale(1); }
    40%    { transform:translate(-14px,10px) scale(1.09); }
    70%    { transform:translate(10px,-7px) scale(0.94); }
  }
  @keyframes yt-fog-3 {
    0%,100%{ transform:translate(0,0) scale(1); }
    50%    { transform:translate(8px,14px) scale(1.04); }
  }

  /* 先輩：光の筋（光芒）── ピーク強度違いの3バリエーションでむらを出す */
  @keyframes yt-ray-strong {
    0%,100%{ opacity:0;    transform:rotate(-22deg) scaleX(1); }
    45%,55%{ opacity:1;    transform:rotate(-22deg) scaleX(1.25); }
  }
  @keyframes yt-ray-mid {
    0%,100%{ opacity:0;    transform:rotate(-22deg) scaleX(1); }
    45%,55%{ opacity:0.70; transform:rotate(-22deg) scaleX(1.1); }
  }
  @keyframes yt-ray-soft {
    0%,100%{ opacity:0;    transform:rotate(-22deg) scaleX(1); }
    45%,55%{ opacity:0.45; transform:rotate(-22deg) scaleX(1); }
  }
  /* 先輩：光源のゆらぎ（左上から差す光のグロー） */
  @keyframes yt-ray-source {
    0%,100%{ opacity:0.55; transform:scale(1); }
    50%    { opacity:0.85; transform:scale(1.08); }
  }

  /* 先生：柔らかいスポットライト呼吸 */
  @keyframes yt-spotlight {
    0%,100%{ opacity:0.90; transform:translateX(-50%) scale(1); }
    50%    { opacity:1;    transform:translateX(-50%) scale(1.12); }
  }
  @keyframes yt-spotlight-sub {
    0%,100%{ opacity:0.70; transform:translateX(-50%) scale(1); }
    50%    { opacity:1;    transform:translateX(-50%) scale(1.10); }
  }
  /* 先生：光の中を漂う塵（ほこり）の粒子 */
  @keyframes yt-dust-1 {
    0%   { transform:translate(0,0); opacity:0; }
    15%  { opacity:0.8; }
    85%  { opacity:0.6; }
    100% { transform:translate(18px,-120px); opacity:0; }
  }
  @keyframes yt-dust-2 {
    0%   { transform:translate(0,0); opacity:0; }
    20%  { opacity:0.7; }
    80%  { opacity:0.5; }
    100% { transform:translate(-24px,-150px); opacity:0; }
  }

  /* 関係性オーバーレイ・フェードイン */
  @keyframes yt-overlay-in { from{opacity:0} to{opacity:1} }

  .yt-slide-up { animation: yt-slide-up .42s cubic-bezier(.22,.68,0,1.15) both; }
  .yt-pop      { animation: yt-pop .35s cubic-bezier(.22,.68,0,1.2) both; }
  .yt-fade     { animation: yt-fade .3s ease both; }
  .yt-shimmer  { animation: yt-shimmer .45s cubic-bezier(.22,.68,0,1.1) both; }
  .d1{animation-delay:.05s} .d2{animation-delay:.10s} .d3{animation-delay:.15s}
  .d4{animation-delay:.20s} .d5{animation-delay:.25s} .d6{animation-delay:.30s}

  .yt-flash-ol { position:fixed;inset:0;z-index:9999;pointer-events:none; animation:yt-flash .65s ease-out forwards; }
  .yt-font-in  { animation:yt-shimmer .45s cubic-bezier(.22,.68,0,1.1) both; }

  .yt-card { cursor:pointer;user-select:none;border:2px solid transparent;
    transition:transform .18s cubic-bezier(.22,.68,0,1.2),box-shadow .2s ease,border-color .28s ease,background-color .28s ease,border-radius .5s ease; }
  .yt-card:hover  { transform:translateY(-3px); }
  .yt-card:active { transform:scale(.97); }

  .yt-check { animation:yt-check-in .3s cubic-bezier(.22,.68,0,1.3) forwards; }

  .yt-input {
    width:100%;padding:.75rem 1rem;font-size:.95rem;
    border-width:1.5px;border-style:solid;outline:none;box-sizing:border-box;
    transition:border-color .22s ease,box-shadow .22s ease,background-color .5s ease,border-radius .5s ease,color .5s ease;
  }
  .yt-input:focus { box-shadow:0 0 0 3.5px rgba(4,138,129,.2); }

  .yt-btn {
    width:100%;padding:1rem 2rem;font-size:1.05rem;font-weight:700;
    color:#fff;border:none;cursor:pointer;
    transition:opacity .2s,transform .15s,border-radius .5s ease,box-shadow .3s ease;
  }
  .yt-btn:hover:not(:disabled)  { opacity:.88;transform:translateY(-2px); }
  .yt-btn:active:not(:disabled) { transform:scale(.985); }
  .yt-btn:disabled               { opacity:.4;cursor:not-allowed; }

  /* 性格カード固有スタイル */
  .pc-gentle { border-radius:24px!important;background:#fff5f8!important;border-color:#f9a8c9!important; }
  .pc-strict { border-radius:3px!important; background:#18181b!important;border-color:#3f3f46!important; }
  .pc-cool   { border-radius:6px!important; background:#1e2030!important;border-color:#3a3d50!important; }
  .pc-enrg   { border-radius:24px!important;background:#fff7ed!important;border-color:#fdba74!important; }
  .pc-tsun   { border-radius:10px!important;background:#fff9f0!important;border-color:#fcd34d!important; }
  .pc-other  { border-style:dashed!important; }

  /* 関係性カード固有フォント */
  .rc-teacher { font-family:"Georgia","游明朝","Yu Mincho",serif!important; }
  .rc-kohai   { font-family:"Hiragino Maru Gothic ProN","丸ゴシック","BIZ UDPGothic",sans-serif!important; }

  /* プログレスバー */
  .yt-progress-bar { height:3px;background:rgba(255,255,255,.2);border-radius:99px;overflow:hidden; }
  .yt-progress-fill{ height:100%;background:rgba(255,255,255,.75);border-radius:99px;
    transition:width .4s cubic-bezier(.4,0,.2,1); }

  /* ステップナビゲーション */
  .yt-step-btn-next {
    display:flex;align-items:center;justify-content:center;gap:.4rem;
    padding:.7rem 1.6rem;border-radius:99px;border:none;cursor:pointer;
    font-weight:700;font-size:.9rem;color:#fff;
    transition:opacity .2s,transform .15s,background-color .4s;
  }
  .yt-step-btn-next:hover { opacity:.88;transform:translateY(-1px); }
  .yt-step-btn-next:disabled { opacity:.35;cursor:not-allowed; }

  .yt-step-btn-back {
    display:flex;align-items:center;gap:.3rem;
    padding:.6rem 1rem;border-radius:99px;border:1.5px solid;cursor:pointer;
    font-size:.85rem;background:transparent;
    transition:opacity .2s,border-color .4s,color .4s;
  }
  .yt-step-btn-back:hover { opacity:.7; }

  /* 完了チップ */
  .yt-chip {
    display:inline-flex;align-items:center;gap:.3rem;
    padding:.28rem .65rem;border-radius:99px;font-size:.75rem;font-weight:600;
    border:1.5px solid;cursor:pointer;transition:all .25s;
  }
  .yt-chip:hover { opacity:.75;transform:scale(.97); }

  /* ─── 視差効果を減らす設定（OS設定）への対応 ───────────────────────────────
     霧・光芒・スポットライト・ダスト・パターンイン・シマー等の演出系
     アニメーションを丸ごと無効化する。位置・色・レイアウトはそのまま維持し、
     「動き」のみを止めることで負荷とちらつきを抑える。 */
  @media (prefers-reduced-motion: reduce) {
    .yt-slide-up, .yt-pop, .yt-fade, .yt-shimmer, .yt-font-in, .yt-check,
    .yt-card, .yt-progress-fill, .yt-step-btn-next, .yt-step-btn-back,
    .yt-chip, .yt-input, .yt-btn,
    [style*="animation"] {
      animation: none !important;
      transition: none !important;
    }
  }
`;

// ─── T（トランジション）──────────────────────────────────────────────────────

const T = "0.52s cubic-bezier(.4,0,.2,1)";

// ─── 背景パターン生成（45パターン） ─────────────────────────────────────────
//
//  関係性 → パターンの「形」
//    先生 = 格子（知的・構造的）
//    先輩 = 斜線（経験・流れ）
//    後輩 = ドット（柔らか・親しみ）
//
//  性格 → パターンの「密度・強度・角度・重ね方」
//    優しい   = 大きめ間隔・低不透明度・ぼかし的に広がる
//    厳しい   = 細かい間隔・高不透明度・シャープ
//    クール   = 極めて疎・限りなく薄い
//    元気     = 大きめ・やや高不透明度・太め
//    ツンデレ = 二重レイヤー・非対称（表裏の感情）
//
//  性別 → パターンカラー（青/紫/緑）

function getBgPattern(
  gender: Gender | null,
  relationship: Relationship | null,
  personality: Personality | null,
  isDark: boolean,
  reduceMotion: boolean = false
): React.CSSProperties {
  if (!relationship || relationship === "other") return {};
  if (!personality  || personality  === "other") return {};
  // 視差効果を減らす設定の場合は、模様自体は出さずフラットな背景のままにする
  if (reduceMotion) return {};

  // 性別ごとのRGB
  type RGB = [number, number, number];
  const gRGB: Record<Gender, RGB> = {
    male:   [37,  99, 235],
    female: [192, 38, 211],
    any:    [22, 163,  74],
  };
  const [R, G, B] = gender ? gRGB[gender] : [46, 64, 87];
  // ダークモード（クール）では白を使う
  const [PR, PG, PB]: RGB = isDark ? [255, 255, 255] : [R, G, B];
  const c = (a: number) => `rgba(${PR},${PG},${PB},${a})`;

  // ── 先生：格子（grid） ──────────────────────────────────────────────────
  if (relationship === "teacher") {
    // gentle  : 広め・薄め。やさしく広がるグラフ用紙
    // strict  : 細かく・くっきり。ノートの罫線
    // cool    : 極疎・限界まで薄い。白い霧の向こうにある格子
    // energetic: 太線・中間隔。情熱的な方眼ノート
    // tsundere: 5度傾いた格子。整ってるようで少しズレてる
    const map: Record<Exclude<Personality,"other">, React.CSSProperties> = {
      gentle: {
        backgroundImage: [
          `linear-gradient(${c(0.10)} 1px, transparent 1px)`,
          `linear-gradient(90deg, ${c(0.10)} 1px, transparent 1px)`,
        ].join(", "),
        backgroundSize: "56px 56px",
      },
      strict: {
        backgroundImage: [
          `linear-gradient(${c(0.20)} 1.5px, transparent 1.5px)`,
          `linear-gradient(90deg, ${c(0.20)} 1.5px, transparent 1.5px)`,
        ].join(", "),
        backgroundSize: "32px 32px",
      },
      cool: {
        backgroundImage: [
          `linear-gradient(${c(0.07)} 1px, transparent 1px)`,
          `linear-gradient(90deg, ${c(0.07)} 1px, transparent 1px)`,
        ].join(", "),
        backgroundSize: "80px 80px",
      },
      energetic: {
        backgroundImage: [
          `linear-gradient(${c(0.22)} 2.5px, transparent 2.5px)`,
          `linear-gradient(90deg, ${c(0.22)} 2.5px, transparent 2.5px)`,
        ].join(", "),
        backgroundSize: "40px 40px",
      },
      tsundere: {
        backgroundImage: [
          `linear-gradient(5deg,  ${c(0.15)} 1.5px, transparent 1.5px)`,
          `linear-gradient(95deg, ${c(0.15)} 1.5px, transparent 1.5px)`,
        ].join(", "),
        backgroundSize: "38px 38px",
      },
    };
    return map[personality as Exclude<Personality,"other">] ?? {};
  }

  // ── 先輩：斜線（diagonal lines） ────────────────────────────────────────
  if (relationship === "senpai") {
    // gentle  : ゆるやかな角度・広め・薄い。穏やかな流れ
    // strict  : 急な角度・狭め・くっきり。厳しい指針
    // cool    : 極めてゆるやかな角度・極疎。静かな背景
    // energetic: 二方向クロスハッチ。エネルギーの交差
    // tsundere: 二種類の角度が混在。相反する感情
    const map: Record<Exclude<Personality,"other">, React.CSSProperties> = {
      gentle: {
        backgroundImage: `repeating-linear-gradient(
          -40deg,
          transparent,
          transparent 29px,
          ${c(0.10)} 29px,
          ${c(0.10)} 31px
        )`,
      },
      strict: {
        backgroundImage: `repeating-linear-gradient(
          -65deg,
          transparent,
          transparent 13px,
          ${c(0.20)} 13px,
          ${c(0.20)} 15px
        )`,
      },
      cool: {
        backgroundImage: `repeating-linear-gradient(
          -45deg,
          transparent,
          transparent 51px,
          ${c(0.07)} 51px,
          ${c(0.07)} 53px
        )`,
      },
      energetic: {
        backgroundImage: [
          `repeating-linear-gradient(-45deg, transparent, transparent 15px, ${c(0.18)} 15px, ${c(0.18)} 17px)`,
          `repeating-linear-gradient( 45deg, transparent, transparent 15px, ${c(0.10)} 15px, ${c(0.10)} 17px)`,
        ].join(", "),
      },
      tsundere: {
        backgroundImage: [
          `repeating-linear-gradient(-28deg, transparent, transparent 18px, ${c(0.16)} 18px, ${c(0.16)} 20px)`,
          `repeating-linear-gradient(-75deg, transparent, transparent 39px, ${c(0.08)} 39px, ${c(0.08)} 41px)`,
        ].join(", "),
      },
    };
    return map[personality as Exclude<Personality,"other">] ?? {};
  }

  // ── 後輩：ドット（radial dots） ─────────────────────────────────────────
  if (relationship === "kohai") {
    // gentle  : 大きめドット・広め間隔・やわらか。丸くて親しみやすい
    // strict  : 小さめドット・狭め間隔・くっきり。真面目な密度
    // cool    : 極小ドット・極疎。存在感を消したい
    // energetic: 大きめドット・やや高不透明度。元気よく弾ける
    // tsundere: 2サイズのドットがオフセットで混在。二面性
    const map: Record<Exclude<Personality,"other">, React.CSSProperties> = {
      gentle: {
        backgroundImage: `radial-gradient(circle, ${c(0.18)} 2px, transparent 2px)`,
        backgroundSize: "28px 28px",
      },
      strict: {
        backgroundImage: `radial-gradient(circle, ${c(0.22)} 1.5px, transparent 1.5px)`,
        backgroundSize: "16px 16px",
      },
      cool: {
        backgroundImage: `radial-gradient(circle, ${c(0.08)} 1.5px, transparent 1.5px)`,
        backgroundSize: "44px 44px",
      },
      energetic: {
        backgroundImage: `radial-gradient(circle, ${c(0.25)} 2.5px, transparent 2.5px)`,
        backgroundSize: "20px 20px",
      },
      tsundere: {
        backgroundImage: [
          `radial-gradient(circle, ${c(0.20)} 2px,   transparent 2px)`,
          `radial-gradient(circle, ${c(0.10)} 1.5px, transparent 1.5px)`,
        ].join(", "),
        backgroundSize:     "24px 24px, 24px 24px",
        backgroundPosition: "0 0,       12px 12px",
      },
    };
    return map[personality as Exclude<Personality,"other">] ?? {};
  }

  return {};
}

// ─── 関係性オーバーレイ（霧 / 光芒 / スポットライト） ────────────────────────

function RelationshipOverlay({ relationship, reduceMotion = false, isMobile = false }: {
  relationship: Relationship | null; reduceMotion?: boolean; isMobile?: boolean;
}) {
  if (!relationship || relationship === "other") return null;
  // 視差効果を減らす設定の場合は、演出レイヤーごと描画しない
  if (reduceMotion) return null;

  const wrap: React.CSSProperties = {
    position: "absolute", inset: 0,
    pointerEvents: "none", zIndex: 2, overflow: "hidden",
    animation: "yt-overlay-in 0.9s ease forwards",
  };

  // ── 後輩：霧・もや・煙（むらのある不均一な濃淡） ────────────────────────────
  if (relationship === "kohai") {
    // grad: 中心の濃さと広がり方を変えて「濃い塊」と「薄く伸びる靄」を混在させる
    // パフォーマンス対策：blurレイヤーは最大4個（モバイルは2個）に間引き、blur量も半減
    const allBlobs: Array<React.CSSProperties & { anim: string; grad: string; radius: string }> = [
      { width:380,height:300, top:"-4%",  left:"-6%",  filter:"blur(10px)", radius:"45% 55% 60% 40% / 50% 45% 55% 50%",
        grad:"radial-gradient(ellipse at 35% 35%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.55) 45%, transparent 75%)",
        anim:"yt-fog-1 9s ease-in-out 0s infinite" },
      { width:420,height:330, top:"-6%",  left:"50%",  filter:"blur(15px)", radius:"60% 40% 45% 55% / 55% 60% 40% 45%",
        grad:"radial-gradient(ellipse at 60% 40%, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.20) 50%, transparent 75%)",
        anim:"yt-fog-2 11s ease-in-out -3s infinite" },
      { width:280,height:230, top:"33%",  left:"6%",   filter:"blur(7px)", radius:"50% 50% 45% 55% / 45% 55% 50% 50%",
        grad:"radial-gradient(ellipse at 45% 50%, rgba(255,255,255,1) 0%, rgba(255,255,255,0.6) 40%, transparent 72%)",
        anim:"yt-fog-3 8s ease-in-out -5s infinite" },
      { width:400,height:320, top:"46%",  left:"54%",  filter:"blur(17px)", radius:"55% 45% 50% 50% / 60% 40% 60% 40%",
        grad:"radial-gradient(ellipse at 50% 55%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.18) 50%, transparent 78%)",
        anim:"yt-fog-1 10s ease-in-out -2s infinite" },
    ];
    const blobs = isMobile ? allBlobs.slice(0, 2) : allBlobs;
    return (
      <div aria-hidden="true" style={wrap}>
        {blobs.map(({ anim, grad, radius, ...style }, i) => (
          <div key={i} style={{
            position: "absolute",
            borderRadius: radius,
            background: grad,
            animation: anim,
            willChange: "transform, opacity",
            ...style,
          }} />
        ))}
      </div>
    );
  }

  // ── 先輩：光の筋（斜めに差し込む光芒・むらのある明滅） ──────────────────────
  if (relationship === "senpai") {
    // anim: 強い光芒・中間・淡い光芒の3種を混ぜてむらを出す
    // パフォーマンス対策：同時アニメーション数を抑えるため本数を間引く（モバイルはさらに半減）
    const allRays = [
      { left:"4%",   width:"75px", dur:"5.5s", delay:"0s",    anim:"yt-ray-strong", grad:"rgba(255,255,255,0.95)" },
      { left:"19%",  width:"45px", dur:"6.8s", delay:"-1.8s", anim:"yt-ray-soft",   grad:"rgba(255,255,255,0.95)" },
      { left:"35%",  width:"85px", dur:"4.8s", delay:"-3.2s", anim:"yt-ray-mid",    grad:"rgba(255,255,255,0.95)" },
      { left:"52%",  width:"40px", dur:"7.2s", delay:"-0.6s", anim:"yt-ray-strong", grad:"rgba(255,255,255,0.95)" },
      { left:"68%",  width:"65px", dur:"5.2s", delay:"-2.5s", anim:"yt-ray-soft",   grad:"rgba(255,255,255,0.95)" },
    ];
    const rays = isMobile ? allRays.slice(0, 3) : allRays;
    return (
      <div aria-hidden="true" style={wrap}>
        {/* 光源のゆらぎ：左上から差す光の根元のグロー */}
        <div style={{
          position: "absolute",
          top: "-18%", left: "-12%",
          width: "55%", paddingBottom: "55%",
          borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.15) 50%, transparent 75%)",
          animation: "yt-ray-source 7s ease-in-out 0s infinite",
          willChange: "transform, opacity",
        }} />
        {rays.map((r, i) => (
          <div key={i} style={{
            position: "absolute",
            top: "-30%",
            left: r.left,
            width: r.width,
            height: "160%",
            background: `linear-gradient(to bottom, transparent 0%, ${r.grad} 30%, ${r.grad} 70%, transparent 100%)`,
            transformOrigin: "top center",
            animation: `${r.anim} ${r.dur} ease-in-out ${r.delay} infinite`,
            willChange: "transform, opacity",
          }} />
        ))}
      </div>
    );
  }

  // ── 先生：柔らかい放射状スポットライト＋漂う塵 ──────────────────────────────
  if (relationship === "teacher") {
    // 光の中をゆっくり舞う塵の粒子（モバイルは半分に間引く）
    const allDust = [
      { size:5, top:"30%", left:"35%", anim:"yt-dust-1 7s ease-in-out 0s infinite" },
      { size:4, top:"45%", left:"55%", anim:"yt-dust-2 9s ease-in-out -2s infinite" },
      { size:6, top:"55%", left:"42%", anim:"yt-dust-1 8s ease-in-out -4s infinite" },
      { size:3, top:"38%", left:"62%", anim:"yt-dust-2 6.5s ease-in-out -1s infinite" },
    ];
    const dust = isMobile ? allDust.slice(0, 2) : allDust;
    return (
      <div aria-hidden="true" style={wrap}>
        {/* メイン：天井から差し込む楕円グロー（やや歪んだ形でむらを出す） */}
        <div style={{
          position: "absolute",
          top: "-15%", left: "50%",
          width: "130%", paddingBottom: "90%",
          borderRadius: "48% 52% 50% 50% / 55% 50% 50% 45%",
          background: "radial-gradient(ellipse at 48% 40%, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.45) 45%, transparent 70%)",
          transform: "translateX(-50%)",
          animation: "yt-spotlight 6s ease-in-out 0s infinite",
          willChange: "transform, opacity",
        }} />
        {/* サブ：床からの反射光 */}
        <div style={{
          position: "absolute",
          bottom: "-10%", left: "50%",
          width: "80%", paddingBottom: "40%",
          borderRadius: "52% 48% 50% 50% / 50% 50% 55% 45%",
          background: "radial-gradient(ellipse, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.20) 50%, transparent 70%)",
          transform: "translateX(-50%)",
          animation: "yt-spotlight-sub 6s ease-in-out -3s infinite",
          willChange: "transform, opacity",
        }} />
        {/* 漂う塵の粒子 */}
        {dust.map((d, i) => (
          <div key={i} style={{
            position: "absolute",
            top: d.top, left: d.left,
            width: d.size, height: d.size,
            borderRadius: "50%",
            backgroundColor: "rgba(255,255,255,0.95)",
            boxShadow: "0 0 6px rgba(255,255,255,0.8)",
            animation: d.anim,
            willChange: "transform, opacity",
          }} />
        ))}
      </div>
    );
  }

  return null;
}

// ─── 汎用コンポーネント ───────────────────────────────────────────────────────

function Section({ title, hint, theme, children }: { title: string; hint?: string; theme: ThemeVars; children: React.ReactNode }) {
  return (
    <div className="yt-slide-up" style={{
      backgroundColor: theme.card,
      border: `1.5px solid ${theme.border}`,
      borderLeft: theme.showSectionAccent ? `4px solid ${theme.accent}` : `1.5px solid ${theme.border}`,
      borderRadius: theme.radius, padding: "1.5rem 1.4rem",
      boxShadow: theme.cardShadow,
      transition: `background-color ${T},border-color ${T},border-radius ${T},box-shadow ${T}`,
    }}>
      <p style={{ fontWeight: 800, fontSize: ".95rem", color: theme.primary, margin: 0,
        fontFamily: theme.fontFamily, letterSpacing: theme.letterSpacing,
        transition: `color ${T},font-family ${T}` }}>{title}</p>
      {hint && <p style={{ color: theme.muted, fontSize: ".8rem", margin: ".4rem 0 0", lineHeight: 1.65,
        fontFamily: theme.fontFamily, transition: `color ${T},font-family ${T}` }}>{hint}</p>}
      <div style={{ marginTop: "1rem" }}>{children}</div>
    </div>
  );
}

function OCard({ selected, onClick, icon, title, sub, theme, extraClass = "", titleClass = "", delay = 0, children }: {
  selected: boolean; onClick: () => void; icon: string; title: string; sub?: string;
  theme: ThemeVars; extraClass?: string; titleClass?: string; delay?: number; children?: React.ReactNode;
}) {
  return (
    <div className={`yt-card yt-pop d${delay} ${extraClass}`} onClick={onClick} style={{
      borderRadius: theme.inputRadius,
      borderColor: selected ? theme.accent : theme.border,
      backgroundColor: selected ? theme.accentLight : theme.card,
      boxShadow: selected ? theme.cardShadow : "none",
      padding: "1.1rem .9rem",
      display: "flex", flexDirection: "column", alignItems: "center",
      textAlign: "center", gap: ".35rem", position: "relative",
    }}>
      {selected && <span className="yt-check" style={{ position: "absolute", top: ".4rem", right: ".5rem", fontSize: ".8rem", color: theme.accent }}>✓</span>}
      <span style={{ fontSize: "1.6rem", lineHeight: 1 }}>{icon}</span>
      <span className={titleClass} style={{ fontWeight: 700, fontSize: ".9rem", color: selected ? theme.accent : theme.text,
        fontFamily: theme.fontFamily, letterSpacing: theme.letterSpacing, transition: `color ${T}` }}>{title}</span>
      {sub && <span style={{ fontSize: ".74rem", color: theme.muted, lineHeight: 1.4,
        fontFamily: theme.fontFamily, transition: `color ${T},font-family ${T}` }}>{sub}</span>}
      {children}
    </div>
  );
}

// ─── ビルダー進捗ヘッダー ─────────────────────────────────────────────────────

function BuilderProgress({ step, theme }: { step: BuilderStep; theme: ThemeVars }) {
  const steps = ["性別", "関係性", "性格"];
  const pct = `${Math.round((step / 3) * 100)}%`;
  return (
    <div className="yt-slide-up" style={{ marginBottom: "1rem" }}>
      <div className="yt-progress-bar" style={{ background: `${theme.border}` }}>
        <div className="yt-progress-fill" style={{ width: pct, backgroundColor: theme.accent, transition: `width .5s ${T}` }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: ".5rem" }}>
        {steps.map((s, i) => (
          <span key={s} style={{
            fontSize: ".72rem", fontWeight: i + 1 <= step ? 700 : 400,
            color: i + 1 < step ? theme.accent : i + 1 === step ? theme.primary : theme.muted,
            fontFamily: theme.fontFamily,
            transition: `color ${T}`,
          }}>
            {i + 1 < step ? "✓ " : `${i + 1}. `}{s}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── 完了チップ ───────────────────────────────────────────────────────────────

function CompletedChips({ gender, relationship, step, theme, onClickGender, onClickRel }: {
  gender: Gender | null; relationship: Relationship | null; step: BuilderStep;
  theme: ThemeVars; onClickGender: () => void; onClickRel: () => void;
}) {
  const GL: Record<Gender, string> = { male: "♂ 男性", female: "♀ 女性", any: "☯ どちらでも" };
  const RL: Record<Relationship, string> = { teacher: "📚 先生", senpai: "🌟 先輩", kohai: "🌸 後輩", other: "✨ その他" };
  if (!gender) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: ".4rem", marginBottom: ".8rem" }}>
      {gender && (
        <button className="yt-chip" onClick={onClickGender}
          style={{ borderColor: theme.accent, color: theme.accent, backgroundColor: theme.accentLight }}>
          {GL[gender]} <span style={{ opacity: .6, fontSize: ".65rem" }}>✎</span>
        </button>
      )}
      {relationship && step > 2 && (
        <button className="yt-chip" onClick={onClickRel}
          style={{ borderColor: theme.accent, color: theme.accent, backgroundColor: theme.accentLight }}>
          {RL[relationship]} <span style={{ opacity: .6, fontSize: ".65rem" }}>✎</span>
        </button>
      )}
    </div>
  );
}

// ─── ステップナビゲーション ───────────────────────────────────────────────────

function StepNav({ step, canNext, theme, onBack, onNext, nextLabel = "次へ →" }: {
  step: BuilderStep; canNext: boolean; theme: ThemeVars;
  onBack: () => void; onNext: () => void; nextLabel?: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: step > 1 ? "space-between" : "flex-end", alignItems: "center", marginTop: "1.2rem" }}>
      {step > 1 && (
        <button className="yt-step-btn-back" onClick={onBack}
          style={{ borderColor: theme.border, color: theme.muted }}>
          ← 戻る
        </button>
      )}
      {step < 3 && (
        <button className="yt-step-btn-next" disabled={!canNext} onClick={onNext}
          style={{ backgroundColor: canNext ? theme.accent : theme.border }}>
          {nextLabel} →
        </button>
      )}
    </div>
  );
}

// ─── キャラクターサマリーカード ───────────────────────────────────────────────

function CharSummaryCard({ gender, relationship, personality, persQuote, theme }: {
  gender: Gender; relationship: Relationship; personality: Personality;
  persQuote: string; theme: ThemeVars;
}) {
  const GL: Record<Gender, string>       = { male: "♂ 男性", female: "♀ 女性", any: "☯ 性別不問" };
  const RL: Record<Relationship, string> = { teacher: "📚 先生", senpai: "🌟 先輩", kohai: "🌸 後輩", other: "✨ その他" };
  const PL: Record<Personality, string>  = { gentle: "🌸 優しい", strict: "⚡ 厳しい", cool: "❄️ クール", energetic: "🔥 元気", tsundere: "💢 ツンデレ", other: "✨ その他" };

  return (
    <div className="yt-slide-up" style={{
      backgroundColor: theme.accentLight, border: `2px solid ${theme.accent}`,
      borderRadius: theme.radius, padding: "1.2rem 1.4rem", boxShadow: theme.cardShadow,
      transition: `background-color ${T},border-color ${T},border-radius ${T}`,
    }}>
      <p style={{ fontSize: ".72rem", fontWeight: 700, letterSpacing: ".1em", color: theme.accent,
        textTransform: "uppercase", margin: "0 0 .5rem", fontFamily: theme.fontFamily }}>
        あなたのキャラクター
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: ".4rem", marginBottom: ".75rem" }}>
        {[GL[gender], RL[relationship], PL[personality]].map(b => (
          <span key={b} style={{ fontSize: ".82rem", fontWeight: 600, padding: ".22rem .7rem",
            borderRadius: "99px", background: theme.card, color: theme.primary,
            border: `1px solid ${theme.border}`, fontFamily: theme.fontFamily }}>
            {b}
          </span>
        ))}
      </div>
      {persQuote && (
        <p style={{ fontSize: ".9rem", color: theme.text, fontStyle: "italic", margin: 0,
          lineHeight: 1.6, fontFamily: theme.fontFamily, transition: `color ${T},font-family ${T}` }}>
          {persQuote}
        </p>
      )}
    </div>
  );
}

// ─── プレビューカード（選択した世界観をこの枠の中だけで再現） ──────────────────
// 「選択したら全部変わる」演出を、このカードの中だけに閉じ込める。
// ページ全体の背景・フォントは変えず、ここだけがキャラクターの世界観を体験できる窓になる。

function PreviewCard({ gender, relationship, personality, persQuote, theme, reduceMotion, isMobile, shimmerActive }: {
  gender: Gender; relationship: Relationship; personality: Personality;
  persQuote: string; theme: ThemeVars; reduceMotion: boolean; isMobile: boolean; shimmerActive: boolean;
}) {
  return (
    <div className={`yt-slide-up${shimmerActive ? " yt-font-in" : ""}`} style={{
      position: "relative", overflow: "hidden",
      backgroundColor: theme.bg, border: `1.5px solid ${theme.border}`,
      borderRadius: theme.radius, boxShadow: theme.cardShadow,
      transition: `background-color ${T},border-color ${T},border-radius ${T}`,
    }}>
      {/* 背景パターン（このカードの中だけ） */}
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
        animation: reduceMotion ? "none" : "yt-pattern-in 0.7s ease forwards",
        ...getBgPattern(gender, relationship, personality, theme.isDark, reduceMotion),
      }} />

      {/* 関係性オーバーレイ（霧 / 光芒 / スポットライト・このカードの中だけ） */}
      <RelationshipOverlay relationship={relationship} reduceMotion={reduceMotion} isMobile={isMobile} />

      <div style={{ position: "relative", zIndex: 3, padding: "1.6rem 1.5rem" }}>
        <p style={{ fontSize: ".72rem", fontWeight: 700, letterSpacing: ".1em", color: theme.accent,
          textTransform: "uppercase", margin: "0 0 .6rem", fontFamily: theme.fontFamily }}>
          PREVIEW — こんな雰囲気になります
        </p>
        <p style={{ fontSize: "1rem", fontWeight: 800, color: theme.primary, margin: "0 0 .6rem",
          fontFamily: theme.fontFamily, letterSpacing: theme.letterSpacing,
          fontStyle: theme.fontFamily.includes("serif") ? "italic" : "normal" }}>
          {theme.tagline}
        </p>
        {persQuote && (
          <p style={{ fontSize: ".88rem", color: theme.text, fontStyle: "italic", margin: 0,
            lineHeight: 1.7, fontFamily: theme.fontFamily }}>
            {persQuote}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── 送信後ステップ案内 ───────────────────────────────────────────────────────

function NextStepsCard({ theme, gender, relationship, personality, charChoice }: {
  theme: ThemeVars;
  gender: Gender | null;
  relationship: Relationship | null;
  personality: Personality | null;
  charChoice: CharChoice | null;
}) {
  const gk = gender as GK | null;
  const rk = relationship as RK | null;
  const pk = personality as PK | null;
  const hit = (C: CharCopyTable) =>
    gk && rk && pk && gk in C && rk in C[gk] && pk in C[gk][rk] ? C[gk][rk][pk] : null;

  // ── Step 1: アプリ内チャットでご連絡（45パターン）──────────────────────────
  const step1desc = (() => {
    if (charChoice === "custom")   return "内容を確認し、24〜48時間以内にご連絡いたします";
    const found = hit(STEP1);
    if (found) return found;
    if (pk === "gentle")    return "やさしくアプリでメッセージをお送りします。もうしばらく待っていてね 🌸";
    if (pk === "strict")    return "確認でき次第、迅速にご連絡いたします ⚡";
    if (pk === "cool")      return "……アプリにメッセージを送る。待っていなさい ❄️";
    if (pk === "energetic") return "すぐにでも連絡したい！通常24〜48時間以内にお送りします 🔥";
    if (pk === "tsundere")  return "べ、別にすぐ連絡したいわけじゃないし！24〜48時間以内にアプリでメッセージする 💢";
    return "通常24〜48時間以内にアプリでメッセージをお送りします";
  })();

  // ── Step 2: キャラクターを完成（45パターン）──────────────────────────────
  const step2desc = (() => {
    if (charChoice === "custom")   return "いただいたテキスト定義を隅々まで確認して、キャラクターを仕上げます";
    const found = hit(STEP2);
    if (found) return found;
    if (rk === "teacher" && gk === "male")   return "彼の先生キャラクターを丁寧に仕上げます";
    if (rk === "teacher" && gk === "female") return "彼女の先生キャラクターを丁寧に仕上げます";
    if (rk === "teacher")                    return "先生キャラクターを丁寧に仕上げます";
    if (rk === "senpai"  && gk === "male")   return "彼の先輩キャラクターを丁寧に仕上げます";
    if (rk === "senpai"  && gk === "female") return "彼女の先輩キャラクターを丁寧に仕上げます";
    if (rk === "senpai")                     return "先輩キャラクターを丁寧に仕上げます";
    if (rk === "kohai"   && gk === "male")   return "彼の後輩キャラクターを丁寧に仕上げます";
    if (rk === "kohai"   && gk === "female") return "彼女の後輩キャラクターを丁寧に仕上げます";
    if (rk === "kohai")                      return "後輩キャラクターを丁寧に仕上げます";
    return "ご要望を確認してキャラクターを仕上げます";
  })();

  // Step 3: 性別×関係性×性格 = 45パターン完全対応
  const step3desc = (() => {
    const found = hit(STEP3);
    if (found) return found;
    if (pk === "gentle")    return "毎日やさしくサポートしてもらいながら英語を続けましょう 🌸";
    if (pk === "strict")    return "毎日アプリのメッセージで厳しく鍛えてもらおう。甘えは禁物！⚡";
    if (pk === "cool")      return "毎日『……今日の課題』。短く的確なメッセージがアプリに届きます ❄️";
    if (pk === "energetic") return "毎日元気なメッセージと英語でテンション爆上がり！🔥";
    if (pk === "tsundere")  return "毎日『べ、別にあなたのためじゃないけど…』というメッセージがアプリに届きます 💢";
    if (rk === "teacher")   return "毎日先生からアプリのメッセージで丁寧な英語指導が届きます 📚";
    if (rk === "senpai")    return "毎日頼りになる先輩と英語を続けましょう 🌟";
    if (rk === "kohai")     return "毎日後輩からのメッセージがアプリに届きます ✨";
    return "毎日アプリのメッセージで楽しく英語を続けましょう ✨";
  })();

  const steps = [
    { icon: "📩", label: "アプリ内チャットでご連絡", desc: step1desc },
    { icon: "🎭", label: "キャラクターを完成", desc: step2desc },
    { icon: "🗣️", label: "学習スタート！",     desc: step3desc },
  ];
  return (
    <div style={{
      backgroundColor: theme.isDark ? "rgba(40,44,56,0.82)" : "rgba(255,255,255,0.86)",
      backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
      border: `1px solid ${theme.border}`, borderRadius: theme.radius,
      padding: "1.2rem 1.4rem",
      transition: `background-color ${T},border-color ${T},border-radius ${T}`,
    }}>
      <p style={{ fontSize: ".72rem", fontWeight: 700, letterSpacing: ".1em",
        color: theme.muted, textTransform: "uppercase", margin: "0 0 .8rem", fontFamily: theme.fontFamily }}>
        送信後の流れ
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: ".6rem" }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: "flex", gap: ".75rem", alignItems: "flex-start" }}>
            <span style={{ fontSize: "1.1rem", lineHeight: 1, flexShrink: 0, marginTop: "1px" }}>{s.icon}</span>
            <div>
              <p style={{ fontWeight: 700, fontSize: ".84rem", color: theme.text, margin: 0,
                fontFamily: theme.fontFamily, transition: `color ${T}` }}>{s.label}</p>
              <p style={{ fontSize: ".76rem", color: theme.muted, margin: ".1rem 0 0",
                fontFamily: theme.fontFamily, transition: `color ${T}` }}>{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── メインページ ─────────────────────────────────────────────────────────────

export default function ApplyPage() {
  const [nickname,     setNickname]     = useState("");
  const [email,        setEmail]        = useState("");
  const [charChoice,   setCharChoice]   = useState<CharChoice | null>(null);
  const [gender,       setGender]       = useState<Gender | null>(null);
  const [builderStep,  setBuilderStep]  = useState<BuilderStep>(1);
  const [relationship, setRelationship] = useState<Relationship | null>(null);
  const [relOther,     setRelOther]     = useState("");
  const [personality,  setPersonality]  = useState<Personality | null>(null);
  const [persOther,    setPersOther]    = useState("");
  const [refChar,      setRefChar]      = useState("");
  const [charDesc,     setCharDesc]     = useState("");
  const [presetChar,   setPresetChar]   = useState<PresetCharId | null>(null);
  const [submitted,    setSubmitted]    = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [orderId,      setOrderId]      = useState<number | null>(null);
  const [paymentState, setPaymentState] = useState<"checking" | "available" | "unavailable">("checking");
  const [checkoutUrl,  setCheckoutUrl]  = useState<string | null>(null);
  const [redirecting,  setRedirecting]  = useState(false);

  const [shimmerActive, setShimmerActive] = useState(false);

  const { reduceMotion, isMobile } = useReducedMotionAndViewport();
  const previewRef = useRef<HTMLDivElement>(null);

  const theme = buildPresetTheme(gender, relationship, personality, charChoice === "preset" ? presetChar : null);
  const copy  = getDynamicCopy(gender, relationship);

  // ── 選択ハンドラ ──────────────────────────────────────────────────────────
  function triggerShimmer() {
    setShimmerActive(false);
    // rAF で一度フラッシュしてから再付与し、アニメーションを確実に再生
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setShimmerActive(true));
    });
    setTimeout(() => setShimmerActive(false), 500);
  }
  function handleGenderSelect(g: Gender) {
    triggerShimmer();
    setGender(g); setRelationship(null); setPersonality(null);
  }
  function handleRelSelect(r: Relationship) {
    triggerShimmer();
    setRelationship(r); setPersonality(null);
  }
  function handlePersSelect(p: Personality) {
    triggerShimmer();
    setPersonality(p);
    scrollToPreview();
  }
  function handlePresetSelect(id: PresetCharId) {
    triggerShimmer();
    const p = PRESET_CHARACTERS.find(c => c.id === id);
    if (!p) return;
    setPresetChar(id);
    setGender(p.gender); setRelationship(p.relationship); setPersonality(p.personality);
    scrollToPreview();
  }
  function scrollToPreview() {
    setTimeout(() => {
      previewRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    }, 80);
  }
  function goBackToGender()        { setBuilderStep(1); setRelationship(null); setPersonality(null); }
  function goBackToRelationship()  { setBuilderStep(2); setPersonality(null); }

  // body 背景色同期（ページ全体の背景・文字色は BASE で固定し、選択のたびに変化させない）
  useEffect(() => {
    const prev = { bg: document.body.style.backgroundColor, color: document.body.style.color, tr: document.body.style.transition };
    document.body.style.backgroundColor = BASE.bg;
    document.body.style.color = BASE.text;
    return () => { document.body.style.backgroundColor = prev.bg; document.body.style.color = prev.color; document.body.style.transition = prev.tr; };
  }, []);

  // 申し込み完了後、オンライン決済（Stripe）が利用可能かどうかを確認する。
  // 未設定の場合は503が返るため、その場合は従来のチャット案内のみを表示する。
  useEffect(() => {
    if (!submitted || orderId == null) return;
    let cancelled = false;
    api.createCheckoutSession(orderId)
      .then((res: { checkout_url?: string }) => {
        if (cancelled) return;
        if (res.checkout_url) { setCheckoutUrl(res.checkout_url); setPaymentState("available"); }
        else setPaymentState("unavailable");
      })
      .catch(() => { if (!cancelled) setPaymentState("unavailable"); });
    return () => { cancelled = true; };
  }, [submitted, orderId]);

  function goToCheckout() {
    if (!checkoutUrl) return;
    setRedirecting(true);
    window.location.href = checkoutUrl;
  }

  // ── バリデーション ─────────────────────────────────────────────────────────
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const s1Valid   = nickname.trim().length > 0 && emailValid;
  const relReady  = relationship && (relationship !== "other" || relOther.trim());
  const bReady    = charChoice === "builder" ? !!(gender && relReady && personality && (personality !== "other" || persOther.trim())) : true;
  const cReady    = charChoice === "custom"  ? charDesc.trim().length >= 10 : true;
  const pReady    = charChoice === "preset"  ? !!presetChar : true;
  const formReady = !!(s1Valid && charChoice && bReady && cReady && pReady);

  // ── 送信処理 ───────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formReady || submitting) return;
    setSubmitting(true); setError("");
    const GL: Record<Gender, string>       = { male: "男性", female: "女性", any: "どちらでもOK" };
    const RL: Record<Relationship, string> = { teacher: "先生", senpai: "先輩", kohai: "後輩", other: relOther };
    const PL: Record<Personality, string>  = { gentle: "優しい", strict: "厳しい", cool: "クール", energetic: "元気・明るい", tsundere: "ツンデレ", other: persOther };
    let charName = ""; const nl: string[] = [];
    if (charChoice === "builder" && gender && relationship && personality) {
      charName = `[ビルダー] ${GL[gender]}/${RL[relationship]}/${PL[personality]}`;
      nl.push("【キャラビルダー】", `性別: ${GL[gender]}`, `関係性: ${RL[relationship]}`, `性格: ${PL[personality]}`);
    } else if (charChoice === "custom") {
      charName = "オリジナル定義"; nl.push("【オリジナル定義】");
      if (refChar.trim()) nl.push(`参考: ${refChar.trim()}`);
      nl.push(`\nキャラクター説明:\n${charDesc.trim()}`);
    } else if (charChoice === "preset" && presetChar) {
      const p = PRESET_CHARACTERS.find(c => c.id === presetChar);
      if (p) {
        charName = p.name;
        nl.push("【推しキャラクター選択】", `キャラクター: ${p.name}（${p.reading}）`,
          `性別: ${GL[p.gender]}`, `関係性: ${RL[p.relationship]}`, `性格: ${PL[p.personality]}`);
      }
    }
    try {
      const res = await fetch("/api/orders/form-submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nickname.trim(), email: email.trim(), character_name: charName, notes: nl.join("\n") }),
      });
      if (!res.ok) { const e2 = await res.json().catch(() => ({})); throw new Error((e2 as { detail?: string }).detail || "送信に失敗しました"); }
      const resJson = await res.json().catch(() => ({})) as { order_id?: number };
      if (resJson.order_id != null) setOrderId(resJson.order_id);
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "送信に失敗しました。もう一度お試しください。");
    } finally { setSubmitting(false); }
  }

  const inputStyle: React.CSSProperties = {
    backgroundColor: theme.isDark ? "#2a2f3a" : theme.card,
    borderColor: theme.border, borderRadius: theme.inputRadius,
    color: theme.text, fontFamily: theme.fontFamily, letterSpacing: theme.letterSpacing,
  };

  // ── 完了画面 ──────────────────────────────────────────────────────────────
  // LPでは抑えていた「世界観演出」をここで初めてフルスペックで見せる。
  // 「もっと作り込まれた画面が後で見られる」という期待値が転換率に効く想定。
  if (submitted) {
    const showWorld = !!(relationship && personality && relationship !== "other" && personality !== "other");
    return (
      <>
        <style>{GLOBAL_CSS}</style>
        <div style={{ minHeight: "100vh", backgroundColor: theme.gradA, transition: `background-color .65s ease`,
          display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1rem",
          position: "relative", overflow: "hidden" }}>
          {showWorld && (
            <>
              <div aria-hidden="true" style={{
                position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
                animation: reduceMotion ? "none" : "yt-pattern-in 0.9s ease forwards",
                ...getBgPattern(gender, relationship, personality, theme.isDark, reduceMotion),
              }} />
              <RelationshipOverlay relationship={relationship} reduceMotion={reduceMotion} isMobile={isMobile} />
            </>
          )}
          <div className="yt-pop" style={{
            position: "relative", zIndex: 3,
            backgroundColor: theme.card, border: `1.5px solid ${theme.border}`,
            borderRadius: theme.radius, maxWidth: "480px", width: "100%",
            padding: "3.5rem 2.5rem", textAlign: "center", boxShadow: "0 24px 64px rgba(0,0,0,.2)",
          }}>
            <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }}>🎉</div>
            <h1 style={{ color: theme.primary, fontWeight: 900, fontSize: "1.5rem",
              margin: "0 0 1rem", fontFamily: theme.fontFamily }}>
              申し込みを受け付けました！
            </h1>
            {showWorld && (
              <p style={{ color: theme.accent, fontWeight: 700, fontSize: ".85rem",
                margin: "0 0 .8rem", fontFamily: theme.fontFamily }}>
                あなたの推し先生のページが、こんな雰囲気になります
              </p>
            )}
            <p style={{ color: theme.muted, fontSize: ".95rem", lineHeight: 2,
              fontFamily: theme.fontFamily, margin: 0, whiteSpace: "pre-line" }}>
              {copy.successBody}
            </p>

            {paymentState === "available" && (
              <div style={{ marginTop: "1.8rem" }}>
                {charChoice === "preset" ? (
                  <p style={{ color: theme.text, fontSize: ".88rem", lineHeight: 1.8,
                    fontFamily: theme.fontFamily, margin: "0 0 1rem" }}>
                    公式キャラクターはキャラ作成費無料です。このまま進むとすぐにアカウントが発行されます。
                  </p>
                ) : (
                  <p style={{ color: theme.text, fontSize: ".88rem", lineHeight: 1.8,
                    fontFamily: theme.fontFamily, margin: "0 0 1rem" }}>
                    お支払いを完了すると、すぐにアカウントが発行されます。
                  </p>
                )}
                <button
                  className="yt-btn"
                  disabled={redirecting}
                  onClick={goToCheckout}
                  style={{ backgroundColor: theme.accent, borderRadius: theme.inputRadius, fontFamily: theme.fontFamily }}
                >
                  {redirecting
                    ? (charChoice === "preset" ? "アカウントを準備しています…" : "決済画面に移動しています…")
                    : (charChoice === "preset" ? "アカウントを発行する →" : "お支払いに進む →")}
                </button>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  // ── 関係性バリデーション ──────────────────────────────────────────────────
  const emailError = emailTouched && email.trim().length > 0 && !emailValid
    ? "メールアドレスの形式が正しくありません"
    : null;

  // ── メインフォーム ─────────────────────────────────────────────────────────
  return (
    <>
      <style>{GLOBAL_CSS}</style>

      {/* ══ ヒーロー ════════════════════════════════════════════════════════ */}
      <div style={{
        backgroundColor: theme.gradA, padding: theme.heroPaddingV,
        textAlign: "center", position: "relative", overflow: "hidden",
        transition: `background-color .65s ${T},padding .6s ${T}`,
      }}>
        <div style={{ position: "absolute", top: "-60px", right: "-80px", width: "380px", height: "380px",
          borderRadius: "50%", backgroundColor: theme.gradB, opacity: theme.blobOpacity,
          filter: "blur(72px)", pointerEvents: "none", transition: `background-color .65s ${T},opacity .6s ease` }} />
        <div style={{ position: "absolute", bottom: "-100px", left: "-60px", width: "300px", height: "300px",
          borderRadius: "50%", backgroundColor: theme.gradB, opacity: theme.blobOpacity * .6,
          filter: "blur(56px)", pointerEvents: "none", transition: `background-color .65s ${T},opacity .6s ease` }} />

        <p style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".22em", color: "rgba(255,255,255,.55)",
          textTransform: "uppercase", margin: "0 0 1rem", fontFamily: theme.fontFamily }}>
          English Learning Service
        </p>
        <h1 style={{ fontSize: "clamp(2.4rem,8vw,3.2rem)", fontWeight: 900, color: "#fff",
          letterSpacing: ".04em", margin: "0 0 .75rem", fontFamily: theme.fontFamily,
          textShadow: "0 2px 20px rgba(0,0,0,.22)", transition: `font-family ${T}` }}>
          推しEnglish
        </h1>
        {/* ── サービス説明（新規追加） */}
        <p style={{ fontSize: "clamp(.82rem,2.5vw,.92rem)", color: "rgba(255,255,255,.7)",
          maxWidth: "380px", margin: "0 auto .75rem", lineHeight: 1.75,
          fontFamily: theme.fontFamily, transition: `font-family ${T}` }}>
          毎日アプリ内チャットで、あなただけのオリジナルキャラクターが英語をマンツーマン指導。
        </p>
        <p style={{ fontSize: "clamp(.9rem,3vw,1.05rem)", color: "rgba(255,255,255,.88)",
          maxWidth: "420px", margin: "0 auto", lineHeight: 1.8,
          fontFamily: theme.fontFamily, letterSpacing: theme.letterSpacing,
          fontStyle: theme.fontFamily.includes("serif") ? "italic" : "normal",
          transition: `font-family ${T},letter-spacing ${T}`, minHeight: "3.4rem" }}>
          {theme.tagline}
        </p>

        {/* 選択状況バッジ */}
        {(gender || relationship || personality) && (
          <div style={{ marginTop: "1.3rem", display: "flex", justifyContent: "center", flexWrap: "wrap", gap: ".4rem" }}>
            {gender     && <span style={{ background: "rgba(255,255,255,.18)", backdropFilter: "blur(8px)", color: "#fff", fontSize: ".74rem", padding: ".25rem .7rem", borderRadius: "999px", fontFamily: theme.fontFamily }}>{{ male:"♂ 男性", female:"♀ 女性", any:"☯ どちらでも" }[gender]}</span>}
            {relationship && <span style={{ background: "rgba(255,255,255,.18)", backdropFilter: "blur(8px)", color: "#fff", fontSize: ".74rem", padding: ".25rem .7rem", borderRadius: "999px", fontFamily: theme.fontFamily }}>{{ teacher:"📚 先生", senpai:"🌟 先輩", kohai:"🌸 後輩", other:"✨ その他" }[relationship]}</span>}
            {personality  && <span style={{ background: "rgba(255,255,255,.18)", backdropFilter: "blur(8px)", color: "#fff", fontSize: ".74rem", padding: ".25rem .7rem", borderRadius: "999px", fontFamily: theme.fontFamily }}>{{ gentle:"🌸 優しい", strict:"⚡ 厳しい", cool:"❄️ クール", energetic:"🔥 元気", tsundere:"💢 ツンデレ", other:"✨ その他" }[personality]}</span>}
          </div>
        )}
      </div>

      {/* ══ フォームエリア ════════════════════════════════════════════════════
          初見の3秒で離脱されないよう、ページ全体の背景・フォントは BASE で固定。
          「選択したら全部変わる」演出は下部の PreviewCard だけに閉じ込める。 ── */}
      <div style={{
        minHeight: "100vh", backgroundColor: BASE.bg,
        fontFamily: BASE.fontFamily, letterSpacing: BASE.letterSpacing, fontWeight: BASE.fontWeight,
        padding: "2.5rem 1rem 6rem",
        position: "relative", overflow: "hidden",
      }}>
        {/* ── Layer 0: 性別ティント（男=青, 女=ピンク）CSS transition で滑らかに変化 ── */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute", inset: 0,
            pointerEvents: "none", zIndex: 0,
            transition: reduceMotion ? "none" : "background-color 0.9s ease",
            backgroundColor:
              gender === "male"   ? "rgba(96,165,250,0.18)" :
              gender === "female" ? "rgba(244,114,182,0.18)" :
              "transparent",
          }}
        />

        {/* ── Layer 3: フォームコンテンツ ──────────────────────────────────── */}
        <div style={{ maxWidth: "540px", margin: "0 auto", position: "relative", zIndex: 3 }}>
          <div>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.3rem" }}>

              {/* S1: 基本情報 */}
              <Section title="👤 まず、あなたを教えてください" theme={theme}>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: ".82rem", color: theme.muted, marginBottom: ".4rem", fontFamily: theme.fontFamily, transition: `color ${T}` }}>
                      ニックネーム <span style={{ color: theme.accent }}>*</span>
                    </label>
                    <input className="yt-input" type="text" value={nickname}
                      onChange={e => setNickname(e.target.value)}
                      placeholder="例：えりか、Taro、みう" style={inputStyle} required />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: ".82rem", color: theme.muted, marginBottom: ".4rem", fontFamily: theme.fontFamily, transition: `color ${T}` }}>
                      メールアドレス <span style={{ color: theme.accent }}>*</span>
                    </label>
                    <input className="yt-input" type="email" value={email}
                      onChange={e => setEmail(e.target.value)}
                      onBlur={() => setEmailTouched(true)}
                      placeholder="example@email.com" style={{
                        ...inputStyle,
                        borderColor: emailError ? "#e11d48" : theme.border,
                      }} required />
                    {emailError
                      ? <p style={{ color: "#e11d48", fontSize: ".78rem", marginTop: ".3rem", fontFamily: theme.fontFamily }}>{emailError}</p>
                      : <p style={{ color: theme.muted, fontSize: ".76rem", marginTop: ".3rem", fontFamily: theme.fontFamily, opacity: .8 }}>アカウント情報の送付先として使用します（今後のやり取りはアプリ内チャットで行います）</p>
                    }
                  </div>
                </div>
              </Section>

              {/* S2: キャラクタータイプ選択 */}
              {s1Valid && (
                <Section
                  title="💛あなたの推し先生は？"
                  hint="後から変更できますので、気軽に選んでください"
                  theme={theme}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
                    {/* 推しキャラから選ぶ（プリセット） */}
                    {PRESET_CHARACTERS.map((p, i) => {
                      const selected = charChoice === "preset" && presetChar === p.id;
                      return (
                        <div
                          key={p.id}
                          className={`yt-card yt-pop d${i + 1}`}
                          onClick={() => { setCharChoice("preset"); handlePresetSelect(p.id); }}
                          style={{
                            borderRadius: theme.inputRadius, padding: "1rem 1.2rem",
                            borderColor: selected ? p.themeOverride.accent ?? theme.accent : theme.border,
                            backgroundColor: selected ? p.themeOverride.accentLight ?? theme.accentLight : theme.card,
                            position: "relative",
                            boxShadow: selected ? theme.cardShadow : "none",
                          }}
                        >
                          {selected && <span className="yt-check" style={{ position: "absolute", top: ".5rem", right: ".6rem", color: p.themeOverride.accent ?? theme.accent }}>✓</span>}
                          <p style={{ fontWeight: 800, fontSize: "1.05rem", color: selected ? (p.themeOverride.primary ?? theme.accent) : theme.text, margin: 0, fontFamily: theme.fontFamily, transition: `color ${T}` }}>
                            <span style={{
                              display: "inline-block", fontSize: ".7rem", fontWeight: 800, padding: ".1rem .5rem",
                              borderRadius: "99px", marginRight: ".4rem", verticalAlign: "middle",
                              background: p.themeOverride.accent ?? theme.accent, color: "#fff",
                            }}>
                              公式
                            </span>
                            {p.name}
                            <span style={{ fontWeight: 400, fontSize: ".75rem", color: theme.muted, marginLeft: ".5rem" }}>
                              （{p.reading}）
                            </span>
                          </p>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: ".35rem", margin: ".55rem 0" }}>
                            {[REL_LABEL[p.relationship], PERS_LABEL[p.personality]].map(b => (
                              <span key={b} style={{
                                fontSize: ".75rem", fontWeight: 600, padding: ".18rem .65rem",
                                borderRadius: "99px", background: theme.bg, color: theme.primary,
                                border: `1px solid ${theme.border}`, fontFamily: theme.fontFamily,
                              }}>
                                {b}
                              </span>
                            ))}
                          </div>
                          <p style={{ fontSize: ".8rem", color: theme.muted, margin: "0 0 .4rem", fontFamily: theme.fontFamily, transition: `color ${T}` }}>
                            趣味: {p.hobby}
                          </p>
                          <p style={{ fontSize: ".85rem", fontStyle: "italic", color: theme.text, margin: "0 0 .6rem", lineHeight: 1.6, fontFamily: theme.fontFamily, transition: `color ${T}` }}>
                            {p.quote}
                          </p>
                          <ul style={{
                            display: "flex", flexWrap: "wrap", gap: ".3rem .5rem", margin: "0 0 .6rem", padding: 0,
                            listStyle: "none",
                          }}>
                            {["キャラ作成無料", "即日スタート", "限定称号・壁紙あり", "隠しセリフ多数", "公式インスタあり"].map(b => (
                              <li key={b} style={{
                                fontSize: ".7rem", fontWeight: 700, padding: ".15rem .55rem",
                                borderRadius: "99px", background: theme.accentLight, color: theme.text,
                                border: `1px solid ${theme.border}`, fontFamily: theme.fontFamily,
                              }}>
                                ✅ {b}
                              </li>
                            ))}
                          </ul>
                          <a
                            href={p.instagram}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: ".35rem",
                              fontSize: ".78rem", fontWeight: 700,
                              color: p.themeOverride.accent ?? theme.accent,
                              textDecoration: "none", fontFamily: theme.fontFamily,
                              transition: `color ${T}`,
                            }}
                          >
                            📷 公式Instagramをフォローする
                          </a>
                        </div>
                      );
                    })}

                    {/* 質問で作る（旧カスタム）*/}
                    <div
                      className="yt-card yt-pop d3"
                      onClick={() => { setCharChoice("builder"); setPresetChar(null); setGender(null); setRelationship(null); setPersonality(null); setBuilderStep(1); }}
                      style={{
                        borderRadius: theme.inputRadius, padding: "1rem 1.2rem",
                        borderColor: charChoice === "builder" ? theme.accent : theme.border,
                        backgroundColor: charChoice === "builder" ? theme.accentLight : theme.card,
                        display: "flex", alignItems: "center", gap: "1rem", position: "relative",
                        boxShadow: charChoice === "builder" ? theme.cardShadow : "none",
                      }}
                    >
                      {charChoice === "builder" && <span className="yt-check" style={{ position: "absolute", top: ".5rem", right: ".6rem", color: theme.accent }}>✓</span>}
                      <span style={{ fontSize: "1.8rem", lineHeight: 1, flexShrink: 0 }}>🧭</span>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: ".95rem", color: charChoice === "builder" ? theme.accent : theme.text, margin: 0, fontFamily: theme.fontFamily, transition: `color ${T}` }}>
                          質問に答えて作る
                        </p>
                        <p style={{ fontSize: ".78rem", color: theme.muted, margin: ".2rem 0 0", lineHeight: 1.5, fontFamily: theme.fontFamily, transition: `color ${T}` }}>
                          性別・関係性・性格を3ステップで選ぶ。一番おすすめ！
                        </p>
                      </div>
                    </div>

                    {/* テキストで定義（旧自分で定義）*/}
                    <div
                      className="yt-card yt-pop d4"
                      onClick={() => { setCharChoice("custom"); setPresetChar(null); setGender(null); setRelationship(null); setPersonality(null); }}
                      style={{
                        borderRadius: theme.inputRadius, padding: "1rem 1.2rem",
                        borderColor: charChoice === "custom" ? theme.accent : theme.border,
                        backgroundColor: charChoice === "custom" ? theme.accentLight : theme.card,
                        display: "flex", alignItems: "center", gap: "1rem", position: "relative",
                        boxShadow: charChoice === "custom" ? theme.cardShadow : "none",
                      }}
                    >
                      {charChoice === "custom" && <span className="yt-check" style={{ position: "absolute", top: ".5rem", right: ".6rem", color: theme.accent }}>✓</span>}
                      <span style={{ fontSize: "1.8rem", lineHeight: 1, flexShrink: 0 }}>✍️</span>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: ".95rem", color: charChoice === "custom" ? theme.accent : theme.text, margin: 0, fontFamily: theme.fontFamily, transition: `color ${T}` }}>
                          テキストで自由に定義する
                        </p>
                        <p style={{ fontSize: ".78rem", color: theme.muted, margin: ".2rem 0 0", lineHeight: 1.5, fontFamily: theme.fontFamily, transition: `color ${T}` }}>
                          こだわりのキャラを自分で書いて伝える。上級者向け。
                        </p>
                      </div>
                    </div>

                  </div>
                </Section>
              )}

              {/* ──────────────────── キャラビルダー（ウィザード） ──────────────── */}
              {charChoice === "builder" && (
                <div className="yt-slide-up">
                  <BuilderProgress step={builderStep} theme={theme} />
                  <CompletedChips
                    gender={gender} relationship={relationship} step={builderStep} theme={theme}
                    onClickGender={goBackToGender} onClickRel={goBackToRelationship}
                  />

                  {/* Step 1: 性別 */}
                  {builderStep === 1 && (
                    <Section
                      title="① 性別を選んでください"
                      hint="ページの配色とキャラクターの口調が変わります"
                      theme={theme}
                    >
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: ".65rem" }}>
                        {([["male","♂","男性","青系カラー"],["female","♀","女性","紫・ピンク系"],["any","☯","どちらでも","グリーン系"]] as [Gender,string,string,string][]).map(([v,ic,lbl,sub],i) => (
                          <OCard key={v} delay={i+1} selected={gender===v} onClick={() => handleGenderSelect(v)}
                            icon={ic} title={lbl} sub={sub} theme={theme} />
                        ))}
                      </div>
                      <StepNav step={1} canNext={!!gender} theme={theme}
                        onBack={() => {}} onNext={() => setBuilderStep(2)} />
                    </Section>
                  )}

                  {/* Step 2: 関係性 */}
                  {builderStep === 2 && (
                    <Section
                      title="② どんな関係性のキャラ？"
                      hint="先輩＝キャラが年上 / 後輩＝キャラが年下。フォントも変わります。"
                      theme={theme}
                    >
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: ".65rem" }}>
                        {([["teacher","📚","先生","rc-teacher"],["senpai","🌟","先輩",""],["kohai","🌸","後輩","rc-kohai"],["other","✨","その他",""]] as [Relationship,string,string,string][]).map(([v,ic,lbl,tc],i) => (
                          <OCard key={v} delay={i+1} selected={relationship===v} onClick={() => handleRelSelect(v)}
                            icon={ic} title={lbl} sub={copy.relCards[v]} theme={theme} titleClass={tc} />
                        ))}
                      </div>
                      {relationship === "other" && (
                        <div className="yt-slide-up" style={{ marginTop: ".8rem" }}>
                          <label style={{ display: "block", fontSize: ".82rem", color: theme.muted, marginBottom: ".35rem", fontFamily: theme.fontFamily }}>
                            どんな関係性？ <span style={{ color: theme.accent }}>*</span>
                          </label>
                          <input className="yt-input" type="text" value={relOther}
                            onChange={e => setRelOther(e.target.value)}
                            placeholder="例：友達、ライバル、幼なじみ" style={inputStyle} />
                        </div>
                      )}
                      <StepNav step={2} canNext={!!relReady} theme={theme}
                        onBack={() => setBuilderStep(1)} onNext={() => setBuilderStep(3)} />
                    </Section>
                  )}

                  {/* Step 3: 性格 */}
                  {builderStep === 3 && (
                    <Section title={copy.persSectionTitle} hint={copy.persHint} theme={theme}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: ".75rem" }}>

                        {/* 優しい */}
                        <div className="yt-card pc-gentle yt-pop d1" onClick={() => handlePersSelect("gentle")}
                          style={{ borderColor: personality==="gentle"?"#f472b6":undefined, padding:"1.1rem", position:"relative" }}>
                          {personality==="gentle" && <span className="yt-check" style={{position:"absolute",top:".4rem",right:".5rem",color:"#f472b6"}}>✓</span>}
                          <div style={{ textAlign:"center" }}>
                            <span style={{fontSize:"1.8rem"}}>🌸</span>
                            <p style={{fontWeight:700,fontSize:".92rem",color:"#be185d",margin:".3rem 0 .4rem"}}>優しい</p>
                            <p style={{fontSize:".82rem",color:"#9d174d",fontStyle:"italic",lineHeight:1.55,margin:0}}>{copy.persQuotes.gentle}</p>
                          </div>
                        </div>

                        {/* 厳しい */}
                        <div className="yt-card pc-strict yt-pop d2" onClick={() => handlePersSelect("strict")}
                          style={{ borderColor: personality==="strict"?"#71717a":undefined, padding:"1.1rem", position:"relative" }}>
                          {personality==="strict" && <span className="yt-check" style={{position:"absolute",top:".4rem",right:".5rem",color:"#a1a1aa"}}>✓</span>}
                          <div style={{ textAlign:"center" }}>
                            <span style={{fontSize:"1.8rem"}}>⚡</span>
                            <p style={{fontWeight:800,fontSize:".92rem",color:"#e4e4e7",margin:".3rem 0 .4rem",letterSpacing:".06em"}}>厳しい</p>
                            <p style={{fontSize:".82rem",color:"#a1a1aa",lineHeight:1.55,margin:0}}>{copy.persQuotes.strict}</p>
                          </div>
                        </div>

                        {/* クール */}
                        <div className="yt-card pc-cool yt-pop d3" onClick={() => handlePersSelect("cool")}
                          style={{ borderColor: personality==="cool"?"#3fc5b8":undefined, padding:"1.1rem", position:"relative" }}>
                          {personality==="cool" && <span className="yt-check" style={{position:"absolute",top:".4rem",right:".5rem",color:"#3fc5b8"}}>✓</span>}
                          <div style={{ textAlign:"center" }}>
                            <span style={{fontSize:"1.8rem"}}>❄️</span>
                            <p style={{fontWeight:300,fontSize:".92rem",color:"#c8d0e0",margin:".3rem 0 .2rem",letterSpacing:".08em"}}>クール</p>
                            <p style={{fontSize:".68rem",color:"#4a5268",margin:"0 0 .35rem"}}>（ページが暗くなります）</p>
                            <p style={{fontSize:".82rem",color:"#7d8fa8",fontStyle:"italic",lineHeight:1.55,margin:0}}>{copy.persQuotes.cool}</p>
                          </div>
                        </div>

                        {/* 元気・明るい */}
                        <div className="yt-card pc-enrg yt-pop d4" onClick={() => handlePersSelect("energetic")}
                          style={{ borderColor: personality==="energetic"?"#f97316":undefined, padding:"1.1rem", position:"relative" }}>
                          {personality==="energetic" && <span className="yt-check" style={{position:"absolute",top:".4rem",right:".5rem",color:"#f97316"}}>✓</span>}
                          <div style={{ textAlign:"center" }}>
                            <span style={{fontSize:"1.8rem"}}>🔥</span>
                            <p style={{fontWeight:700,fontSize:".92rem",color:"#c2410c",margin:".3rem 0 .4rem"}}>元気・明るい</p>
                            <p style={{fontSize:".82rem",color:"#ea580c",fontWeight:600,lineHeight:1.55,margin:0}}>{copy.persQuotes.energetic}</p>
                          </div>
                        </div>

                        {/* ツンデレ */}
                        <div className="yt-card pc-tsun yt-pop d5" onClick={() => handlePersSelect("tsundere")}
                          style={{ borderColor: personality==="tsundere"?"#d97706":undefined, padding:"1.1rem", position:"relative" }}>
                          {personality==="tsundere" && <span className="yt-check" style={{position:"absolute",top:".4rem",right:".5rem",color:"#d97706"}}>✓</span>}
                          <div style={{ textAlign:"center" }}>
                            <span style={{fontSize:"1.8rem"}}>💢</span>
                            <p style={{fontWeight:700,fontSize:".92rem",color:"#92400e",margin:".3rem 0 .4rem"}}>ツンデレ</p>
                            <p style={{fontSize:".82rem",color:"#b45309",fontStyle:"italic",lineHeight:1.55,margin:0}}>{copy.persQuotes.tsundere}</p>
                          </div>
                        </div>

                        {/* その他 */}
                        <div className="yt-card pc-other yt-pop d6" onClick={() => handlePersSelect("other")}
                          style={{ borderColor:personality==="other"?theme.accent:theme.border, backgroundColor:personality==="other"?theme.accentLight:theme.card, borderRadius:theme.inputRadius, padding:"1.1rem", position:"relative" }}>
                          {personality==="other" && <span className="yt-check" style={{position:"absolute",top:".4rem",right:".5rem",color:theme.accent}}>✓</span>}
                          <div style={{ textAlign:"center" }}>
                            <span style={{fontSize:"1.8rem"}}>✨</span>
                            <p style={{fontWeight:700,fontSize:".92rem",color:theme.text,margin:".3rem 0 .4rem",fontFamily:theme.fontFamily}}>その他</p>
                            <p style={{fontSize:".82rem",color:theme.muted,lineHeight:1.55,margin:0,fontFamily:theme.fontFamily}}>自由に指定する</p>
                          </div>
                        </div>
                      </div>

                      {personality === "other" && (
                        <div className="yt-slide-up" style={{ marginTop: ".8rem" }}>
                          <label style={{ display: "block", fontSize: ".82rem", color: theme.muted, marginBottom: ".35rem", fontFamily: theme.fontFamily }}>
                            どんな性格？ <span style={{ color: theme.accent }}>*</span>
                          </label>
                          <input className="yt-input" type="text" value={persOther}
                            onChange={e => setPersOther(e.target.value)}
                            placeholder="例：ミステリアス、お兄ちゃん系" style={inputStyle} />
                        </div>
                      )}

                      <div style={{ display: "flex", justifyContent: "flex-start", marginTop: "1.2rem" }}>
                        <button type="button" className="yt-step-btn-back" onClick={() => setBuilderStep(2)}
                          style={{ borderColor: theme.border, color: theme.muted }}>
                          ← 戻る
                        </button>
                      </div>
                    </Section>
                  )}
                </div>
              )}

              {/* テキスト定義セクション */}
              {charChoice === "custom" && (
                <Section title="✍️ キャラクターを定義してください" theme={theme}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <div>
                      <label style={{ display: "block", fontSize: ".82rem", color: theme.muted, marginBottom: ".4rem", fontFamily: theme.fontFamily, transition: `color ${T}` }}>
                        参考にできる既存キャラクター（任意）
                      </label>
                      <input className="yt-input" type="text" value={refChar}
                        onChange={e => setRefChar(e.target.value)}
                        placeholder="例：呪術廻戦の五条悟、進撃の巨人のリヴァイ" style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: ".82rem", color: theme.muted, marginBottom: ".35rem", fontFamily: theme.fontFamily, transition: `color ${T}` }}>
                        {CUSTOM_CHAR_COPY.label} <span style={{ color: theme.accent }}>*</span>
                      </label>
                      <p style={{ fontSize: ".78rem", color: theme.muted, lineHeight: 1.75, margin: "0 0 .5rem", fontFamily: theme.fontFamily, transition: `color ${T}` }}>
                        {CUSTOM_CHAR_COPY.hint}
                      </p>
                      <textarea className="yt-input" value={charDesc} onChange={e => setCharDesc(e.target.value)}
                        placeholder={CUSTOM_CHAR_COPY.placeholder}
                        rows={6} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.8 }} required />
                      {charDesc.trim().length > 0 && charDesc.trim().length < 10 && (
                        <p style={{ color: "#e11d48", fontSize: ".78rem", marginTop: ".35rem", fontFamily: theme.fontFamily }}>
                          もう少し詳しく書いてもらえると助かります 🙏
                        </p>
                      )}
                    </div>
                  </div>
                </Section>
              )}

              {/* キャラクターサマリーカード＋プレビューカード（ビルダー完了時・プリセット選択時） */}
              {(charChoice === "builder" || charChoice === "preset") && gender && relReady && personality && (
                <>
                  <CharSummaryCard
                    gender={gender} relationship={relationship!} personality={personality}
                    persQuote={personality !== "other" ? copy.persQuotes[personality as Exclude<Personality,"other">] : persOther}
                    theme={theme}
                  />
                  {relationship !== "other" && personality !== "other" && (
                    <div ref={previewRef}>
                      <PreviewCard
                        gender={gender} relationship={relationship!} personality={personality}
                        persQuote={copy.persQuotes[personality as Exclude<Personality,"other">]}
                        theme={theme} reduceMotion={reduceMotion} isMobile={isMobile}
                        shimmerActive={shimmerActive}
                      />
                    </div>
                  )}
                </>
              )}

              {/* 送信ボタン */}
              {formReady && (
                <div className="yt-slide-up" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {error && (
                    <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: theme.inputRadius,
                      padding: ".75rem 1rem", color: "#b91c1c", fontSize: ".88rem", fontFamily: theme.fontFamily }}>
                      ⚠ {error}
                    </div>
                  )}
                  <button type="submit" disabled={submitting} className="yt-btn" style={{
                    background: `linear-gradient(135deg,${theme.gradA} 0%,${theme.gradB} 100%)`,
                    borderRadius: theme.inputRadius, fontFamily: theme.fontFamily,
                    letterSpacing: theme.letterSpacing, boxShadow: theme.cardShadow,
                  }}>
                    {submitting ? "送信中…" : theme.submitLabel}
                  </button>

                  {/* 送信後ステップ案内 */}
                  <NextStepsCard theme={theme} gender={gender} relationship={relationship} personality={personality} charChoice={charChoice} />
                </div>
              )}

            </form>
          </div>
        </div>
      </div>
    </>
  );
}
