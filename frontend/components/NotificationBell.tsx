"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { toast } from "@/components/Toast";

type NotificationItem = {
  id: number;
  type: string;
  payload: { course_id?: number; title?: string; message?: string } | null;
  is_read: boolean;
  created_at: string;
};

function describe(n: NotificationItem): string {
  if (n.type === "new_course") return `新着コース: ${n.payload?.title || ""}`;
  if (n.payload?.message) return n.payload.message;
  return n.type;
}

export function NotificationBell() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  function load() {
    if (!getToken()) return;
    api.listNotifications().then(res => {
      setItems(res.notifications || []);
      setUnreadCount(res.unread_count || 0);
    }).catch(() => {});
  }

  useEffect(() => {
    setLoggedIn(!!getToken());
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleOpen() {
    setOpen(o => !o);
  }

  async function handleItemClick(n: NotificationItem) {
    try {
      if (!n.is_read) await api.markNotificationRead(n.id);
    } catch { /* 既読化失敗しても遷移は続ける */ }
    setOpen(false);
    load();
    if (n.payload?.course_id) router.push(`/courses/${n.payload.course_id}`);
  }

  async function handleMarkAllRead() {
    try {
      await api.markAllNotificationsRead();
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "操作に失敗しました", "error");
    }
  }

  if (!loggedIn) return null;

  return (
    <div ref={ref} className="relative">
      <button onClick={handleOpen} className="relative text-white/90 text-lg" aria-label="通知">
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 text-[10px] font-bold rounded-full px-1.5 py-0.5" style={{ background: "#e33", color: "white" }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 max-w-[85vw] rounded-lg shadow-lg z-50" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
            <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>通知</p>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="text-xs underline" style={{ color: "var(--muted)" }}>すべて既読</button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-xs p-3" style={{ color: "var(--muted)" }}>通知はありません</p>
            ) : (
              items.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className="w-full text-left px-3 py-2 text-xs flex flex-col gap-0.5"
                  style={{ background: n.is_read ? "transparent" : "var(--example-bg, #eef)", color: "var(--text)" }}
                >
                  <span>{describe(n)}</span>
                  <span style={{ color: "var(--muted)" }}>{new Date(n.created_at).toLocaleString("ja-JP")}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
