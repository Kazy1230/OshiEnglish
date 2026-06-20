"use client";
import { useState } from "react";
import { API_BASE } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { toast } from "@/components/Toast";

const ERROR_MARKER = "[ERROR]";

interface StreamingTextProps {
  endpoint: string;
  payload: object;
  buttonLabel?: string;
  disabled?: boolean;
  onComplete?: (text: string, headers: Headers) => void;
}

/** AIストリーミング生成の結果をリアルタイムに表示するコンポーネント(詳細設計書 Section 5.3 準拠) */
export function StreamingText({ endpoint, payload, buttonLabel = "生成する", disabled = false, onComplete }: StreamingTextProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startStream() {
    setLoading(true);
    setError(null);
    setText("");
    try {
      const token = getToken();
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: "生成に失敗しました。もう一度試してください" }));
        throw new Error(err.detail || "生成に失敗しました。もう一度試してください");
      }
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          fullText += chunk;
          const markerIdx = fullText.indexOf(ERROR_MARKER);
          setText(markerIdx === -1 ? fullText : fullText.slice(0, markerIdx).trimEnd());
        }
      }
      setLoading(false);

      const markerIdx = fullText.indexOf(ERROR_MARKER);
      if (markerIdx !== -1) {
        const cleanText = fullText.slice(0, markerIdx).trimEnd();
        const errorMessage = fullText.slice(markerIdx + ERROR_MARKER.length).trim() || "生成に失敗しました。もう一度試してください";
        setText(cleanText);
        toast(errorMessage, "error");
        return;
      }
      onComplete?.(fullText, response.headers);
    } catch (err: unknown) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "通信エラーが発生しました。接続を確認してください");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button onClick={startStream} disabled={loading || disabled} className="btn-primary self-start disabled:opacity-50">
        {loading ? "生成中…" : buttonLabel}
      </button>
      {error && (
        <div className="flex items-center gap-2">
          <p className="text-sm" style={{ color: "#c0392b" }}>{error}</p>
          <button onClick={startStream} className="text-xs underline" style={{ color: "var(--muted)" }}>再試行</button>
        </div>
      )}
      {text && (
        <pre className="whitespace-pre-wrap text-sm p-3 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)", maxHeight: 400, overflowY: "auto" }}>
          {text}
        </pre>
      )}
    </div>
  );
}
