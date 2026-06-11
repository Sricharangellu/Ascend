# Contract Changelog

All changes to the shared contract (schema.sql, openapi.yaml, events.md) are logged here.
Contracts only move forward: additive first; breaking changes get a new version.

## Wave 0 — foundation (DATABASE agent, 2026-06-11)

### contracts/schema.sql — Wave 0 published
- Added: `tenants` table (root aggregate, no tenant_id, no RLS).
- Added: `roles` table (tenant-scoped, RLS enabled, prefix `role_`).
- Added: `users` table (tenant-scoped, RLS enabled, prefix `usr_`).
- Added: `audit_log` table (tenant-scoped, append-only RLS, prefix `aud_`).
- Added: `feature_flags` table (tenant-scoped + global sentinel, RLS enabled, prefix `ff_`).
- Added: `idempotency_keys` table (tenant-scoped, RLS enabled, prefix `idk_`).
- Wave 1 commerce tables included as commented placeholders (products, inventory,
  inventory_movements, orders, order_lines, payments, sync_queue).

### Cross-cutting conventions established
- All money: BIGINT cents. All timestamps: BIGINT epoch ms.
- All IDs: TEXT uuid-v7 with table prefix.
- All tenant-scoped tables: RLS ENABLED + tenant_isolation policy.
- All indexes: tenant-leading `(tenant_id, ...)`.

### Migration files
- `db/migrations/0001_foundation.sql` — forward migration.
- `db/migrations/0001_foundation.down.sql` — tested rollback.
- `db/migrations/run.sh` — dependency-light psql-based runner.

### RLS policies
- `db/rls/policies.sql` — fail-closed isolation for all Wave 0 tenant tables.

### Seeds
- `db/seeds/0001_demo.sql` — demo tenant, 3 system roles, 1 owner user, 4 flags.

### Backup/DR
- `db/backup/backup.sh` — pg_dump wrapper, RPO ≤ 5 min design.
- `db/backup/restore.sh` — pg_restore wrapper, RTO ≤ 30 min design.

---

## Wave 0 — foundation (scaffold, pre-agent)
- 2026-06-11: Initialized contract skeletons (schema.sql, openapi.yaml, events.md).
