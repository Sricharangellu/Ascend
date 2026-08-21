# Nav-reachability fix: Workforce + Notifications — completion audit

**Date:** 2026-08-02
**Session:** Claude (Cowork, Sonnet 5) — continuing the Ponytail-audit fix sequence
(`AUDIT_2026-07-31T200054Z-ui-ponytail-retail-core.md`) after Phase A (sales-history,
PR #135), Phase B (returns-refund-confirmation, PR #136), Phase C (terminal cleanup,
PR #137), and Phase D (KpiCard dedupe on returns/payments, uncommitted-then-committed
this session as `e8c2add` on `feature/pos-shared-metric-cleanup`, not yet pushed/PR'd).
This is the next fix in that sequence, addressing two of the retail-core audit's
**High priority** findings that were still open.

## What was fixed

**Finding #5** (`workforce/page.tsx` is fully built and completely orphaned): shift
scheduling, shift modal, and time-off approval all work end-to-end, but zero `Link`
references existed anywhere in the app — confirmed by full-tree grep before this fix.
Added one nav entry (`{ label: "Workforce", href: "/workforce", featureGate: "workforce" }`)
to the Inventory rail section in `web/components/EnterpriseShell.tsx`, matching where
`SECTION_MAP` already placed the `workforce` `NavKey` (`workforce: "inventory"`, line 52).
`"workforce"` was already a registered `FeatureId` and already present in
`FEATURE_GROUPS`/`web/lib/features.ts` — no registry change needed for this one.

**Finding #10** (`notifications/page.tsx` fully built but missing from the sidebar nav):
the page is a backend-persisted inbox with channel preferences, alert rules, and digest
scheduling — distinct from the header bell, which is an ephemeral SSE stream with no
persistence. `notifications` was already a valid `NavKey` mapped to the `setup` rail
section (`SECTION_MAP`, line 57), but, unlike this audit's `workforce` finding, it was
**not** a registered `FeatureId` at all — missing from both the `FeatureId` union and
`FEATURE_GROUPS` in `web/lib/features.ts`. Fixed both:
- Added `"notifications"` to the `FeatureId` union and to `FEATURE_GROUPS`'s
  Administration group (same group as the already-present `audit-log`, a similarly
  core/always-on module).
- Added the nav entry to the Setup rail section in `EnterpriseShell.tsx`.
- Added a "Manage notifications →" footer link inside `NotificationBell.tsx`'s dropdown
  panel, per the audit's own suggested fix, so the ephemeral bell and the persisted inbox
  are discoverable from one another.

Confirmed this doesn't regress the RBAC model: `PermissionsContext.hasFeature()` grants
`owner`/`admin` everything unconditionally, and grants `manager` (and any other
`ALL_ACCESS_ROLES` member) every id in `ALL_FEATURES` (which is derived from
`FEATURE_GROUPS`, so it picks up `"notifications"` automatically now); restricted
custom roles get nothing extra unless a role is explicitly granted the new
`"notifications"` permission via `settings/permissions` (same mechanism as every other
feature id — `custom_roles.permissions` is a free-form `string[]` on the backend with
no fixed enum, confirmed by reading `src/modules/custom_roles/service.ts`, so adding a
new frontend-only id here doesn't require a backend migration or allowlist change).

`routeEnabled()` (`CapabilitiesContext.tsx`) fails open for both routes: `/workforce`
has a registered module route (`moduleRegistry.ts`, `workforce` key) but nothing
disables it by default; `/notifications` has no `route` field on its `core: true`
module entry at all, so it can never appear in a tenant's disabled-routes list — it's
unconditionally reachable once the feature gate above is satisfied.

## Files changed

- `web/lib/features.ts` — `"notifications"` added to `FeatureId` union + Administration
  `FEATURE_GROUPS` entry (additive only).
- `web/components/EnterpriseShell.tsx` — two new `NavChild` entries (Workforce under
  Inventory, Notifications under Setup). No existing entries touched.
- `web/components/NotificationBell.tsx` — new footer link + `next/link` import.

Deliberately did **not** touch `returns/page.tsx`, `sales/page.tsx`,
`inventory/pipeline/page.tsx`, `terminal/**`, or any other file currently in flight on
`chore/reporting-reports-dedup`, `cursor/ui-wave-a-trust-leftovers-604f`, or
`cursor/ui-wave-b-cashier-trust-604f` (all unmerged as of this session — see the
coordination note in `WORK/LOCK.md`). This fix's three files have zero overlap with any
of those branches.

## Verification (sandbox-constrained — see note)

This Cowork sandbox cannot sustain a single tool call long enough to run a full
`cd web && npm run typecheck` (a documented, pre-existing limitation of this
environment — see `WORK/LOOP_STATE.md` iteration 17 and others for the same finding on
unrelated work). Ran what the 45s-per-call ceiling allows instead:

- `npx eslint components/EnterpriseShell.tsx components/NotificationBell.tsx lib/features.ts`
  — **clean, zero output** (no errors, no warnings).
- `npx vitest run tests/navPartialGate.test.ts` — **4/4 passing**, the one existing test
  that exercises `isNavChildVisible`/`EnterpriseShell` nav-gating logic (it tests the
  gating function directly, not a specific nav entry, so it isn't a snapshot that would
  need updating for the two new entries — confirmed by reading the test file).
- Manual registry-consistency check: confirmed `"workforce"` was already both a
  `FeatureId` and a `moduleRegistry.ts` entry with `route: "/workforce"`; confirmed
  `"notifications"` was a `core: true` module (always enabled) with no `route` field
  (so `routeEnabled()` can never disable it); confirmed no duplicate ids exist in the
  updated `FEATURE_GROUPS` list (37 ids, 0 duplicates, checked via a one-line Node
  script).
- Confirmed both target pages (`app/(protected)/workforce/page.tsx`,
  `app/(protected)/notifications/page.tsx`) exist and are the ones the new hrefs point
  to.

**Not run in this session** (sandbox limitation, not a known failure): full
`npm run typecheck`, `npm run lint` (project-wide), `npm run build`. Nothing above gives
any reason to expect these would fail — the change is three small, additive edits to
files with no complex type surface — but this is a scoping limitation to disclose
honestly, not a clean bill of health from the full gate.

## Status

Committed locally (not pushed — this sandbox has no GitHub credentials, same
limitation recorded against nearly every other entry in `WORK/LOCK.md`). Sri: push
`feature/pos-shared-metric-cleanup` and open/update its PR when convenient; run the
full `web` gate (`typecheck && lint && build`) on a real machine or in CI before
merging, per the verification gap noted above.

## Remaining open findings from the two Ponytail audits (not addressed this session)

For reference, still open after Phases A-E: retail-core findings #1-#4, #6-#9 (all
High/Medium priority Setup/Settings/Team, Catalog/Inventory, and Purchasing/Finance
consolidations), plus everything in the remaining-scope audit (golf mock-duplication
cluster, automotive/service-orders merge, restaurant-dashboard mock endpoint, etc.).
Recommend picking the next one by the same rule this whole sequence has followed:
smallest safe change, least file overlap with branches already in flight.
