import type { Request, Response, NextFunction } from "express";
import { HttpError } from "../shared/http.js";
import { requestLogger, moduleLogger } from "../shared/logger.js";

const log = moduleLogger("error-envelope");

/**
 * Error-envelope middleware. Must be mounted LAST in the Express chain.
 * Returns a consistent JSON envelope:
 *
 *   { error: { code, message, requestId } }
 *
 * Internal errors (5xx) never leak stack traces or internal messages to the
 * caller — they receive a generic "internal_error" message. The real error is
 * logged to stderr with the requestId so operators can correlate.
 */
export function errorEnvelopeMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId: string = (res.locals["requestId"] as string | undefined) ?? "unknown";
  // DB-17: include W3C trace context in error logs for APM correlation.
  const traceId: string = (res.locals["traceId"] as string | undefined) ?? requestId;
  const spanId: string  = (res.locals["spanId"]  as string | undefined) ?? "0000000000000000";
  const reqLog = requestLogger(traceId, spanId, req.path);

  if (err instanceof HttpError) {
    if (err.status >= 500) {
      reqLog.error({ requestId, method: req.method, status: err.status, code: err.code }, err.message);
    }
    res.status(err.status).json({
      error: { code: err.code, message: err.message, requestId },
    });
    return;
  }

  // Unexpected error — log with trace context, never expose internals to caller.
  const message = err instanceof Error ? err.message : String(err);
  reqLog.error({
    requestId,
    path: req.path,
    method: req.method,
    message,
    stack: err instanceof Error ? err.stack : undefined,
  }, "unhandled error");

  res.status(500).json({
    error: {
      code: "internal_error",
      message: "An unexpected error occurred.",
      requestId,
    },
  });
}
