#!/usr/bin/env bash
# =============================================================================
# db/backup/restore.sh — pg_restore wrapper for Ascend
# Wave: 0 — Platform foundation
#
# RTO TARGET: ≤ 30 minutes from backup selection to database online.
#
# USAGE
#   ./db/backup/restore.sh [--file path/to/backup.pgdump] [--latest] [--dry-run]
#
#   --file <path>  Restore from a specific .pgdump file.
#   --latest       Auto-select the most recent backup in BACKUP_DIR.
#   --dry-run      Print what would be done without executing.
#   --list         List available backups without restoring.
#
# ENVIRONMENT
#   DATABASE_URL         Target database connection string (required)
#   BACKUP_DIR           Directory containing .pgdump files
#                        Default: /var/backups/finder-pos
#   BACKUP_S3_BUCKET     Optional: download from S3 if file not found locally
#   RESTORE_JOBS         Parallel restore workers. Default: 4
#
# SAFETY
#   This script will DROP and re-CREATE the target database.
#   Operator must confirm with 'yes' unless --force is passed.
#   NEVER run in production without a confirmed incident window.
#
# DR DRILL — NOW AUTOMATED. Use db/backup/drill.sh, not this checklist by hand.
#
#   DRILL_SOURCE_URL=… DRILL_TARGET_URL=… ./db/backup/drill.sh
#
#   It runs the whole sequence (fingerprint → backup → verify → restore →
#   compare → prove the app boots against the result → report RTO) and fails on
#   any step. .github/workflows/restore-drill.yml runs it weekly and on every
#   change to db/backup/**, which is what this checklist never achieved: it said
#   "run quarterly" and was run exactly once, by hand, on 2026-08-05.
#
# CORRECTION to the manual checklist this replaces — its step 3 was wrong, and
# following it would have produced a false pass:
#   ✗ "Run smoke tests (DATABASE_URL=<restore-test-db> npm run smoke)"
#     scripts/smoke.ts provisions its OWN throwaway `smoke_<ts>` schema and drops
#     it afterwards. Pointed at a restored database it exercises a brand-new
#     schema sitting beside the restored data and never reads a single restored
#     row — so it goes green regardless of whether the restore worked at all.
#   ✓ scripts/verify-restored-db.ts reads the restored rows instead, and drill.sh
#     additionally compares a per-table content checksum (which covers
#     users.password_hash byte for byte) between source and restored database.
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults / env
# ---------------------------------------------------------------------------
BACKUP_DIR="${BACKUP_DIR:-/var/backups/finder-pos}"
RESTORE_JOBS="${RESTORE_JOBS:-4}"
MODE="--file"
BACKUP_FILE=""
DRY_RUN=false
FORCE=false
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
LOG_PREFIX="[restore.sh ${TIMESTAMP}]"

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --file)      MODE="--file";   BACKUP_FILE="$2"; shift 2 ;;
        --latest)    MODE="--latest"; shift ;;
        --dry-run)   DRY_RUN=true;    shift ;;
        --list)      MODE="--list";   shift ;;
        --force)     FORCE=true;      shift ;;
        *) echo "Unknown argument: $1" >&2; exit 1 ;;
    esac
done

# ---------------------------------------------------------------------------
# Validate
# ---------------------------------------------------------------------------
if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "${LOG_PREFIX} ERROR: DATABASE_URL is not set." >&2
    exit 1
fi

if ! command -v pg_restore &>/dev/null; then
    echo "${LOG_PREFIX} ERROR: pg_restore not found on PATH." >&2
    exit 1
fi

if ! command -v psql &>/dev/null; then
    echo "${LOG_PREFIX} ERROR: psql not found on PATH." >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Parse DB name from DATABASE_URL for DROP/CREATE commands
parse_dbname() {
    python3 -c "
from urllib.parse import urlparse
import sys
u = urlparse('$DATABASE_URL')
print(u.path.lstrip('/'))
"
}

parse_host_port_user() {
    # Returns psql flags: -h HOST -p PORT -U USER
    python3 -c "
from urllib.parse import urlparse
u = urlparse('$DATABASE_URL')
parts = []
if u.hostname: parts += ['-h', u.hostname]
if u.port:     parts += ['-p', str(u.port)]
if u.username: parts += ['-U', u.username]
print(' '.join(parts))
"
}

