import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { buildApp } from "./app.js";

/**
 * Migration advisory lock — regression tests for a real CI flake.
 *
 * Symptom: a test that did nothing wrong failing with pg `57014 statement
 * timeout` at almost exactly 30 s (CI run 31138020800 attempt 1: 893/894, the
 * loser being settings.test.ts at 30014 ms; attempt 2 on a healthy runner
 * passed 894/894).
 *
 * Two causes, both covered below:
 *   1. the lock was database-wide, so 86 test files migrating 86 DISJOINT
 *      schemas all queued on one key;
 *   2. `pg_advisory_xact_lock` BLOCKS, and a blocking statement is charged
 *      against `statement_timeout`, so queuing time was indistinguishable from
 *      working time and surfaced as a query timeout naming an innocent test.
 *
 * Every test here holds the lock from a second, independent connection — the
 * same technique the inventory concurrency tests use — so they are
 * deterministic rather than timing-dependent.
 *
 * The narrowing is deliberately NOT applied to the default schema; a separate
 * test below pins that, because widening concurrency there would have been a
 * silent correctness regression rather than a speed-up.
 */

let __seq = 0;
const __schema = () => `mlock_${process.pid}_${Date.now().toString(36)}_${__seq++}`;

/** Same namespace + hash the implementation uses (kept in sync deliberately —
 *  if these drift, these tests stop testing the real lock and should fail). */
const MIGRATION_LOCK_NAMESPACE = 7381920;
function schemaLockKey(schema: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < schema.length; i++) {
    h ^= schema.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}

/**
 * Open a standalone client and hold the migration lock for `schema`.
 *
 * Holds BOTH lock forms, and that detail is what makes the concurrency test
 * below a real regression test rather than a tautology:
 *
 *   - `pg_advisory_xact_lock(ns, key)` — the two-key form the implementation
 *     uses today, scoped to one schema.
 *   - `pg_advisory_xact_lock(ns)` — the single-key form the implementation used
 *     BEFORE this fix, which was global to the database.
 *
 * Postgres keeps the one-key and two-key advisory spaces entirely separate —
 * they never conflict with each other. So holding only the two-key form would
 * not block the old global lock at all, and the concurrency test would pass
 * against the very code it is supposed to catch (verified: it did). Holding
 * both means the test blocks a regression to the global key and stays honest
 * about the current one.
 */
async function holdMigrationLock(schema: string): Promise<() => Promise<void>> {
  const client = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  await client.query("BEGIN");
  const scoped = await client.query("SELECT pg_try_advisory_xact_lock($1, $2) AS locked", [
    MIGRATION_LOCK_NAMESPACE,
    schemaLockKey(schema),
  ]);
  assert.equal(scoped.rows[0].locked, true, "test setup: should have taken the schema-scoped lock");
  const legacy = await client.query("SELECT pg_try_advisory_xact_lock($1) AS locked", [
    MIGRATION_LOCK_NAMESPACE,
  ]);
  assert.equal(legacy.rows[0].locked, true, "test setup: should have taken the legacy global lock");
  return async () => {
    await client.query("ROLLBACK"); // xact-scoped locks release here
    await client.end();
  };
}

// ── Cause 1: the lock must not be broader than the invariant it protects ─────
// Migrations are schema-scoped DDL, so two DIFFERENT schemas can never collide.
// The helper holds the legacy global key too, so reverting to it makes this
// test block and fail — which is the whole flake, reproduced at 1× instead of
// the 86× concurrency that produced it in CI.
test("migrations on a different schema are not blocked by another schema's lock", async () => {
  const busy = __schema();
  const mine = __schema();
  const release = await holdMigrationLock(busy);
  try {
    // Deliberately tiny wait budget: if this ever queues at all, the test fails
    // fast and loudly instead of hiding behind a generous timeout.
    const prev = process.env["PG_MIGRATION_LOCK_WAIT_MS"];
    process.env["PG_MIGRATION_LOCK_WAIT_MS"] = "2000";
    try {
      const app = await buildApp({ schema: mine });
      await app.db.close();
    } finally {
      if (prev === undefined) delete process.env["PG_MIGRATION_LOCK_WAIT_MS"];
      else process.env["PG_MIGRATION_LOCK_WAIT_MS"] = prev;
    }
  } finally {
    await release();
  }
});

