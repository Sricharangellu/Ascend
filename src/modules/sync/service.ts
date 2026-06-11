import type { DB } from "../../shared/db.js";
import type { EventBus } from "../../shared/events.js";
import type { DomainEvent, Page } from "../../shared/types.js";

export type SyncStatus = "pending" | "synced" | "failed";

export interface SyncRow {
  id: number;
  event_type: string;
  payload: string; // JSON: { payload, meta }
  status: SyncStatus;
  attempts: number;
  created_at: number;
  last_attempted_at: number | null;
}

export interface SyncCounts {
  pending: number;
  synced: number;
  failed: number;
}

export interface StatusReport extends SyncCounts {
  online: boolean;
}

export interface PushResult {
  attempted: number;
  synced: number;
  failed: number;
}

export interface ListQueueQuery {
  status?: SyncStatus;
  limit?: number;
  offset?: number;
}

/**
 * An uploader simulates pushing one queued event to the cloud ledger. Returns
 * normally on success and throws on failure. The default always succeeds. Tests
 * inject a custom uploader via setUploader (or failNext) to exercise retry/backoff.
 */
export type Uploader = (row: SyncRow) => void | Promise<void>;

const MAX_ATTEMPTS = 10;
const BACKOFF_BASE_MS = 1000; // next-eligible = base * 2^attempts

/**
 * The offline-first engine. Implements the transactional outbox: every domain
 * event is written into `sync_queue` as `pending` (see enqueue, wired to
 * events.onAny). A push worker drains pending rows to the cloud ledger when
 * online; while offline the queue simply accumulates.
 */
export class SyncEngine {
  private online = true;
  private uploader: Uploader = () => {};
  private failCounter = 0;

  constructor(
    private readonly db: DB,
    private readonly events: EventBus,
  ) {}

  // --- Connectivity ---------------------------------------------------------

  isOnline(): boolean {
    return this.online;
  }

  setOnline(online: boolean): boolean {
    this.online = online;
    return this.online;
  }

  // --- Test hooks -----------------------------------------------------------

  setUploader(fn: Uploader): void {
    this.uploader = fn;
  }

  failNext(count = 1): void {
    this.failCounter = count;
  }

  // --- Outbox ---------------------------------------------------------------

  /**
   * Outbox writer. Subscribed to events.onAny, it records EVERY domain event
   * into `sync_queue` as `pending`, bundling payload + meta (aggregateId,
   * occurredAt) so the cloud can reconstruct the event.
   */
  async enqueue(event: DomainEvent): Promise<void> {
    const payload = JSON.stringify({
      payload: event.payload,
      meta: { aggregateId: event.aggregateId, occurredAt: event.occurredAt },
    });
    await this.db.query(
      `INSERT INTO sync_queue (event_type, payload, status, attempts, created_at, last_attempted_at)
       VALUES (?, ?, 'pending', 0, ?, NULL)`,
      [event.type, payload, Date.now()],
    );
  }

  // --- Push worker ----------------------------------------------------------

  /**
   * Drain pending rows to the cloud ledger. No-op while offline. Selects pending
   * rows with attempts < max, oldest first, batched to 50. Rows inside their
   * backoff window are skipped unless `forceAll`. `now` is injectable for tests.
   */
  async pushSync(opts: { forceAll?: boolean; now?: number } = {}): Promise<PushResult> {
    const result: PushResult = { attempted: 0, synced: 0, failed: 0 };
    if (!this.online) return result;

    const now = opts.now ?? Date.now();
    const forceAll = opts.forceAll ?? false;

    const rows = await this.db.query<SyncRow>(
      `SELECT * FROM sync_queue
       WHERE status = 'pending' AND attempts < ?
       ORDER BY id
       LIMIT 50`,
      [MAX_ATTEMPTS],
    );

    for (const row of rows) {
      if (!forceAll && !this.isEligible(row, now)) continue;

      result.attempted++;
      try {
        await this.attemptUpload(row);
        await this.markSynced(row.id, now);
        result.synced++;
      } catch {
        const attempts = row.attempts + 1;
        if (attempts >= MAX_ATTEMPTS) {
          await this.markFailed(row.id, attempts, now);
          result.failed++;
        } else {
          await this.markRetry(row.id, attempts, now);
        }
      }
    }

    return result;
  }

  private async attemptUpload(row: SyncRow): Promise<void> {
    if (this.failCounter > 0) {
      this.failCounter--;
      throw new Error("simulated upload failure");
    }
    await this.uploader(row);
  }

  /** A row is eligible once now >= last_attempted_at + base * 2^attempts. */
  private isEligible(row: SyncRow, now: number): boolean {
    if (row.attempts === 0 || row.last_attempted_at === null) return true;
    const nextEligible = row.last_attempted_at + BACKOFF_BASE_MS * 2 ** row.attempts;
    return now >= nextEligible;
  }

  private async markSynced(id: number, now: number): Promise<void> {
    await this.db.query(
      `UPDATE sync_queue SET status = 'synced', last_attempted_at = ? WHERE id = ?`,
      [now, id],
    );
  }

  private async markRetry(id: number, attempts: number, now: number): Promise<void> {
    await this.db.query(
      `UPDATE sync_queue SET attempts = ?, last_attempted_at = ? WHERE id = ?`,
      [attempts, now, id],
    );
  }

  private async markFailed(id: number, attempts: number, now: number): Promise<void> {
    await this.db.query(
      `UPDATE sync_queue SET status = 'failed', attempts = ?, last_attempted_at = ? WHERE id = ?`,
      [attempts, now, id],
    );
  }

  // --- Reads ----------------------------------------------------------------

  async counts(): Promise<SyncCounts> {
    const rows = await this.db.query<{ status: SyncStatus; n: number }>(
      `SELECT status, COUNT(*) AS n FROM sync_queue GROUP BY status`,
    );
    const counts: SyncCounts = { pending: 0, synced: 0, failed: 0 };
    for (const r of rows) {
      if (r.status === "pending" || r.status === "synced" || r.status === "failed") {
        counts[r.status] = r.n;
      }
    }
    return counts;
  }

  async status(): Promise<StatusReport> {
    return { online: this.online, ...(await this.counts()) };
  }

  async list(query: ListQueueQuery = {}): Promise<Page<SyncRow>> {
    const limit = clampLimit(query.limit);
    const offset = query.offset && query.offset > 0 ? Math.floor(query.offset) : 0;

    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (query.status) {
      where.push("status = @status");
      params.status = query.status;
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const totalRow = await this.db.one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM sync_queue ${whereSql}`,
      params,
    );
    const total = totalRow?.n ?? 0;

    const items = await this.db.query<SyncRow>(
      `SELECT * FROM sync_queue ${whereSql}
       ORDER BY id
       LIMIT @limit OFFSET @offset`,
      { ...params, limit, offset },
    );

    return { items, total, limit, offset };
  }
}

function clampLimit(limit?: number): number {
  if (!limit || limit <= 0) return 50;
  return Math.min(Math.floor(limit), 200);
}