# Hostname only, for the confirmation prompt — a wrong-database restore is
# most often caused by DATABASE_URL silently pointing at the wrong tier
# (prod vs. testing), so the operator needs the host in front of them right
# before they confirm, not buried in a connection string.
parse_host() {
    python3 -c "
from urllib.parse import urlparse
u = urlparse('$DATABASE_URL')
print(u.hostname or '(unknown host)')
"
}

list_backups() {
    echo "${LOG_PREFIX} Available backups in ${BACKUP_DIR}:"
    find "$BACKUP_DIR" -name "finder_pos_*.pgdump" | sort | while read -r f; do
        local sz
        sz=$(du -sh "$f" | cut -f1)
        echo "  ${sz}  $f"
    done
}

confirm_restore() {
    # Target is always logged, even under --force, so an unattended/DR-drill
    # invocation still leaves an audit trail of what it pointed at.
    local dbname="$1" host="$2"
    echo "${LOG_PREFIX} Target database: ${dbname}"
    echo "${LOG_PREFIX} Target host:     ${host}"

    if $FORCE; then
        echo "${LOG_PREFIX} --force set — skipping interactive confirmation."
        return 0
    fi
    echo ""
    echo "  ┌─────────────────────────────────────────────────────────┐"
    echo "  │  WARNING: This will DROP and re-create the database!    │"
    echo "  │  All existing data will be PERMANENTLY DELETED.         │"
    echo "  │  Only proceed during a confirmed incident window.       │"
    echo "  └─────────────────────────────────────────────────────────┘"
    echo ""
    echo "  About to restore into:"
    echo "    database : ${dbname}"
    echo "    host     : ${host}"
    echo ""
    # Require the operator to type the exact database name, not a generic
    # "yes" — a wrong-database restore is a copy/paste DATABASE_URL mistake,
    # and a generic confirmation doesn't force anyone to actually read the
    # target above it. Typing the name does.
    echo -n "  Type the database name (${dbname}) to continue: "
    read -r answer
    if [[ "$answer" != "$dbname" ]]; then
        echo "${LOG_PREFIX} Aborted — typed name did not match target database '${dbname}'."
        exit 1
    fi
}

