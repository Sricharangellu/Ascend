import { monitorEventLoopDelay } from "node:perf_hooks";
import type { Request, Response, NextFunction } from "express";

/**
 * RED metrics (Rate, Errors, Duration) — an in-process, dependency-free
 * Prometheus exposition. Wave 2 observability: a real scrape target without
 * standing up a metrics backend. Cardinality is kept low by normalizing dynamic
 * path segments (ids) to ":id" and bucketing status into the exact code.
 *
 * Exposed at GET /metrics. The route is bearer-token protected in production by
 * app.ts; this module only records and renders the metrics payload.
 *
 * Alongside the RED counters, renderMetrics() emits USE-style gauges (see
 * RuntimeGauges below) for the four subsystems that could previously fail
 * completely invisibly: the Postgres pool, the job queue, the transactional
 * outbox, and the Node runtime itself. Those need a live DB read, so the caller
 * (app.ts's /metrics handler) collects them and passes them in — this module
 * stays synchronous and dependency-free, and every gauge is optional so a
 * failed or skipped collection degrades to "that gauge is absent" rather than
 * to a broken scrape.
 */

interface DurationAgg {
  sum: number;
  count: number;
}

const requestCounts = new Map<string, number>(); // method|path|status -> n
const durations = new Map<string, DurationAgg>(); // method|path -> {sum,count}

// ── UOM conversion pipeline (ADR-006) — lets a config problem surface as a
// metric instead of waiting for a support ticket. Same in-process counter
// pattern as the HTTP metrics above; no new dependency. ─────────────────────
const uomConversions = new Map<string, number>();     // kind|context -> n
const uomUnitNotConfigured = new Map<string, number>(); // kind -> n
let uomBarcodeLookupFailed = 0;

/** A purchasing/receiving line was successfully converted from a configured
 *  unit ("case", "box") to base (each) units. */
export function recordUomConversion(kind: string, context: "po_create" | "receive"): void {
  const key = `${kind}|${context}`;
  uomConversions.set(key, (uomConversions.get(key) ?? 0) + 1);
}

/** A caller requested a purchasing unit that isn't configured for the product
 *  (no matching product_barcodes row) — the request failed closed (400). */
export function recordUomUnitNotConfigured(kind: string): void {
  uomUnitNotConfigured.set(kind, (uomUnitNotConfigured.get(kind) ?? 0) + 1);
}

/** A scanned/looked-up barcode matched no active product, in either
 *  product_barcodes or the legacy products.barcode column. */
export function recordUomBarcodeLookupFailed(): void {
  uomBarcodeLookupFailed += 1;
}

// ── POS-specific telemetry — operational metrics for the scan→cart→checkout
// flow, distinct from the purchasing-side counters above. ───────────────────
let posBarcodeScans = 0;
let posBarcodeScanFailures = 0;
const posScanUnit = new Map<string, number>();     // unit -> n
const posCheckoutUnit = new Map<string, number>(); // unit -> n

export function recordPosBarcodeScan(): void {
  posBarcodeScans += 1;
}

export function recordPosBarcodeScanFailure(): void {
  posBarcodeScanFailures += 1;
}

export function recordPosScanUnit(unit: string): void {
  posScanUnit.set(unit, (posScanUnit.get(unit) ?? 0) + 1);
}

export function recordPosCheckoutUnit(unit: string): void {
  posCheckoutUnit.set(unit, (posCheckoutUnit.get(unit) ?? 0) + 1);
}

const ID_SEGMENT =
  /^(prod|ord|oln|pay|usr|tnt|role|ivm)_|^[0-9a-f]{8}-[0-9a-f-]{20,}$|^\d+$/i;

export function normalizePath(path: string): string {
  const clean = path.split("?")[0] ?? path;
  return (
    "/" +
    clean
      .split("/")
      .filter((s) => s.length > 0)
      .map((s) => (ID_SEGMENT.test(s) ? ":id" : s))
      .join("/")
  );
}

