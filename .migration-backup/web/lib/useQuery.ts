"use client";

/**
 * useQuery — stale-while-revalidate data fetching hook.
 *
 * Features:
 * - Module-level in-memory cache: navigating away and back shows cached data
 *   instantly while a fresh fetch runs in the background.
 * - Deduplication: concurrent callers with the same key share one in-flight request.
 * - TTL: cached data older than `staleMs` (default 30s) triggers a background revalidation.
 * - Cache is keyed by the `key` string; pass a stable key (include query params).
 */

import { useState, useEffect, useRef, useCallback } from "react";

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

interface InFlight {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  promise: Promise<any>;
}

// Module-level caches — survive component unmount/remount.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cache = new Map<string, CacheEntry<any>>();
const inFlight = new Map<string, InFlight>();

function getCached<T>(key: string): T | undefined {
  return cache.get(key)?.data as T | undefined;
}

function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, fetchedAt: Date.now() });
}

function isStale(key: string, staleMs: number): boolean {
  const entry = cache.get(key);
  if (!entry) return true;
  return Date.now() - entry.fetchedAt > staleMs;
}

export interface UseQueryOptions {
  /** Milliseconds before cached data is considered stale. Default 30 000. */
  staleMs?: number;
  /** If false, skip fetching (useful for conditional queries). Default true. */
  enabled?: boolean;
}

export interface UseQueryResult<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  /** Call to manually invalidate the cache and re-fetch. */
  invalidate: () => void;
}

/**
 * useQuery<T>(key, fetcher, options)
 *
 * @param key     Stable cache key string (include all relevant params).
 * @param fetcher Async function that returns T. Must be stable (wrap in useCallback or
 *                define outside the component, or pass deps via key).
 * @param options Optional staleMs, enabled.
 */
export function useQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: UseQueryOptions = {},
): UseQueryResult<T> {
  const { staleMs = 30_000, enabled = true } = options;

  const [data, setData] = useState<T | undefined>(() => getCached<T>(key));
  const [loading, setLoading] = useState<boolean>(!getCached<T>(key) && enabled);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(
    (background: boolean) => {
      if (!background) setLoading(true);
      setError(null);

      let req = inFlight.get(key);
      if (!req) {
        const p = fetcherRef.current();
        req = { promise: p };
        inFlight.set(key, req);
        p.then(
          (result) => {
            setCached(key, result);
            inFlight.delete(key);
          },
          () => {
            inFlight.delete(key);
          },
        );
      }

      void req.promise.then(
        (result: T) => {
          setData(result);
          setLoading(false);
        },
        (err: unknown) => {
          setError(err instanceof Error ? err.message : "Request failed");
          setLoading(false);
        },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  useEffect(() => {
    if (!enabled) return;

    const cached = getCached<T>(key);
    if (cached !== undefined) {
      setData(cached);
      setLoading(false);
      if (isStale(key, staleMs)) {
        run(true); // background revalidation
      }
    } else {
      run(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, staleMs, run, revision]);

  const invalidate = useCallback(() => {
    cache.delete(key);
    setRevision((r) => r + 1);
  }, [key]);

  return { data, loading, error, invalidate };
}

/** Imperatively invalidate a cache key from outside a component (e.g. after a mutation). */
export function invalidateQuery(key: string): void {
  cache.delete(key);
}

/** Invalidate all keys matching a prefix. */
export function invalidateQueryPrefix(prefix: string): void {
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}
