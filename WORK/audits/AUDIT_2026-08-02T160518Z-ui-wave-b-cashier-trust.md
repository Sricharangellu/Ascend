# Ascend — Wave B cashier & buyer trust (product-experience follow-on)

Date: 2026-08-02T160518Z  
Agent: Cursor Cloud `bc-c564feef` (Ascend UI ponytail audit)  
Branch: `cursor/ui-wave-b-cashier-trust-604f`  
Continues: `AUDIT_2026-07-30T222326Z-product-experience-review.md` Wave B items 6–8 (S-scope slice)

## What shipped

| Change | Status |
|---|---|
| POS action bar: remove Hold / Drawer / Receipt / Return stubs (kept Discount + Complete) | `built_unverified` |
| Checkout status strip: drop fake Return-mode pill | `built_unverified` |
| Shortcuts overlay: only list wired shortcuts (no F1–F4 / Ctrl+P fiction) | `built_unverified` |
| Command palette `hrefForHit` → entity detail URLs for product/customer/vendor/PO/order | `built_verified` (unit test) |
| Nav: rename Purchase → Cost Entry; page title aligned | `built_unverified` |
| Returns desk copy no longer claims POS return-mode is enabled | `built_unverified` |

## Verification

- `node tools/hygiene-check.mjs` — PASS  
- `cd web && npm run typecheck` — PASS  
- `cd web && npm run lint` — PASS (pre-existing warnings only)  
- `cd web && npx vitest run tests/commandPaletteHref.test.ts` — 2/2 PASS  

## Honest limits / next

- Does **not** implement real Hold / cash-drawer kick / receipt reprint / in-cart returns / gift-card tender / customer attach — those remain Wave B M–L work.  
- Invoice / sales_order still land on list hubs (no detail routes yet); quotation → `/quotes` list.  
- Aging party-name BE joins (Wave B item 9) not started — needs backend change.  
- PR #139 (Wave A) and PR #133 (Critical FE contracts) remain separate drafts.
