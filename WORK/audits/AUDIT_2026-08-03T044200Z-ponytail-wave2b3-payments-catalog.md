# Audit — Ponytail Wave 2b + Wave 3 (Payments → Orders, catalog tabs)

| Field | Value |
|---|---|
| Date (UTC) | 2026-08-03T04:42:00Z |
| Parent | Ponytail master index Waves 2–3; stacks on Waves 0–2 ported to `develop` |
| Branch | `cursor/ponytail-implement-4fe7` |
| Status | `built_unverified` — gates pending in this audit snapshot |

## What changed

1. **Sales conflict fix** — Wave 0 cherry-pick left conflict markers in committed `/sales`; page is a clean `redirect("/orders")`.
2. **Payments consolidate** — `/payments` → `redirect("/orders")` + permanent next.config redirect; Sell nav Payments item removed. Tender detail remains on `/orders/[id]` Payments tab.
3. **Catalog `[id]` Wave 3** — top-level tabs collapsed **15 → 6**: Overview, Details, Pricing, Stock, Purchasing, Activity.
   - `DetailsWorkspace` — product / variants / categories / media / labels / compliance / online
   - `StockWorkspace` — on-hand + expiry
   - `ActivityWorkspace` — transactions + analytics + audit
   - Overview deep-links remap via `resolveTab()`
4. **Deleted orphan** — unused `ReorderSuggestionsTab.tsx` (never imported).

## Remaining (later waves)

- Returns split (customer vs vendor)
- Wave 4 DS pass on keepers (slate → erp tokens on legacy catalog leaf tabs)
- Wave 5 POS stub honesty (overlap with PR #140)
- Delete dead `/reporting/*` folders after redirects bake

## Status labels

| Surface | Status |
|---|---|
| `/payments` redirect | `built_unverified` |
| `/catalog/[id]` 6-tab IA | `built_unverified` |
| `/sales` clean redirect | `built_unverified` |
