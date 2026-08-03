# Audit — Connectivity / API breaks / Rate limiting

Date: 2026-08-03T02:13:00Z
Branch: `cursor/audit-connectivity-rate-limit-57b8` (from `develop`)
Status labels use the AGENTS.md vocabulary.

## Scope

Code-verified audit of gaps and bugs in three areas Sri named:

1. Connectivity (offline outbox / network failure surfacing)
2. API breaks (FE↔BE contract drift, client error handling)
3. Rate limiting (gateway, docs, CI, client Retry-After)

## What was already healthy (`built_verified`)

| Area | Evidence |
|---|---|
| FE↔BE gap scan | `npm run gap:scan` → 456 backend / 381 frontend paths, 21 allowlisted, 0 unexplained gaps |
| Identity rate-limit e2e flake | Already fixed (`IDENTITY_RATE_LIMIT_*` env overrides + CI e2e env) — see `docs/architecture/PIPELINE.md` |
| Redis sliding-window limiter | `src/gateway/rateLimit.ts` + tests; fail-open on Redis errors |
| Circuit breaker around Stripe / Anthropic | `src/shared/circuit-breaker.ts` wired in payments + AI (429 already treated as breaker failure for Anthropic) |
| Broken `/inventory/transfers` redirect | Already fixed earlier → `/inventory?tab=transfers` |

## Bugs found and fixed this pass

| # | Bug | Severity | Fix |
|---|---|---|---|
| 1 | Offline outbox + service worker treated **429 (and 408)** as permanent 4xx and **deleted queued checkouts** | Critical (silent sale loss under throttle) | `isTransientClientStatus()`; keep item queued in `offlineOutbox.ts` + `sw.js` |
| 2 | Web API client had **no 429 Retry-After handling** (docs promised it) | High (login/API blips surface as hard failures) | One automatic wait+retry in `apiFetch` / `apiDownload`; expose `retryAfterSec` on `ApiResponseError` |
| 3 | Fetch network failures threw raw `TypeError` | Medium (callers couldn't treat connectivity uniformly) | Wrap as `ApiResponseError("network_error", …, status: 0)` |
| 4 | SSO public handshake limiter **not env-overridable** (same class as the identity e2e flake) | Medium (CI/single-IP risk) | `SSO_RATE_LIMIT_CAPACITY` / `_REFILL` in `src/app.ts`; set generously in e2e CI job |
| 5 | Register limiter also missing from e2e CI env | Low | `IDENTITY_REGISTER_RATE_*` in e2e job |
| 6 | IP limiter omitted `X-RateLimit-*` headers; `Retry-After` could become `Infinity` when `refillRate=0` | Medium (client/docs mismatch; bad header) | Emit Limit/Remaining; finite Retry-After fallback |
| 7 | `docs/api/rate-limits.md` described wrong limits, phantom `X-RateLimit-Reset`, and wrong Redis algo | Docs drift | Rewrote to match code |

## Still open (not code-fixed here — NEEDS-SRI / larger scope)

| Item | Status | Why not fixed here |
|---|---|---|
| Allowlisted Preview API prefixes (golf/pricing/warehouse/documents/promotions) | `mocked` / intentional | Product Preview surfaces — not connectivity bugs |
| Inventory pipeline receiving/issues/errors + catalog credits | `missing` / NEEDS-SRI | Product decisions, not wiring |
| Custom-roles contract mismatch | `partial` / NEEDS-SRI | FE↔BE model disagreement |
| Production heartbeat probing dead URLs | Ops / NEEDS-SRI | `docs/architecture/DEPLOYMENTS.md` P0 |
| In-memory rate limits without `REDIS_URL` across replicas | Known prod warning in `src/app.ts` | Infra config, not a code bug |

## Verification plan

- `node tools/hygiene-check.mjs`
- `npm run gap:scan`
- Backend: `npx tsx --test src/gateway/rateLimit.test.ts` (+ typecheck)
- Frontend: `vitest` on `web/tests/api-client.test.ts` + web typecheck/lint
