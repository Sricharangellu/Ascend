"use client";

/**
 * INF-8: Offline Checkout Outbox — IndexedDB write-ahead queue.
 *
 * When the terminal is offline, capture requests are stored here and
 * replayed in order when connectivity resumes. Each item carries a
 * stable client-generated idempotency key so the backend deduplicates
 * replayed requests correctly even if the browser retries.
 *
 * Storage: IndexedDB (survives tab closes, larger than localStorage,
 * async — does not block the UI thread).
 *
 * Replay: triggered by the service worker's `sync` event
 * (tag: "checkout-replay") via `navigator.serviceWorker.ready`.
 * Falls back to a polling approach when Background Sync is not supported.
 */

const DB_NAME = "finder-pos-outbox";
const DB_VERSION = 1;
const STORE = "checkout_queue";

export interface OutboxItem {
  /** Client-generated idempotency key — passed as X-Idempotency-Key header on replay. */
  id: string;
  url: string;
  method: string;
  body: string; // JSON-serialised request body
  authToken: string | null; // access token at time of enqueue (may expire — SW will refresh)
  createdAt: number;
  retryCount: number;
  /** Human-readable label for the UI (e.g. "Order #1234 — $25.00 cash") */
  label: string;
}

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(db: IDBDatabase, id: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbGetAll<T>(db: IDBDatabase): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as T[]).sort((a: any, b: any) => a.createdAt - b.createdAt));
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, item: OutboxItem): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbCount(db: IDBDatabase): Promise<number> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Enqueue a payment capture for offline replay. Returns the item id. */
export async function enqueueCheckout(
  url: string,
  body: unknown,
  authToken: string | null,
  label: string,
): Promise<string> {
  const id = `outbox_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const item: OutboxItem = {
    id,
    url,
    method: "POST",
    body: JSON.stringify(body),
    authToken,
    createdAt: Date.now(),
    retryCount: 0,
    label,
  };
  const db = await openDb();
  await idbPut(db, item);
  db.close();
  return id;
}

/** All pending items in queue order (oldest first). */
export async function getOutbox(): Promise<OutboxItem[]> {
  const db = await openDb();
  const items = await idbGetAll<OutboxItem>(db);
  db.close();
  return items;
}

/** Number of pending items. */
export async function pendingCount(): Promise<number> {
  const db = await openDb();
  const n = await idbCount(db);
  db.close();
  return n;
}

/** Remove a successfully replayed item. */
export async function removeItem(id: string): Promise<void> {
  const db = await openDb();
  await idbDelete(db, id);
  db.close();
}

/** Increment retry count on an item that failed transiently. */
export async function incrementRetry(id: string): Promise<void> {
  const db = await openDb();
  const item = await idbGet<OutboxItem>(db, id);
  if (item) await idbPut(db, { ...item, retryCount: item.retryCount + 1 });
  db.close();
}

/** Clear entire outbox (test / hard reset). */
export async function clearOutbox(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  db.close();
}

/**
 * Request a Background Sync so the SW drains the outbox when online.
 * Falls back to immediate drain attempt if Background Sync API is unavailable.
 */
export async function requestSync(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    // Background Sync API — Chrome/Edge; not in Firefox/Safari
    if ("sync" in registration) {
      await (registration as unknown as { sync: { register(tag: string): Promise<void> } }).sync.register("checkout-replay");
    }
    // Always also post a message so the SW can try immediately if online
    registration.active?.postMessage({ type: "DRAIN_OUTBOX" });
  } catch {
    // Not critical — the SW will retry on next navigation or install
  }
}

/**
 * Drain the outbox from the main thread (fallback when Background Sync unavailable).
 * Replays each item in order, removes on 2xx, retries on network error,
 * removes on permanent 4xx (the backend has already rejected it).
 */
export async function drainOutboxMainThread(
  getToken: () => string | null,
): Promise<{ succeeded: number; failed: number }> {
  const items = await getOutbox();
  let succeeded = 0;
  let failed = 0;

  for (const item of items) {
    const token = getToken() ?? item.authToken;
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": item.id,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: item.body,
      });

      if (res.ok) {
        await removeItem(item.id);
        succeeded++;
      } else if (res.status >= 400 && res.status < 500) {
        // Permanent client error — don't retry, remove with failure log
        console.warn(`[outbox] permanent failure for ${item.id}: ${res.status}`);
        await removeItem(item.id);
        failed++;
      } else {
        // Server error — leave in queue for next attempt
        await incrementRetry(item.id);
      }
    } catch {
      // Network error — leave in queue
      await incrementRetry(item.id);
    }
  }

  return { succeeded, failed };
}
