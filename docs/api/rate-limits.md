# Rate limits

## Limits

| Endpoint group | Limit | Window |
|---|---|---|
| `POST /api/identity/login` | 10 requests | per minute per IP |
| `POST /api/identity/refresh` | 20 requests | per minute per IP |
| All other `/api/v1/*` endpoints | 300 requests | per minute per tenant |
| Stripe webhook (`/api/stripe/webhook`) | No limit | N/A (external caller) |

## Response headers

When a rate limit is approached or exceeded:

| Header | Description |
|---|---|
| `X-RateLimit-Limit` | Max requests in this window |
| `X-RateLimit-Remaining` | Remaining requests in current window |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |
| `Retry-After` | Seconds to wait (only on 429 response) |

## Handling 429

```javascript
if (response.status === 429) {
  const retryAfter = parseInt(response.headers["retry-after"] ?? "5", 10);
  await sleep(retryAfter * 1000);
  return retry(request);
}
```

## Backend implementation

Rate limits use Redis with an atomic Lua `INCR/PEXPIRE` script. If Redis is unavailable, limits fail open (requests are allowed through). The fallback prevents an infrastructure issue from taking down the API.

## Increasing limits

Enterprise tenants can request higher limits. Contact support with your use case and expected request volume.
