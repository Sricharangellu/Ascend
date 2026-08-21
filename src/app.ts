import express, { Router, type Express } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import helmet from "helmet";
import { openDb, txTimeoutMs, type DB } from "./shared/db.js";
import { openRedis } from "./shared/redis.js";
import { EventBus } from "./shared/events.js";
import { Outbox } from "./shared/outbox.js";
import { logger } from "./shared/logger.js";
import { buildInfo } from "./shared/version.js";
import { modules } from "./modules/index.js";
import { parseCapabilitiesImpactQuery, SettingsService } from "./modules/settings/service.js";
import { identityModule } from "./identity/index.js";
import { SsoService } from "./modules/sso/service.js";
import { registerPublicRoutes as registerSsoPublicRoutes } from "./modules/sso/routes.js";
import {
  requestIdMiddleware,
  rateLimitMiddleware,
  tenantRateLimitMiddleware,
  makeTenantTierResolver,
  makeAuthMiddleware,
  tenantResolver,
  metricsMiddleware,
  accessLogMiddleware,
  renderMetrics,
  requireRole,
  readinessVerdict,
} from "./gateway/index.js";
import type { RuntimeGauges } from "./gateway/metrics.js";
import { handler, errorMiddleware } from "./shared/http.js";
import { bootstrapOrchestration, ORCHESTRATION_MIGRATIONS } from "./orchestration/index.js";
import { SseBroker } from "./shared/sse.js";
import type { AuthPayload } from "./gateway/auth.js";

export interface App {
  express: Express;
  db: DB;
  events: EventBus;
  /** Transactional outbox (ACPA M1) — exposed for crash-recovery tests. */
  outbox: Outbox;
  /** Call on graceful shutdown to disconnect the Redis event-bus subscriber. */
  cleanup: () => Promise<void>;
}

export interface BuildAppOptions {
  connectionString?: string;
  schema?: string;
}

/**
 * Constant-time comparison for infrastructure credentials (`/metrics` token,
 * `/jobs/tick` scheduler secrets). A plain `!==` leaks the length of the
 * shared prefix through response timing, and both of these endpoints are
 * unauthenticated-by-position — they are reachable without a session, so the
 * only thing standing between an attacker and Prometheus internals or the job
 * runtime is the secret itself.
 *
 * The digests are hashed to a fixed width first so `timingSafeEqual`, which
 * throws on length mismatch, cannot be turned into a length oracle either.
 */
