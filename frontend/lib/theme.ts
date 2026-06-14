export type CharacterTheme = {
  id: number;
  name: string;
  description?: string;
  greeting?: string;
  greetings?: string[];
  image_url?: string;
  color_scheme?: {
    primary?: string;
    accent?: string;
    bg?: string;
    text?: string;
    card?: string;
    border?: string;
    example_bg?: string;
    tips_bg?: string;
  };
  font_style?: string; // rounded / serif / handwriting / monospace
  reward_progress_template?: string; // チャット画面のご褒美進捗メッセージ（{character}/{published}/{remaining}/{target} を置換）
  chat_footer_note?: string; // チャット画面の入力欄下の注意書き
  instagram_account?: string; // 公式Instagramアカウント名（@なし）
  is_preset?: boolean; // 公式キャラクターかどうか
};

/** ご褒美進捗メッセージのデフォルトテンプレート（{character}/{published}/{remaining}/{target} を置換して使用） */
export const DEFAULT_REWARD_PROGRESS_TEMPLATE =
  "公開記事 {published} 冊達成中。あと {remaining} 冊で「{character}」からご褒美が届くよ！";

/** チャット画面footerの注意書きデフォルト */
export const DEFAULT_CHAT_FOOTER_NOTE =
  "※ お返事には少々お時間がかかることがあります。気長に待っていてね。";

/** 親密度バーの説明文（ツールチップ表示用） */
export const INTIMACY_INFO_TEXT =
  "メッセージのやり取りやログインで上昇します。レベルが上がるとキャラの口調が変わり、限定称号・壁紙・隠しセリフが解放されます。";

/** 記事報酬バーの説明文（ツールチップ表示用） */
export const REWARD_INFO_TEXT =
  "記事を依頼するたびに進みます。一定数に達すると限定報酬が解放されます。";

/** テンプレート文字列内のプレースホルダーを実際の値に置換する */
export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => (key in values ? String(values[key]) : `{${key}}`));
}

/** メールアドレスの先頭1文字以外を伏せ字にする（例: t***@example.com） */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  return `${local.charAt(0)}${"*".repeat(Math.max(local.length - 1, 1))}${domain}`;
}

/** font_style → CSS font-family */
export function getFontFamily(font_style?: string): string {
  switch (font_style) {
    case "rounded":     return "'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', sans-serif";
    case "serif":       return "'Noto Serif JP', 'Yu Mincho', serif";
    case "handwriting": return "'Yomogi', 'Tsukushi A Round Gothic', cursive";
    case "monospace":   return "'Courier New', 'Osaka-Mono', monospace";
    default:            return "'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif";
  }
}

/** デフォルトテーマ（キャラクター未設定の場合） */
export const defaultTheme: CharacterTheme = {
  id: 0,
  name: "",
  color_scheme: {
    primary:    "#2e4057",
    accent:     "#048a81",
    bg:         "#f8f7f2",
    text:       "#333333",
    card:       "#ffffff",
    border:     "#e0ddd5",
    example_bg: "#f0f9ff",
    tips_bg:    "#f0fdf4",
  },
  font_style: "default",
};

/**
 * キャラクターの「一言」をランダム表示する際、できるだけ長く同じ文言が
 * 連続/再出現しないようにするための"重複回避シャッフルバッグ"。
 *
 * 仕組み: 候補のインデックスをシャッフルした「袋」をlocalStorageに保持し、
 * 1回表示するたびに袋から1つ取り出す。袋が空になったら、直前に表示した
 * ものが再び先頭に来ないように再シャッフルして補充する。
 * → 候補がN個あれば、最低でもN回は同じものが出ない（重複は袋を使い切った
 *   タイミングの境界でのみ起こり得るが、直前と同じにはならない）
 */