// ── The invariant itself still holds ────────────────────────────────────────
// Widening concurrency must not have weakened the guarantee: the SAME schema
// must still be mutually exclusive.
test("the same schema's migration lock is still exclusive", async () => {
  const schema = __schema();
  const release = await holdMigrationLock(schema);
  const probe = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
  try {
    await probe.connect();
    const res = await probe.query("SELECT pg_try_advisory_xact_lock($1, $2) AS locked", [
      MIGRATION_LOCK_NAMESPACE,
      schemaLockKey(schema),
    ]);
    assert.equal(res.rows[0].locked, false, "a second holder must not get the same schema's lock");
  } finally {
    await probe.end();
    await release();
  }
});

// ── Cause 2: a genuine wait must report itself, not masquerade as a query timeout ──
test("waiting out the migration lock fails with an explicit message, not a statement timeout", async () => {
  const schema = __schema();
  const release = await holdMigrationLock(schema);
  const prev = process.env["PG_MIGRATION_LOCK_WAIT_MS"];
  process.env["PG_MIGRATION_LOCK_WAIT_MS"] = "300";
  try {
    await assert.rejects(
      () => buildApp({ schema }),
      (err: Error) => {
        assert.match(err.message, /waiting for the migration lock/i, "must name the real cause");
        assert.match(err.message, new RegExp(schema), "must name the contended schema");
        // The bug being fixed: this used to surface as pg 57014 / "statement timeout",
        // which named an innocent query instead of the lock.
        assert.doesNotMatch(err.message, /statement timeout/i);
        return true;
      },
    );
  } finally {
    if (prev === undefined) delete process.env["PG_MIGRATION_LOCK_WAIT_MS"];
    else process.env["PG_MIGRATION_LOCK_WAIT_MS"] = prev;
    await release();
  }
});

// ── Backward compatibility: production must keep the historical single key ──
// Postgres never lets a one-key and a two-key advisory lock conflict. So if the
// default schema had moved to the two-key form along with everything else, a
// rolling deploy running one old instance and one new one would migrate the
// same schema concurrently — the exact race the lock exists to prevent, quietly
// un-serialised by a change meant to be safe.
//
// This test holds ONLY the legacy single key, so it can pass only while the
// default schema still contends on it.
//
// It is the one test here that names `public` rather than a throwaway schema —
// unavoidable, since that is the property under test. The blast radius is a
// bare `schema_migrations` table in the test database's `public` (buildApp
// creates it before reaching the lock, and the lock then refuses, so no module
// migration runs). Nothing else in the suite can see it: every other test opens
// its connection with `search_path` set to its own schema only.
test("the default schema still contends on the legacy single-key lock", async () => {
  const client = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  await client.query("BEGIN");
  const held = await client.query("SELECT pg_try_advisory_xact_lock($1) AS locked", [MIGRATION_LOCK_NAMESPACE]);
  assert.equal(held.rows[0].locked, true, "test setup: should have taken the legacy global lock");

  const prev = process.env["PG_MIGRATION_LOCK_WAIT_MS"];
  process.env["PG_MIGRATION_LOCK_WAIT_MS"] = "300";
  // If this ever regresses, buildApp resolves instead of rejecting and hands
  // back a live pool; hold it so the finally can close it rather than leaving
  // the test runner hanging on an open handle.
  let leaked: Awaited<ReturnType<typeof buildApp>> | undefined;
  try {
    await assert.rejects(
      async () => {
        leaked = await buildApp({ schema: "public" });
      },
      /waiting for the migration lock on schema "public"/i,
      "the default schema must still block on the historical single-key lock",
    );
  } finally {
    await leaked?.db.close();
    if (prev === undefined) delete process.env["PG_MIGRATION_LOCK_WAIT_MS"];
    else process.env["PG_MIGRATION_LOCK_WAIT_MS"] = prev;
    await client.query("ROLLBACK");
    await client.end();
  }
});

// ── The hash backing the second lock key ────────────────────────────────────
test("schema lock keys are stable, distinct, and inside int4 range", async () => {
  const a = schemaLockKey("public");
  assert.equal(a, schemaLockKey("public"), "same schema must map to the same key across processes");
  assert.notEqual(a, schemaLockKey("tenant_b"), "different schemas must not collide");
  for (const s of ["public", "test_1", "mlock_x", "", "a".repeat(200)]) {
    const k = schemaLockKey(s);
    assert.ok(Number.isInteger(k), `${s}: key must be an integer`);
    assert.ok(k >= -2147483648 && k <= 2147483647, `${s}: key must fit pg int4`);
  }
});
