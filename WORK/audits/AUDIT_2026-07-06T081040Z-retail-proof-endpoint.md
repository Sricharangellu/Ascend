# Audit — retail proof audit endpoint

Status label: **built_verified**

## What (FORWARD_PLAN queue #2)
New `GET /api/v1/reports/retail-proof?recentDays=30` — a real-data retail readiness
report (reports read-model, tenant-scoped, read-only). Backend authority for the setup
checklist + the deterministic recommendation signals.

- setup: 7 tasks as booleans (outlet, register, taxRate, paymentModes, receipt,
  firstProduct, firstReceiving) + completed/total.
- metrics: productCount, activeProductCount, productsWithoutCost, totalStockUnits,
  low/outOfStock, orderCount, revenueCents, cogsCents, grossProfitCents,
  productsNeverSold, productsNoRecentSales.
- signals: DETERMINISTIC rule-based (AGENTS.md "AI/Recommendations Rules" — no AI):
  setup_incomplete, no_products, products_without_cost, out_of_stock, low_stock,
  no_sales_yet, products_never_sold, slow_movers.
- expenses: honestly reported unbuilt (available:false) — queue #3.

Every figure from real tables. Receipt detected via non-empty saved template.

## Verified
- reports.test.ts +2 (suite 5/5, real Postgres): seeded-baseline not-ready; receive +
  cost-gap + sale path.
- backend tsc 0; smoke 20/20 (earlier run).

## INCIDENT (needs Sri's awareness)
During verification the working tree lost src/modules/* and src/identity/* from DISK
(unexplained; occurred while TWO full backend suites ran concurrently in this SECOND
clone — 'finder-pos-github' — which AGENTS.md explicitly warns against). No data lost:
origin was clean at the claim commit; a bad local commit that recorded the deletion was
discarded via 'git reset --hard' to origin, and this endpoint was re-applied from
session record and re-verified. LIKELY TRIGGER: concurrent test runs and/or the
second-clone setup. MITIGATION going forward: single clone, never run two full suites at
once. See WORK/WORK_STATE.md.

## Follow-ups
- Wire the frontend RetailSetupChecklist to this single endpoint (replaces client-side
  multi-fetch).
- Backbone for queue #6 (deterministic recommendation engine) — signals[] is the seed.
- Expenses (queue #3) adds spend/net coverage the report currently disclaims.