export function pickGreeting(theme?: CharacterTheme | null): string | undefined {
  if (typeof window === "undefined") return theme?.greetings?.[0] ?? theme?.greeting;

  const list = (theme?.greetings && theme.greetings.length > 0) ? theme.greetings
    : (theme?.greeting ? [theme.greeting] : []);
  if (list.length === 0) return undefined;
  if (list.length === 1) return list[0];

  const storageKey = `yt_greeting_bag_${theme?.id ?? 0}`;
  type BagState = { bag: number[]; last: number | null; size: number };

  function shuffledIndices(size: number, avoidFirst: number | null): number[] {
    const arr = Array.from({ length: size }, (_, i) => i);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    // 直前に表示したものが次の袋の先頭に来てしまう（＝連続表示）のを避ける
    if (avoidFirst !== null && arr.length > 1 && arr[0] === avoidFirst) {
      [arr[0], arr[1]] = [arr[1], arr[0]];
    }
    return arr;
  }

  let state: BagState | null = null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) state = JSON.parse(raw);
  } catch { state = null; }

  if (!state || state.size !== list.length || !Array.isArray(state.bag)) {
    state = { bag: shuffledIndices(list.length, null), last: null, size: list.length };
  }
  if (state.bag.length === 0) {
    state.bag = shuffledIndices(list.length, state.last);
  }

  const idx = state.bag.shift()!;
  state.last = idx;

  try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* ignore */ }

  return list[idx];
}

/* ---------------------------------------------------------------------
 * ダークモード対応：キャラクターごとのカラースキームを保ったまま、
 * 背景は暗く・文字は明るく見えるように色を変換するユーティリティ。
 * （単純な反転ではなく、HSLの明度だけを調整して色味＝そのキャラらしさを残す）
 * ------------------------------------------------------------------- */
function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "").match(/.{1,2}/g);
  if (!m || m.length < 3) return [0, 0, 0];
  return [parseInt(m[0], 16), parseInt(m[1], 16), parseInt(m[2], 16)];
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360; s /= 100; l /= 100;
  if (s === 0) { const v = l * 255; return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue2rgb(p, q, h + 1 / 3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1 / 3) * 255];
}
/** 色相・彩度はそのままに、明度だけ書き換える */
function withLightness(hex: string, targetL: number): string {
  try {
    const [r, g, b] = hexToRgb(hex);
    const [h, s] = rgbToHsl(r, g, b);
    const [nr, ng, nb] = hslToRgb(h, s, Math.max(0, Math.min(100, targetL)));
    return rgbToHex(nr, ng, nb);
  } catch { return hex; }
}
/** 明度を相対的に持ち上げる（最低値を保証） */
function ensureMinLightness(hex: string, minL: number): string {
  try {
    const [r, g, b] = hexToRgb(hex);
    const [h, s, l] = rgbToHsl(r, g, b);
    if (l >= minL) return hex;
    const [nr, ng, nb] = hslToRgb(h, s, minL);
    return rgbToHex(nr, ng, nb);
  } catch { return hex; }
}

export type ThemeMode = "light" | "dark";
type ResolvedScheme = Required<NonNullable<CharacterTheme["color_scheme"]>> & { fontFamily: string };

/** ダークモード用に配色を変換する（色相・彩度は維持し、明度だけ反転気味に調整） */
function toDarkScheme(light: ResolvedScheme): ResolvedScheme {
  return {
    ...light,
    // ブランドカラー（primary/accent）は暗い背景でも視認できるよう明るさを底上げ
    primary:    ensureMinLightness(light.primary, 58),
    accent:     ensureMinLightness(light.accent, 58),
    // 背景・カード・文字・枠線はキャラ固有色の色味を活かしつつ明度を反転
    bg:         withLightness(light.bg, 12),
    card:       withLightness(light.bg, 18),
    text:       withLightness(light.text, 90),
    border:     withLightness(light.border, 28),
    example_bg: withLightness(light.example_bg, 20),
    tips_bg:    withLightness(light.tips_bg, 20),
  };
}

/** color_scheme の欠損値をデフォルトで補完し、必要に応じてダークモード配色に変換する */
export function resolveTheme(theme?: CharacterTheme | null, mode: ThemeMode = "light"): ResolvedScheme {
  const cs = theme?.color_scheme ?? {};
  const def = defaultTheme.color_scheme!;
  const light: ResolvedScheme = {
    primary:    cs.primary    ?? def.primary!,
    accent:     cs.accent     ?? def.accent!,
    bg:         cs.bg         ?? def.bg!,
    text:       cs.text       ?? def.text!,
    card:       cs.card       ?? def.card!,
    border:     cs.border     ?? def.border!,
    example_bg: cs.example_bg ?? def.example_bg!,
    tips_bg:    cs.tips_bg    ?? def.tips_bg!,
    fontFamily: getFontFamily(theme?.font_style),
  };
  return mode === "dark" ? toDarkScheme(light) : light;
}
