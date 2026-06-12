import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { tenantRateLimitMiddleware, RATE_TIERS } from "./rateLimit.js";

// Minimal fake req/res to drive the middleware without HTTP.
function fakeReq(): Request {
  return { headers: {}, socket: { remoteAddress: "127.0.0.1" } } as unknown as Request;
}
function fakeRes(tenantId?: string): Response {
  const headers: Record<string, string> = {};
  return {
    locals: tenantId ? { auth: { tenantId } } : {},
    setHeader: (k: string, v: string) => { headers[k] = v; },
    getHeader: (k: string) => headers[k],
  } as unknown as Response;
}

/** Drive N requests through the middleware; return how many were allowed. */
function hit(mw: ReturnType<typeof tenantRateLimitMiddleware>, res: Response, n: number): number {
  let allowed = 0;
  for (let i = 0; i < n; i++) {
    let err: unknown = null;
    mw(fakeReq(), res, (e?: unknown) => { err = e; });
    if (!err) allowed++;
  }
  return allowed;
}

test("tenant limiter allows up to tier capacity then 429s", () => {
  const tiers = { standard: { capacity: 5, refillRate: 0 } }; // no refill within the test window
  const mw = tenantRateLimitMiddleware({ tiers });
  const res = fakeRes("tnt_a");
  const allowed = hit(mw, res, 8);
  assert.equal(allowed, 5, "exactly capacity requests allowed");
  assert.equal(res.getHeader("X-RateLimit-Tier"), "standard");
});

test("buckets are isolated per tenant", () => {
  const tiers = { standard: { capacity: 3, refillRate: 0 } };
  const mw = tenantRateLimitMiddleware({ tiers });
  const a = hit(mw, fakeRes("tnt_a"), 5); // a exhausts at 3
  const b = hit(mw, fakeRes("tnt_b"), 2); // b is independent
  assert.equal(a, 3);
  assert.equal(b, 2, "second tenant unaffected by the first's usage");
});

test("tierOf selects a higher tier with a larger budget", () => {
  const mw = tenantRateLimitMiddleware({
    tiers: { standard: { capacity: 2, refillRate: 0 }, enterprise: { capacity: 10, refillRate: 0 } },
    tierOf: (t) => (t === "tnt_big" ? "enterprise" : "standard"),
  });
  assert.equal(hit(mw, fakeRes("tnt_small"), 5), 2);
  assert.equal(hit(mw, fakeRes("tnt_big"), 5), 5);
});

test("RATE_TIERS exposes standard/premium/enterprise ascending", () => {
  assert.ok(RATE_TIERS.standard.capacity < RATE_TIERS.premium.capacity);
  assert.ok(RATE_TIERS.premium.capacity < RATE_TIERS.enterprise.capacity);
});
