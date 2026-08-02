# Phase 6 Completion Audit — Procurement Intelligence

**Date:** 2026-07-28
**Session:** Claude (Cowork, Sonnet 5)
**Scope reference:** `WORK/FORWARD_PLAN.md` → "Phase 6: Procurement intelligence
(approved scope, 2026-07-28)"; original gap analysis in
`WORK/audits/AUDIT_2026-07-28T184729Z-erp-procurement-demand-planning-gap.md`.
LOCK claim: `WORK/LOCK.md` → "Parallel Non-Overlapping Claim (Claude,
Cowork/Sonnet 5 — Phase 6 procurement intelligence, item 1: MOQ/pack-size-aware
reorder rounding)".

## Verdict

All three approved items shipped, in the required order, each gated by a
clean typecheck/gap-scan/table-scan/hygiene pass and a real-Postgres test run
before the next item started. No regressions found in any touched or
downstream test suite. No item marked NEEDS-SRI was touched. No file in the
pre-existing, unclaimed, uncommitted UOM-conversion working-tree change (ADR-006,
`src/shared/uom.ts`, etc. — 24 files, ~750 lines, discovered on claim and
documented in `WORK/LOCK.md`) was read, written, or otherwise depended on by
this work.

## What shipped

### Item 1 — Supplier MOQ and pack-size aware reorder calculations

New pure helper `src/shared/reorder-quantity.ts` (`roundToOrderQuantity`):
rounds a raw target quantity up to a whole number of the supplier's case pack,
then up further if that still doesn't clear the supplier's MOQ. No-op
(returns `Math.max(1, Math.ceil(rawQty))`) when neither is configured, so
every product that hasn't opted in behaves exactly as before.

Wired into all three reorder-suggestion surfaces that existed in the
codebase (a third one, `InventoryService.getReorderSuggestions()`, was
discovered mid-Item-2 to have the same gap and retroactively fixed under this
item):

- `catalog/detail-views.ts` → `reorderSuggestions()`
- `inventory/pipeline-views.ts` → `reorderAlerts()`
- `inventory/service.ts` → `getReorderSuggestions()`

Each response gained two additive fields, `preferred_supplier_moq` /
`preferred_supplier_case_pack`, and `suggested_qty` now rounds to a quantity
the preferred supplier can actually fulfil. `createPoFromAlert()` needed no
change — it already forwards `alert.suggested_qty` straight to
`createOrder()`, so the rounded quantity reaches the created PO for free.

### Item 2 — Explicit safety stock

New column `inventory.safety_stock INTEGER NOT NULL DEFAULT 0` (additive
migration, `src/modules/inventory/index.ts`). This is the single settable
source of truth for the concept — a second copy was deliberately **not**
added to `inventory_stock` (its own `reorder_level`/`reorder_quantity`
columns are dead — never written by any route — so a second unwritable
column there would be more dead schema, not a real second source).

- `InventoryService.setSafetyStock()` mirrors `setReorderPoint()` exactly.
- New route `PUT /api/inventory/:productId/safety-stock` (manager-gated,
  same guard as reorder-point).
- All three reorder-suggestion surfaces now read the real
  `inventory.safety_stock` value and add it to the raw target quantity
  *before* MOQ/case-pack rounding — replacing a prior "fake mirror" pattern
  where each surface reported `safety_stock: reorder_pt`/`reorder_level`
  instead of a real, independently configurable value. Additive and a no-op
  (0) for every product that hasn't set one, so existing behavior for
  pre-existing data is unchanged.

### Item 3 — Promised delivery date

Computation-only — no new column, no new table, and critically, no edit to
`purchasing/{service,routes}.ts` (both inside the excluded dirty-tree scope).
`expected_delivery_date` (or `expected_date` on the pipeline's `pending()`
view) is derived as `ordered_at` (or "now" for a not-yet-created suggestion)
`+ lead_time_days`, where `lead_time_days` prefers the specific
`(product, supplier)` pairing from `product_suppliers.lead_time_days`, falls
back to the product's general `products.lead_time_days`, and finally to a
7-day default — reusing a fallback chain already established elsewhere in
this codebase.

Wired into:

- `inventory/pipeline-views.ts` → `pending()`: replaced the file's own
  honest "no ETA" approximation comment with a real `expected_date` and a
  real `days_overdue` (previously hard-coded to 0 for every row).
