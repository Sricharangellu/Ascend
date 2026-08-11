import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { buildApp } from "./app.js";

// ─── Migration advisory lock: contention must not surface as a query timeout ──
//
// `db.tx()` opens every transaction with `SET LOCAL statement_timeout`. The
// migration lock used to be taken with the *blocking* `pg_advisory_xact_lock`,
// which is a single statement — so the wait for the lock was itself subject to
// that timeout and Postgres aborted it with SQLSTATE 57014, "canceling
// statement due to statement timeout". A boot that was merely queued behind
// another instance failed as though a query had hung.
//
// Real occurrence: CI run 31138020800 attempt 1 failed 893/894, the loser being
// settings.test.ts "get and update feature flags" at exactly 30014ms with code
// 57014. The backend suite builds a fresh schema at 123 call sites across 86
// files, all serialized on this one global lock, so the victim is arbitrary.

const MIGRATION_LOCK_KEY = 7381920;

let __seq = 0;
const __schema = () => `miglock_${process.pid}_${Date.now().toString(36)}_${__seq++}`;

/**
 * Holds the migration advisory lock on an independent connection — exactly what
 * a concurrent app instance mid-migration looks like to the booting one.
 * Resolves to a release function that ends the transaction and the client.
 *
 * This *waits* for the lock rather than try-once. The whole suite boots a fresh
 * schema at 123 call sites, so the lock is genuinely contended while these tests
 * run — a try-once acquire fails outright whenever another file happens to be
 * migrating, which is most of the time.
 */
async function holdMigrationLock(): Promise<() => Promise<void>> {
  const client = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  await client.query("BEGIN");
  // Bounded so a genuine deadlock fails the test instead of hanging the suite.
  await client.query("SET LOCAL statement_timeout = 120000");
  await client.query("SELECT pg_advisory_xact_lock($1)", [MIGRATION_LOCK_KEY]);
  return async () => {
    await client.query("COMMIT");
    await client.end();
  };
}

test("boot survives lock contention that outlasts the transaction statement timeout", async () => {
  const release = await holdMigrationLock();
  // Comfortably below the hold duration set further down, so the old blocking
  // implementation aborts the wait with 57014 and the boot dies — but still
  // comfortably ABOVE what any single migration needs. Both bounds matter:
  // each module migration is sent as one whole-file batch and is therefore a
  // single statement under this same timeout, so a value chosen only to be
  // small (800ms was the first attempt) starves the migrations instead of the
  // wait, and the test then fails for the wrong reason. A whole fresh-schema
  // boot measures ~1.9s end to end here, so 4s per statement is ample headroom.
  const prevTxTimeout = process.env["PG_TX_TIMEOUT_MS"];
  process.env["PG_TX_TIMEOUT_MS"] = "4000";
  let released = false;

  try {
    // Settle handlers are attached synchronously. The boot is expected to still
    // be waiting during the sleep below, but if it fails early (which is exactly
    // what the old blocking implementation does, at the statement timeout) the
    // rejection must be captured here — a floating promise would surface as an
    // unhandled rejection that wedges the test runner instead of failing.
    const booting = buildApp({ schema: __schema() }).then(
      (app) => ({ ok: true as const, app }),
      (err: Error) => ({ ok: false as const, err }),
    );
    // Hold past the statement timeout, then let the boot through. Kept as short
    // as the margin allows: this blocks every other test file's boot for the
    // duration, since they all queue on this same global lock.
    await new Promise((r) => setTimeout(r, 6000));
    released = true;
    await release();

    const result = await booting;
    assert.ok(
      result.ok,
      `the app must finish booting once the lock is released, but it failed with: ${result.ok ? "" : result.err.message}`,
    );

    // The migrations really ran under the lock — not skipped, not half-applied.
    const row = await result.app.db.one<{ n: number }>("SELECT COUNT(*)::int AS n FROM schema_migrations");
    assert.ok((row?.n ?? 0) > 0, "migrations must have been recorded after acquiring the lock");
  } finally {
    if (!released) await release();
    if (prevTxTimeout === undefined) delete process.env["PG_TX_TIMEOUT_MS"];
    else process.env["PG_TX_TIMEOUT_MS"] = prevTxTimeout;
  }
});

test("an unobtainable migration lock fails with a named cause, not a statement timeout", async () => {
  const release = await holdMigrationLock();
  const prevWait = process.env["PG_MIGRATION_LOCK_WAIT_MS"];
  process.env["PG_MIGRATION_LOCK_WAIT_MS"] = "300";

  try {
    await assert.rejects(
      () => buildApp({ schema: __schema() }),
      (err: Error) => {
        // The point of the change: the operator is told the lock is contended,
        // rather than being handed an unrelated-looking query timeout.
        assert.match(err.message, /migration lock 7381920 not acquired/);
        assert.match(err.message, /PG_MIGRATION_LOCK_WAIT_MS/);
        assert.doesNotMatch(err.message, /statement timeout/i);
        return true;
      },
    );
  } finally {
    if (prevWait === undefined) delete process.env["PG_MIGRATION_LOCK_WAIT_MS"];
    else process.env["PG_MIGRATION_LOCK_WAIT_MS"] = prevWait;
    await release();
  }
});
