import { Redis } from "ioredis";

/**
 * Minimal interface that our rate-limit store needs from a Redis client.
 * Keeps the gateway layer decoupled from the full ioredis API.
 */
export interface RedisClient {
  eval(script: string, numkeys: number, ...rest: string[]): Promise<unknown>;
  quit(): Promise<string>;
}

/**
 * Open a Redis connection from REDIS_URL (or the supplied url).
 * Returns null when no URL is configured so callers can fall back to
 * in-memory implementations — keeps dev/test zero-config.
 */
export function openRedis(url?: string): RedisClient | null {
  const redisUrl = url ?? process.env.REDIS_URL;
  if (!redisUrl) return null;

  const client = new Redis(redisUrl, {
    lazyConnect: false,
    enableReadyCheck: false,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 2000)),
  });

  client.on("error", (err) => {
    // Log but don't crash — rate limiting degrades gracefully.
    console.error("[redis] connection error:", (err as Error).message);
  });

  return client;
}
