import type { Request, Response, NextFunction } from "express";
import { HttpError } from "../shared/http.js";

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

  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, requestId },
    });
    return;
  }

  // Unexpected error — log it (never expose internals).
  const message = err instanceof Error ? err.message : String(err);
  console.error(
    JSON.stringify({
      level: "error",
      requestId,
      path: req.path,
      method: req.method,
      message,
      stack: err instanceof Error ? err.stack : undefined,
    }),
  );

  res.status(500).json({
    error: {
      code: "internal_error",
      message: "An unexpected error occurred.",
      requestId,
    },
  });
}
