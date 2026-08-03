# Audit — Profit Visibility Metrics (FORWARD_PLAN queue #4)

- **UTC**: 2026-07-06T14:36:26Z
- **Session**: Claude session E (desktop app, "continue")
- **Queue item**: #4 — Add profit visibility metrics (wire expenses into retail-proof)
- **Status label**: `built_verified`

## What shipped

`GET /api/v1/reports/retail-proof` now reports **net** profit, not gross-only, by
joining the live expenses module (queue #3) into the readiness report.

### `src/modules/reports/service.ts` — `retailProof()`
- `RetailProof.metrics` extended with: `grossProfitCents`, `expensesCents`,
  `netProfitCents`, `grossMarginPct` (number|null), `netMarginPct` (number|null).
- `RetailProof.expenses` type changed from the honest-unbuilt disclaimer form to
  `{ available: boolean; totalCents: number; count: number; uncategorizedCount: number }`.
- Added an expenses aggregate query (tenant-scoped, integer cents):
  `SELECT COALESCE(SUM(amount_cents),0), COUNT(*), COUNT(*) FILTER (WHERE category IS NULL)`
  over the recent window, producing `expensesCents`, `expensesCount`, `uncategorizedExpenses`.
- `grossProfitCents = revenueCents - cogsCents`; `netProfitCents = grossProfitCents - expensesCents`.
- Margins are revenue-relative and **null-safe** (null when `revenueCents === 0`, never divide-by-zero).
- `expenses` return object flipped to `available: true` with the real totals.

### Deterministic profit signals (rule-based, per AI/Recommendations rule)
- `negative_net_profit` (**critical**) — fires when `revenueCents > 0 && netProfitCents < 0`.
- `uncategorized_expenses` (**info**) — fires when `uncategorizedExpenses > 0`.
No AI-invented output; both are pure rules over real data.

### `src/modules/reports/reports.test.ts`
- Updated the seeded-baseline test: `expenses.available === true`, `totalCents === 0`.
- New test "profit visibility — expenses reduce net profit and raise signals":
  sells a stocked product (net == gross when no expenses), records an expense
  larger than gross profit, asserts `expensesCents`, `netProfitCents = gross - expenses`,
  negative net, computed `netMarginPct`, and both new signals present.

## Verification (command gates)
- Backend `npx tsc -p tsconfig.json --noEmit`: **0 errors**.
- Reports suite (real Postgres, single isolated run — tooling-incident discipline): **6/6 pass**.
- `npm run smoke`: **20/20 — full POS lifecycle verified**.

## Scope discipline
- No new tables, no new module, no web changes, no other-module edits.
- Single isolated test runs only (no concurrent full-suite runs).

## Follow-ups (unchanged queue)
- #5 progress intelligence model; #6 deterministic recommendation engine
  (retail-proof `signals[]` is the seed); #7 segmented business health scores.
- Frontend: wire RetailSetupChecklist + dashboard to retail-proof; build expenses page.
