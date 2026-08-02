#!/usr/bin/env bash
# =============================================================================
# Ascend POS — PostgreSQL backup script
#
# Creates a plain-SQL dump of the database pointed to by DATABASE_URL and
# stores it under backups/ (relative to the repo root). Old dumps are pruned
# after BACKUP_RETAIN_DAYS (default: 7) to keep disk usage in check.
#
# Usage:
#   DATABASE_URL=postgres://... bash artifacts/api-server/scripts/backup.sh
#
# Environment:
#   DATABASE_URL          — required; Postgres connection string
#   BACKUP_DIR            — directory for dump files (default: ./backups)
#   BACKUP_RETAIN_DAYS    — how many days of backups to keep (default: 7)
# =============================================================================
set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────────────
DB_URL="${DATABASE_URL:?DATABASE_URL must be set}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-${REPO_ROOT}/backups}"
RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-7}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILENAME="ascend-backup-${TIMESTAMP}.sql"
OUTFILE="${BACKUP_DIR}/${FILENAME}"

# ── Ensure backup directory exists ───────────────────────────────────────────
mkdir -p "${BACKUP_DIR}"

echo "[backup] Starting dump → ${OUTFILE}"

# ── Run pg_dump ───────────────────────────────────────────────────────────────
# --no-owner / --no-acl: dump is portable — owner and GRANT/REVOKE statements
#   are excluded so the dump can be restored into any database user.
# --if-exists: makes DROP statements safe during restore even on a fresh DB.
# --clean: prepend DROP statements so restore is idempotent.
# NOTE: do NOT add --schema=public — it omits CREATE EXTENSION statements
#   (e.g. pg_trgm), which makes the dump unrestorable into a fresh database.
#   Flags must stay in sync with dbBackupJob; verified by restore-verify tests.
pg_dump \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  "${DB_URL}" \
  > "${OUTFILE}"

echo "[backup] Dump complete: ${OUTFILE} ($(du -sh "${OUTFILE}" | cut -f1))"

# ── Prune old backups ─────────────────────────────────────────────────────────
echo "[backup] Pruning dumps older than ${RETAIN_DAYS} days…"
find "${BACKUP_DIR}" -maxdepth 1 -name "ascend-backup-*.sql" \
  -mtime "+${RETAIN_DAYS}" -delete -print | \
  sed 's/^/[backup] Deleted: /'

echo "[backup] Done."
