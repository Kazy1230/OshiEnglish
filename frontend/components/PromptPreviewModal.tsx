"use client";
import { useState, useEffect } from "react";
import { toast } from "./Toast";

export function PromptPreviewModal({
  title,
  promptText,
  onClose,
}: {
  title: string;
  promptText: string;
  onClose: () => void;
}) {
  const [text, setText] = useState(promptText);

  useEffect(() => {
    setText(promptText);
  }, [promptText]);

  async function copyAndClose() {
    await navigator.clipboard.writeText(text);
    toast("プロンプトをコピーしました", "success");
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl flex flex-col gap-3 rounded-2xl p-5 shadow-2xl"
        style={{ background: "var(--card-bg, #fff)", maxHeight: "90vh" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 flex-shrink-0">
          <h3 className="font-bold text-sm" style={{ color: "var(--primary)" }}>
            📋 {title}
          </h3>
          <button
            onClick={onClose}
            className="text-lg leading-none hover:opacity-60 transition-opacity"
            style={{ color: "var(--muted)" }}
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          className="w-full rounded-lg p-3 text-xs outline-none resize-y"
          style={{
            fontFamily: "monospace",
            background: "var(--bg)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            minHeight: "300px",
            maxHeight: "60vh",
            overflowY: "auto",
          }}
        />
        <div className="flex items-center justify-between flex-shrink-0 gap-3">
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {text.length.toLocaleString()} 字
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost text-xs py-1.5 px-3"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={copyAndClose}
              className="btn-primary text-xs py-1.5 px-4"
            >
              📋 コピーしてとじる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
