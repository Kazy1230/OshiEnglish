import { useEffect, useRef, useState } from "react";
import { api, API_BASE } from "@/lib/api";
import { toast } from "@/components/Toast";

export type ChatMessage = {
  id: number | string;
  role: "user" | "assistant";
  body: string;
  is_draft?: boolean;
  linked_content_url?: string | null;
};

type HistoryItem = {
  id: number;
  body: string;
  answer?: { body: string; is_draft?: boolean; linked_content_url?: string | null } | null;
};

/** コースチャット（履歴取得・挨拶・ストリーミング送信）の共通ロジック。フル画面版とコンパクト版の両方から使う。 */
export function useCourseChat(courseId: number, options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [upgradeCta, setUpgradeCta] = useState<{ topic: string } | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!enabled || initializedRef.current) return;
    initializedRef.current = true;
    let cancelled = false;
    async function init() {
      try {
        const history: HistoryItem[] = await api.getChatHistory(courseId);
        const converted: ChatMessage[] = [];
        for (const q of history) {
          converted.push({ id: `q-${q.id}`, role: "user", body: q.body });
          if (q.answer) {
            converted.push({
              id: `a-${q.id}`, role: "assistant", body: q.answer.body,
              is_draft: q.answer.is_draft,
              linked_content_url: q.answer.linked_content_url,
            });
          }
        }
        if (converted.length === 0) {
          try {
            const greet = await api.getGreeting(courseId);
            if (greet?.message) converted.push({ id: "greeting", role: "assistant", body: greet.message });
          } catch {
            // 挨拶取得失敗はサイレントスキップ
          }
        }
        if (!cancelled) setMessages(converted);
      } catch (err: unknown) {
        if (!cancelled) toast(err instanceof Error ? err.message : "読み込みに失敗しました", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [courseId, enabled]);

  async function sendMessage(body: string) {
    if (!body.trim() || sending) return;
    setSending(true);
    setStreamingText("");

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", body };
    setMessages(prev => [...prev, userMsg]);

    const token = typeof window !== "undefined" ? localStorage.getItem("yt_token") : null;
    try {
      const res = await fetch(`${API_BASE}/chat/${courseId}/ask-stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ body }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "エラーが発生しました" }));
        throw new Error(err.detail || `エラー (${res.status})`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;
          try {
            const evt = JSON.parse(payload);
            if (evt.error) throw new Error(evt.error);
            if (evt.delta) {
              accumulated += evt.delta;
              setStreamingText(accumulated);
            }
            if (evt.done) {
              setStreamingText(null);
              const assistantMsg: ChatMessage = {
                id: `a-${evt.question_id}`,
                role: "assistant",
                body: evt.answer || accumulated,
                is_draft: !!evt.pending_instructor,
              };
              setMessages(prev => [...prev, assistantMsg]);
              if (evt.frustration_signal) setUpgradeCta({ topic: evt.frustration_signal.topic });
            }
          } catch (parseErr: unknown) {
            if (parseErr instanceof Error && parseErr.message !== "Unexpected token") {
              throw parseErr;
            }
          }
        }
      }
    } catch (err: unknown) {
      setStreamingText(null);
      toast(err instanceof Error ? err.message : "送信に失敗しました", "error");
    } finally {
      setSending(false);
    }
  }

  return { messages, loading, sending, streamingText, upgradeCta, setUpgradeCta, sendMessage };
}
