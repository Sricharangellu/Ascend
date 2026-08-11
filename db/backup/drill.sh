#!/usr/bin/env bash
# =============================================================================
# db/backup/drill.sh — automated disaster-recovery drill (backup → restore → prove)
#
# WHY THIS EXISTS
#   `restore.sh` has carried a "DR DRILL CHECKLIST (run quarterly, record in RTO
#   log)" since it was written, and nothing ever ran it on a schedule. The
#   mechanism was drilled by hand exactly once (2026-08-05: backup 0.168s →
#   501KB, restore ~1s, 193 tables verified identical, app booted against the
#   restored DB) and has had nothing re-proving it since — which is
#   `GAPS.md`'s "Restore validation in CI … nothing re-proves it, so the path
#   can rot silently."
#
#   A backup path that is not continuously exercised is indistinguishable from
#   a broken one until the day you need it. This repo has already been bitten by
#   precisely that shape of failure twice: `backup.yml` reporting success in ~5s
#   having backed up nothing, and `uptime.yml` probing a dead hostname for over
#   a week. Both were green. This script exists so the restore path cannot join
#   that list.
#
# WHAT IT PROVES, AND WHAT IT DOES NOT
#   PROVES: the backup→restore MECHANISM works — pg_dump produces a readable
#   archive, pg_restore reconstitutes it, every table's row count AND full
#   content checksum survive identical (so `users.password_hash` is provably
#   intact, byte for byte), and the application boots, applies migrations and
#   reports ready against the result.
#
#   DELIBERATELY NOT ASSERTED: a successful login. That was the original design
#   and it is impossible by construction — `neutralizeDemoAccountsInProduction()`
#   (src/identity/service.ts) scrambles the password hash of `owner@ascend.dev`
#   and `cashier@ascend.dev` on every production boot, precisely so a real
#   deployment cannot be entered with the repo's published demo credentials.
#   That is a good security property and this drill must not weaken it. The
#   per-table content checksum covers the same ground more strongly anyway: it
#   compares the stored hashes directly rather than exercising one account.
#
#   DOES NOT PROVE: that PRODUCTION can be recovered. That needs a drill against
#   real production infrastructure and is blocked on `PROD_DATABASE_URL` (see
#   WORK/LOOP_STATE.md's NEEDS-SRI). Do not read a green run here as C-1 closed.
#   It closes C-1's mechanism half only, and says so in its own output.
#
# USAGE
#   DRILL_SOURCE_URL=postgresql://…/source \
#   DRILL_TARGET_URL=postgresql://…/restore_target \
#   ./db/backup/drill.sh
#
# ENVIRONMENT
#   DRILL_SOURCE_URL   (required) database to back up. Must already contain data.
#   DRILL_TARGET_URL   (required) database to restore INTO. Created if absent.
#                      NEVER point this at anything you cannot afford to lose —
#                      restore.sh drops and recreates every object in it.
#   BACKUP_DIR         where the .pgdump is written. Default: ./.drill-backups
#   DRILL_RTO_BUDGET_SECONDS  fail if restore+verify exceeds this.
#                      Default: 1800 (restore.sh's documented RTO target, 30 min)
#   JWT_SECRET         needed by the post-restore verifier to boot the app.
# =============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-${REPO_ROOT}/.drill-backups}"
RTO_BUDGET="${DRILL_RTO_BUDGET_SECONDS:-1800}"
LOG_PREFIX="[drill.sh]"

if [[ -z "${DRILL_SOURCE_URL:-}" ]]; then
    echo "${LOG_PREFIX} ERROR: DRILL_SOURCE_URL is not set." >&2
    exit 1
fi
if [[ -z "${DRILL_TARGET_URL:-}" ]]; then
    echo "${LOG_PREFIX} ERROR: DRILL_TARGET_URL is not set." >&2
    exit 1
