# Finder POS — Database Layer

Owner: **DATABASE agent**
Wave: 0 — Platform foundation

---

## Directory layout

```
db/
├── migrations/
│   ├── run.sh                      Migration runner (psql, no npm dependency)
│   ├── 0001_foundation.sql         Wave 0: tenants, users, roles, audit_log,
│   │                                        feature_flags, idempotency_keys
│   ├── 0001_foundation.down.sql    Rollback for 0001
│   └── … (0002_*, 0003_* added each wave)
├── rls/
│   └── policies.sql                Row-Level Security policies for every
│                                   tenant-scoped table
├── seeds/
│   └── 0001_demo.sql               Demo tenant, owner user, 3 roles, 4 flags
├── backup/
│   ├── backup.sh                   pg_dump wrapper (RPO ≤ 5 min via cron)
│   └── restore.sh                  pg_restore wrapper (RTO ≤ 30 min)
└── pool/                           PgBouncer config (added Wave 2)
```

---

## Running migrations

### Prerequisites

- `psql` on PATH (PostgreSQL client tools).
- `DATABASE_URL` environment variable set:

  ```bash
  export DATABASE_URL=postgresql://app_user:secret@localhost:5432/finder_pos
  ```

### Apply all pending migrations

```bash
./db/migrations/run.sh
# or explicitly:
./db/migrations/run.sh up
```

### Apply a specific migration

```bash
./db/migrations/run.sh up 0001
```

### Roll back a migration

```bash
./db/migrations/run.sh down 0001
```

### Apply RLS policies (run after every migration)

```bash
psql "$DATABASE_URL" -f db/rls/policies.sql
```

### Load demo seed data

```bash
psql "$DATABASE_URL" -f db/seeds/0001_demo.sql
```

### Full local reset (from zero)

```bash
psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
./db/migrations/run.sh up
psql "$DATABASE_URL" -f db/rls/policies.sql
psql "$DATABASE_URL" -f db/seeds/0001_demo.sql
```

---

## Tenancy & Row-Level Security model

### Design principle

Every business table carries `tenant_id UUID NOT NULL`. The database enforces
isolation via PostgreSQL Row-Level Security (RLS). No application-layer filter
can be accidentally omitted — a missing `WHERE tenant_id = ?` clause does not
cause a cross-tenant data leak because the database policy blocks it.

### How it works

1. The backend resolves the tenant from the verified JWT on every request.
2. It executes `SET LOCAL app.tenant_id = '<tenant-uuid>'` inside the
   transaction before any query.
3. Every policy on every tenant-scoped table evaluates:

   ```sql
   USING (tenant_id = current_setting('app.tenant_id')::uuid)
   ```

4. If `app.tenant_id` is not set, `current_setting()` raises an error
   (fail-closed — no rows, no leak, and a visible bug).

### Application role vs. service role

| Role          | BYPASSRLS | Usage                                    |
|---------------|-----------|------------------------------------------|
| `app_user`    | No        | All runtime queries from the backend     |
| `migrator`    | Yes       | Migration runner, `run.sh`               |
| `backup_role` | Yes       | `pg_dump` / `pg_restore`                 |

The `app_user` role **must not** have `BYPASSRLS`.

### Tenant-isolation test (run in CI)

```sql
-- Should return ERROR (not 0 rows) — app.tenant_id unset:
RESET app.tenant_id;
SELECT * FROM users;  -- ERROR: unrecognized configuration parameter

-- Should return 0 rows — wrong tenant:
SET app.tenant_id = '00000000-0000-0000-0000-000000000099';
SELECT * FROM users;  -- 0 rows

-- Should return rows for the correct tenant only:
SET app.tenant_id = '00000000-0000-7000-a000-000000000001';
SELECT count(*) FROM users;  -- 1 (demo owner)
```

### Tenant-leading indexes

Every index on a tenant-scoped table is tenant-leading, e.g.:

