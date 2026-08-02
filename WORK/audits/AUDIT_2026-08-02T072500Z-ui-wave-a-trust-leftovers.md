# Ascend — Wave A trust leftovers (product-experience follow-on)

Date: 2026-08-02T072500Z  
Agent: Cursor Cloud `bc-c564feef` (Ascend UI ponytail audit)  
Branch: `cursor/ui-wave-a-trust-leftovers-604f`  
Continues: `AUDIT_2026-07-30T222326Z-product-experience-review.md` Wave A item 5  
(PR #133 Critical fixes remain separate / draft — not restacked here)

## What shipped

| Change | Status |
|---|---|
| Nav: `/inventory/errors` (Error Center) marked `partial: true` | `built_verified` (unit test) |
| Pipeline tabs Overview / Receiving / Issues gated behind `NEXT_PUBLIC_SHOW_PARTIAL_PAGES` | `built_unverified` (manual) |
| Inventory Overview **Returns** tab gated the same way (allowlisted missing BE) | `built_unverified` |
| Inventory overview load/load-more: error banner + Retry (no silent empty) | `built_unverified` |
| Gift cards list load: error banner + Retry | `built_unverified` |
| AdjustModal locations load: alert + disable save | `built_unverified` |
| Terminal locations load + stock deduct: error toasts (payment still succeeds) | `built_unverified` |
| Dashboard secondary panels (low stock / notifications / outlets): alert on failure | `built_unverified` |

## Verification

- `node tools/hygiene-check.mjs` — PASS  
- `cd web && npm run typecheck` — PASS  
- `cd web && npm run lint` — PASS (pre-existing warnings only)  
- `cd web && npx vitest run tests/navPartialGate.test.ts` — 5/5 PASS  

## Honest limits / next

- Does **not** re-ship PR #133 Critical contract fixes (AR aging, Quick Sell, etc.) — merge that PR separately.  
- Wave B still open: POS customer/GC tender, hide Hold/Drawer stubs, command-palette entity deep-links, receive-path consolidation, aging party-name joins.  
- NEEDS-SRI items (receiving sessions, issues engine, EDI bytes) unchanged — only Preview-gated so they stop looking production-live.