fi
if [[ "$DRILL_SOURCE_URL" == "$DRILL_TARGET_URL" ]]; then
    # Restoring onto the source would destroy the very data the comparison is
    # supposed to check against, and would pass trivially while proving nothing.
    echo "${LOG_PREFIX} ERROR: DRILL_SOURCE_URL and DRILL_TARGET_URL are the same database." >&2
    echo "${LOG_PREFIX} The restore would overwrite the source and the comparison would be meaningless." >&2
    exit 1
fi

mkdir -p "$BACKUP_DIR"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Same python3-based URL parsing restore.sh uses — kept identical on purpose so
# the two scripts cannot disagree about what a DATABASE_URL means.
url_part() {
    python3 -c "
from urllib.parse import urlparse
u = urlparse('$1')
print(getattr(u, '$2') or '')
"
}

# Fingerprint = every public table, its exact row count, AND an md5 of its
# entire contents. Sorted, so it diffs cleanly.
#
# Why all three, each earning its place:
#   - table names alone: an empty restore has an identical table list to a good
#     one. Structure-only checks wave through the worst outcome.
#   - row counts: catch a truncated or partial restore, but not a corrupted one.
#     Same number of rows with mangled values passes.
#   - content md5: catches value-level corruption. This is what actually proves
#     credentials survived — `users.password_hash` is inside this hash, so a
#     matching checksum is stronger evidence than any single successful login,
#     and it needs no write to the source and no assumption about which accounts
#     exist.
#
# `t::text` renders the whole row; ordering by it makes the hash independent of
# physical row order, which pg_restore does not preserve.
#
# Cost note: this reads every row of every table. Fine for a drill database;
# for a very large source, budget accordingly (it is one sequential scan per
# table, not a join).
fingerprint() {
    psql "$1" -tA <<'SQL'
SELECT tablename
       || '=' ||
       (xpath(
          '/row/c/text()',
          query_to_xml(format('SELECT count(*) AS c FROM %I.%I', schemaname, tablename), false, true, '')
       ))[1]::text
       || ':' ||
       (xpath(
          '/row/h/text()',
          query_to_xml(
            format('SELECT coalesce(md5(string_agg(t::text, ''|'' ORDER BY t::text)), ''empty'') AS h FROM %I.%I t',
                   schemaname, tablename),
            false, true, '')
       ))[1]::text
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
SQL
}

ensure_target_exists() {
    local host port user dbname admin_url
    host="$(url_part "$DRILL_TARGET_URL" hostname)"
    port="$(url_part "$DRILL_TARGET_URL" port)"
    user="$(url_part "$DRILL_TARGET_URL" username)"
    dbname="$(url_part "$DRILL_TARGET_URL" path)"
    dbname="${dbname#/}"

    if psql "$DRILL_TARGET_URL" -c 'SELECT 1' >/dev/null 2>&1; then
        return 0
    fi

    echo "${LOG_PREFIX} Target database '${dbname}' not reachable — attempting to create it."
    admin_url="${DRILL_TARGET_URL%/*}/postgres"
    if ! psql "$admin_url" -c "CREATE DATABASE \"${dbname}\"" >/dev/null 2>&1; then
        echo "${LOG_PREFIX} ERROR: could not create '${dbname}'. Create it yourself and re-run:" >&2
        echo "${LOG_PREFIX}   createdb -h ${host:-localhost} -p ${port:-5432} -U ${user:-postgres} ${dbname}" >&2
        exit 1
    fi
    echo "${LOG_PREFIX} Created target database '${dbname}'."
}

# ---------------------------------------------------------------------------
# Drill
# ---------------------------------------------------------------------------
echo "${LOG_PREFIX} ━━━ DR DRILL STARTED ━━━"
echo "${LOG_PREFIX} source : $(url_part "$DRILL_SOURCE_URL" hostname)$(url_part "$DRILL_SOURCE_URL" path)"
echo "${LOG_PREFIX} target : $(url_part "$DRILL_TARGET_URL" hostname)$(url_part "$DRILL_TARGET_URL" path)"
echo "${LOG_PREFIX} backups: ${BACKUP_DIR}"
echo ""

