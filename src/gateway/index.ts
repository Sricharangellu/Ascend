/**
 * Gateway seam — all cross-cutting middleware for the Finder POS modular monolith.
 *
 * Mounting order in app.ts:
 *   1. requestIdMiddleware       — assign requestId + W3C traceparent
 *   2. rateLimitMiddleware()     — token-bucket per IP (Wave 0: simple, Wave 2: Redis+tiers)
 *   3. authMiddleware            — verify JWT, populate res.locals.auth
 *   4. tenantResolver            — record tenant context (DB SET LOCAL happens in service layer)
 *   --- your route handlers ---
 *   5. errorEnvelopeMiddleware   — { error: { code, message, requestId } } envelope
 */
export { requestIdMiddleware } from "./requestId.js";
export { rateLimitMiddleware } from "./rateLimit.js";
export { authMiddleware, tenantResolver } from "./auth.js";
export { errorEnvelopeMiddleware } from "./errorEnvelope.js";
export type { AuthPayload } from "./auth.js";
