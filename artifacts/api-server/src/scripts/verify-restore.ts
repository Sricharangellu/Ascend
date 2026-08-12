/**
 * verify-restore — backup/restore smoke test.
 *
 * Proves the recovery procedure actually works before a real emergency:
 *   1. Runs the real backup job (same pg_dump flags production uses) against
 *      DATABASE_URL, writing the dump to a temp directory.
 *   2. Parses the dump itself into an inventory (tables + COPY row counts).
 *      Expectations come from the dump, NOT from live queries, so concurrent
 *      writes on an active database can never cause false failures.
 *   3. Restores the dump into a freshly created scratch database (the live
 *      database is never touched) with ON_ERROR_STOP=on — any SQL error in
 *      restored tables, indexes, constraints, sequences, or functions fails
 *      the verification. (Strict mode is safe here because the scratch DB is
 *      fresh and the dump uses --if-exists; the production restore.sh keeps
 *      lenient mode for restoring into non-empty databases.)
 *   4. Verifies the restored database matches the dump inventory: identical
 *      table set, and row counts equal to the dump's COPY counts for the
 *      critical tables (tenants, users, orders, products).
 *   5. Drops the scratch database (always, also on failure).
 *
 * Exit codes: 0 = verified (or explicitly SKIPPED when DATABASE_URL is not
 * set, e.g. in environments without a database); 1 = verification failed.
 *
 * Usage:
 *   pnpm --filter @workspace/api-server db:verify-restore
 */

import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { dbBackupJob } from "../orchestration/jobs/db-backup.job.js";
import type { JobRow } from "../orchestration/types.js";
import { parseDumpInventory, compareInventory } from "../shared/restore-verify.js";

const CRITICAL_TABLES = ["tenants", "users", "orders", "products"] as const;

function log(message: string): void {
  console.log(`[verify-restore] ${message}`);
}

/**
 * Verification failure. Thrown (never process.exit) so the cleanup `finally`
 * blocks in main() always run — the scratch database and temp dump directory
 * must be removed even when verification fails. The outermost catch is the
 * only place that exits the process.
 */
class VerificationError extends Error {}

function fail(message: string): never {
  throw new VerificationError(message);
}

/**
 * Run psql in STRICT mode (ON_ERROR_STOP=on), feeding the dump on stdin.
 * Any SQL error aborts the restore and rejects — exported via scripts so the
 * strictness itself is covered by tests (see restore-verify.psql.test.ts).
 */
export function runStrictPsqlRestore(dbUrl: string, dumpFile: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn(
      "psql",
      ["--set=ON_ERROR_STOP=on", "--quiet", "--no-psqlrc", dbUrl],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    const errChunks: Buffer[] = [];
    proc.stderr.on("data", (c: Buffer) => errChunks.push(c));
    // When ON_ERROR_STOP=on aborts psql mid-stream, further writes to its
    // stdin raise EPIPE. That is expected — the close handler reports the
    // real failure (exit code + stderr); never let EPIPE crash the process.
    proc.stdin.on("error", () => {});
    const rs = createReadStream(dumpFile);
    rs.on("error", (err) => {
      proc.kill();
      reject(new Error(`failed to read dump file: ${err.message}`));
    });
    rs.pipe(proc.stdin);
    proc.on("error", (err) => reject(new Error(`psql process error: ${err.message}`)));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `psql exited ${code} — restore produced SQL errors: ` +
              Buffer.concat(errChunks).toString("utf8").slice(0, 800),
          ),
        );
      } else {
        resolvePromise();
      }
    });
  });
}

/** Replace the database name in a Postgres connection URL. */
export function withDatabase(dbUrl: string, dbName: string): string {
  const url = new URL(dbUrl);
  url.pathname = `/${dbName}`;
  return url.toString();
}

async function listPublicTables(client: pg.Client): Promise<string[]> {
  const res = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );
  return res.rows.map((r) => r.table_name);
}

