import type { Request, Response, NextFunction } from "express";
import { v7 as uuidv7 } from "uuid";

/**
 * Assigns a unique request-id to every incoming request and propagates
 * W3C Trace-Context headers (traceparent/tracestate) so distributed traces
 * compose across services. The requestId is stored on `res.locals` so
 * subsequent middleware (auth, error-envelope) can reference it without
 * passing it explicitly.
 *
 * W3C Trace-Context spec: https://www.w3.org/TR/trace-context/
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Accept an upstream traceparent or generate a new one.
  const incoming = req.headers["traceparent"];
  const requestId = uuidv7();

  // Propagate / generate a traceparent header.
  // Format: 00-<traceId>-<spanId>-<flags>
  // We use the requestId (uuid v7 → 128 bits, drop dashes) as the trace-id
  // and generate a fresh span-id (64 bits).
  const traceId = incoming
    ? String(incoming).split("-")[1] ?? requestId.replace(/-/g, "")
    : requestId.replace(/-/g, "");

  const spanId = uuidv7().replace(/-/g, "").slice(0, 16);
  const traceparent = `00-${traceId}-${spanId}-01`;

  res.setHeader("traceparent", traceparent);
  res.setHeader("x-request-id", requestId);

  res.locals["requestId"] = requestId;
  res.locals["traceId"] = traceId;
  res.locals["spanId"] = spanId;

  next();
}
