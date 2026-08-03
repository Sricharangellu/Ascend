# Rate limits

## Limits

| Endpoint group | Limit | Notes |
|---|---|---|
| Global (all routes) | 120 burst, 40 tokens/sec per IP | Applied first; Redis sliding window when `REDIS_URL` is set, otherwise in-memory token bucket |
| `POST /api/identity/login` (+ other `/api/identity/*`) | 10 burst, 0.33 tokens/sec per IP | Brute-force guard. Override via `IDENTITY_RATE_LIMIT_CAPACITY` / `IDENTITY_RATE_LIMIT_REFILL` |
| `POST /api/identity/register` | 5 burst, 0.05 tokens/sec per IP | Extra-tight. Override via `IDENTITY_REGISTER_RATE_CAPACITY` / `IDENTITY_REGISTER_RATE_REFILL` |
| Public SSO handshake (`/api/v1/sso/*` pre-auth) | 10 burst, 0.33 tokens/sec per IP | Same posture as identity login. Override via `SSO_RATE_LIMIT_CAPACITY` / `SSO_RATE_LIMIT_REFILL` |
| Authenticated `/api/v1/*` | Per-tenant tier (see below) | Applied after auth; isolated per `tenant_id` |
| Stripe webhook (`/api/stripe/webhook`) | No dedicated limit | Relies on Stripe's signed delivery |

### Tenant tiers (`tenantRateLimitMiddleware`)

| Tier | Burst capacity | Sustained tokens/sec |
|---|---|---|
| `standard` (default) | 60 | 10 (~600 req/min) |
| `premium` | 200 | 50 (~3k req/min) |
| `enterprise` | 600 | 200 (~12k req/min) |

## Response headers

| Header | Description |
|---|---|
| `X-RateLimit-Limit` | Burst capacity for the active limiter |
| `X-RateLimit-Remaining` | Remaining tokens/window slots after this request (0 on 429) |
| `X-RateLimit-Tier` | Tenant tier name (`standard` / `premium` / `enterprise`) — tenant limiter only |
| `Retry-After` | Seconds to wait (only on 429 response) |

## Handling 429

The web API client (`web/api-client/client.ts`) automatically waits for
`Retry-After` (capped at 10s) and retries **once — but only when the
`Retry-After` header is present**. Gateway rate limits always set that header.
Identity `account_locked` is also HTTP 429 but **without** `Retry-After`; the
client surfaces it immediately (retrying a lockout is pointless).

```javascript
if (response.status === 429) {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter !== null) {
    await sleep(Math.min(Math.max(parseInt(retryAfter, 10) || 0, 0), 10) * 1000);
    return retry(request); // once
  }
  // No Retry-After → not a gateway rate limit (e.g. account_locked). Surface it.
}
```

Offline checkout outbox / service-worker replay treat 429 (and 408) as
**transient** — the item stays queued, and a 429 **stops the drain early** so
remaining items don't stampede the same exhausted bucket. Do not classify 429
as a permanent 4xx.

## Backend implementation

- **With `REDIS_URL`:** atomic Lua sliding-window counter (sorted set), shared
  across all instances.
- **Without Redis (dev / single instance):** in-memory token bucket. Limits are
  **not** shared across replicas — production should set `REDIS_URL`.
- **Redis errors fail open** (request allowed) so an infrastructure blip cannot
  take down the API.

## Increasing limits

Enterprise tenants can request a higher tier. Contact support with your use
case and expected request volume. CI / single-IP test suites should raise the
identity/SSO env overrides rather than weakening production defaults.
