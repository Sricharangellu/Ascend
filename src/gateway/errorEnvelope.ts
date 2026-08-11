import type { Request, Response, NextFunction } from "express";
import { HttpError } from "../shared/http.js";
import { requestLogger, moduleLogger } from "../shared/logger.js";
import { logError, contextFromRequest } from "../shared/monitoring.js";

const log = moduleLogger("error-envelope");

/**
 * Error-envelope middleware. Must be mounted LAST in the Express chain, and
 * must be the ONLY error handler mounted — see the history note below.
 *
 * Returns the envelope `docs/api/error-codes.md` documents for every error:
 *
 *   { error: { code, message, requestId } }
 *
 * plus `details` when the error carries structured per-field issues (what
 * `parseBody` attaches on a validation failure). Internal errors (5xx) never
 * leak stack traces or internal messages to the caller — they receive a
 * generic message. The real error is logged with the requestId so operators
 * can correlate.
 *
 * ─── Why this file has a history note (repaired 2026-08-10) ─────────────────
 * This middleware existed, was exported, and was mounted in app.ts — and had
 * never run. `errorMiddleware` (shared/http.ts) was mounted immediately before
 * it and always responded, never calling `next(err)`, so Express never reached
 * the handler after it. Express only advances to the next error handler when
 * the current one calls next(err); one that responds terminates the chain.
 *
 * The cost was not cosmetic. **No error response this app has ever returned
 * carried a `requestId`**, while `docs/api/error-codes.md` tells callers to
 * "use `requestId` when contacting support" — so a customer reporting an error
 * had nothing to correlate against the logs, and neither did anyone reading
 * them. Two implementations of one contract also drifted, exactly the failure
 * mode GAPS.md names as this repo's dominant one: the unreachable copy had no
 * `details` passthrough (would have silently dropped every validation issue if
 * it ever ran) and answered 500s with `internal_error`, a code that is not in
 * `ERROR_CODES` at all.
 *
 * The repair consolidated both into this one handler and deleted the other, so
 * there is no second implementation left to drift. `errorEnvelope.test.ts`
 * asserts the requestId is present and correlates with the `x-request-id`
 * response header — it fails if a handler is ever mounted ahead of this one
 * again, which is the specific regression that hid here for months.
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

  // Headers already flushed (e.g. a stream that failed mid-write): there is no
  // envelope to send. Delegating to Express' default handler is the only
  // correct move — writing a second body would corrupt the response.
  if (res.headersSent) {
    log.error({ requestId, path: req.path }, "error after headers sent — cannot send envelope");
    _next(err);
    return;
  }

  if (err instanceof HttpError) {
    if (err.status >= 500) {
      reqLog.error({ requestId, method: req.method, status: err.status, code: err.code }, err.message);
      // 5xx keeps the monitoring/Sentry hook `errorMiddleware` used to own.
      logError(err, { ...contextFromRequest(req), requestId, traceId, spanId, statusCode: err.status });
    }
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        // Additive, and load-bearing: `parseBody` puts per-field validation
        // issues here. Dropping it would break every client that reads them.
        ...(err.details !== undefined ? { details: err.details } : {}),
        requestId,
      },
    });
    return;
  }

  // Unexpected error — log with trace context, never expose internals to the
  // caller. `internal` (not `internal_error`) is the code in ERROR_CODES, and
  // is what this app has actually been returning.
  const message = err instanceof Error ? err.message : String(err);
  reqLog.error({
    requestId,
    path: req.path,
    method: req.method,
    message,
    stack: err instanceof Error ? err.stack : undefined,
  }, "unhandled error");
  logError(err, { ...contextFromRequest(req), requestId, traceId, spanId, statusCode: 500 });

  res.status(500).json({
    error: {
      code: "internal",
      message: "An unexpected error occurred.",
      requestId,
    },
  });
}