export function recordRequest(method: string, path: string, status: number, durationMs: number): void {
  const np = normalizePath(path);
  const ckey = `${method}|${np}|${status}`;
  requestCounts.set(ckey, (requestCounts.get(ckey) ?? 0) + 1);
  const dkey = `${method}|${np}`;
  const agg = durations.get(dkey) ?? { sum: 0, count: 0 };
  agg.sum += durationMs;
  agg.count += 1;
  durations.set(dkey, agg);
}

/** Express middleware: times every request and records it on completion. */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    recordRequest(req.method, req.path, res.statusCode, durationMs);
  });
  next();
}

const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

// ── Event-loop delay ────────────────────────────────────────────────────────
// The single most useful saturation signal for a Node process, and the one this
// service had no way to see: a blocked loop shows up as every endpoint slowing
// at once, which is indistinguishable from "the database got slow" in the RED
// metrics alone. node:perf_hooks' histogram is sampled by libuv itself — no
// polling timer, no measurable overhead — so it is safe to leave running.
// .unref() so it can never hold the process open during tests or shutdown.
const eventLoopDelay = monitorEventLoopDelay({ resolution: 10 });
eventLoopDelay.enable();
(eventLoopDelay as unknown as { unref?: () => void }).unref?.();

/**
 * Point-in-time readings the caller collects and hands to renderMetrics().
 * Every field is optional: a collection that failed or was skipped simply omits
 * its gauge, which Prometheus reads as "no sample", not as zero. That
 * distinction matters — a hard-coded 0 for `outbox_pending` would look exactly
 * like a healthy outbox while the collector was broken.
 */
export interface RuntimeGauges {
  /** db.poolStats() — open, idle, and queued-waiting connections. */
  pool?: { total: number; idle: number; waiting: number } | null;
  /** PG_POOL_MAX, so a dashboard can plot utilisation without knowing config. */
  poolMax?: number;
  /** job_queue rows grouped by status (pending/running/completed/failed). */
  jobsByStatus?: Record<string, number>;
  /** Age in ms of the oldest still-pending job that is already due to run. */
  oldestDueJobAgeMs?: number;
  /** event_outbox rows with dispatched = FALSE (ADR-003 durability backlog). */
  outboxPending?: number;
  /** Age in ms of the oldest undispatched outbox row. */
  outboxOldestPendingAgeMs?: number;
  /** buildInfo().sha — lets a metric step-change be tied to a specific deploy. */
  buildSha?: string;
}

/**
 * Render the current metrics in Prometheus text exposition format.
 *
 * The argument is optional so existing callers (and the metrics tests) keep
 * working unchanged — without it, this returns exactly what it always did plus
 * the process/event-loop gauges, which need no collection.
 */
