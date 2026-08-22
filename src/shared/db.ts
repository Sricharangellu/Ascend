import pg from "pg";
import { currentTenantId } from "./tenant-context.js";
import { classifySupabaseHost } from "./connection-info.js";

const { Pool, types } = pg;

// node-postgres returns BIGINT (int8, OID 20) and NUMERIC (OID 1700) as strings
// to avoid precision loss. Every bigint in this schema (cents, ms timestamps,
// sync_queue ids, COUNT(*) results) is well within Number.MAX_SAFE_INTEGER, and
// the app models them as `number`, so parse them back to numbers globally.
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));

/** Parameters may be positional (?) via an array, or named (@key) via an object. */
export type Params = unknown[] | Record<string, unknown> | undefined;

/**
 * Minimal async database interface backing the modular monolith. Backed by
 * Postgres (node-postgres). SQL is written with SQLite-style `?` (positional)
 * or `@name` (named) placeholders and compiled to Postgres `$n` here, so the
 * service-layer SQL stays portable.
 */
export interface PoolStats {
  /** Total connections currently open (idle + active). */
  total: number;
  /** Connections available for immediate use. */
  idle: number;
  /** Requests queued waiting for a free connection. */
  waiting: number;
}

export interface DB {
  query<T = any>(sql: string, params?: Params): Promise<T[]>;
  one<T = any>(sql: string, params?: Params): Promise<T | undefined>;
  exec(sql: string): Promise<void>;
  tx<T>(fn: (db: DB) => Promise<T>): Promise<T>;
  /**
   * Returns a DB view where every query runs inside an explicit transaction
   * with `set_config('app.tenant_id', tenantId, true)` so Postgres RLS
   * policies can use `current_setting('app.tenant_id', true)` to enforce
   * tenant isolation at the database layer. Safe with connection pools:
   * `set_config(..., true)` is transaction-local and resets at COMMIT/ROLLBACK.
   */
  withTenant(tenantId: string): DB;
  /**
   * Returns a DB view that sets `app.request_id` on every transaction so
   * Postgres logs and pg_stat_activity can correlate slow queries to HTTP
   * requests. Composable with withTenant: db.withTenant(t).withRequestId(r).
   */
  withRequestId(requestId: string): DB;
  close(): Promise<void>;
  /**
   * Returns live connection pool statistics. Null when called on a
   * transaction-scoped DB (which shares the parent pool's connection).
   * Use in health checks to detect pool exhaustion.
   */
  poolStats(): PoolStats | null;
}

interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
}

/** Compile `?`/`@name` placeholders to Postgres `$n`, returning text + ordered values. */
export function compile(sql: string, params: Params): { text: string; values: unknown[] } {
  if (params === undefined) return { text: sql, values: [] };

  if (Array.isArray(params)) {
    let i = 0;
    const text = sql.replace(/\?/g, () => `$${++i}`);
    return { text, values: params };
  }

  const values: unknown[] = [];
  const slots = new Map<string, number>();
  const text = sql.replace(/@(\w+)/g, (_m, key: string) => {
    let slot = slots.get(key);
    if (slot === undefined) {
      values.push((params as Record<string, unknown>)[key]);
      slot = values.length;
      slots.set(key, slot);
    }
    return `$${slot}`;
  });
  return { text, values };
}

/**
 * Resolved per-STATEMENT timeout applied as `SET LOCAL statement_timeout` at
 * every BEGIN. Note the scope: Postgres applies `statement_timeout` to each
 * statement separately, so this is not a budget for the transaction as a whole
 * (verified against PG 16 — two 1.5s sleeps both survive a 2s setting).
 *
 * Exported so callers that must legitimately widen it for one statement can
 * restore *this* value afterwards rather than re-deriving it from the env and
 * drifting. `src/app.ts` does exactly that around the migration advisory lock,
 * where the wait is queuing time, not work, and must not be killed as if it
 * were a hung query.
 */
export function txTimeoutMs(): number {
  const raw = Number(process.env["PG_TX_TIMEOUT_MS"] ?? 30_000);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 30_000;
}