```sql
CREATE INDEX users_tenant_email_idx ON users (tenant_id, email);
```

This ensures index scans are bounded to one tenant's data, critical for
query performance at scale (Wave 2 partitioning uses the same key).

---

## ID conventions

| Table              | Prefix  | Example                              |
|--------------------|---------|--------------------------------------|
| tenants            | `tnt_`  | `tnt_01j0abc...`                     |
| users              | `usr_`  | `usr_01j0abc...`                     |
| roles              | `role_` | `role_01j0abc...`                    |
| audit_log          | `aud_`  | `aud_01j0abc...`                     |
| feature_flags      | `ff_`   | `ff_01j0abc...`                      |
| idempotency_keys   | `idk_`  | `idk_01j0abc...`                     |
| products (Wave 1)  | `prod_` | `prod_01j0abc...`                    |
| orders (Wave 1)    | `ord_`  | `ord_01j0abc...`                     |
| payments (Wave 1)  | `pay_`  | `pay_01j0abc...`                     |

IDs are UUID v7 encoded as TEXT with the prefix. UUID v7 is time-ordered,
which means B-tree inserts are sequential (no page splits at scale).

---

## Money and time

- All money columns: `BIGINT` (cents). Never floats.
- All timestamps: `BIGINT` (Unix epoch milliseconds). `Date.now()` in TypeScript.

---

## Backup & Disaster Recovery

### RPO ≤ 5 minutes

Achieved via continuous WAL archiving (WAL-G or pgBackRest, configured in
Wave 2) plus `pg_dump` every 15 minutes via cron.

```cron
# WAL archive every 5 minutes (plug WAL-G endpoint in backup.sh)
*/5  * * * *  /opt/finder-pos/db/backup/backup.sh --wal-archive

# Full logical backup every 15 minutes
*/15 * * * *  /opt/finder-pos/db/backup/backup.sh --full
```

### RTO ≤ 30 minutes

`restore.sh` uses `pg_restore --jobs=4` (parallel restore) to minimize
wall-clock recovery time. On a 4-core machine with a typical Year-1 dataset
(< 50 GB), restore completes well under 30 minutes.

### DR Drill (run quarterly)

1. Provision a restore-test database.
2. Run `./db/backup/restore.sh --latest` against it.
3. Run `./db/migrations/run.sh up` to apply any post-backup migrations.
4. Run `npm run smoke -- --env restore-test` to verify application health.
5. Record start time, backup timestamp, elapsed time in the DR log.
6. RTO must be ≤ 30 minutes. Investigate and remediate if exceeded.

### Backup retention

| Storage tier | Retention  | Tool                     |
|--------------|------------|--------------------------|
| Local disk   | 7 days     | `backup.sh` auto-purge   |
| S3 (Standard-IA) | 30 days | `aws s3 cp` in `backup.sh` |
| S3 (Glacier) | 1 year     | S3 lifecycle rule        |

### Backup verification

```bash
./db/backup/backup.sh --verify
```

Runs `pg_restore --list` against the latest local backup to confirm the file
is readable and not corrupt. Run daily in CI.

---

## Wave 1 — Core commerce (upcoming)

Wave 1 will add:

```
db/migrations/0002_commerce.sql
db/migrations/0002_commerce.down.sql
```

Tables: `products`, `inventory`, `inventory_movements`, `orders`,
`order_lines`, `payments`, `sync_queue` — all with `tenant_id` + RLS +
tenant-leading indexes.

RLS policies will be appended to `db/rls/policies.sql` following the same
pattern as Wave 0.

---

## Wave 2 — Hardening (upcoming)

- PgBouncer transaction-mode pooling config in `db/pool/pgbouncer.ini`.
- Read-replica routing guidance.
- Range/hash partitioning by `tenant_id` — no app changes required.
- Redis key conventions: `t:{tenant_uuid}:product:{id}`, TTL notes.
- Automated restore drill with recorded RPO/RTO actuals.
