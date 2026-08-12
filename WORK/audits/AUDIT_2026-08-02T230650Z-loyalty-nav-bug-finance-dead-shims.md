# Loyalty nav bug + orphaned finance shims — completion audit

**Date:** 2026-08-02
**Session:** Claude (Cowork, Sonnet 5) — Phase F of the UI Ponytail audit fix sequence
(Phase A sales-history #135, B returns-refund #136, C terminal cleanup #137 — all
already merged to `develop`; Phase D KpiCard dedupe and Phase E workforce/notifications
nav — both committed this branch, `e8c2add`/`3144537`, not yet pushed).

## What was fixed

**Retail-core audit finding #2** ("`setup/loyalty` is a live navigation bug, not just
clutter"): `web/app/(protected)/setup/loyalty/page.tsx` re-exported the unrelated
top-level `/loyalty` app (Tiers/Members/Rewards) instead of `../../settings/page`, the
pattern every one of its seven siblings (`devices`, `payment-terms`, `payment-modes`,
`security`, `shipping`, `taxes`, root `setup/page.tsx`) already uses. Settings'
"Loyalty Tiers" tab links to `/setup/loyalty` expecting the tabbed Settings shell
(`sectionFromPath` already correctly maps `pathname.endsWith("/loyalty")` to the
`loyalty` section, which renders `<LoyaltyTiersSection />` inline) — instead the user
was dropped onto a completely different full-page app. Fixed by changing the one-line
re-export to match every sibling shim. Verified `LoyaltyTiersSection` has no path
assumptions of its own (self-contained, fetches its own data).

**Retail-core audit finding #12** (partial — the two truly orphaned shims only):
`finance/payment-made/page.tsx` and `finance/settings/page.tsx` were one-line
re-export shims with zero inbound references anywhere in `web/` (confirmed by
repo-wide grep before deleting — `finance/payment-made` had one *dead* reference, a
`financeTabFromPath()` path-matcher branch that would fire if anything ever navigated
there, but nothing does; `finance/settings` had none at all). Deleted both files (and
their now-empty directories) and removed the dead `pathname.endsWith("/payment-made")`
branch from `financeTabFromPath()` in `finance/page.tsx`, leaving a comment explaining
why.

**Deliberately NOT done** (per finding #12's remaining scope + finding #8): did **not**
touch `finance/bills/page.tsx` — unlike its two siblings, it's still actively used
(finance/page.tsx's AP-tab click handler does `router.replace("/finance/bills")`).
Deleting it now would break that redirect. Repointing the AP tab to go straight to
`/bills` and removing `finance/bills` as a redirect-hop is finding #8's job (the AP
tab also has ~65 lines of dead JSX behind that redirect, and duplicated
`PayControl`/billing helpers with `accounting/page.tsx` — a bigger, riskier refactor
better done as its own change, not bundled into this cleanup).

## Files changed

- `web/app/(protected)/setup/loyalty/page.tsx` — one-line re-export target fixed.
- `web/app/(protected)/finance/payment-made/page.tsx` — deleted.
- `web/app/(protected)/finance/settings/page.tsx` — deleted.
- `web/app/(protected)/finance/page.tsx` — removed the now-dead path-matcher branch,
  with an explanatory comment.

Zero overlap with the other branches currently in flight
(`chore/reporting-reports-dedup`, `cursor/ui-wave-a-trust-leftovers-604f`,
`cursor/ui-wave-b-cashier-trust-604f`) — none of them touch `setup/loyalty` or any
`finance/*` file.

## Verification (same sandbox constraints as the prior Phase E audit)

- `npx eslint` on all three touched/added files (`finance/page.tsx`,
  `setup/loyalty/page.tsx`) — clean, zero output.
- Repo-wide grep (via the Grep tool, not raw recursive `grep` — the latter choked on
  `.next`/`node_modules` and timed out) confirmed zero remaining references to
  `finance/payment-made` or `finance/settings` anywhere in `web/`, `web/tests/`, or
  `web/e2e/` before deleting.
- No existing test file references `financeTabFromPath`, the deleted routes, or
  `setup/loyalty` — nothing to regress, nothing to update.
- Full `web` typecheck/lint/build still could not be run in this sandbox (same
  documented 45s-per-call ceiling as every prior entry — not attempted redundantly
  this time, see the Phase E audit for the direct proof this is an environment limit).

## File-deletion note (new this session)

Deleting files under the connected `Ascend` folder initially failed with `Operation not
permitted` — this folder's mount blocks unlink by default. Called
`allow_cowork_file_delete` for both target files, which enabled deletion for the
session; a stray dummy test file created while diagnosing this was also cleaned up
immediately after.

## Status

Committed locally. Same push limitation as every other entry in `WORK/LOCK.md` — no
GitHub credentials in this sandbox.
