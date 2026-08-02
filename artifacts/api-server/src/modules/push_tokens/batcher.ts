import type { PushNotificationPayload } from "./service.js";

export interface OrderAlert {
  orderId: string;
  orderNumber: string;
  totalCents: number | null;
  receivedAt: number;
}

interface TenantWindow {
  timer: ReturnType<typeof setTimeout>;
  pending: OrderAlert[];
  windowStartedAt: number;
}

export type SendFn = (
  tenantId: string,
  notification: PushNotificationPayload,
) => Promise<void>;

/**
 * Per-tenant debounce/accumulator for order push notifications.
 *
 * Semantics:
 * - Every order (including the first) is held for a short batching window
 *   (default 10s) rather than delivered instantly. If the window closes
 *   with only one order accumulated — a quiet period — that order is
 *   delivered as a normal single-order notification.
 * - Orders arriving while the window is open fold into the same batch and
 *   re-arm the window (debounce), capped at maxWindowMs from the first
 *   order so a sustained rush can't defer the alert forever. When the
 *   window closes with 2+ orders, ONE grouped notification is sent —
 *   "3 New Orders · $142.50 total" — representing every order in the
 *   burst, first included.
 * - State is held in memory, keyed by tenant. In multi-instance
 *   deployments with Redis event fan-out, the caller must ensure only the
 *   instance that originated an order feeds it to the batcher (see the
 *   order.created handler), so each order is batched and delivered by
 *   exactly one instance.
 */
export class OrderNotificationBatcher {
  private readonly windows = new Map<string, TenantWindow>();

  constructor(
    private readonly send: SendFn,
    private readonly windowMs: number = readWindowMs(),
    private readonly maxWindowMs: number = readWindowMs() * 6,
  ) {}

  /** Handle one order.created event. */
  add(tenantId: string, alert: OrderAlert): void {
    const existing = this.windows.get(tenantId);

    if (!existing) {
      // Quiet period: open a window holding this order. If nothing else
      // arrives before it closes, the order is delivered as a single alert.
      this.openWindow(tenantId, [alert], Date.now());
      return;
    }

    existing.pending.push(alert);

    // Re-arm the timer (debounce), but never past the max window.
    const elapsed = Date.now() - existing.windowStartedAt;
    const remainingCap = this.maxWindowMs - elapsed;
    const delay = Math.max(0, Math.min(this.windowMs, remainingCap));
    clearTimeout(existing.timer);
    existing.timer = setTimeout(() => this.flush(tenantId), delay);
    if (typeof existing.timer.unref === "function") existing.timer.unref();
  }

  /** Immediately flush all pending batches (used on shutdown / tests). */
  flushAll(): void {
    for (const tenantId of [...this.windows.keys()]) this.flush(tenantId);
  }

  private openWindow(tenantId: string, pending: OrderAlert[], startedAt: number): void {
    const timer = setTimeout(() => this.flush(tenantId), this.windowMs);
    if (typeof timer.unref === "function") timer.unref();
    this.windows.set(tenantId, { timer, pending, windowStartedAt: startedAt });
  }

  private flush(tenantId: string): void {
    const win = this.windows.get(tenantId);
    if (!win) return;
    clearTimeout(win.timer);
    this.windows.delete(tenantId);

    if (win.pending.length === 0) return;
    if (win.pending.length === 1) {
      this.deliverSingle(tenantId, win.pending[0]!);
      return;
    }
    this.deliverBatch(tenantId, win.pending);
  }

  private deliverSingle(tenantId: string, alert: OrderAlert): void {
    const total = alert.totalCents !== null ? formatCents(alert.totalCents) : "";
    void this.send(tenantId, {
      title: "New Order",
      body: total
        ? `Order #${alert.orderNumber} · ${total}`
        : `Order #${alert.orderNumber} has been placed`,
      data: {
        screen: "orders",
        orderId: alert.orderId,
        orderNumber: alert.orderNumber,
      },
    }).catch(() => {
      // Push delivery is best-effort
    });
  }

  private deliverBatch(tenantId: string, alerts: OrderAlert[]): void {
    const count = alerts.length;
    const knownTotals = alerts.filter((a) => a.totalCents !== null);
    const sumCents = knownTotals.reduce((s, a) => s + (a.totalCents ?? 0), 0);
    const title =
      knownTotals.length > 0
        ? `${count} New Orders · ${formatCents(sumCents)} total`
        : `${count} New Orders`;
    const since = new Date(Math.min(...alerts.map((a) => a.receivedAt)));
    const numbers = alerts.map((a) => `#${a.orderNumber}`).join(", ");
    void this.send(tenantId, {
      title,
      body: `${count} new orders since ${formatTime(since)}: ${truncate(numbers, 120)}`,
      data: {
        screen: "orders",
        batch: true,
        count,
        orderIds: alerts.map((a) => a.orderId),
      },
    }).catch(() => {
      // Push delivery is best-effort
    });
  }
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTime(d: Date): string {
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function readWindowMs(): number {
  const raw = Number(process.env.PUSH_BATCH_WINDOW_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 10_000;
}
