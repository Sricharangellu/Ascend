# Dead setup/* shim cleanup — completion note

**Date:** 2026-08-03
**Session:** Claude (Cowork, Sonnet 5) — Phase G of the UI Ponytail audit fix sequence,
continuing on `fix/ponytail-phase-ef-nav-loyalty-cleanup` after Phases D/E/F.

## What was fixed

Retail-core finding #3 (partial — the fully-dead half): `setup/payment-types`,
`setup/inventory-locations`, and `setup/users` were one-line re-export shims
(`../../settings/page`, `../../inventory/locations/page`, `../../team/page`
respectively) with **zero inbound references anywhere in the repo** — confirmed via
repo-wide grep (app code, tests, e2e specs) before deleting. Deleted all three files and
their now-empty directories.

**Not done in this pass** (the other half of finding #3 — the 7 shims that *are* wired
into `settings/page.tsx`'s tab navigation: `devices`, `payment-terms`, `payment-modes`,
`security`, `shipping`, `taxes`, root `setup/page.tsx`): those are load-bearing, not dead
weight — leaving them as-is.

**Also checked, deliberately not touched:** finding #1 (Module Marketplace triplication —
`setup/business-profile` + `setup/modules` vs. `settings/modes`). Unlike the three
deleted above, `/setup/modules` is directly exercised by `web/e2e/verticals.spec.ts`
(4 references via `expectAuthenticatedRouteHealthy`). Deleting it outright would break
those specs; the audit's alternative (converting it to a redirect stub, matching the
existing `catalog/price-book`/`inventory/expiry`/`inventory/transfers` pattern) needs the
e2e assertions checked/updated alongside the page change, which is more than a
this-session drive-by. Flagging as the next candidate, not attempting a rushed version of
it here.

## Files changed

- Deleted `web/app/(protected)/setup/payment-types/page.tsx`
- Deleted `web/app/(protected)/setup/inventory-locations/page.tsx`
- Deleted `web/app/(protected)/setup/users/page.tsx`

## Verification

- Repo-wide grep (via the Grep tool) confirmed zero references to any of the three paths
  before deleting — no app code, no test, no e2e spec.
- `npm run hygiene` — clean (1095 files).
- `npm run gap:scan` — clean (456 backend / 381 frontend paths, 21 allowlisted,
  unchanged — these were never real API-backed routes to begin with, just re-export
  shims).
- `npm run table:scan` — clean (161 table names, unaffected — frontend-only change).
- No backend change, so backend typecheck is unaffected by construction.

## Context — repo state as of this session

Two things worth recording since they happened between the last session and this one,
independent of this change:

1. **A large, unrelated codebase (~2100 files, a separate pnpm/Drizzle/Replit-scaffolded
   monorepo — `lib/api-client-react`, `lib/db`, `pnpm-workspace.yaml`, etc.) was
   accidentally merged into `develop`** via "Merge local workspace work into develop"
   (`64758a5`), then correctly reverted via PR #145 (`d35a98f`). Confirmed the revert is
   clean: `git diff 498beee d35a98f` is empty — `develop`'s tree is back to exactly
   where it was before the bad merge. No action needed from this session; noting it here
   since it's a significant incident that self-resolved between sessions.
2. **This branch (`fix/ponytail-phase-ef-nav-loyalty-cleanup`) is confirmed pushed**
   (Phases E + F, previously prepared as `pos-shared-metric-cleanup-rebased` locally,
   now live on `origin` under this name) and is a clean 5-commits-ahead-0-behind
   `develop` — ready for PR review/merge, unaffected by the incident above.
3. Two Cursor Agent branches now exist implementing parts of a separate, newer 142-route
   Ponytail audit: `cursor/ponytail-enterprise-ui-audit-72bc` (docs only) and
   `cursor/ponytail-wave0-honesty-72bc` (real code — sales→orders redirect, kiosk/error-
   center mock gating, Purchase→Cost Entry rename, brand cleanup). Both are based on the
   stale `e55e743` (pre-#134) point, not current `develop` — they'll need a rebase before
   merging, and are a different (complementary, not conflicting) slice of the Ponytail
   backlog than this session's work.
