import { v7 as uuidv7 } from "uuid";
import type { DB } from "./db.js";
import type { DomainEvent } from "./types.js";
import { logger } from "./logger.js";

/**
 * Transactional outbox v1 (ACPA Migration 1 — "financial events must never be
 * lost").
 *
 * Dual dispatch: publishers enqueue a row alongside the business operation,
 * then dispatch synchronously exactly as before (zero behavior change), then
 * mark the row delivered. If the process dies between the business write and
 * handler completion, the row stays 'pending' and the reconciler redelivers it
 * — but ONLY to registered durable consumers, which must be idempotent
 * (accounting postings use hasPosting(); billing's auto-bill checks for an
 * existing bill). Consumers that are not idempotent (e.g. inventory stock
 * increments) are never redelivered; their at-most-once semantics are
 * unchanged from the pre-outbox behavior.
 */

export interface OutboxRow {
  id: string;
  tenant_id: string | null;
  type: string;
  payload: string; // JSON DomainEvent payload
  aggregate_id: string | null;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  last_error: string | null;
  created_at: number;
  delivered_at: number | null;
}

type DurableHandler = (event: DomainEvent) => Promise<void>;

const MAX_ATTEMPTS = 10;

export class Outbox {
  private durable = new Map<string, DurableHandler[]>();

  constructor(private readonly db: DB) {}

  /** Register a durable (idempotent!) consumer for redelivery of missed events. */
  onDurable(type: string, handler: DurableHandler): void {
    const list = this.durable.get(type) ?? [];
    list.push(handler);
    this.durable.set(type, list);
  }

  /** True when at least one durable consumer wants this event type persisted. */
  hasDurable(type: string): boolean {
    return this.durable.has(type);
  }

  /** Persist the event before dispatch (called by EventBus.publish). v1 writes
   *  on its own connection immediately before dispatch; in-transaction enqueue
   *  lands with M1.3 when publishers move inside the business tx.
   *
   *  `dispatched = TRUE` is kept for schema compatibility: the retired DB-8
   *  relay claimed `dispatched = FALSE` rows and republished them to ALL bus
   *  subscribers (including non-idempotent ones). The relay was removed in
   *  M1.2; rows use the `status` state machine exclusively. */
  async enqueue(type: string, payload: unknown, aggregateId?: string): Promise<string> {
    const id = `obx_${uuidv7()}`;
    const tenantId = (payload as { tenantId?: string })?.tenantId ?? null;
    await this.db.query(
      `INSERT INTO event_outbox (id, tenant_id, type, payload, aggregate_id, occurred_at, dispatched, status, attempts, created_at)
       VALUES (@id, @t, @type, @payload, @agg, @occurredAt, TRUE, 'pending', 0, @now)`,
      {
        id, t: tenantId ?? "system", type,
        payload: JSON.stringify(payload ?? {}),
        agg: aggregateId ?? id, // column is NOT NULL in the legacy schema
        occurredAt: new Date().toISOString(),
        now: Date.now(),
      },
    );
    return id;
  }

  /** Synchronous dispatch completed — the normal path. */
  async markDelivered(id: string): Promise<void> {
    await this.db.query(
      "UPDATE event_outbox SET status = 'delivered', delivered_at = @now WHERE id = @id",
      { now: Date.now(), id },
    );
  }

  /**
   * Redeliver pending rows to durable consumers. Runs at boot (crash recovery)
   * and on an interval when background jobs are enabled. `olderThanMs` skips
   * rows an in-flight request may still be dispatching.
   */
  async reconcile(olderThanMs = 30_000, limit = 200): Promise<{ delivered: number; failed: number }> {
    const rows = await this.db.query<OutboxRow>(
      `SELECT * FROM event_outbox
        WHERE status = 'pending' AND created_at < @cutoff AND attempts < @max
        ORDER BY created_at ASC LIMIT @limit`,
      { cutoff: Date.now() - olderThanMs, max: MAX_ATTEMPTS, limit },
    );
    let delivered = 0;
    let failed = 0;
    for (const row of rows) {
      const handlers = this.durable.get(row.type) ?? [];
      const event: DomainEvent = {
        type: row.type,
        occurredAt: new Date(Number(row.created_at)).toISOString(),
        payload: JSON.parse(row.payload) as unknown,
        ...(row.aggregate_id ? { aggregateId: row.aggregate_id } : {}),
      };
      try {
        for (const h of handlers) await h(event);
        await this.markDelivered(row.id);
        delivered++;
      } catch (err) {
        failed++;
        const attempts = Number(row.attempts) + 1;
        const status = attempts >= MAX_ATTEMPTS ? "failed" : "pending";
        await this.db.query(
          "UPDATE event_outbox SET attempts = @a, last_error = @e, status = @s WHERE id = @id",
          { a: attempts, e: String((err as Error).message ?? err).slice(0, 500), s: status, id: row.id },
        );
        logger.warn({ err, outboxId: row.id, type: row.type, attempts }, "outbox redelivery failed");
      }
    }
    return { delivered, failed };
  }
}

// The event_outbox TABLE already exists (identity migrations, DB-8) but had no
// producers — dormant plumbing. Rather than a duplicate table, M1 extends it
// with a proper delivery state machine. The legacy `dispatched` flag survives
// only as a schema artifact: its relay job was removed in M1.2 (we still write
// TRUE for compatibility with rows older deploys might inspect).
export const CREATE_EVENT_OUTBOX = `
ALTER TABLE event_outbox ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE event_outbox ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE event_outbox ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE event_outbox ADD COLUMN IF NOT EXISTS delivered_at BIGINT;
CREATE INDEX IF NOT EXISTS event_outbox_status_pending_idx ON event_outbox (status, created_at) WHERE status = 'pending';
`;
