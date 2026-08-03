# Contract Changelog

All changes to the shared contract (schema.sql, openapi.yaml, events.md) are logged here.
Contracts only move forward: additive first; breaking changes get a new version.

## Wave 1 — Core commerce (DATABASE agent, 2026-06-12)

### contracts/schema.sql — Wave 1 published
- Activated (live DDL, no longer placeholder): `products`, `inventory`,
  `inventory_movements`, `orders`, `order_lines`, `payments`, `sync_queue`.
- All Wave 1 tables use `tenant_id TEXT NOT NULL` (reconciled from UUID).

### Tenant-id type reconciliation (ratified 2026-06-12)
- **Background:** Wave 0 tables were scaffolded with `tenant_id UUID`.  The
  LIVE backend uses tenant ids as TEXT with a `tnt_` prefix (e.g. `tnt_demo`).
- **Decision:** Wave 1 and all future tables use `tenant_id TEXT NOT NULL`.
  Wave 0 tables will be reconciled in a future fixup migration.
- **RLS impact:** Wave 1 RLS policies compare TEXT = TEXT — no `::uuid` cast.
  Wave 0 policies retain their `::uuid` cast until the fixup migration lands.
- **Backend must match:** `SET LOCAL app.tenant_id = 'tnt_demo'` (TEXT, not
  UUID).  Do NOT cast to `::uuid` when setting the session variable.

### New migration files
- `db/migrations/0002_commerce.sql`      — forward migration (Wave 1).
- `db/migrations/0002_commerce.down.sql` — rollback (reverse-dependency order).

### New RLS policies (db/rls/policies.sql)
- Wave 1 tables appended: `products`, `inventory`, `inventory_movements`,
  `orders`, `order_lines`, `payments`, `sync_queue`.
- Policy predicate: `tenant_id = current_setting('app.tenant_id')` (TEXT, no cast).
- `inventory_movements` and audit-style tables: INSERT-only for app role
  (no UPDATE/DELETE policy).
- Documented RLS design-target vs. Wave 1 enablement stance (application-layer
  enforcement in Wave 1; RLS activation pending auth-service role split).

### Column decisions the backend must match
| Table | Column | Type | Note |
|---|---|---|---|
| products | tenant_id | TEXT | tnt_<slug> |
| products | price_cents | BIGINT | cents |
| products | tax_class | TEXT | 'standard'\|'exempt' |
| products | status | TEXT | 'active'\|'draft'\|'archived' |
| inventory | PK | (tenant_id, product_id) | composite, no surrogate |
| inventory_movements | delta | INTEGER | +recv/-sale |
| inventory_movements | reason | TEXT | 'receiving'\|'sale'\|'adjustment'\|'return' |
| orders | state_code | TEXT | 'CA'\|'NY'\|'TX'\|'FL' |
| orders | status | TEXT | 'open'\|'completed'\|'refunded'\|'voided' |
| order_lines | qty | INTEGER | (was `quantity` in CONTRACTS.md) |
| order_lines | unit_price_cents | BIGINT | (was `unit_cents`) |
| order_lines | line_total_cents | BIGINT | (was `line_cents`) |
| payments | tendered_cents | BIGINT | replaces cash_cents (split detail in app layer) |
| payments | status | TEXT | adds 'refunded' to prior 'captured'\|'declined' |
| sync_queue | id | BIGSERIAL | integer sequence, not TEXT uuid |
| sync_queue | payload | JSONB | (was TEXT in CONTRACTS.md) |

---

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