async function main(): Promise<void> {
  const dbUrl = process.env["DATABASE_URL"];
  if (!dbUrl) {
    // Explicit, loud skip — some environments (pure-frontend CI) have no DB.
    console.log(
      "[verify-restore] SKIPPED: DATABASE_URL is not set — no database to verify against.",
    );
    return;
  }

  const tmpDir = await mkdtemp(join(tmpdir(), "verify-restore-"));
  const scratchDb = `ascend_restore_verify_${Date.now()}`;
  const admin = new pg.Client({ connectionString: dbUrl });
  await admin.connect();

  let scratchCreated = false;
  try {
    // ── 1. Run the real backup job into a temp dir ───────────────────────
    const envBackup = {
      dir: process.env["BACKUP_DIR"],
      bucket: process.env["BACKUP_S3_BUCKET"],
      enabled: process.env["BACKUP_ENABLED"],
    };
    process.env["BACKUP_DIR"] = tmpDir;
    delete process.env["BACKUP_S3_BUCKET"]; // no remote upload during verification
    delete process.env["BACKUP_ENABLED"];
    let dumpFile: string;
    try {
      const result = await dbBackupJob({} as JobRow);
      if (!result.file) fail("backup job did not produce a dump file");
      dumpFile = join(tmpDir, result.file);
    } finally {
      if (envBackup.dir !== undefined) process.env["BACKUP_DIR"] = envBackup.dir;
      else delete process.env["BACKUP_DIR"];
      if (envBackup.bucket !== undefined) process.env["BACKUP_S3_BUCKET"] = envBackup.bucket;
      if (envBackup.enabled !== undefined) process.env["BACKUP_ENABLED"] = envBackup.enabled;
    }
    const dumpSize = (await stat(dumpFile)).size;
    if (dumpSize === 0) fail("dump file is empty");
    log(`dump created: ${dumpFile} (${(dumpSize / 1024).toFixed(1)} KB)`);

    // ── 2. Parse expectations out of the dump itself ─────────────────────
    const inventory = await parseDumpInventory(dumpFile);
    if (inventory.tables.size === 0) fail("dump contains no CREATE TABLE statements");
    log(
      `dump inventory: ${inventory.tables.size} tables; ` +
        CRITICAL_TABLES.map((t) => `${t}=${inventory.counts.get(t) ?? "?"}`).join(", "),
    );

    // ── 3. Restore into a fresh scratch database (strict mode) ───────────
    await admin.query(`CREATE DATABASE "${scratchDb}"`);
    scratchCreated = true;
    log(`scratch database created: ${scratchDb}`);
    await runStrictPsqlRestore(withDatabase(dbUrl, scratchDb), dumpFile);
    log("restore completed with zero SQL errors (ON_ERROR_STOP=on)");

    // ── 4. Verify restored state against the dump inventory ──────────────
    const restored = new pg.Client({ connectionString: withDatabase(dbUrl, scratchDb) });
    await restored.connect();
    try {
      const restoredTables = await listPublicTables(restored);
      const restoredCounts = new Map<string, number>();
      for (const t of CRITICAL_TABLES) {
        if (!restoredTables.includes(t)) continue; // reported as missing_table/critical below
        const res = await restored.query(`SELECT count(*)::int AS n FROM "${t}"`);
        restoredCounts.set(t, res.rows[0].n as number);
      }

      const problems = compareInventory(
        inventory,
        restoredTables,
        restoredCounts,
        CRITICAL_TABLES,
      );
      if (problems.length > 0) {
        fail(
          `${problems.length} problem(s):\n` +
            problems.map((p) => `  - [${p.kind}] ${p.detail}`).join("\n"),
        );
      }

      log(
        `verified: all ${inventory.tables.size} tables restored; critical row counts match dump ` +
          `(${CRITICAL_TABLES.map((t) => `${t}=${restoredCounts.get(t)}`).join(", ")})`,
      );
      console.log("[verify-restore] PASSED — backups are restorable.");
    } finally {
      await restored.end();
    }
  } finally {
    // ── Cleanup: drop scratch DB and temp dump ───────────────────────────
    if (scratchCreated) {
      try {
        await admin.query(`DROP DATABASE IF EXISTS "${scratchDb}" WITH (FORCE)`);
        log(`scratch database dropped: ${scratchDb}`);
      } catch (err) {
        console.error(
          `[verify-restore] WARNING: failed to drop scratch database ${scratchDb}: ` +
            `${err instanceof Error ? err.message : String(err)} — drop it manually.`,
        );
      }
    }
    await admin.end();
    await rm(tmpDir, { recursive: true, force: true });
  }
}

// Only execute when run as a script (allows importing runStrictPsqlRestore in tests).
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(
      `[verify-restore] FAILED: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  });
}