/**
 * Per-statement timeout applied to EVERY connection through the pool's startup
 * `options`, so it also covers queries that never enter an explicit transaction.
 * Before this existed, `db.query()` outside a transaction had no timeout at all:
 * one runaway query could pin a pooled connection indefinitely, and with
 * `PG_POOL_MAX` connections per instance that is how a single slow report takes
 * the whole instance down. Setting it in the startup packet costs zero round
 * trips, unlike a `SET` after connect.
 */
export function statementTimeoutMs(): number {
  const raw = Number(process.env["PG_STATEMENT_TIMEOUT_MS"] ?? txTimeoutMs());
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : txTimeoutMs();
}

/**
 * Kills sessions that hold an open transaction without doing work. A client
 * that dies mid-transaction otherwise leaves its locks and its snapshot in
 * place until TCP keepalive notices — which blocks VACUUM and, on a hot row,
 * blocks every other writer.
 */
export function idleTxTimeoutMs(): number {
  const raw = Number(process.env["PG_IDLE_TX_TIMEOUT_MS"] ?? 60_000);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 60_000;
}

/**
 * Quote a session-variable value as a SQL string literal, or return null when
 * it contains anything outside the id charset this codebase generates.
 *
 * Used only to fold `set_config` into the same round trip as `BEGIN`, which the
 * extended (parameterised) protocol cannot do because it allows one statement
 * per message. The allowlist is the point: anything unexpected returns null and
 * the caller falls back to the parameterised path, so this can never become an
 * injection point even if one of these ids one day comes from somewhere less
 * trusted.
 */
export function quoteSessionLiteral(value: string): string | null {
  if (value === "") return "''";
  if (!/^[A-Za-z0-9_:.@-]{1,128}$/.test(value)) return null;
  return `'${value}'`;
}

/**
 * Whether the single-statement fast path (session-level `app.tenant_id` /
 * `app.request_id`) is safe for this connection target.
 *
 * It relies on session state surviving between statements, which is true for a
 * direct connection and for a session-mode pooler, and NOT true for a
 * transaction-mode pooler (Supabase port 6543), where consecutive statements
 * can land on different server connections. There the fast path is disabled and
 * every tenant-scoped query goes back through an explicit transaction, which is
 * correct under any pooling mode. `PG_SESSION_CTX=off` forces that same
 * conservative path; `=on` forces the fast path for a pooler we cannot classify.
 */
export function sessionCtxEnabled(
  connectionString: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env["PG_SESSION_CTX"]?.trim().toLowerCase();
  if (raw && ["0", "false", "no", "off"].includes(raw)) return false;
  if (raw && ["1", "true", "yes", "on"].includes(raw)) return true;
  try {
    const url = new URL(connectionString);
    const port = url.port ? Number(url.port) : 5432;
    return classifySupabaseHost(url.hostname, port)?.mode !== "transaction";
  } catch {
    return true;
  }
}

interface DbInternals {
  isTx: boolean;
  pool?: pg.Pool;
  /** False when session-level context cannot be relied on (see above). */
  sessionCtx?: boolean;
  /** Set by withTenant()/withRequestId(); overrides the ambient tenant context. */
  view?: SessionCtx;
}

/**
 * Session variables this layer manages on a pooled connection. Both are read by
 * Postgres — `app.tenant_id` by the RLS policies in `db/rls/policies.sql`,
 * `app.request_id` by `log_line_prefix`/`pg_stat_activity` when correlating a
 * slow query back to the HTTP request that issued it.
 */
interface SessionCtx {
  tenant: string;
  requestId: string;
}

const EMPTY_CTX: SessionCtx = { tenant: "", requestId: "" };

function sameCtx(a: SessionCtx, b: SessionCtx): boolean {
  return a.tenant === b.tenant && a.requestId === b.requestId;
}

/**
 * Tracks the SESSION-level context currently applied to each pooled connection,
 * so a statement whose context already matches costs no extra round trip.
 *
 * Keyed on the pg client object, which the pool reuses for the life of the
 * physical connection: when a connection drops, pg constructs a new client and
 * the (now unreachable) entry is collected, so a reconnected — and therefore
 * reset — session can never be mistaken for a configured one.
 */
const sessionCtx = new WeakMap<object, SessionCtx>();

