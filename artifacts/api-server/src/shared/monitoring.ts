/**
 * Structured error monitoring — log-aggregator-friendly JSON output.
 *
 * Design: emit structured JSON to stdout so any log aggregator (Datadog,
 * CloudWatch, Logtail, etc.) can index and alert on error fields without
 * requiring a vendor SDK. When SENTRY_DSN is set in the environment, we also
 * fire-and-forget a minimal Sentry envelope via fetch (no npm package needed).
 *
 * Fields emitted:
 *   level, message, error, stack, requestId, traceId, spanId, tenantId, path,
 *   method, statusCode, timestamp (ISO 8601)
 */

import type { Request } from "express";

export interface ErrorContext {
  requestId?: string;
  traceId?: string;
  spanId?: string;
  tenantId?: string;
  path?: string;
  method?: string;
  statusCode?: number;
}

export function logError(err: unknown, ctx: ErrorContext = {}): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? (err.stack ?? "") : "";

  const entry = {
    level: "error",
    timestamp: new Date().toISOString(),
    message,
    error: message,
    stack: stack.split("\n").slice(0, 8).join("\n"),
    ...ctx,
  };

  // Structured JSON log — picked up by log aggregators automatically.
  process.stdout.write(JSON.stringify(entry) + "\n");

  // Optional: forward to Sentry via HTTP envelope (no SDK required).
  void sendToSentry(err, ctx);
}

/** Emit a structured info log (for auditing, not alerting). */
export function logInfo(message: string, ctx: Record<string, unknown> = {}): void {
  process.stdout.write(JSON.stringify({ level: "info", timestamp: new Date().toISOString(), message, ...ctx }) + "\n");
}

/**
 * Fire-and-forget minimal Sentry error envelope.
 * Only active when SENTRY_DSN is configured. Fails silently.
 */
async function sendToSentry(err: unknown, ctx: ErrorContext): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace("/", "");
    const endpoint = `${url.protocol}//${url.host}/api/${projectId}/envelope/`;
    const publicKey = url.username;

    const now = Math.floor(Date.now() / 1000);
    const eventId = crypto.randomUUID().replace(/-/g, "");
    const message = err instanceof Error ? err.message : String(err);
    const stacktrace = err instanceof Error && err.stack
      ? {
          frames: err.stack.split("\n").slice(1, 6).map((line) => ({
            filename: line.trim(),
            function: "<unknown>",
          })),
        }
      : undefined;

    const envelope = [
      JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn }),
      JSON.stringify({ type: "event", content_type: "application/json" }),
      JSON.stringify({
        event_id: eventId,
        timestamp: now,
        platform: "node",
        level: "error",
        exception: {
          values: [{
            type: err instanceof Error ? err.constructor.name : "Error",
            value: message,
            stacktrace,
          }],
        },
        tags: {
          request_id: ctx.requestId,
          tenant_id: ctx.tenantId,
          path: ctx.path,
        },
        extra: ctx,
      }),
    ].join("\n");

    await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=finder-pos/1.0, sentry_key=${publicKey}`,
      },
      body: envelope,
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Monitoring must never crash the app.
  }
}

/** Extract error context from an Express request. */
export function contextFromRequest(req: Request): ErrorContext {
  return {
    requestId: (req as unknown as Record<string, string>)["id"] ?? undefined,
    traceId: String(req.headers["x-trace-id"] ?? ""),
    spanId: String(req.headers["x-span-id"] ?? ""),
    path: req.path,
    method: req.method,
  };
}