# ── 1. Fingerprint the source ───────────────────────────────────────────────
echo "${LOG_PREFIX} [1/7] Fingerprinting source database…"
SOURCE_FP="$(mktemp)"
fingerprint "$DRILL_SOURCE_URL" > "$SOURCE_FP"
SOURCE_TABLES="$(grep -c . "$SOURCE_FP" || true)"
SOURCE_ROWS="$(awk -F'[=:]' '{s+=$2} END {print s+0}' "$SOURCE_FP")"
if [[ "$SOURCE_TABLES" -eq 0 ]]; then
    # A drill against an empty source would pass every later step and prove
    # nothing at all — the single most dangerous way for this script to be green.
    echo "${LOG_PREFIX} ERROR: source database has no public tables. A drill against an empty" >&2
    echo "${LOG_PREFIX} source would pass trivially and prove nothing. Seed it first." >&2
    exit 1
fi
if [[ "$SOURCE_ROWS" -eq 0 ]]; then
    echo "${LOG_PREFIX} ERROR: source has ${SOURCE_TABLES} tables but ZERO rows. Same problem:" >&2
    echo "${LOG_PREFIX} an empty-to-empty restore is not evidence. Seed it first." >&2
    exit 1
fi
echo "${LOG_PREFIX}       ${SOURCE_TABLES} tables, ${SOURCE_ROWS} rows total"

# ── 2. Back up ──────────────────────────────────────────────────────────────
echo "${LOG_PREFIX} [2/7] Running backup.sh --full…"
T_BACKUP_START=$(date +%s)
DATABASE_URL="$DRILL_SOURCE_URL" BACKUP_DIR="$BACKUP_DIR" "${REPO_ROOT}/db/backup/backup.sh" --full
T_BACKUP_END=$(date +%s)
BACKUP_SECONDS=$((T_BACKUP_END - T_BACKUP_START))

DUMP_FILE="$(find "$BACKUP_DIR" -name 'finder_pos_*.pgdump' | sort | tail -n1)"
if [[ -z "$DUMP_FILE" ]]; then
    echo "${LOG_PREFIX} ERROR: backup.sh reported success but produced no .pgdump file." >&2
    exit 1
fi
DUMP_BYTES="$(stat -c%s "$DUMP_FILE" 2>/dev/null || stat -f%z "$DUMP_FILE")"
echo "${LOG_PREFIX}       ${DUMP_FILE} (${DUMP_BYTES} bytes, ${BACKUP_SECONDS}s)"

# ── 3. Verify the archive is readable ───────────────────────────────────────
echo "${LOG_PREFIX} [3/7] Running backup.sh --verify…"
BACKUP_DIR="$BACKUP_DIR" "${REPO_ROOT}/db/backup/backup.sh" --verify

# ── 4. Restore into the target ──────────────────────────────────────────────
# RTO measurement starts here: in a real incident the clock that matters runs
# from "begin restoring" to "application serving", not from when the backup was
# taken.
echo "${LOG_PREFIX} [4/7] Preparing target and running restore.sh --force…"
ensure_target_exists
T_RESTORE_START=$(date +%s)
DATABASE_URL="$DRILL_TARGET_URL" BACKUP_DIR="$BACKUP_DIR" \
    "${REPO_ROOT}/db/backup/restore.sh" --force --file "$DUMP_FILE"

# ── 5. Fingerprint the target ───────────────────────────────────────────────
echo "${LOG_PREFIX} [5/7] Fingerprinting restored database…"
TARGET_FP="$(mktemp)"
fingerprint "$DRILL_TARGET_URL" > "$TARGET_FP"
TARGET_TABLES="$(grep -c . "$TARGET_FP" || true)"
TARGET_ROWS="$(awk -F'[=:]' '{s+=$2} END {print s+0}' "$TARGET_FP")"
echo "${LOG_PREFIX}       ${TARGET_TABLES} tables, ${TARGET_ROWS} rows total"

