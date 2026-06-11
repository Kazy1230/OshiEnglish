"use client";
import { useEffect, useState } from "react";

const STORAGE_KEY = "yt_theme_mode";
export type ThemeMode = "light" | "dark";

/**
 * ライト/ダークモードの切り替えを管理するフック。
 * - 初回はlocalStorageの保存値 → OSの設定（prefers-color-scheme）の順に判定
 * - 切り替えた結果は <html> に "dark" クラスを付与/削除し、localStorageに保存する
 *   （globals.css 側で .dark 配下のCSS変数を上書きしてサイト全体のトーンを変える）
 */
export function useDarkMode(): [ThemeMode, () => void] {
  const [mode, setMode] = useState<ThemeMode>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let initial: ThemeMode = "light";
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark") {
        initial = saved;
      } else if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
        initial = "dark";
      }
    } catch { /* ignore */ }
    setMode(initial);
    setReady(true);
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", initial === "dark");
    }
  }, []);

  function toggle() {
    setMode(prev => {
      const next: ThemeMode = prev === "dark" ? "light" : "dark";
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", next === "dark");
      }
      return next;
    });
  }

  // 初期判定が終わるまでは光モード扱いにしてチラつきを抑える
  return [ready ? mode : "light", toggle];
}