function makeDb(q: Queryable, opts: DbInternals): DB {
  const view: SessionCtx | null = opts.view ?? null;

  /**
   * The context a statement issued through this DB view must run under:
   * an explicit `withTenant()`/`withRequestId()` view wins, otherwise the
   * request-scoped AsyncLocalStorage tenant set by the gateway applies.
   */
  function wantedCtx(): SessionCtx {
    return {
      tenant: view?.tenant || currentTenantId() || "",
      requestId: view?.requestId || "",
    };
  }

  /**
   * Run one statement on a pooled connection whose SESSION context matches
   * `want`, so Postgres RLS sees the tenant even though the statement is not
   * wrapped in an explicit transaction.
   *
   * This is the hot path: every authenticated request goes through it. The
   * previous implementation wrapped each single statement in its own
   * transaction — BEGIN, set_config, the statement, COMMIT — which is four
   * network round trips and four times the connection hold time for one
   * statement that Postgres already executes atomically. Reusing the
   * connection's existing session values collapses that to one round trip
   * whenever the connection was last used by the same tenant, which under real
   * traffic is the overwhelming majority of checkouts.
   *
   * Clearing matters as much as the fast path: a statement with NO tenant
   * context (background jobs, migrations, /metrics) landing on a connection
   * still set to some tenant would be silently RLS-filtered to that tenant, so
   * an empty context resets the session values rather than inheriting them.
   */
  async function runOnPooled<T>(want: SessionCtx, sql: string, params?: Params): Promise<T[]> {
    const client = await opts.pool!.connect();
    try {
      if (!sameCtx(sessionCtx.get(client) ?? EMPTY_CTX, want)) {
        await client.query("SELECT set_config('app.tenant_id', $1, false), set_config('app.request_id', $2, false)", [
          want.tenant,
          want.requestId,
        ]);
        sessionCtx.set(client, want);
      }
      const { text, values } = compile(sql, params);
      const res = await client.query(text, values);
      return res.rows as T[];
    } finally {
      client.release();
    }
  }

  /** True when a single statement can go straight to a pooled connection. */
  const canFastPath = !opts.isTx && opts.pool !== undefined && opts.sessionCtx === true;

  const db: DB = {
    async query<T = any>(sql: string, params?: Params): Promise<T[]> {
      if (canFastPath) return runOnPooled<T>(wantedCtx(), sql, params);
      // Inside a transaction the context was already applied at BEGIN.
      // Otherwise (session context unavailable — e.g. a transaction-mode
      // pooler) fall back to an explicit transaction, which is correct under
      // any pooling mode, just slower.
      if (!opts.isTx && !sameCtx(wantedCtx(), EMPTY_CTX)) {
        return db.tx((tdb) => tdb.query<T>(sql, params));
      }
      const { text, values } = compile(sql, params);
      const res = await q.query(text, values);
      return res.rows as T[];
    },
    async one<T = any>(sql: string, params?: Params): Promise<T | undefined> {
      const rows = await db.query<T>(sql, params);
      return rows[0];
    },
    async exec(sql: string): Promise<void> {
      if (canFastPath) {
        await runOnPooled(wantedCtx(), sql);
        return;
      }
      if (!opts.isTx && !sameCtx(wantedCtx(), EMPTY_CTX)) {
        return db.tx((tdb) => tdb.exec(sql));
      }
      await q.query(sql);
    },
    async tx<T>(fn: (tdb: DB) => Promise<T>): Promise<T> {
      if (opts.isTx) return fn(db); // nested: outer BEGIN holds
      const client = await opts.pool!.connect();
      const tdb = makeDb(client, { isTx: true, view: opts.view });
      try {
        // The context applies to the whole transaction. It is set
        // transaction-locally, so it reverts at COMMIT/ROLLBACK and leaves the
        // tracked SESSION values intact — and it is applied whenever it DIFFERS
        // from those values, including when the wanted context is empty, which
        // is what stops a transaction with no tenant from inheriting the
        // previous checkout's tenant.
        const want = wantedCtx();
        const current = sessionCtx.get(client) ?? EMPTY_CTX;
        const needsCtx = !sameCtx(current, want);
        // `statement_timeout` rides in on the pool's startup options, so the
        // only thing that has to travel with BEGIN is this context — and when
        // both values are safe to inline, they fit in a single round trip. The
        // parameterised fallback keeps an unusual id correct, just slower.
        const tenantLit = needsCtx ? quoteSessionLiteral(want.tenant) : null;
        const requestLit = needsCtx ? quoteSessionLiteral(want.requestId) : null;
        const inline = tenantLit !== null && requestLit !== null;
        await client.query(
          needsCtx && inline
            ? `BEGIN; SELECT set_config('app.tenant_id', ${tenantLit}, true), set_config('app.request_id', ${requestLit}, true)`
            : "BEGIN",
        );
        if (needsCtx && !inline) {
          await client.query(
            "SELECT set_config('app.tenant_id', $1, true), set_config('app.request_id', $2, true)",
            [want.tenant, want.requestId],
          );
        }
        const out = await fn(tdb);
        await client.query("COMMIT");
        return out;
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      } finally {
        client.release();
      }
    },
    withTenant(tenantId: string): DB {
      return makeDb(q, { ...opts, view: { tenant: tenantId, requestId: view?.requestId ?? "" } });
    },
    withRequestId(requestId: string): DB {
      return makeDb(q, { ...opts, view: { tenant: view?.tenant ?? "", requestId } });
    },
    async close(): Promise<void> {
      // Scoped views share the parent's pool and must not close it.
      if (!opts.isTx && !opts.view && opts.pool) await opts.pool.end();
    },
    poolStats(): PoolStats | null {
      if (!opts.pool || opts.isTx) return null;
      return {
        total: opts.pool.totalCount,
        idle: opts.pool.idleCount,
        waiting: opts.pool.waitingCount,
      };
    },
  };
  return db;
}

