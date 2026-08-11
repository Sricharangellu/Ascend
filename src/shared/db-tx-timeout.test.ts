import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb, migrationLockTimeoutMs, txTimeoutMs, type DB } from "./db.js";

/**
 * Regression suite for the migration advisory-lock timeout window.
 *
 * `db.tx()` sets `statement_timeout` on BEGIN so a runaway transaction cannot
 * hold locks indefinitely. `buildApp()` then takes `pg_advisory_xact_lock` as
 * the FIRST statement inside that transaction — and Postgres charges the time
 * spent *queuing* for a lock against the same per-statement budget as real
 * work. So the guard measured the wrong thing: an instance that had done
 * nothing but wait its turn was killed with `57014` as though it had run a
 * runaway query.
 *
 * It bites in the test suite, where 123 call sites across 86 files each build a
 * fresh schema and therefore serialize on one global lock. Seen live in CI run
 * 31138020800 (attempt 1: 893/894, `settings.test.ts` dying at exactly 30014 ms
 * while Postgres was checkpointing; attempt 2 on a healthy runner: 894/894) —
 * the signature of an environment-shaped flake, not a code defect.
 *
 * The fix brackets the wait: suspend the timeout, take the lock, restore it.
 * These tests pin all three halves of that — the wait survives, the restore
 * really happens, and the unbracketed shape really does fail (so this file
 * fails loudly if someone drops the bracket).
 *
 * Uses its own advisory-lock id, NOT app.ts's 7381920: taking the real one here
 * would block every concurrently-running test file that builds an app.
 */

const TEST_LOCK = 7381921;
const HOLD_MS = 1_200;
const TINY_TIMEOUT_MS = 300;

/** Two independent pools — one connection cannot both hold and contend a lock. */
function openPair(): { a: DB; b: DB } {
  return { a: openDb({ max: 2 }), b: openDb({ max: 2 }) };
}

/**
 * Hold TEST_LOCK inside a transaction until the returned `release` is called.
 * Resolves once the lock is actually held, so callers never race the barrier.
 */
async function holdLock(db: DB): Promise<{ release: () => void; done: Promise<void> }> {
  let acquired!: () => void;
  let release!: () => void;
  const isAcquired = new Promise<void>((r) => (acquired = r));
  const isReleased = new Promise<void>((r) => (release = r));

  const done = db.tx(async (tdb) => {
    await tdb.exec(`SELECT pg_advisory_xact_lock(${TEST_LOCK})`);
    acquired();
    await isReleased; // idle JS time — statement_timeout only runs during a statement
  });

  await isAcquired;
  return { release, done };
}

test("txTimeoutMs defaults to 30s and rejects values that would disable the guard", () => {
  assert.equal(txTimeoutMs({} as NodeJS.ProcessEnv), 30_000);
  assert.equal(txTimeoutMs({ PG_TX_TIMEOUT_MS: "5000" } as NodeJS.ProcessEnv), 5_000);
  assert.equal(txTimeoutMs({ PG_TX_TIMEOUT_MS: "1500.9" } as NodeJS.ProcessEnv), 1_500);
  // 0 would mean "no timeout" and negatives are nonsense — both fall back.
  assert.equal(txTimeoutMs({ PG_TX_TIMEOUT_MS: "0" } as NodeJS.ProcessEnv), 30_000);
  assert.equal(txTimeoutMs({ PG_TX_TIMEOUT_MS: "-1" } as NodeJS.ProcessEnv), 30_000);
  assert.equal(txTimeoutMs({ PG_TX_TIMEOUT_MS: "banana" } as NodeJS.ProcessEnv), 30_000);
});

test("migrationLockTimeoutMs defaults to 5 min and treats 0 as wait-forever", () => {
  assert.equal(migrationLockTimeoutMs({} as NodeJS.ProcessEnv), 300_000);
  assert.equal(migrationLockTimeoutMs({ PG_MIGRATION_LOCK_TIMEOUT_MS: "1000" } as NodeJS.ProcessEnv), 1_000);
  // Unlike PG_TX_TIMEOUT_MS, 0 is a legitimate setting here: wait indefinitely.
  assert.equal(migrationLockTimeoutMs({ PG_MIGRATION_LOCK_TIMEOUT_MS: "0" } as NodeJS.ProcessEnv), 0);
  assert.equal(migrationLockTimeoutMs({ PG_MIGRATION_LOCK_TIMEOUT_MS: "-5" } as NodeJS.ProcessEnv), 300_000);
  assert.equal(migrationLockTimeoutMs({ PG_MIGRATION_LOCK_TIMEOUT_MS: "banana" } as NodeJS.ProcessEnv), 300_000);
});