# ── 6. Compare ──────────────────────────────────────────────────────────────
echo "${LOG_PREFIX} [6/7] Comparing source and restored fingerprints…"
if ! diff -u "$SOURCE_FP" "$TARGET_FP" > /tmp/drill-fingerprint.diff 2>&1; then
    echo "${LOG_PREFIX} ✗ FINGERPRINT MISMATCH — the restore is NOT faithful." >&2
    echo "${LOG_PREFIX} Differences (-source / +restored):" >&2
    sed 's/^/  /' /tmp/drill-fingerprint.diff >&2
    exit 1
fi
echo "${LOG_PREFIX}       ✓ identical — ${SOURCE_TABLES} tables, ${SOURCE_ROWS} rows, and every"
echo "${LOG_PREFIX}         per-table content checksum match exactly (users.password_hash included)"

# ── 7. Prove the restored database is USABLE ────────────────────────────────
# Structural equality is necessary and not sufficient: it cannot tell you a
# bcrypt hash survived, or that migrations still apply. This boots the real
# application against the restored data and performs a real login.
#
# NODE_ENV=production is load-bearing, not incidental. Outside production the
# app's own seedDemo() invents a demo tenant + owner whenever the users table is
# empty, so the verifier would pass against a database nothing was restored into.
# The verifier refuses to run without it; passing it here is what keeps step 7 a
# real gate rather than a rubber stamp. It is also what a real recovery does.
#
# Consequence worth knowing: NODE_ENV=production also flips sslConfig()'s default
# to "TLS required" (src/shared/db.ts). A local or CI Postgres serves no TLS, so
# the drill defaults PG_SSL=disable — but only when the caller has not set it, so
# a drill aimed at real infrastructure keeps whatever TLS posture it was given.
# The choice is logged rather than made silently.
if [[ -z "${PG_SSL:-}" ]]; then
    export PG_SSL="disable"
    echo "${LOG_PREFIX}       PG_SSL not set — defaulting to 'disable' for a non-TLS drill database."
    echo "${LOG_PREFIX}       Set PG_SSL (and PG_CA_CERT_B64) explicitly when drilling against real infra."
else
    echo "${LOG_PREFIX}       PG_SSL='${PG_SSL}' (caller-supplied, left alone)."
fi
echo "${LOG_PREFIX} [7/7] Booting the application against the restored database…"
DATABASE_URL="$DRILL_TARGET_URL" NODE_ENV=production \
    npx tsx "${REPO_ROOT}/scripts/verify-restored-db.ts"
T_VERIFIED=$(date +%s)

RTO_SECONDS=$((T_VERIFIED - T_RESTORE_START))

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
echo ""
echo "${LOG_PREFIX} ━━━ DR DRILL PASSED ━━━"
echo "${LOG_PREFIX}   backup      : ${BACKUP_SECONDS}s → ${DUMP_BYTES} bytes"
echo "${LOG_PREFIX}   tables/rows : ${SOURCE_TABLES} / ${SOURCE_ROWS} — identical after restore"
echo "${LOG_PREFIX}   RTO         : ${RTO_SECONDS}s (restore start → application authenticating)"
echo "${LOG_PREFIX}   RTO budget  : ${RTO_BUDGET}s"

if [[ "$RTO_SECONDS" -gt "$RTO_BUDGET" ]]; then
    echo "${LOG_PREFIX} ✗ RTO BUDGET EXCEEDED (${RTO_SECONDS}s > ${RTO_BUDGET}s)" >&2
    exit 1
fi

echo ""
echo "${LOG_PREFIX} SCOPE, STATED PLAINLY: this proves the backup→restore MECHANISM."
echo "${LOG_PREFIX} It does NOT prove production can be recovered — that needs a drill against"
echo "${LOG_PREFIX} real production infrastructure and is blocked on PROD_DATABASE_URL."
echo "${LOG_PREFIX} C-1's production half stays OPEN."