export function renderMetrics(gauges: RuntimeGauges = {}): string {
  const lines: string[] = [];
  lines.push("# HELP http_requests_total Total HTTP requests by method, path and status.");
  lines.push("# TYPE http_requests_total counter");
  for (const [key, n] of requestCounts) {
    const [method, path, status] = key.split("|");
    lines.push(`http_requests_total{method="${esc(method!)}",path="${esc(path!)}",status="${esc(status!)}"} ${n}`);
  }
  lines.push("# HELP http_request_duration_ms Request duration in milliseconds (summary).");
  lines.push("# TYPE http_request_duration_ms summary");
  for (const [key, agg] of durations) {
    const [method, path] = key.split("|");
    const labels = `method="${esc(method!)}",path="${esc(path!)}"`;
    lines.push(`http_request_duration_ms_sum{${labels}} ${agg.sum.toFixed(3)}`);
    lines.push(`http_request_duration_ms_count{${labels}} ${agg.count}`);
  }

  lines.push("# HELP uom_conversions_total Purchasing/receiving lines converted from a configured unit to base (each) units.");
  lines.push("# TYPE uom_conversions_total counter");
  for (const [key, n] of uomConversions) {
    const [kind, context] = key.split("|");
    lines.push(`uom_conversions_total{kind="${esc(kind!)}",context="${esc(context!)}"} ${n}`);
  }
  lines.push("# HELP uom_unit_not_configured_total Requests for a purchasing unit with no matching product_barcodes row — failed closed, not miscalculated.");
  lines.push("# TYPE uom_unit_not_configured_total counter");
  for (const [kind, n] of uomUnitNotConfigured) {
    lines.push(`uom_unit_not_configured_total{kind="${esc(kind)}"} ${n}`);
  }
  lines.push("# HELP uom_barcode_lookup_failed_total Barcode lookups matching no active product.");
  lines.push("# TYPE uom_barcode_lookup_failed_total counter");
  lines.push(`uom_barcode_lookup_failed_total ${uomBarcodeLookupFailed}`);

  lines.push("# HELP pos_barcode_scans_total POS barcode scans attempted.");
  lines.push("# TYPE pos_barcode_scans_total counter");
  lines.push(`pos_barcode_scans_total ${posBarcodeScans}`);
  lines.push("# HELP pos_barcode_scan_failures_total POS barcode scans that matched no active product.");
  lines.push("# TYPE pos_barcode_scan_failures_total counter");
  lines.push(`pos_barcode_scan_failures_total ${posBarcodeScanFailures}`);
  lines.push("# HELP pos_scan_unit_total POS scans by resolved unit (each/box/case/...).");
  lines.push("# TYPE pos_scan_unit_total counter");
  for (const [unit, n] of posScanUnit) {
    lines.push(`pos_scan_unit_total{unit="${esc(unit)}"} ${n}`);
  }
  lines.push("# HELP pos_checkout_unit_total Order lines checked out by unit (each/box/case/...).");
  lines.push("# TYPE pos_checkout_unit_total counter");
  for (const [unit, n] of posCheckoutUnit) {
    lines.push(`pos_checkout_unit_total{unit="${esc(unit)}"} ${n}`);
  }

  // ── Node runtime (always available — no collection needed) ────────────────
  const mem = process.memoryUsage();
  lines.push("# HELP process_uptime_seconds Seconds since this process started.");
  lines.push("# TYPE process_uptime_seconds gauge");
  lines.push(`process_uptime_seconds ${process.uptime().toFixed(3)}`);
  lines.push("# HELP process_resident_memory_bytes Resident set size of this process.");
  lines.push("# TYPE process_resident_memory_bytes gauge");
  lines.push(`process_resident_memory_bytes ${mem.rss}`);
  lines.push("# HELP nodejs_heap_used_bytes V8 heap currently in use.");
  lines.push("# TYPE nodejs_heap_used_bytes gauge");
  lines.push(`nodejs_heap_used_bytes ${mem.heapUsed}`);
  lines.push("# HELP nodejs_heap_total_bytes V8 heap allocated.");
  lines.push("# TYPE nodejs_heap_total_bytes gauge");
  lines.push(`nodejs_heap_total_bytes ${mem.heapTotal}`);
  lines.push(
    "# HELP nodejs_eventloop_delay_ms Event-loop delay since process start (ns histogram, reported in ms).",
  );
  lines.push("# TYPE nodejs_eventloop_delay_ms summary");
  lines.push(`nodejs_eventloop_delay_ms{quantile="0.5"} ${(eventLoopDelay.percentile(50) / 1e6).toFixed(3)}`);
  lines.push(`nodejs_eventloop_delay_ms{quantile="0.99"} ${(eventLoopDelay.percentile(99) / 1e6).toFixed(3)}`);
  lines.push(`nodejs_eventloop_delay_ms_max ${(eventLoopDelay.max / 1e6).toFixed(3)}`);

  // ── Postgres connection pool ──────────────────────────────────────────────
  // /readyz already 503s when `waiting > 0`, but that is a binary, point-in-time
  // signal a human has to go looking for. These are the same numbers as a time
  // series, so pool pressure is visible as a trend before it becomes an outage.
  if (gauges.pool) {
    lines.push("# HELP db_pool_connections Postgres pool connections by state.");
    lines.push("# TYPE db_pool_connections gauge");
    lines.push(`db_pool_connections{state="total"} ${gauges.pool.total}`);
    lines.push(`db_pool_connections{state="idle"} ${gauges.pool.idle}`);
    lines.push(`db_pool_connections{state="waiting"} ${gauges.pool.waiting}`);
  }
  if (gauges.poolMax !== undefined) {
    lines.push("# HELP db_pool_max Configured maximum pool size (PG_POOL_MAX).");
    lines.push("# TYPE db_pool_max gauge");
    lines.push(`db_pool_max ${gauges.poolMax}`);
  }

  // ── Background job queue ──────────────────────────────────────────────────
  // /jobs/tick drains this on a schedule; nothing reported on it. A cron that
  // silently stops firing (the exact failure mode C-2 describes, and the one
  // /jobs/tick exists to work around on serverless) is invisible until a
  // customer notices a trial never expired. Depth-by-status plus the age of the
  // oldest overdue job makes a stalled drain alertable.
  if (gauges.jobsByStatus) {
    lines.push("# HELP job_queue_depth Rows in job_queue by status.");
    lines.push("# TYPE job_queue_depth gauge");
    for (const [status, n] of Object.entries(gauges.jobsByStatus)) {
      lines.push(`job_queue_depth{status="${esc(status)}"} ${n}`);
    }
  }
  if (gauges.oldestDueJobAgeMs !== undefined) {
    lines.push("# HELP job_queue_oldest_due_age_ms Age of the oldest pending job already past its run_at.");
    lines.push("# TYPE job_queue_oldest_due_age_ms gauge");
    lines.push(`job_queue_oldest_due_age_ms ${gauges.oldestDueJobAgeMs}`);
  }

  // ── Transactional outbox (ADR-003) ────────────────────────────────────────
  // Financially-critical events are persisted before dispatch and redelivered
  // by outbox.reconcile(). A growing undispatched backlog means money-adjacent
  // side effects are not happening — the highest-severity silent failure in
  // this system, and previously observable only by querying the database by
  // hand. Alert on outbox_oldest_pending_age_ms, not on the count.
  if (gauges.outboxPending !== undefined) {
    lines.push("# HELP outbox_pending_events Undispatched rows in event_outbox.");
    lines.push("# TYPE outbox_pending_events gauge");
    lines.push(`outbox_pending_events ${gauges.outboxPending}`);
  }
  if (gauges.outboxOldestPendingAgeMs !== undefined) {
    lines.push("# HELP outbox_oldest_pending_age_ms Age of the oldest undispatched outbox row.");
    lines.push("# TYPE outbox_oldest_pending_age_ms gauge");
    lines.push(`outbox_oldest_pending_age_ms ${gauges.outboxOldestPendingAgeMs}`);
  }

  // ── Build identity ────────────────────────────────────────────────────────
  // The standard Prometheus info-gauge pattern: a constant 1 carrying labels, so
  // a dashboard can annotate "this step-change starts at this commit" without
  // cross-referencing deploy logs. /healthz already returns the sha; this makes
  // it correlatable inside the metrics store.
  if (gauges.buildSha) {
    lines.push("# HELP ascend_build_info Build identity of the running process (always 1).");
    lines.push("# TYPE ascend_build_info gauge");
    lines.push(`ascend_build_info{sha="${esc(gauges.buildSha)}"} 1`);
  }

  return lines.join("\n") + "\n";
}

/** Test helper: clear all recorded metrics. */
export function resetMetrics(): void {
  requestCounts.clear();
  durations.clear();
  uomConversions.clear();
  uomUnitNotConfigured.clear();
  uomBarcodeLookupFailed = 0;
  posBarcodeScans = 0;
  posBarcodeScanFailures = 0;
  posScanUnit.clear();
  posCheckoutUnit.clear();
}