test("a wedged holder fails the waiter with 55P03, not a silent hang", async () => {
  const { a, b } = openPair();
  const { release, done } = await holdLock(a);

  try {
    // The whole point of using lock_timeout rather than just disabling
    // statement_timeout: the wait is bounded, and the error names the real
    // cause. 57014 here would mean we regressed to blaming the query.
    await assert.rejects(
      b.tx(async (tdb) => {
        await tdb.exec("SET LOCAL statement_timeout = 0");
        await tdb.exec("SET LOCAL lock_timeout = 400");
        await tdb.exec(`SELECT pg_advisory_xact_lock(${TEST_LOCK})`);
      }),
      (err: unknown) => {
        assert.equal(
          (err as { code?: string }).code,
          "55P03",
          `expected lock_timeout (55P03), got ${(err as { code?: string }).code ?? String(err)}`,
        );
        return true;
      },
    );
  } finally {
    release();
    await done;
    await Promise.all([a.close(), b.close()]);
  }
});

test("unbracketed advisory lock dies with 57014 when the wait outlasts statement_timeout", async () => {
  const { a, b } = openPair();
  const prior = process.env["PG_TX_TIMEOUT_MS"];
  process.env["PG_TX_TIMEOUT_MS"] = String(TINY_TIMEOUT_MS);
  const { release, done } = await holdLock(a);

  try {
    // This is the shape app.ts had before the fix: lock first, under the
    // transaction's statement_timeout. The waiter did nothing wrong and still dies.
    await assert.rejects(
      b.tx(async (tdb) => {
        await tdb.exec(`SELECT pg_advisory_xact_lock(${TEST_LOCK})`);
      }),
      (err: unknown) => {
        assert.equal((err as { code?: string }).code, "57014", `expected statement_timeout, got ${String(err)}`);
        return true;
      },
      "the pre-fix shape must still fail — otherwise this suite cannot catch a regression",
    );
  } finally {
    release();
    await done;
    if (prior === undefined) delete process.env["PG_TX_TIMEOUT_MS"];
    else process.env["PG_TX_TIMEOUT_MS"] = prior;
    await Promise.all([a.close(), b.close()]);
  }
});

test("bracketed advisory lock waits out the holder, then restores the timeout", async () => {
  const { a, b } = openPair();
  const prior = process.env["PG_TX_TIMEOUT_MS"];
  process.env["PG_TX_TIMEOUT_MS"] = String(TINY_TIMEOUT_MS);
  const { release, done } = await holdLock(a);

  try {
    const startedAt = Date.now();
    const waiter = b.tx(async (tdb) => {
      // Exactly the sequence app.ts now runs around its migration lock.
      await tdb.exec("SET LOCAL statement_timeout = 0");
      await tdb.exec(`SET LOCAL lock_timeout = ${migrationLockTimeoutMs()}`);
      await tdb.exec(`SELECT pg_advisory_xact_lock(${TEST_LOCK})`);
      await tdb.exec("SET LOCAL lock_timeout = 0");
      await tdb.exec(`SET LOCAL statement_timeout = ${txTimeoutMs()}`);

      // The restore must be real: with the timeout back at 300 ms, a 2 s
      // statement has to die. If this passes, the bracket leaked "no timeout"
      // into the migrations themselves and the runaway guard is gone.
      await assert.rejects(
        tdb.query("SELECT pg_sleep(2)"),
        (err: unknown) => (err as { code?: string }).code === "57014",
        "statement_timeout must be restored after the lock is acquired",
      );
      return "acquired";
    });

    // Hold well past the timeout, so an unbracketed waiter would already be dead.
    setTimeout(release, HOLD_MS);

    assert.equal(await waiter, "acquired");
    assert.ok(
      Date.now() - startedAt >= HOLD_MS,
      "waiter should have blocked for the full hold rather than returning early",
    );
  } finally {
    release();
    await done;
    if (prior === undefined) delete process.env["PG_TX_TIMEOUT_MS"];
    else process.env["PG_TX_TIMEOUT_MS"] = prior;
    await Promise.all([a.close(), b.close()]);
  }
});
