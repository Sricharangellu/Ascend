# Audit — expenses MVP backend module

Status label: **built_verified** (backend); frontend wiring: **missing** (follow-up)

## What (FORWARD_PLAN queue #3)
New `expenses` module — the "Record expenses" step of the retail flow had no backend
(only chart-of-accounts expense *accounts* existed; no way to record a spend).

- Table `expenses` (tenant_id, category NULLABLE, amount_cents BIGINT CHECK>0, spent_at,
  vendor, note, account_id, created_by, created_at) + indexes.
- `POST /api/v1/expenses` — record spend; validated (zod), **manager+**, money in
  integer cents, **audit-logged** (expense.created).
- `GET /api/v1/expenses?category=&from=&to=&limit=&offset=` — list with filters.
- `GET /api/v1/expenses/summary?from=&to=` — totalCents, count, uncategorizedCount,
  byCategory[] (feeds dashboard + the retail-proof "uncategorized expenses" signal).
- `GET /api/v1/expenses/:id`; `DELETE /:id` — correction, manager+, audit-logged.
- Tenant-scoped throughout; registered before rlsModule.

## Verified (single isolated runs — tooling-incident discipline)
- expenses.test.ts 3/3 real Postgres: create→list→summary (categorized + uncategorized,
  totals, by-category); manager-gate (cashier 403 on create/delete, owner deletes);
  non-positive amount 400; tenant-scoped baseline.
- backend tsc 0; smoke 20/20 (expenses mounts).

## Follow-ups
- Frontend expenses page wired to these routes (loading/empty/error/success states).
- Feed expense totals + uncategorized count into GET /reports/retail-proof (it currently
  disclaims expenses as unbuilt) and the dashboard.
- Optional: link account_id to a real chart-of-accounts expense account + validate it.
