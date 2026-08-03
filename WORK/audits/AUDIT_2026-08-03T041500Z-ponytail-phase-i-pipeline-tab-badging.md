# AUDIT — Ponytail Phase I: /inventory/pipeline tab-level mock badging

Date: 2026-08-03T04:15:00Z
Branch: `fix/ponytail-phase-i-pipeline-tab-badging`

## Context

Next item in the priority queue from `WORK/FORWARD_PLAN.md`'s Phase 9: Phase
H deliberately left `/inventory/pipeline` alone because 3 of its 6 tabs
(Pending, Reorder Alerts, History) are backed by real routes
(`src/modules/inventory/pipeline-routes.ts`, covered by `pipeline-views.
test.ts`) while 3 (Overview/Summary, Receiving, Issues) are MSW-mock-only
with no backend route anywhere in `src/modules/inventory/`. Page-level
`partial: true` nav-gating (the pattern used for Kiosk Mode / Error Center
in Phase H) would have hidden the whole route, taking the working tabs down
with it — this needed tab-level treatment instead.

## What was done

Single file: `web/app/(protected)/inventory/pipeline/page.tsx`.

- Added a `mock?: boolean` field to the `TABS` array, set on the 3 mock-only
  tabs (`overview` labeled "Pipeline", `receiving`, `issues`).
- Tab buttons now render a small outlined gray `Badge` ("Preview") next to
  the label when `mock` is set, reusing the existing `Badge` component
  (`web/components/Badge.tsx`) rather than inventing new styling.
- Added a one-line dismissable-free notice (`role="status"`) above the tab
  content area when the active tab is a mock one: "Preview — this tab shows
  sample data. It isn't backed by a live API yet." Kept to the one file;
  didn't touch the 3 mock tab components themselves or the 3 real ones.

Confirmed via `Grep` before editing: zero references to `/inventory/pipeline`
or its tab labels/`role="tab"` structure in `web/e2e/**` or `web/tests/**`,
so this couldn't break e2e or component tests.

## Verification

- `npx eslint` on the touched file (via `node node_modules/eslint/bin/
  eslint.js`, see sandbox note below): clean.
- `npx tsc --noEmit` (full frontend): clean, 0 errors.
- `npm run hygiene` / `gap:scan` / `table:scan`: all pass (rebased onto
  latest `origin/develop` after PR #154 landed mid-session; counts moved
  from unrelated backend work, not from this change — 460 backend / 381
  frontend paths, 163 table names, both zero-collision/zero-gap).
- Frontend-only change, no schema/route impact.

## Sandbox incident this pass, fixed (not left broken)

While chasing an unrelated `eslint: not found` / missing `node_modules/.bin`
error to verify this change, traced it back to **this session's own earlier
Next.js version-bump attempt** (see `WORK/audits/AUDIT_2026-08-03T033000Z-
security-audit-jwt-secret-guard.md`) — the interrupted `npm install` calls
during that attempt left `web/node_modules` genuinely broken: `.bin` was
empty, and `node_modules/next` was missing all its `.d.ts` files entirely
(confirmed via `npx tsc --noEmit` failing with `TS7016: Could not find a
declaration file for module 'next/...'` across ~20 files, not just the one
touched here). Because this sandbox's working directory is a live mount of
the real project folder, this was a real, not just ephemeral-sandbox, state.

Fixed in two steps: `npm rebuild` (fast, restored `.bin` without a full
re-resolve) got tooling working again, then `rm -rf node_modules/next &&
npm install next@14.2.29` (targeted, ~23s) restored the missing `.d.ts`
files. Both `npm install` invocations rewrote `package.json` (added an
unwanted `^` range) and `package-lock.json` (same range change plus ~30
lines of unrelated `"peer": true` churn, apparently from npm recomputing the
peer graph) as side effects — reverted both files via `git checkout --` back
to their committed state once `node_modules` itself was verified working
(`ls node_modules/next/*.d.ts`, then a full clean `tsc --noEmit`), so no
lockfile drift got committed. `npx tsc --noEmit` on the whole frontend is
clean now, not just on the one file this phase touched.

Flagging for whoever picks up the Next.js 14.2.35 bump (Phase 9, item 4):
budget for `npm install` in this specific sandbox to reliably exceed 45s and
potentially leave `node_modules` in a broken intermediate state if
interrupted — `npm rebuild` is the fast recovery step if `.bin` goes empty,
but a genuinely missing package (like `next` was here) needs a targeted
`rm -rf node_modules/<pkg> && npm install <pkg>@<version>` to actually
restore it, not just `npm rebuild`.

## Branch status

`fix/ponytail-phase-i-pipeline-tab-badging`, rebased onto current
`origin/develop` (`9f3952f`, PR #154) — clean fast-forward candidate. Push
command for Sri: `git push origin fix/ponytail-phase-i-pipeline-tab-badging:develop`
