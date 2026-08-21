"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useNotifications, type Notification } from "@/lib/useNotifications";

const LEVEL_STYLES: Record<string, string> = {
  info: "border-l-blue-400 bg-blue-50",
  success: "border-l-emerald-400 bg-emerald-50",
  warning: "border-l-amber-400 bg-amber-50",
};

const LEVEL_DOT: Record<string, string> = {
  info: "bg-blue-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
};

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

function NotifItem({ n, onDismiss }: { n: Notification; onDismiss: (id: string) => void }) {
  return (
    <div className={`relative border-l-2 px-3 py-2.5 ${LEVEL_STYLES[n.level] ?? LEVEL_STYLES.info} ${n.read ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {!n.read && <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${LEVEL_DOT[n.level] ?? LEVEL_DOT.info}`} />}
            <p className="text-[12px] font-semibold leading-tight" style={{ color: "var(--color-text-primary)" }}>{n.title}</p>
          </div>
          {n.body && <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{n.body}</p>}
          <p className="mt-1 text-[10px]" style={{ color: "var(--color-text-muted)" }}>{timeAgo(n.receivedAt)}</p>
        </div>
        <button
          onClick={() => onDismiss(n.id)}
          aria-label="Dismiss notification"
          className="mt-0.5 shrink-0 transition-colors hover:text-brand-500"
          style={{ color: "var(--color-text-muted)" }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 2l8 8M10 2l-8 8"/></svg>
        </button>
      </div>
    </div>
  );
}

export function NotificationBell() {
  const { notifications, unreadCount, markAllRead, dismiss, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const toggle = useCallback(() => {
    setOpen((v) => {
      if (!v) markAllRead();
      return !v;
    });
  }, [markAllRead]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label={`Notifications${unreadCount > 0 ? ` — ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        style={{ color: "var(--color-text-muted)" }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="region"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-xl border shadow-2xl"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: "var(--color-border)" }}>
            <span className="text-[12px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Notifications</span>
            {notifications.length > 0 && (
              <button onClick={clearAll} className="text-[10px] font-medium transition-colors hover:text-brand-600"
                style={{ color: "var(--color-text-muted)" }}>
                Clear all
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 divide-y overflow-y-auto" style={{ borderColor: "var(--color-border)" }}>
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-[11px]" style={{ color: "var(--color-text-muted)" }}>No notifications</p>
            ) : (
              notifications.map((n) => (
                <NotifItem key={n.id} n={n} onDismiss={dismiss} />
              ))
            )}
          </div>

          {/* Footer — this panel is an ephemeral, session-only stream (SSE, no
              persistence); the Notifications page is the backend-persisted
              inbox with channel preferences, alert rules, and digest
              scheduling, so it's linked here rather than duplicated. */}
          <div className="border-t border-slate-100 px-3 py-2">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-[11px] font-medium text-slate-500 hover:text-slate-700"
            >
              Manage notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
