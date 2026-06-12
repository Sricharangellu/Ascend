import type { Request, Response, NextFunction } from "express";

/**
 * RED metrics (Rate, Errors, Duration) — an in-process, dependency-free
 * Prometheus exposition. Wave 2 observability: a real scrape target without
 * standing up a metrics backend. Cardinality is kept low by normalizing dynamic
 * path segments (ids) to ":id" and bucketing status into the exact code.
 *
 * Exposed at GET /metrics (unauthenticated, like the health probes).
 */

interface DurationAgg {
  sum: number;
  count: number;
}

const requestCounts = new Map<string, number>(); // method|path|status -> n
const durations = new Map<string, DurationAgg>(); // method|path -> {sum,count}

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
  return lines.join("\n") + "\n";
}

/** Test helper: clear all recorded metrics. */
export function resetMetrics(): void {
  requestCounts.clear();
  durations.clear();
}