export interface OpenDbOptions {
  connectionString?: string;
  schema?: string;
  max?: number;
}

/**
 * TLS settings for the Postgres pool (standing critical C-3).
 *
 * Certificates are VERIFIED by default whenever TLS is on. Managed Postgres
 * providers use publicly-signed chains, so this works with Node's bundled
 * CAs. For a private CA, supply the PEM via PG_CA_CERT (or base64 in
 * PG_CA_CERT_B64). PG_SSL_NO_VERIFY=1 restores the old unverified behavior
 * as an explicit, loudly-logged escape hatch — never silently.
 *
 * Exported for tests.
 */
export function sslConfig(env: NodeJS.ProcessEnv = process.env): { rejectUnauthorized: boolean; ca?: string } | undefined {
  const raw = env.PG_SSL?.trim().toLowerCase();
  const wantSsl =
    (raw && ["1", "true", "yes", "on", "require", "required"].includes(raw)) ||
    (!raw && env.NODE_ENV === "production");
  if (raw && ["0", "false", "no", "off", "disable", "disabled"].includes(raw)) return undefined;
  if (!wantSsl) return undefined;

  if (env.PG_SSL_NO_VERIFY === "1") {
    console.warn(
      "[db] PG_SSL_NO_VERIFY=1 — TLS certificate verification is DISABLED. " +
        "Connections are open to man-in-the-middle interception. Provide PG_CA_CERT instead.",
    );
    return { rejectUnauthorized: false };
  }

  const ca =
    env.PG_CA_CERT ??
    (env.PG_CA_CERT_B64 ? Buffer.from(env.PG_CA_CERT_B64, "base64").toString("utf8") : undefined);
  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
}

/**
 * Open a Postgres-backed DB. Sets each connection's search_path to the requested
 * schema (created on first use) so unqualified table names and IF NOT EXISTS
 * migrations resolve within it. A unique schema gives tests full isolation
 * against one shared Postgres instance.
 */
export function openDb(options: OpenDbOptions = {}): DB {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Provide a Postgres connection string via env or openDb({ connectionString }).",
    );
  }
  const schema = options.schema ?? "public";
  const pool = new Pool({
    connectionString,
    max: options.max ?? Number(process.env.PG_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    allowExitOnIdle: true,
    ssl: sslConfig(),
    // Startup parameters cost nothing at query time, unlike a `SET` after
    // connect. `statement_timeout` here is what bounds queries that never enter
    // an explicit transaction — before it, those had no timeout at all.
    options:
      `-c search_path=${schema}` +
      ` -c statement_timeout=${statementTimeoutMs()}` +
      ` -c idle_in_transaction_session_timeout=${idleTxTimeoutMs()}`,
  });
  return makeDb(pool, { isTx: false, pool, sessionCtx: sessionCtxEnabled(connectionString) });
}
