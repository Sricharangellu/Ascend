/**
 * app.migration-lock.test.ts — migration advisory-lock wait vs statement_timeout
 * (backlog: "the backend suite's 30s statement timeout covers an unbounded
 * migration-lock WAIT").
 *
 * buildApp() runs migrations inside db.tx(), which sets `statement_timeout`
 * for the whole transaction at BEGIN. The transaction's first statement is
 * the *blocking* `pg_advisory_xact_lock(7381920)` — so time spent queueing
 * for that lock was charged against the same budget as real migration work.
 * Under contention (many processes racing to migrate a shared Postgres, e.g.
 * this repo's ~86 test files), a wait that legitimately outlasts the timeout
 * was killed as a bogus "statement timeout" (pg code 57014).
 *
 * Reproduced deterministically: a second connection grabs the same advisory
 * lock and holds it well past a (deliberately tiny) PG_TX_TIMEOUT_MS before
 * releasing. With the fix, buildApp() simply waits and then completes; without
 * it, buildApp() rejects with a statement_timeout error before the lock is
 * ever released.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { buildApp } from "./app.js";

const { Pool } = pg;

let __seq = 0;
const __schema = () => `miglock_${process.pid}_${Date.now().toString(36)}_${__seq++}`;

test("buildApp() migration lock wait is not killed by statement_timeout under contention", async () => {
  const schema = __schema();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const holder = await pool.connect();

  process.env["PG_TX_TIMEOUT_MS"] = "300"; // tiny on purpose — must not bound the lock wait
  try {
    // holder grabs the lock first and sits on it for 600ms (> the 300ms budget)
    // before releasing, on an otherwise-idle transaction (idle time between
    // statements isn't bounded by statement_timeout, only statement runtime is).
    await holder.query("BEGIN");
    await holder.query("SELECT pg_advisory_xact_lock(7381920)");

    const held = new Promise<void>((resolve) => setTimeout(resolve, 600));
    const releaseAfterHold = held.then(() => holder.query("COMMIT"));

    try {
      // buildApp() must block behind holder's lock, then succeed once it's
      // released — not fail with a statement_timeout while merely waiting.
      const app = await buildApp({ schema });

      const migrated = await app.db.query<{ hash: string }>(
        `SELECT hash FROM "${schema}".schema_migrations LIMIT 1`,
      );
      assert.ok(migrated.length > 0, "migrations must have actually run after the lock was acquired");

      await app.db.close();
    } finally {
      await releaseAfterHold.catch(() => {}); // don't let holder's own COMMIT leak past this test
    }
  } finally {
    delete process.env["PG_TX_TIMEOUT_MS"];
    holder.release();
    await pool.end();
  }
});
