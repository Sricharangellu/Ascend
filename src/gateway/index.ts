/**
 * Gateway seam — all cross-cutting middleware for the Ascend modular monolith.
 *
 * Mounting order in app.ts:
 *   1. requestIdMiddleware       — assign requestId + W3C traceparent
 *   2. metricsMiddleware         — RED metrics per route (exposed at /metrics)
 *   2b. accessLogMiddleware      — one structured log line per completed request
 *   3. rateLimitMiddleware()     — token-bucket per IP (Wave 0: simple, Wave 2: Redis+tiers)
 *   4. authMiddleware            — verify JWT, populate res.locals.auth
 *   5. tenantResolver            — record tenant context (DB SET LOCAL happens in service layer)
 *   --- your route handlers ---
 *   6. errorMiddleware           — { error: { code, message, requestId } } envelope
 *                                  (src/shared/http.ts, mounted last in app.ts)
 *
 * Layer 6 lived here as `errorEnvelopeMiddleware` until 2026-08-10 and was
 * unreachable the whole time — `errorMiddleware` is mounted ahead of it and
 * always responds, so this comment described a layer that never ran. The
 * envelope's behaviour now lives in `errorMiddleware` itself; the file was
 * deleted rather than left exported, so this list cannot drift again.
 */
export { requestIdMiddleware } from "./requestId.js";
export type { RedisClient } from "../shared/redis.js";
export { rateLimitMiddleware, tenantRateLimitMiddleware, RATE_TIERS } from "./rateLimit.js";
export type { TierLimit, TenantRateLimitOptions } from "./rateLimit.js";
export { authMiddleware, makeAuthMiddleware, tenantResolver, requireRole, requireScope, requirePlan, requireCapability, requireModule } from "./auth.js";
export { accessLogMiddleware } from "./accessLog.js";
export { metricsMiddleware, renderMetrics, recordRequest, normalizePath, resetMetrics } from "./metrics.js";
export type { AuthPayload } from "./auth.js";
