# Audit — Wave A trust leftovers + Wave B palette / Cost Entry

UTC: 2026-08-03T050800Z  
Agent: Cursor Cloud `bc-c564feef`  
Branch: `cursor/ui-wave-ab-trust-speed-604f`  
Supersedes conflicting drafts: #139 (Wave A leftovers), #140 palette/Cost Entry slice

## What shipped

### Wave A — Trust
- `partial: true` on Error Center nav; Pipeline Overview/Receiving/Issues tabs + inventory Returns tab gated behind `NEXT_PUBLIC_SHOW_PARTIAL_PAGES`
- Replace silent `.catch(() => {})` with visible errors: gift cards list, dashboard side panels, AdjustModal locations
- **Dashboard outlet filter (#133 leftover)** — report `scope` uses `selectedOutletId` (empty = All Outlets); was decorative before

### Wave B — Speed
- Command palette `hrefForHit` → detail URLs (`/catalog/:id`, `/customers/:id`, `/vendors/:id`, `/purchasing/:id`, `/orders/:id`)
- Nav label Purchase → **Cost Entry**
- Unit tests: `commandPaletteHref.test.ts`, Error Center case in `navPartialGate.test.ts`

## Status

| Slice | Label |
|---|---|
| Partial gates | `built_verified` (unit tests) |
| Error surfacing | `built_unverified` (typecheck/lint/build) |
| Palette deep links | `built_verified` (unit tests) |
| Outlet filter scope | `built_unverified` | 

## Honest notes

- Does not include POS customer/gift-card (#163) or Return-stub removal (already on #163)
- Close #139 / #140 after this + #163 land (avoid duplicate conflict churn)
- Rebased onto post-Ponytail `develop` (`0a437bd`); hotfix #165 closed as superseded
