"use client";
import { useEffect, useState } from "react";

export type ToastType = "success" | "error" | "info";

export interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
}

let toastId = 0;
let addToastFn: ((msg: string, type: ToastType) => void) | null = null;

export function toast(message: string, type: ToastType = "info") {
  addToastFn?.(message, type);
}

export function ToastProvider() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    addToastFn = (message, type) => {
      const id = ++toastId;
      setToasts(prev => [...prev, { id, message, type }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
    };
    return () => { addToastFn = null; };
  }, []);

  const bg: Record<ToastType, string> = {
    success: "#e8fdf0",
    error: "#fce8e8",
    info: "#e8f4fd",
  };
  const border: Record<ToastType, string> = {
    success: "#16a34a",
    error: "#c0392b",
    info: "#0369a1",
  };
  const icon: Record<ToastType, string> = {
    success: "✅",
    error: "❌",
    info: "ℹ️",
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id}
          className="flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-fade-in pointer-events-auto"
          style={{ background: bg[t.type], border: `1px solid ${border[t.type]}`, color: border[t.type], minWidth: "220px" }}>
          <span>{icon[t.type]}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
