import type { Request, Response, NextFunction } from "express";
import { ZodError, type ZodSchema } from "zod";
import { logError, contextFromRequest } from "./monitoring.js";

/**
 * Shared error-code vocabulary. Every code here has ONE meaning and ONE
 * canonical status; use these for cross-cutting failures. Modules may mint
 * domain-specific codes (snake_case, stable — e.g. `already_received`,
 * `invalid_transition`) for state-machine conflicts; those live with the
 * module, not here. Codes are part of the public API contract: additive
 * only, never remove or repurpose (see CODING_STANDARDS.md).
 */
export const ERROR_CODES = {
  bad_request: 400,
  validation_error: 400,
  unauthenticated: 401,
  token_expired: 401,
  invalid_credentials: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limit_exceeded: 429,
  account_locked: 429,
  internal: 500,
  misconfigured: 500,
} as const;
export type SharedErrorCode = keyof typeof ERROR_CODES;

/** Thrown by services/routes to signal a 4xx with a stable error code. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    /** Optional structured detail (e.g. per-field validation issues). */
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (msg: string) => new HttpError(404, "not_found", msg);
export const badRequest = (msg: string) => new HttpError(400, "bad_request", msg);
export const conflict = (msg: string) => new HttpError(409, "conflict", msg);
export const forbidden = (msg: string) => new HttpError(403, "forbidden", msg);

/** Wrap an async route handler so thrown errors hit the error middleware. */
export function handler(
  fn: (req: Request, res: Response) => unknown | Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

/** Validate req.body against a zod schema, throwing 400 on failure. */
export function parseBody<T>(schema: ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    // Structured per-field issues ride along in `details` (additive — the
    // flattened message stays the same for existing clients).
    const details = result.error.issues.map((i) => ({
      field: i.path.join(".") || "(root)",
      message: i.message,
    }));
    throw new HttpError(400, "validation_error", flatten(result.error), details);
  }
  return result.data;
}

function flatten(err: ZodError): string {
  return err.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

/**
 * Express error-handling middleware. Mount last — this is the ONLY error
 * handler; see the note in `src/app.ts` about the envelope middleware that used
 * to sit behind it and could never run.
 *
 * Delivers the documented envelope `{ error: { code, message, requestId } }`,
 * plus `details` on validation errors. `requestId` is what lets a customer
 * reporting an error be correlated to the server log line — it is also echoed
 * as the `x-request-id` response header by `requestIdMiddleware`, so the two
 * always agree.
 */
export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  // requestIdMiddleware writes these to res.locals for exactly this purpose
  // ("so subsequent middleware (auth, error-envelope) can reference it").
  const requestId = (res.locals["requestId"] as string | undefined) ?? "unknown";
  const traceId = (res.locals["traceId"] as string | undefined) ?? requestId;
  const spanId = (res.locals["spanId"] as string | undefined) ?? "";

  if (err instanceof HttpError) {
    // 5xx raised as an HttpError is still a server fault and still needs a log
    // line — previously nothing logged it, because the handler that did was
    // unreachable. Client-side 4xx stay unlogged, as before.
    if (err.status >= 500) {
      logError(err, {
        ...contextFromRequest(req),
        requestId,
        traceId,
        spanId,
        statusCode: err.status,
      });
    }
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        requestId,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }
  // Security: never echo raw error text (it can leak SQL/stack internals). Log
  // structured detail server-side; return a generic message to the client.
  //
  // The correlation fields are passed explicitly rather than left to
  // contextFromRequest. That helper reads `req.id` and the `x-trace-id` /
  // `x-span-id` REQUEST headers — none of which this application ever sets.
  // requestIdMiddleware writes to `res.locals` and emits `traceparent` /
  // `x-request-id` RESPONSE headers instead, so contextFromRequest has been
  // returning `requestId: undefined` and empty trace/span ids on every 500 ever
  // logged. errorMiddleware is its only call site, so overriding here fixes it
  // completely; the helper's own signature is left alone rather than changed
  // for a single caller.
  logError(err, { ...contextFromRequest(req), requestId, traceId, spanId, statusCode: 500 });
  res.status(500).json({ error: { code: "internal", message: "internal error", requestId } });
}