- `inventory/pipeline-views.ts` → `reorderAlerts()`: new
  `expected_delivery_date`, `null` when there's no preferred supplier to
  promise against.
- `catalog/detail-views.ts` → `reorderSuggestions()`: same field, same
  null-when-unlinked rule.
- `inventory/service.ts` → `getReorderSuggestions()`: same field, same rule.

All additive; no existing field was removed, renamed, or repurposed.

## Gates (final consolidated run, after all three items)

- `npm run typecheck` — clean.
- `npm run gap:scan` — clean (456 backend paths / 381 frontend paths, 21
  allowlisted — unchanged from before this phase; every new field is
  backend-response-only, no new frontend-called route).
- `npm run table:scan` — clean (161 table names, no collisions — one
  additive column, no new tables).
- `npm run hygiene` — clean (1079 files scanned).

## Tests (real Postgres, via scratch runners — see note below)

- `src/shared/reorder-quantity.ts` has no dedicated unit-test file; it is
  exercised indirectly through all three surfaces' integration tests below.
  Noted as a minor gap, not blocking — the function is small, pure, and every
  branch (no MOQ/no case-pack, case-pack-only, MOQ-only, both) is covered by
  at least one of those integration tests.
- `catalog/detail-views.test.ts` — 25/25 (4 new across the three items: MOQ
  rounding, safety-stock additive, safety-stock-defaults-to-0 regression,
  expected_delivery_date null→populated).
- `inventory/pipeline-views.test.ts` — 7/7 (3 new: MOQ rounding + PO
  quantity proof, safety-stock additive, expected_date lead-time promise).
- `inventory/inventory.test.ts` — 42/42, run in six batches to fit this
  sandbox's ~44s-per-call budget (7 new across the three items: MOQ
  rounding, safety-stock independence/persistence/RBAC/additive/defaults-to-0
  regression ×5, expected_delivery_date null→populated). All pre-existing
  tests in this file (oversell/refund/idempotency/role-gate/location-transfer
  suites) pass unchanged — confirms no regression outside the touched
  surfaces.
- `purchasing/purchasing.test.ts` — 30/30, run once during Item 1 (the only
  item with a dependency edge into purchasing, via `createOrder()`). Not
  re-run for Items 2/3 since neither touched any purchasing file — a scoped
  judgment call, not an omission; zero purchasing files appear in `git
  status` for this claim from Item 1 onward.

## Sandbox / tooling notes worth preserving

- `scripts/test.ts` ignores CLI args (always runs the full suite), so all
  targeted runs in this phase used throwaway `scripts/_tmp-phase6-test-
  runner.mts` / `...runner2.mts` (same shape, wrapping `pg-harness.ts`'s
  `ensurePg()`, but honoring file args and `--test-name-pattern`). Both are
  untracked (`git status` shows `??`) — harmless, will never enter a commit
  unless explicitly `git add`ed. Safe to delete from a real machine; this
  sandbox's FUSE mount would not allow deleting them here (same `EPERM`
  class as the documented `.git/index.lock` issue).
- **Node's `--test-name-pattern` is silently ignored if it appears *after*
  the target file** on the `node --test` CLI — it must come *before* the
  file argument, or every test in the file runs regardless of the pattern.
  This cost real time mid-session (several 45-second timeouts on
  `inventory.test.ts`, a 42-test file, before the argument order was
  isolated as the cause rather than a slow/hanging test). Worth remembering
  for any future targeted real-Postgres run in this repo.

## Not done, and deliberately so

Everything in `WORK/FORWARD_PLAN.md`'s Phase 6 "Deferred to future phases"
list (projected inventory by date, demand coverage / days of supply, a real
demand-forecasting engine, buyer workspace, forecast analytics) remains
unbuilt, per Sri's explicit sequencing instruction. Every NEEDS-SRI item
(EDI parsing, stateful receiving sessions, approval-chain triggering) remains
untouched. The pre-existing, unclaimed UOM-conversion work found in the
working tree on claim was left exactly as found.

## Outstanding for Sri

- This sandbox has no GitHub push credentials (same limitation noted by
  every other entry in `WORK/LOCK.md`). Committing and pushing this phase's
  changes needs to happen from a machine with real credentials.
- The unrelated, uncommitted UOM-conversion feature (ADR-006) found sitting
  in the working tree on claim is still there, still unclaimed, and still
  looks close to done — worth reconciling/committing separately.