# ---------------------------------------------------------------------------
# Main restore
# ---------------------------------------------------------------------------
run_restore() {
    local backup_file="$1"

    if [[ ! -f "$backup_file" ]]; then
        # Try to download from S3
        if [[ -n "${BACKUP_S3_BUCKET:-}" ]] && command -v aws &>/dev/null; then
            echo "${LOG_PREFIX} File not found locally. Attempting S3 download..."
            local s3_key
            s3_key="${BACKUP_S3_BUCKET}/$(basename "$backup_file")"
            mkdir -p "$(dirname "$backup_file")"
            aws s3 cp "$s3_key" "$backup_file"
            echo "${LOG_PREFIX} Downloaded from S3: $s3_key"
        else
            echo "${LOG_PREFIX} ERROR: Backup file not found: $backup_file" >&2
            exit 1
        fi
    fi

    # Verify backup before restore
    echo "${LOG_PREFIX} Verifying backup integrity..."
    if ! pg_restore --list "$backup_file" > /dev/null 2>&1; then
        echo "${LOG_PREFIX} ERROR: Backup file appears corrupt." >&2
        exit 1
    fi
    echo "${LOG_PREFIX} Backup integrity: OK"

    local dbname
    dbname=$(parse_dbname)
    local host
    host=$(parse_host)
    # shellcheck disable=SC2046
    local pg_flags
    pg_flags=$(parse_host_port_user)

    if $DRY_RUN; then
        echo "${LOG_PREFIX} DRY RUN — would restore $backup_file → database: $dbname @ $host"
        echo "${LOG_PREFIX} Command:"
        echo "  pg_restore --dbname='$DATABASE_URL' --jobs=$RESTORE_JOBS \\"
        echo "    --clean --if-exists --no-owner --no-acl --verbose \\"
        echo "    '$backup_file'"
        return
    fi

    confirm_restore "$dbname" "$host"

    local t_start
    t_start=$(date +%s)
    echo "${LOG_PREFIX} ━━━ RESTORE STARTED ━━━"
    echo "${LOG_PREFIX} Source: $backup_file"
    echo "${LOG_PREFIX} Target: $dbname"
    echo "${LOG_PREFIX} Workers: $RESTORE_JOBS"

    # --clean --if-exists: drops existing objects before recreating
    # --no-owner:          skip ownership commands (app role differs from backup role)
    # --no-acl:            skip GRANT/REVOKE (re-applied by provisioning)
    #
    # pg_restore's own exit code is captured independently of the filtered
    # display below — piping straight into `grep | head` and trailing that
    # with `|| true` (the previous form of this) meant grep's own "zero
    # matches" exit code (1, entirely possible on a clean restore with no
    # error/warning lines) got conflated with, and then unconditionally
    # masked, any REAL pg_restore failure. A failed restore would still print
    # "RESTORE COMPLETE" and a passing RTO — false confidence in exactly the
    # script whose own docstring says it's for a real incident or a DR drill.
    local restore_log
    restore_log="$(mktemp)"
    set +e
    pg_restore \
        --dbname="$DATABASE_URL" \
        --jobs="$RESTORE_JOBS" \
        --clean \
        --if-exists \
        --no-owner \
        --no-acl \
        --verbose \
        "$backup_file" > "$restore_log" 2>&1
    local restore_status=$?
    set -e
    grep -E "(restoring|error|warning)" "$restore_log" | head -50 || true

    if [[ "$restore_status" -ne 0 ]]; then
        echo "${LOG_PREFIX} ━━━ RESTORE FAILED (pg_restore exit ${restore_status}) ━━━" >&2
        echo "${LOG_PREFIX} Full log: $restore_log" >&2
        exit 1
    fi
    rm -f "$restore_log"

    local t_end
    t_end=$(date +%s)
    local rto_s=$(( t_end - t_start ))
    local rto_m=$(( rto_s / 60 ))

    echo "${LOG_PREFIX} ━━━ RESTORE COMPLETE ━━━"
    echo "${LOG_PREFIX} Elapsed: ${rto_m}m ${rto_s}s"

    if [[ $rto_s -gt 1800 ]]; then
        echo "${LOG_PREFIX} WARNING: RTO exceeded 30 minutes (${rto_m}m). Review indexing and parallel settings." >&2
    else
        echo "${LOG_PREFIX} RTO target (≤ 30 min): PASSED (${rto_m}m ${rto_s}s)"
    fi

    echo "${LOG_PREFIX} NEXT STEPS:"
    echo "  1. Verify the restore is USABLE, not merely present:"
    echo "       NODE_ENV=production DATABASE_URL=<this-db> npx tsx scripts/verify-restored-db.ts"
    echo "     (boots the app, which applies migrations, then reads the restored rows)"
    echo "  2. Record RTO in DR log: ${rto_m}m ${rto_s}s"
    echo ""
    echo "  NOTE: do NOT verify with 'npm run smoke'. It provisions its own throwaway"
    echo "  schema and drops it, so it never reads a restored row and goes green even"
    echo "  if this restore did nothing. That advice was wrong and has been corrected."
}

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------
case "$MODE" in
    --list)
        list_backups
        ;;
    --latest)
        echo "${LOG_PREFIX} Selecting latest backup from ${BACKUP_DIR}..."
        BACKUP_FILE=$(find "$BACKUP_DIR" -name "finder_pos_*.pgdump" | sort | tail -n1)
        if [[ -z "$BACKUP_FILE" ]]; then
            echo "${LOG_PREFIX} ERROR: No backups found in ${BACKUP_DIR}." >&2
            exit 1
        fi
        echo "${LOG_PREFIX} Selected: $BACKUP_FILE"
        run_restore "$BACKUP_FILE"
        ;;
    --file)
        if [[ -z "$BACKUP_FILE" ]]; then
            echo "Usage: $0 --file /path/to/backup.pgdump" >&2
            exit 1
        fi
        run_restore "$BACKUP_FILE"
        ;;
esac
