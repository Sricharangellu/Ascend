import type { Request, Response, NextFunction } from "express";

/**
 * RED metrics (Rate, Errors, Duration) — an in-process, dependency-free
 * Prometheus exposition. Wave 2 observability: a real scrape target without
 * standing up a metrics backend. Cardinality is kept low by normalizing dynamic
 * path segments (ids) to ":id" and bucketing status into the exact code.
 *
 * Exposed at GET /metrics. The route is bearer-token protected in production by
 * app.ts; this module only records and renders the metrics payload.
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

/** Render the current metrics in Prometheus text exposition format. */
export function renderMetrics(): string {
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
