"use client";

/**
 * FE-R2: Kitchen Display System (KDS) — full-screen tablet view.
 * Module-gated by module:kitchen. Auto-refreshes every 10s.
 */

import { useEffect, useState } from "react";
import { apiGet, safeLoad } from "@/api-client/client";

interface KdsOrder {
  id: string;
  order_number: string;
  table_number?: string;
  status: string;
  created_at: number;
  items: Array<{ name: string; quantity: number; notes?: string; course?: string }>;
}

function elapsed(ms: number): string {
  const mins = Math.floor((Date.now() - ms) / 60_000);
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h${mins % 60}m`;
}

function urgency(ms: number): string {
  const mins = Math.floor((Date.now() - ms) / 60_000);
  if (mins >= 15) return "border-red-500 bg-red-950";
  if (mins >= 8)  return "border-amber-500 bg-amber-950";
  return "border-green-600 bg-[#0a1a0a]";
}

export default function KitchenDisplayPage() {
  const [orders, setOrders] = useState<KdsOrder[]>([]);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [bumping, setBumping] = useState<string | null>(null);

  const load = () => {
    safeLoad(
      apiGet<{ items: KdsOrder[] }>("/api/v1/orders?status=open&pageSize=50")
        .then((d) => setOrders(d.items ?? []))
        .then(() => setLastRefresh(Date.now())),
    );
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, []);

  const handleBump = async (orderId: string) => {
    setBumping(orderId);
    try {
      // Mark order as completed (bump from KDS)
      await fetch(`/api/v1/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
        credentials: "include",
      });
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } finally { setBumping(null); }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4 font-mono">
      {/* KDS Header */}
      <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold text-white">🍳 Kitchen Display</span>
          <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-white/50">
            {orders.length} active order{orders.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-white/40">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-green-500" /> &lt;8m
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" /> 8-15m
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-500" /> 15m+
          </span>
          <span>Refreshed {Math.floor((Date.now() - lastRefresh) / 1000)}s ago</span>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="flex h-64 items-center justify-center">
          <p className="text-white/30 text-lg">No active orders — kitchen is clear ✓</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {orders.map((order) => (
            <div
              key={order.id}
              className={`rounded-xl border-2 p-4 transition-all ${urgency(order.created_at)}`}
            >
              {/* Order header */}
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <p className="text-lg font-bold text-white">{order.order_number}</p>
                  {order.table_number && (
                    <p className="text-sm text-white/60">Table {order.table_number}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-white">{elapsed(order.created_at)}</p>
                  <p className="text-[10px] uppercase tracking-widest text-white/40">elapsed</p>
                </div>
              </div>

              {/* Items */}
              <ul className="mb-4 space-y-1.5">
                {order.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white/20 text-xs font-bold text-white">
                      {item.quantity}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-white">{item.name}</p>
                      {item.notes && (
                        <p className="text-[11px] text-amber-300">⚠ {item.notes}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {/* Bump button */}
              <button
                type="button"
                disabled={bumping === order.id}
                onClick={() => handleBump(order.id)}
                className="w-full rounded-lg bg-white/10 py-2.5 text-sm font-bold text-white transition-colors hover:bg-white/20 disabled:opacity-50"
              >
                {bumping === order.id ? "Bumping…" : "✓ BUMP"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
