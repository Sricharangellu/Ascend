# Ascend — Wave B item 9: aging party names + deep links

Date: 2026-08-02T200816Z  
Agent: Cursor Cloud `bc-c564feef` (Ascend UI ponytail audit)  
Branch: `cursor/aging-party-names-deeplinks-604f`  
Continues: `AUDIT_2026-07-30T222326Z-product-experience-review.md` Wave B item 9

## What shipped

| Change | Status |
|---|---|
| BE `arAging` LEFT JOIN `customers` → `AgingRow.partyName` | `built_verified` (integration test) |
| BE `apAging` LEFT JOIN `suppliers` → `AgingRow.partyName` | `built_verified` (same test) |
| FE `AgingRow.partyName` in `web/api-client/types.ts` | `built_verified` (typecheck) |
| `/reports/ar-aging` reads `AgingReport` (was wrong `items` shape → permanently empty) + customer deep links | `built_unverified` |
| Accounting AR/AP: party name column + links; aging summary top parties with names | `built_unverified` |

## Verification

- `npm run typecheck` (backend) — PASS  
- `cd web && npm run typecheck` — PASS  
- `cd web && npm run lint` — PASS (pre-existing warnings only)  
- `node tools/hygiene-check.mjs` — PASS  
- Reports test `AR aging joins customer names; AP aging joins supplier names` — PASS (embedded Postgres harness)

## Honest limits / next

- Overlaps PR #133's AR aging contract remapping; this PR also adds names + accounting deep links. Merge either first; expect a small conflict on `ar-aging/page.tsx` if both land.  
- Invoice/bill rows without an open aging balance still fall back to raw IDs for the name column (names come from the aging join, not a full customer/supplier directory fetch).  
- No dedicated `/reports/ap-aging` page yet — AP names surface on accounting.  
- Remaining Wave B M–L: POS customer attach, gift-card tender, real Hold/drawer.
