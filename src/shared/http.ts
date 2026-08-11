import type { Request, Response, NextFunction } from "express";
import { ZodError, type ZodSchema } from "zod";

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
 * NOTE — the error handler that used to live here was REMOVED on 2026-08-10.
 *
 * `errorMiddleware` was mounted in app.ts immediately before
 * `gateway/errorEnvelope.ts`, and because it always responded and never called
 * next(err), the envelope after it was unreachable. Two implementations of one
 * documented contract then drifted: this one carried `details` and answered
 * 500s with `internal`; the unreachable one carried neither, and neither
 * emitted the `requestId` that `docs/api/error-codes.md` tells callers to quote
 * to support. No error response this app ever returned carried one.
 *
 * There is now exactly one error handler — `errorEnvelopeMiddleware` in the
 * gateway, which is where a cross-cutting response shape belongs and which
 * absorbed everything this function did (the `details` passthrough, the
 * `internal` code, and the logError/Sentry hook). Do not add a second one:
 * whichever is mounted first wins, silently, and `gateway/errorEnvelope.test.ts`
 * is what fails when that happens.
 */
