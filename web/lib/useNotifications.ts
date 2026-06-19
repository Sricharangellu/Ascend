"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type NotificationLevel = "info" | "warning" | "success";

export interface Notification {
  id: string;
  type: string;
  title: string;
  body?: string;
  level: NotificationLevel;
  receivedAt: number;
  read: boolean;
}

function buildNotification(type: string, data: Record<string, unknown>): Omit<Notification, "id" | "receivedAt" | "read"> | null {
  switch (type) {
    case "order_created":
      return {
        type,
        level: "info",
        title: `New order${data.orderNumber ? ` #${data.orderNumber}` : ""}`,
        body: data.totalCents != null ? `$${(Number(data.totalCents) / 100).toFixed(2)}` : undefined,
      };
    case "payment_captured":
      return {
        type,
        level: "success",
        title: "Payment captured",
        body: data.amountCents != null ? `$${(Number(data.amountCents) / 100).toFixed(2)}` : undefined,
      };
    case "low_stock":
      return {
        type,
        level: "warning",
        title: `Low stock: ${String(data.name ?? data.productId ?? "product")}`,
        body: `${data.currentStock} units (reorder at ${data.reorderPoint})`,
      };
    case "tier_upgraded":
      return {
        type,
        level: "success",
        title: "Loyalty tier upgrade",
        body: data.tierName ? `Customer reached ${data.tierName}` : undefined,
      };
    default:
      return null;
  }
}

let idCounter = 0;

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Only connect in a real browser environment (not during SSR)
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;

    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let active = true;

    function connect() {
      if (!active) return;
      const es = new EventSource("/api/v1/stream");
      esRef.current = es;

      const handleEvent = (e: MessageEvent, type: string) => {
        try {
          const data = JSON.parse(e.data) as Record<string, unknown>;
          const notif = buildNotification(type, data);
          if (!notif) return;
          setNotifications((prev) => [
            { ...notif, id: String(++idCounter), receivedAt: Date.now(), read: false },
            ...prev.slice(0, 49), // keep max 50
          ]);
        } catch {
          // malformed event — ignore
        }
      };

      for (const t of ["order_created", "payment_captured", "low_stock", "tier_upgraded"]) {
        es.addEventListener(t, (e) => handleEvent(e as MessageEvent, t));
      }

      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (active) {
          retryTimeout = setTimeout(connect, 5_000);
        }
      };
    }

    connect();

    return () => {
      active = false;
      if (retryTimeout) clearTimeout(retryTimeout);
      esRef.current?.close();
      esRef.current = null;
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return { notifications, unreadCount, markAllRead, dismiss, clearAll };
}
