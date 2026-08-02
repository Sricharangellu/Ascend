/**
 * remote-backups CLI — list and pull database dumps from S3-compatible storage.
 *
 * Usage (from repo root):
 *   pnpm --filter @workspace/api-server db:backup:remote-list
 *   pnpm --filter @workspace/api-server db:backup:remote-pull <filename> [dest-dir]
 *
 * Requires BACKUP_S3_BUCKET (and credentials) to be configured — see
 * src/shared/backup-storage.ts for the full env var reference.
 *
 * Typical disaster recovery:
 *   1. db:backup:remote-list                  → pick the newest dump
 *   2. db:backup:remote-pull <filename>       → downloads into ./backups/
 *   3. bash artifacts/api-server/scripts/restore.sh backups/<filename>
 */

import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  remoteBackupConfig,
  listRemoteBackups,
  downloadRemoteBackup,
} from "../shared/backup-storage.js";

function fail(message: string): never {
  console.error(`[remote-backups] ERROR: ${message}`);
  process.exit(1);
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  const config = remoteBackupConfig();
  if (!config) {
    fail(
      "BACKUP_S3_BUCKET is not set. Configure remote backup storage first — " +
        "see the 'Remote backup storage' section in replit.md.",
    );
  }

  if (command === "list") {
    const entries = await listRemoteBackups(config);
    if (entries.length === 0) {
      console.log(
        `[remote-backups] No dumps found in s3://${config.bucket}/${config.prefix}`,
      );
      return;
    }
    console.log(
      `[remote-backups] ${entries.length} dump(s) in s3://${config.bucket}/${config.prefix} (newest first):\n`,
    );
    for (const entry of entries) {
      const when = entry.lastModified?.toISOString() ?? "unknown time";
      console.log(`  ${entry.filename}  (${formatSize(entry.size)}, ${when})`);
    }
    return;
  }

  if (command === "pull") {
    const filename = args[0];
    if (!filename) fail("Usage: pull <filename> [dest-dir]");
    if (!/^ascend-backup-[\w-]+\.sql$/.test(filename)) {
      fail(
        `Unexpected filename "${filename}" — expected an ascend-backup-*.sql name from the list command.`,
      );
    }
    const destDir = resolve(args[1] ?? "backups");
    await mkdir(destDir, { recursive: true });
    const destPath = join(destDir, filename);
    console.log(
      `[remote-backups] Downloading s3://${config.bucket}/${config.prefix}${filename} → ${destPath}`,
    );
    await downloadRemoteBackup(filename, destPath, config);
    console.log(`[remote-backups] Done. Restore with:`);
    console.log(
      `  DATABASE_URL=<connection-string> bash artifacts/api-server/scripts/restore.sh ${join(
        args[1] ?? "backups",
        filename,
      )}`,
    );
    return;
  }

  fail(`Unknown command "${command ?? ""}". Use: list | pull <filename> [dest-dir]`);
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
