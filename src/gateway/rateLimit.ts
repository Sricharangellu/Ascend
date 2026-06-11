import type { Request, Response, NextFunction } from "express";
import { HttpError } from "../shared/http.js";

/**
 * Simple in-memory token-bucket rate limiter.
 *
 * Each unique key (IP address by default, or tenant_id once auth runs)
 * gets a bucket that refills at `refillRate` tokens/second with a
 * maximum of `capacity` tokens. Each request costs 1 token.
 *
 * This is intentionally lightweight for Wave 0. Wave 2 upgrades to
 * Redis-backed sliding-window counters with per-tenant tier limits.
 */
export interface RateLimitOptions {
  /** Max tokens in the bucket (burst allowance). Default: 60. */
  capacity?: number;
  /** Tokens added per second (sustained RPS). Default: 20. */
  refillRate?: number;
  /** Key extractor function. Default: IP address. */
  keyFn?: (req: Request) => string;
}

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

export function rateLimitMiddleware(options: RateLimitOptions = {}) {
  const capacity = options.capacity ?? 60;
  const refillRate = options.refillRate ?? 20; // tokens/sec
  const keyFn = options.keyFn ?? ((req: Request) => {
    return (
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
      req.socket.remoteAddress ??
      "unknown"
    );
  });

  const buckets = new Map<string, Bucket>();

  // Purge stale buckets periodically to avoid unbounded memory growth.
  const purgeIntervalMs = 60_000;
  let lastPurgeMs = Date.now();

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();

    // Periodic cleanup — evict buckets that have been full for >5 minutes.
    if (now - lastPurgeMs > purgeIntervalMs) {
      for (const [key, bucket] of buckets) {
        const idleSec = (now - bucket.lastRefillMs) / 1000;
        if (bucket.tokens >= capacity && idleSec > 300) {
          buckets.delete(key);
        }
      }
      lastPurgeMs = now;
    }

    const key = keyFn(req);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { tokens: capacity, lastRefillMs: now };
      buckets.set(key, bucket);
    }

    // Refill based on elapsed time.
    const elapsedSec = (now - bucket.lastRefillMs) / 1000;
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * refillRate);
    bucket.lastRefillMs = now;

    if (bucket.tokens < 1) {
      const retryAfterSec = Math.ceil((1 - bucket.tokens) / refillRate);
      res.setHeader("Retry-After", String(retryAfterSec));
      next(new HttpError(429, "rate_limit_exceeded", "Too many requests — slow down."));
      return;
    }

    bucket.tokens -= 1;
    next();
  };
}
