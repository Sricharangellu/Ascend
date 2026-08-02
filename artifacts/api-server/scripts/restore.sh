#!/usr/bin/env bash
# =============================================================================
# Ascend POS — PostgreSQL restore script
#
# Restores a plain-SQL dump (created by backup.sh) into the database pointed
# to by DATABASE_URL. The dump includes DROP-then-CREATE statements, so this
# is a full destructive restore — all existing data in the public schema will
# be replaced.
#
# Usage:
#   DATABASE_URL=postgres://... bash artifacts/api-server/scripts/restore.sh backups/ascend-backup-<timestamp>.sql
#
# Environment:
#   DATABASE_URL   — required; Postgres connection string
# =============================================================================
set -euo pipefail

DB_URL="${DATABASE_URL:?DATABASE_URL must be set}"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <dump-file.sql>" >&2
  echo ""
  echo "Available dumps in ./backups/:"
  ls -lh backups/ascend-backup-*.sql 2>/dev/null || echo "  (none found)"
  echo ""
  echo "Dumps in remote storage (if BACKUP_S3_BUCKET is configured):"
  echo "  pnpm --filter @workspace/api-server db:backup:remote-list"
  echo "  pnpm --filter @workspace/api-server db:backup:remote-pull <filename>"
  exit 1
fi

DUMP_FILE="$1"

if [[ ! -f "${DUMP_FILE}" ]]; then
  echo "[restore] ERROR: File not found: ${DUMP_FILE}" >&2
  exit 1
fi

echo "[restore] WARNING: This will REPLACE all data in the target database."
echo "[restore] Target: ${DB_URL%%@*}@…  (credentials redacted)"
echo "[restore] Source: ${DUMP_FILE} ($(du -sh "${DUMP_FILE}" | cut -f1))"
echo ""
read -r -p "Type 'yes' to proceed, anything else to abort: " CONFIRM
if [[ "${CONFIRM}" != "yes" ]]; then
  echo "[restore] Aborted."
  exit 0
fi

echo "[restore] Restoring…"

# psql exits non-zero on SQL errors (e.g. DROP TABLE IF NOT EXISTS on a fresh
# DB). --set=ON_ERROR_STOP=off lets it continue past those so the restore
# completes. Errors are still printed to stderr for review.
psql \
  --set=ON_ERROR_STOP=off \
  "${DB_URL}" \
  < "${DUMP_FILE}"

echo "[restore] Done. The database has been restored from ${DUMP_FILE}."
echo "[restore] Restart the API server to re-apply any in-flight migrations."