function secretsMatch(provided: string | undefined, expected: string): boolean {
  if (provided === undefined) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Read the live pool / job-queue / outbox depths for GET /metrics.
 *
 * Fail-soft by contract: a scrape must never 500, and it must never be the
 * thing that takes the service down under load. Every read is individually
 * wrapped, so a missing table (a fresh schema mid-migration), a permissions
 * problem, or a slow query degrades that one gauge to "absent" — which
 * Prometheus reads as no sample, not as a healthy zero — while the rest of the
 * payload still renders.
 *
 * Both queries are index-backed (`job_queue_ready_idx`,
 * `event_outbox_pending_idx`) and unauthenticated, so they run with no
 * app.tenant_id set and therefore count across all tenants. That is what an
 * operator gauge should report; per-tenant queue depth belongs on the
 * owner-only /api/v1/jobs endpoint, which already exists.
 */
async function collectRuntimeGauges(db: DB): Promise<RuntimeGauges> {
  const gauges: RuntimeGauges = {
    pool: db.poolStats(),
    poolMax: Number(process.env["PG_POOL_MAX"] ?? 10),
    buildSha: buildInfo().sha,
  };
  const now = Date.now();

  try {
    const rows = await db.query<{ status: string; n: number }>(
      "SELECT status, COUNT(*)::int AS n FROM job_queue GROUP BY status",
    );
    const byStatus: Record<string, number> = { pending: 0, running: 0, completed: 0, failed: 0 };
    for (const r of rows) byStatus[r.status] = Number(r.n);
    gauges.jobsByStatus = byStatus;

    const oldest = await db.one<{ run_at: number | null }>(
      "SELECT MIN(run_at) AS run_at FROM job_queue WHERE status = 'pending' AND run_at <= @now",
      { now },
    );
    if (oldest?.run_at != null) gauges.oldestDueJobAgeMs = Math.max(0, now - Number(oldest.run_at));
    else gauges.oldestDueJobAgeMs = 0;
  } catch (err) {
    logger.debug({ err }, "metrics: job_queue gauges unavailable");
  }

  try {
    const row = await db.one<{ n: number; oldest: number | null }>(
      "SELECT COUNT(*)::int AS n, MIN(created_at) AS oldest FROM event_outbox WHERE dispatched = FALSE",
    );
    if (row) {
      gauges.outboxPending = Number(row.n);
      gauges.outboxOldestPendingAgeMs = row.oldest == null ? 0 : Math.max(0, now - Number(row.oldest));
    }
  } catch (err) {
    logger.debug({ err }, "metrics: event_outbox gauges unavailable");
  }

  return gauges;
}

/**
 * Assemble the modular monolith: open the (Postgres) DB, run every module's
 * migrations, then register each module's routes under /api/<name>.
 * Wave 0: gateway middleware + identity module + health probes + feature flags.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<App> {
  // Fail fast in production if required environment variables are absent.
  if (process.env["NODE_ENV"] === "production") {
    const REQUIRED_VARS = [
      ["JWT_SECRET", "JWT signing key — every authenticated request will fail without it"],
      ["DATABASE_URL", "Postgres connection string — the server cannot start without a database"],
    ];
    const missing = REQUIRED_VARS.filter(([name]) => !process.env[name]);
    if (missing.length > 0) {
      const lines = missing.map(([name, purpose]) => `  • ${name} — ${purpose}`).join("\n");
      throw new Error(`FATAL: Missing required environment variables:\n${lines}\n\nSet them before starting the server.`);
    }

    const WARNED_VARS: [string, string][] = [
      ["APP_URL", "public URL of this service — email reset links will fall back to ascendhq-api.vercel.app"],
      ["SENDGRID_API_KEY", "password reset and transactional emails will silently fail"],
      ["STRIPE_SECRET_KEY", "card payments will return 503 — configure Stripe or disable card tender"],
      ["REDIS_URL", "rate limiting uses in-memory state and will NOT be shared across instances — all replicas will have separate limits"],
      ["METRICS_TOKEN", "Prometheus metrics scraping will be disabled until a bearer token is configured"],
      ["CRON_SECRET", "the /jobs/tick cron endpoint will return 503 — background jobs will NOT run on serverless deploys"],
      ["WEBHOOK_SECRET_KEY", "webhook secret encryption is unconfigured — creating/rotating a webhook subscription will fail closed with 503 until this is set"],
    ];
    for (const [name, reason] of WARNED_VARS) {
      if (!process.env[name]) {
        logger.warn({ envVar: name }, `${name} is not set — ${reason}`);
      }
    }
  }

  const schema = options.schema ?? "public";
  const db = openDb({ connectionString: options.connectionString, schema });
  const events = new EventBus();
  // ACPA M1: transactional outbox — financially-critical events are persisted
  // before dispatch and redelivered to idempotent durable consumers on crash.
  const outbox = new Outbox(db);
  events.setOutbox(outbox);
  const redis = openRedis();
  const app = express();

  // Wire Redis Pub/Sub fan-out so events cross instance boundaries.
  // When REDIS_URL is set, every publish() also broadcasts to "finder:events"
  // channel; other instances receive and re-dispatch to their local subscribers.
  // Without Redis (dev/test), the bus stays in-process — no config needed.
  let cleanupEventBridge: () => Promise<void> = async () => {};
  if (redis) {
    cleanupEventBridge = await events.useRedis(redis);
    logger.info("event bus Redis fan-out enabled");
  }

  // ── Stripe webhook — must be registered with raw body parser BEFORE express.json()
  // so we can verify the Stripe-Signature header against the raw payload bytes.
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"];
    if (!webhookSecret) {
      logger.warn("STRIPE_WEBHOOK_SECRET not set — webhook endpoint disabled");
      res.status(503).end();
      return;
    }
    if (!sig) { res.status(400).end(); return; }

    let event: import("stripe").Stripe.Event;
    try {
      const { getStripe } = await import("./modules/payments/stripe.js");
      event = getStripe().webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
    } catch (err) {
      logger.warn({ err }, "Stripe webhook signature verification failed");
      res.status(400).end();
      return;
    }

    logger.info({ type: event.type, id: event.id }, "stripe webhook received");

    // Stripe requires a 200 response quickly — fire-and-forget internal event.
    void events.publish(`stripe.${event.type}`, event.data.object).catch((err) => {
      logger.error({ err, eventType: event.type }, "stripe webhook event handler failed");
    });

    res.status(200).json({ received: true });
  });

  app.use(express.json());
  app.use(helmet({
    contentSecurityPolicy: false, // disabled — API-only server, no HTML served
    crossOriginEmbedderPolicy: false,
  }));
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  // ── CORS ────────────────────────────────────────────────────────────────────
  // Restrict cross-origin requests to known frontend origins. In development
  // all origins are permitted. In production the allowlist is read from the
  // ALLOWED_ORIGINS env var (comma-separated) with a safe default.
  const CORS_METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
  const CORS_HEADERS = "Authorization,Content-Type,Accept,X-Request-Id";
  const rawOrigins = process.env["ALLOWED_ORIGINS"] ?? "";
  const allowedOrigins: Set<string> =
    rawOrigins.trim()
      ? new Set(rawOrigins.split(",").map((o) => o.trim()).filter(Boolean))
      : new Set([
        // Rebrand Phase 3 (additive, not a cutover — see WORK/FUNCTIONAL_REBRAND_PLAN.md):
        // both old and new frontend origins must accept CORS during the transition,
        // since either could be the one the browser is actually loaded from.
        "https://finder-pos.vercel.app",
        "https://finder-pos-web.vercel.app",
        "https://finder-pos-frontend.vercel.app",
        "https://ascend-pos-frontend.vercel.app",
        "https://ascendhq-app.vercel.app",
        // The live production frontend (Vercel project `ascend_hq_web`), confirmed
        // by Sri 2026-08-07. The `ascendhq-app` host above it is dead
        // (DEPLOYMENT_NOT_FOUND) but is kept per the additive policy in this block.
        "https://ascendhqweb.vercel.app",
      ]);

  app.use((req, res, next) => {
    const origin = req.headers.origin ?? "";
    const isDev = process.env["NODE_ENV"] === "development";
    const allowed = isDev || allowedOrigins.has(origin);

    if (allowed && origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", CORS_METHODS);
    res.setHeader("Access-Control-Allow-Headers", CORS_HEADERS);
    res.setHeader("Access-Control-Max-Age", "86400");

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  await db.exec(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);

  // Schema migration tracker — prevents re-running migrations on every cold start.
  // Created outside the advisory lock because IF NOT EXISTS is idempotent and
  // Postgres serializes concurrent DDL internally.
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    hash   TEXT PRIMARY KEY,
    name   TEXT NOT NULL,
    ran_at BIGINT NOT NULL
  )`);

  // Run a migration only if its content hash hasn't been recorded yet.
  // Accepts a transaction DB so callers can batch migrations under one lock.
  async function runIfNew(sql: string, name: string, tdb: DB): Promise<void> {
    const hash = createHash("sha256").update(sql.trim()).digest("hex").slice(0, 24);
    const existing = await tdb.one<{ hash: string }>("SELECT hash FROM schema_migrations WHERE hash = @hash", { hash });
    if (existing) return;
    await tdb.exec(sql);
    await tdb.query("INSERT INTO schema_migrations (hash, name, ran_at) VALUES (@hash, @name, @now)", { hash, name, now: Date.now() });
  }

  // Acquire a transaction-level advisory lock before running any migrations.
  // The lock is held for the duration of the transaction, so concurrent
  // instances wait here and then skip all migrations (hash-checked above).
  // Prevents simultaneous ALTER TABLE races.
  //
  // The wait gets its own, much larger statement timeout. `db.tx()` opens every
  // transaction with `SET LOCAL statement_timeout` (30s by default), and the
  // lock wait is itself a single statement — so queuing behind another instance
  // was abortable with SQLSTATE 57014, "canceling statement due to statement
  // timeout". That surfaced as a query timeout in whichever test was unlucky,
  // rather than as the contention it actually was. Widening the timeout for
  // just this statement separates "waiting for a peer" from "this query hung",
  // which are the same signal to Postgres but very different to an operator.
  //
  // It is not hypothetical: CI run 31138020800 attempt 1 failed 893/894, the
  // loser being settings.test.ts "get and update feature flags" at exactly
  // 30014ms with code 57014, while the Postgres service container was
  // checkpointing heavily. Attempt 2 on a healthy runner passed 894/894. The
  // backend suite builds a fresh schema at 123 call sites across 86 files, and
  // every one of them serializes on this single global lock.
  //
  // Verified against PostgreSQL 16 rather than assumed:
  //   - statement_timeout DOES abort a blocking pg_advisory_xact_lock wait
  //     (2s timeout → "canceling statement due to statement timeout" at 2093ms,
  //     SQLSTATE 57014);
  //   - statement_timeout is per-STATEMENT, not per-transaction, so the
  //     migrations themselves were never starved of budget — only the wait was;
  //   - a later `SET LOCAL statement_timeout` overrides an earlier one, so the
  //     normal budget can be restored for the migrations that follow.
  //
  // A bounded *blocking* wait is used rather than polling pg_try_advisory_xact_lock:
  // Postgres wakes a blocked waiter the instant the lock frees (measured at 4ms),
  // whereas a poll loop adds up to its own interval of latency to every one of
  // the hundreds of acquisitions a full test run makes.
  const MIGRATION_LOCK_KEY = 7381920; // stable magic int for finder migrations
  const rawLockWait = Number(process.env["PG_MIGRATION_LOCK_WAIT_MS"] ?? 300_000);
  const lockWaitMs = Number.isFinite(rawLockWait) && rawLockWait > 0 ? Math.floor(rawLockWait) : 300_000;

  await db.tx(async (tdb) => {
    const startedAt = Date.now();
    try {
      await tdb.exec(`SET LOCAL statement_timeout = ${lockWaitMs}`);
      await tdb.exec(`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`);
    } catch (err) {
      // 57014 = query_canceled. Here it can only mean the wait hit lockWaitMs,
      // so translate it into the cause rather than letting a boot blocked behind
      // a peer report itself as an unrelated slow query.
      if ((err as { code?: string }).code === "57014") {
        throw new Error(
          `migration lock ${MIGRATION_LOCK_KEY} not acquired after ${Date.now() - startedAt}ms — ` +
          `another instance is holding it. Raise PG_MIGRATION_LOCK_WAIT_MS (currently ${lockWaitMs}) ` +
          `if this is expected contention, or check for a stuck migration transaction.`,
        );
      }
      throw err;
    }
    // Restore the normal per-statement budget for the migrations themselves, so
    // the widened timeout covers only the queuing and never the DDL.
    await tdb.exec(`SET LOCAL statement_timeout = ${txTimeoutMs()}`);
    logger.info({ waitedMs: Date.now() - startedAt }, "migration lock acquired");

    for (const sql of identityModule.migrations) await runIfNew(sql, `identity`, tdb);
    for (const mod of modules) {
      for (const [i, sql] of mod.migrations.entries()) {
        await runIfNew(sql, `${mod.name}[${i}]`, tdb);
      }
    }
    for (const [i, sql] of ORCHESTRATION_MIGRATIONS.entries()) {
      await runIfNew(sql, `orchestration[${i}]`, tdb);
    }

    logger.info("migrations complete");
  });

  // ── Global gateway middleware (applied before all /api routes)
  app.use(requestIdMiddleware);
  // PROD-10: scope a per-request DB view that sets app.request_id on every
  // transaction so Postgres logs can correlate slow queries to HTTP requests.
  app.use((req, res, next) => {
    const requestId = (res.locals["requestId"] as string | undefined) ?? "";
    if (requestId) res.locals["db"] = db.withRequestId(requestId);
    next();
  });
  app.use(metricsMiddleware);
  // One structured line per completed request. Mounted BEFORE the rate limiter
  // on purpose: a 429 is exactly the response that needs to be visible, and it
  // is the one an earlier incident investigation could not see at all (see
  // gateway/accessLog.ts). Logging happens in a `finish` hook, so a request
  // rejected downstream is still logged, with the auth context resolved by then.
  app.use(accessLogMiddleware);
  // Per-IP limiter in front of everything. Env-overridable because the right
  // value depends on deployment topology, not on this code: behind a NAT, a
  // corporate proxy or a misconfigured TRUST_PROXY_DEPTH, an entire customer
  // site arrives as one IP and the default would throttle the whole site to
  // 40 req/s. Defaults below are the previous hard-coded values.
  app.use(
    rateLimitMiddleware({
      capacity: Number(process.env["GLOBAL_RATE_LIMIT_CAPACITY"] ?? 120),
      refillRate: Number(process.env["GLOBAL_RATE_LIMIT_REFILL"] ?? 40),
      redis,
    }),
  );

  // ── Liveness + readiness probes (no auth — infrastructure-level)
  app.get("/healthz", (_req, res) => {
    const { sha, builtAt } = buildInfo();
    res.json({ status: "ok", ts: Date.now(), version: sha, builtAt });
  });

  // ── Prometheus metrics — bearer token required in production. In development
  // and tests, an unset METRICS_TOKEN keeps local smoke checks simple.
  app.get("/metrics", async (req, res) => {
    const expected = process.env["METRICS_TOKEN"];
    if (!expected && process.env["NODE_ENV"] === "production") {
      res.status(503).type("text/plain").send("metrics_unconfigured\n");
      return;
    }
    if (expected) {
      const provided = req.headers.authorization?.replace(/^Bearer\s+/i, "");
      if (!secretsMatch(provided, expected)) { res.status(401).end(); return; }
    }
    res
      .set("content-type", "text/plain; version=0.0.4")
      .send(renderMetrics(await collectRuntimeGauges(db)));
  });

  // ── Service health (documented in README; lists the domain modules)
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      modules: modules.map((m) => m.name),
      ts: Date.now(),
    });
  });

  app.get("/readyz", handler(async (_req, res) => {
    // The pool verdict is decided BEFORE touching the database on purpose: the
    // probe must be able to answer when connections are scarce, which is
    // exactly when it is asked. See gateway/readiness.ts for why a queue is no
    // longer treated as unreadiness.
    const pool = db.poolStats();
    const poolMax = Number(process.env["PG_POOL_MAX"] ?? 10);
    const verdict = readinessVerdict(pool, poolMax);
    if (!verdict.ready) {
      res.status(503).json({
        status: "degraded",
        reason: verdict.reason,
        pool,
        waitingLimit: verdict.waitingLimit,
        ts: Date.now(),
      });
      return;
    }

    // Reaching the database is still what "ready" means, so it is checked — but
    // a failure here is 503 "not ready", not the 500 it used to be. A 500 reads
    // as "this endpoint is broken" to a load balancer and to an on-call
    // engineer; the truth is "this instance cannot serve traffic right now",
    // which is what a readiness probe exists to say.
    try {
      await db.one("SELECT 1");
    } catch (err) {
      res.status(503).json({
        status: "degraded",
        reason: "database unreachable",
        error: (err as Error).message,
        pool: pool ?? undefined,
        ts: Date.now(),
      });
      return;
    }

    res.json({
      status: "ok",
      db: "connected",
      pool: pool ?? undefined,
      poolMax,
      modules: ["identity", ...modules.map((m) => m.name)],
      ts: Date.now(),
    });
  }));

  // ── Identity routes (/api/identity/login and /refresh are PUBLIC; /me is protected)
  // Security: public auth endpoints are brute-force surfaces, so apply a strict
  // per-IP limiter (≈20/min sustained, small burst) in front of the router.
  // Registration gets an extra-tight limiter (5 burst, ~3/min) to prevent
  // automated account creation.
  // Thresholds are env-overridable (defaults below = unchanged behavior) so a
  // single-IP test suite (e.g. CI's Playwright runner, which needs dozens of
  // login/probe requests) can be configured without touching this security
  // posture anywhere it isn't explicitly opted into.
  const identityRouter = Router();
  await identityModule.register({ db, events, router: identityRouter });
  app.use(
    "/api/identity/register",
    rateLimitMiddleware({
      capacity: Number(process.env["IDENTITY_REGISTER_RATE_CAPACITY"] ?? 5),
      refillRate: Number(process.env["IDENTITY_REGISTER_RATE_REFILL"] ?? 0.05),
      redis,
    }),
  );
  // The doc comment above (and identity/routes.ts's own per-route comments)
  // says /me, /devices, /mfa/*, /api-keys/* "require auth middleware mounted
  // upstream" — but nothing ever actually mounted it here, so res.locals.auth
  // was never populated for any of them: /me/mfa/* 401 unconditionally
  // (explicit `if (!auth)` check), /devices threw (tenantId() reads
  // res.locals.auth non-null), and /api-keys 403'd via requireRole's
  // safe-fallback-to-"cashier" default. Found live: a valid Bearer token that
  // worked fine against /api/v1/capabilities got 401 from /api/identity/me.
  // Fail-safe in every case (no cross-tenant/role leak), but fully broken.
  // Scoped per-path (not the whole /api/identity prefix) since
  // /register|/login|/login/mfa|/refresh|/logout|/forgot-password|
  // /reset-password must keep working with no token at all.
  app.use("/api/identity/me", makeAuthMiddleware(db));
  app.use("/api/identity/devices", makeAuthMiddleware(db));
  app.use("/api/identity/mfa", makeAuthMiddleware(db));
  app.use("/api/identity/api-keys", makeAuthMiddleware(db));
  app.use(
    "/api/identity",
    rateLimitMiddleware({
      capacity: Number(process.env["IDENTITY_RATE_LIMIT_CAPACITY"] ?? 10),
      refillRate: Number(process.env["IDENTITY_RATE_LIMIT_REFILL"] ?? 0.33),
      redis,
    }),
    identityRouter,
  );

  // ── SSO pre-login handshake — must be reachable BEFORE a token exists, so it
  // cannot go through the auth-gated /api/v1 router below (that would make SSO
  // login impossible: no token yet -> 401 -> can never get a token). Mounted
  // at the same /api/v1/sso path the frontend already calls; Express matches
  // this registration first, so /config (auth-gated, registered later via the
  // domain-modules loop) is unaffected. Same brute-force posture as identity login.
  const ssoPublicRouter = Router();
  registerSsoPublicRoutes(ssoPublicRouter, new SsoService(db));
  // Env-overridable for the same reason as /api/identity above: a single-IP
  // test suite (Playwright CI) can exhaust the brute-force bucket and cascade
  // every SSO-handshake spec. Defaults keep prod posture unchanged.
  app.use(
    "/api/v1/sso",
    rateLimitMiddleware({
      capacity: Number(process.env["SSO_RATE_LIMIT_CAPACITY"] ?? 10),
      refillRate: Number(process.env["SSO_RATE_LIMIT_REFILL"] ?? 0.33),
      redis,
    }),
    ssoPublicRouter,
  );

  // ── Auth + per-tenant tiered rate limit applied to all /api/v1/* routes.
  // makeAuthMiddleware handles both JWT sessions and API key tokens (fpk_ prefix).
  // Per-tenant tiered limiter, sized by the tenant's subscription plan. Without
  // the resolver every tenant fell through to `standard` (10 req/s sustained),
  // which no multi-store enterprise customer can run a shift on.
  const tierResolver = makeTenantTierResolver(db);
  app.use(
    "/api/v1",
    makeAuthMiddleware(db),
    tenantResolver,
    tenantRateLimitMiddleware({ redis, tierOf: tierResolver.tierOf }),
  );

  // ── Feature flags (tenant-scoped, requires auth)
  app.get(
    "/api/v1/flags",
    handler(async (_req, res) => {
      const auth = res.locals["auth"] as { tenantId: string } | undefined;
      const tenantId = auth?.tenantId;
      // Return global flags + tenant-overrides (tenant row wins over global row).
      const flags = await db.query<{ flag_key: string; enabled: boolean }>(
        `SELECT flag_key, enabled FROM feature_flags
         WHERE tenant_id IS NULL OR tenant_id = @tenantId
         ORDER BY tenant_id NULLS FIRST`,
        { tenantId: tenantId ?? "" },
      );
      // Merge: tenant row overrides global row for the same key.
      const map = new Map<string, boolean>();
      for (const f of flags) {
        map.set(f.flag_key, f.enabled);
      }
      res.json(Object.fromEntries(map));
    }),
  );

  // ── Platform capabilities (tenant-scoped, requires auth)
  // This is the read-only source of truth that setup/settings/demo switchers
  // should consume before rendering business-type-specific modules.
  const settingsService = new SettingsService(db);
  app.get(
    "/api/v1/capabilities/impact",
    handler(async (req, res) => {
      const auth = res.locals["auth"] as AuthPayload;
      res.json(await settingsService.getCapabilitiesImpact(auth, parseCapabilitiesImpactQuery(req.query as Record<string, unknown>)));
    }),
  );
  app.get(
    "/api/v1/capabilities",
    handler(async (_req, res) => {
      const auth = res.locals["auth"] as AuthPayload;
      res.json(await settingsService.getCapabilities(auth));
    }),
  );

  // ── Domain modules (mounted under /api/v1/<name>; auth applied via /api/v1
  //    prefix registered above. A module may override with `mountPath` when its
  //    routes are already top-level resource names.)
  for (const mod of modules) {
    const router = Router();
    await mod.register({ db, events, router, outbox });
    app.use(mod.mountPath ?? `/api/v1/${mod.name}`, router);
  }

  // Outbox crash recovery: deliver any events left pending by a previous
  // process death, then sweep periodically when background jobs are enabled.
  void outbox.reconcile().catch((err) => logger.warn({ err }, "outbox boot reconcile failed"));
  if (process.env["FINDER_BACKGROUND_JOBS"] !== "false") {
    setInterval(() => {
      void outbox.reconcile().catch((err) => logger.warn({ err }, "outbox sweep failed"));
    }, 60_000).unref();
  }

  // ── Root info
  app.get("/", (_req, res) => {
    res.json({
      service: "ascend",
      status: "ok",
      storage: "postgres",
      modules: ["identity", ...modules.map((m) => m.name)],
      endpoints: [
        "/health",
        "/healthz",
        "/readyz",
        "/api/identity/login",
        "/api/identity/refresh",
        "/api/v1/flags",
        "/api/v1/capabilities",
        "/api/v1/capabilities/impact",
        "/api/catalog",
        "/api/inventory",
        "/api/orders",
        "/api/payments",
        "/api/sync",
      ],
    });
  });

  // ── Orchestration layer (workflows, sagas, command handlers, background jobs)
  const orchestration = bootstrapOrchestration(db, events);

  // ── Background-job tick — GET /jobs/tick (ACPA M1.2, closes C-2)
  // The in-process setInterval pollers freeze between serverless invocations,
  // so on Vercel a cron (vercel.json "crons") hits this endpoint instead.
  // Vercel sends `Authorization: Bearer ${CRON_SECRET}` automatically when the
  // env var is set. Each tick drains due jobs (bounded) and reconciles the
  // outbox; FOR UPDATE SKIP LOCKED + consumer idempotency make concurrent
  // ticks and long-lived-deploy intervals safe to overlap.
  //
  // This is also what runs the DEMO-1 trial-expiry sweep (job type
  // "trial_expiry", registered in bootstrapOrchestration) — a prospect's
  // trial signup enqueues/reschedules itself into the same job_queue this
  // endpoint drains, so no separate scheduler entry point is needed for it.
  //
  // Two credentials are accepted, because two kinds of scheduler exist:
  //   CRON_SECRET      — Vercel Cron's convention; sent as `Authorization: Bearer`.
  //   JOBS_TICK_SECRET — any other scheduler (Render cron job, GitHub Actions,
  //                      an external uptime service); sent as `X-Jobs-Tick-Secret`.
  // `.env.example` has documented both since the endpoint was written, but only
  // CRON_SECRET was ever read — so an operator on a non-Vercel host who followed
  // the documentation and set JOBS_TICK_SECRET got a 503 in production and no
  // background jobs at all, silently. That matters more now than it did: prod is
  // claimed to run on Render (docs/architecture/DEPLOYMENTS.md), where Vercel's
  // Bearer convention does not exist.
  app.get("/jobs/tick", handler(async (req, res) => {
    const cronSecret = process.env["CRON_SECRET"];
    const tickSecret = process.env["JOBS_TICK_SECRET"];
    if (!cronSecret && !tickSecret && process.env["NODE_ENV"] === "production") {
      res.status(503).json({ error: "cron_unconfigured" });
      return;
    }
    if (cronSecret ?? tickSecret) {
      const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "");
      const headerSecret = req.headers["x-jobs-tick-secret"];
      const ok =
        (cronSecret !== undefined && secretsMatch(bearer, cronSecret)) ||
        (tickSecret !== undefined && secretsMatch(typeof headerSecret === "string" ? headerSecret : undefined, tickSecret));
      if (!ok) { res.status(401).end(); return; }
    }
    const deadline = Date.now() + 10_000;
    let jobsProcessed = 0;
    for (let i = 0; i < 20 && Date.now() < deadline; i++) {
      const n = await orchestration.jobConsumer.poll();
      jobsProcessed += n;
      if (n === 0) break;
    }
    const reconciled = await outbox.reconcile();
    res.json({ status: "ok", jobsProcessed, outbox: reconciled, ts: Date.now() });
  }));

  // ── Server-Sent Events stream — GET /api/v1/stream
  const sseBroker = new SseBroker();

  // Forward relevant domain events to the SSE broker.
  events.on("order.created", (e) => {
    const p = e.payload as { tenantId?: string; orderNumber?: string; totalCents?: number };
    if (p.tenantId) sseBroker.broadcast(p.tenantId, { type: "order_created", data: { orderNumber: p.orderNumber, totalCents: p.totalCents } });
  });
  events.on("payment.captured", (e) => {
    const p = e.payload as { tenantId?: string; orderId?: string; amountCents?: number };
    if (p.tenantId) sseBroker.broadcast(p.tenantId, { type: "payment_captured", data: { orderId: p.orderId, amountCents: p.amountCents } });
  });
  events.on("inventory.adjusted", async (e) => {
    const p = e.payload as { tenantId?: string; productId?: string; newQty?: number; reorderPt?: number; name?: string };
    if (p.tenantId && p.newQty !== undefined && p.reorderPt !== undefined && p.reorderPt > 0 && p.newQty <= p.reorderPt) {
      sseBroker.broadcast(p.tenantId, { type: "low_stock", data: { productId: p.productId, name: p.name, currentStock: p.newQty, reorderPoint: p.reorderPt } });
    }
  });
  events.on("loyalty.tier_upgraded", (e) => {
    const p = e.payload as { tenantId?: string; customerId?: string; tierName?: string };
    if (p.tenantId) sseBroker.broadcast(p.tenantId, { type: "tier_upgraded", data: { customerId: p.customerId, tierName: p.tierName } });
  });

  app.get("/api/v1/stream", (req, res) => {
    const auth = res.locals["auth"] as AuthPayload | undefined;
    if (!auth?.tenantId) { res.status(401).end(); return; }
    sseBroker.connect(auth.tenantId, res);
    // Keep the connection open — cleanup handled by the broker on 'close' event.
    req.on("close", () => { /* broker handles it */ });
  });

  // ── BE-34: /api/v1/jobs status endpoint (owner-only)
  app.get(
    "/api/v1/jobs",
    requireRole("owner"),
    handler(async (_req, res) => {
      const auth = res.locals["auth"] as AuthPayload;
      const rows = await db.query<{
        id: string; type: string; status: string; run_at: number;
        attempts: number; max_attempts: number; created_at: number;
      }>(
        `SELECT id, type, status, run_at, attempts, max_attempts, created_at
         FROM job_queue
         WHERE tenant_id IN (@t, 'system')
         ORDER BY created_at DESC LIMIT 100`,
        { t: auth.tenantId },
      );
      const counts = { pending: 0, running: 0, done: 0, failed: 0 };
      for (const r of rows) {
        const key = r.status === "completed" ? "done" : r.status;
        if (key in counts) (counts as Record<string, number>)[key]++;
      }
      res.json({ items: rows, summary: counts });
    }),
  );

  // ── Error handling — ONE handler, deliberately.
  // This used to be two: `errorMiddleware` followed by `errorEnvelopeMiddleware`,
  // with a comment claiming the envelope "must be last". It was last, and it was
  // never reached: errorMiddleware always responds and never calls next(err), so
  // the envelope was unreachable dead code from the day it was mounted. The
  // visible consequence was that the documented `{error:{code,message,requestId}}`
  // contract was never delivered — no error response carried a requestId, so a
  // customer reporting an error gave you nothing to correlate against the logs.
  // The frontend had been reading that field all along (web/contexts/StoreAuthContext.tsx).
  //
  // Fixed by folding the envelope's one genuine advantage (requestId, plus
  // logging 5xx HttpErrors) into errorMiddleware rather than by reordering the
  // two: swapping them would have been a breaking change, since the envelope
  // renames 5xx `internal` → `internal_error` and drops the `details` array that
  // validation errors carry.
  app.use(errorMiddleware);

  return { express: app, db, events, outbox, cleanup: cleanupEventBridge };
}
