/**
 * Daily database backup job.
 *
 * Runs pg_dump against DATABASE_URL and writes a timestamped .sql file to the
 * backups/ directory at the repo root. Old dumps are pruned automatically to
 * keep disk usage under control. The job re-enqueues itself 24 h in the
 * future so the daily schedule is maintained without a cron daemon.
 *
 * Only runs when BACKUP_ENABLED !== "false" and DATABASE_URL is set — exits
 * cleanly in test/demo environments where neither is expected to be present.
 *
 * Dump options match backup.sh: --no-owner --no-acl --clean --if-exists so
 * the SQL file is portable and can be restored into any Postgres user.
 */

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import { readdir, unlink, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { JobRow } from "../types.js";
import { moduleLogger } from "../../shared/logger.js";

const log = moduleLogger("db-backup");

/** Re-enqueue interval — once per day. */
export const DB_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** How many days of backup files to retain before pruning. */
const RETAIN_DAYS = Number(process.env["BACKUP_RETAIN_DAYS"] ?? 7);
const RETAIN_MS = RETAIN_DAYS * 24 * 60 * 60 * 1000;

/** Resolve the backups/ directory relative to the repo root. */
function backupDir(): string {
  const custom = process.env["BACKUP_DIR"];
  if (custom) return resolve(custom);
  // src/orchestration/jobs/ → ../../../../backups/ (repo root)
  const thisFile = fileURLToPath(import.meta.url);
  return resolve(thisFile, "../../../../..", "backups");
}

/** Run pg_dump, writing output to outFile. Resolves with bytes written. */
function runPgDump(dbUrl: string, outFile: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ws = createWriteStream(outFile);
    const proc = spawn(
      "pg_dump",
      ["--no-owner", "--no-acl", "--schema=public", "--clean", "--if-exists", dbUrl],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    proc.stdout.pipe(ws);

    const errChunks: Buffer[] = [];
    proc.stderr.on("data", (chunk: Buffer) => errChunks.push(chunk));

    proc.on("error", (err) => {
      ws.destroy();
      reject(new Error(`pg_dump process error: ${err.message}`));
    });

    ws.on("error", (err) => {
      proc.kill();
      reject(new Error(`Write stream error: ${err.message}`));
    });

    proc.on("close", (code) => {
      ws.end(() => {
        if (code !== 0) {
          const stderr = Buffer.concat(errChunks).toString("utf8").slice(0, 500);
          reject(new Error(`pg_dump exited ${code}: ${stderr}`));
        } else {
          resolve(ws.bytesWritten);
        }
      });
    });
  });
}

/** Delete dump files older than RETAIN_MS. */
async function pruneOldDumps(dir: string): Promise<number> {
  const cutoff = Date.now() - RETAIN_MS;
  let pruned = 0;
  try {
    const entries = await readdir(dir);
    for (const entry of entries) {
      if (!entry.startsWith("ascend-backup-") || !entry.endsWith(".sql")) continue;
      const full = join(dir, entry);
      const s = await stat(full);
      if (s.mtimeMs < cutoff) {
        await unlink(full);
        pruned++;
        log.info({ file: entry }, "pruned old backup");
      }
    }
  } catch {
    // Non-fatal — a missing or unreadable directory is fine on first run.
  }
  return pruned;
}

export async function dbBackupJob(_job: JobRow): Promise<{ file: string; bytes: number; pruned: number }> {
  const dbUrl = process.env["DATABASE_URL"];
  if (!dbUrl) {
    log.warn("DATABASE_URL not set — skipping backup");
    return { file: "", bytes: 0, pruned: 0 };
  }
  if (process.env["BACKUP_ENABLED"] === "false") {
    log.info("BACKUP_ENABLED=false — skipping backup");
    return { file: "", bytes: 0, pruned: 0 };
  }

  const dir = backupDir();
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "T").slice(0, 19) + "Z";
  const filename = `ascend-backup-${ts}.sql`;
  const outFile = join(dir, filename);

  log.info({ file: outFile }, "starting pg_dump");
  const bytes = await runPgDump(dbUrl, outFile);
  log.info({ file: filename, bytes }, "pg_dump complete");

  const pruned = await pruneOldDumps(dir);

  return { file: filename, bytes, pruned };
}
