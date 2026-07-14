# Functional Rebrand Migration Plan — retire remaining "Finder"/"finder-pos" identifiers

Status: **Planned — not started.** This document is planning only; no code in this PR
changes runtime behavior. Written 2026-07-14, following #63 (design-standards enforcement,
cosmetic `SalesGent` cleanup) and #64 (brand primary-color unification).

## Why this exists

#63 and #64 removed every *cosmetic* old-brand reference (comments, tokens, docs prose).
What's left is **functional**: identifiers the running system depends on — cookie names,
localStorage keys, the live Vercel URLs, and the seeded demo credentials. These cannot be
renamed with a find-and-replace; a careless rename here logs out every active session,
breaks the frontend↔backend connection, or silently defeats a production security guard.
This plan sequences the rename so it can be executed with **no forced logout and no
downtime window**, using additive-then-retire patterns throughout.

## Full inventory (verified against the repo, 2026-07-14, commit `764d970`)

| Category | Identifier(s) | Blast radius | Runtime risk if renamed carelessly |
|---|---|---|---|
| Auth cookies | `finder_refresh` (httpOnly), `finder_session_hint` (readable) | 5 files | **High** — every logged-in user is forced to re-auth if frontend/backend disagree on the cookie name for even one deploy cycle |
| Client-side keys | `finder_pos_demo`, `finder_pos_mock_refresh`, `finder_pos_sync_outbox`, `finder_pos_user`, `finder_store_token`, `finder_capabilities_v*`, `finder_global_context_v*`, `finder_retail_setup_dismissed_v*` (localStorage) | 8 files | **Low** — one-time soft reset per browser (loses dismissed-setup flag, pending offline sync queue, cached capabilities). No auth impact; these are not cookies. |
| Live URLs | `finder-pos-backend.vercel.app`, `finder-pos-frontend.vercel.app` | 16 files (CORS allowlist, deploy script, CI, docs, tests) | **High** — frontend↔backend calls and CORS break if the URLs move without both sides updated in lockstep |
| Demo credentials | `owner@finder-pos.dev` / `cashier@finder-pos.dev` / `FinderDemo!2026` (`DEMO_PASSWORD` const at `src/identity/service.ts:62`) | 19 files (9 are backend, incl. the production **neutralize-demo** security guard) | **Medium** — no coupling to other systems, but the neutralize-demo guard (`src/identity/neutralize-demo.test.ts`) exists specifically to scramble this *exact* published password if it's ever detected in a production database. If the guard's literal isn't updated in lockstep with the new published password, the guard silently stops protecting anything. |
| Vercel project identifiers | `prj_krZ34CIFjzQrMvZ08PWqqbxzBf7d` (backend), `prj_TiPX9UYctGKJbQr4Lb1WFwSsKiN1` (frontend) | `scripts/deploy.sh` | **None if left alone** — these are immutable Vercel-assigned IDs, not derived from the project name. Renaming the *project* in Vercel does not change these IDs, env vars, secrets, or deploy history. |

## Phase 1 — Cookie rename (dual-write, then cutover)

Goal: rename `finder_refresh` → `ascend_refresh`, `finder_session_hint` → `ascend_session_hint`
with zero forced logouts.

1. **Dual-write deploy** (backend): on login/refresh, set *both* the old and new cookie
   names with identical values (`src/identity/routes.ts` — the 4 `res.cookie`/`clearCookie`
   call sites). On read, check the new name first, fall back to the old
   (`getCookie(req, "ascend_refresh") ?? getCookie(req, "finder_refresh")`).
2. **Dual-read deploy** (frontend): `web/middleware.ts` and `web/lib/auth.ts` check both
   cookie names the same way. Deploy frontend and backend together (or frontend first —
   reading a cookie that doesn't exist yet is harmless; the reverse order is what's unsafe).
3. **Soak period**: wait longer than the refresh-token rotation window (every active
   session naturally re-authenticates and picks up new-name cookies during normal use)
   before proceeding. A conservative soak is 2× the longest realistic session idle time.
4. **Cutover deploy**: stop setting/reading the old cookie names. Remove the fallback code.
   Any session that *only* ever had the old cookie (e.g., abandoned browser tab) simply
   redirects to `/login` once on next protected-route visit — a one-time re-auth, not an
   outage.
5. Update the 2 test files that assert on the literal old cookie name
   (`src/identity/identity.test.ts`, `web/tests/api-client.test.ts`).

## Phase 2 — Client-side storage keys (low-risk, single deploy)

These are not cookies and carry no auth coupling — safe to rename in one deploy, no
dual-write needed. Update the 8 files (`web/lib/auth.ts`, `web/lib/syncOutbox.ts`,
`web/lib/useFinderContext.tsx`, `web/contexts/CapabilitiesContext.tsx`,
`web/components/setup/RetailSetupChecklist.tsx`, `web/mocks/MockWorkerInit.tsx`, and the 2
test files) to the new key names. Effect on existing users: their dismissed-setup flag
resets once, and any not-yet-synced offline queue under the *old* key is orphaned in
localStorage (harmless, just unread) — call this out in the release notes so support isn't
surprised by "I dismissed that already" reports.

## Phase 3 — Live URLs (additive alias, then retire — no hard cutover)

Goal: move off `finder-pos-backend/frontend.vercel.app` without a moment where the old and
new URLs disagree.

1. In the Vercel dashboard, **add** the desired new domain (e.g. `ascend-backend.vercel.app`,
   `ascend-frontend.vercel.app`) as an *additional* alias on each existing project — do
   **not** rename the project's primary domain yet. Both URLs now resolve to the same
   deployment.
2. Update `ALLOWED_ORIGINS` (backend env var, currently defaults to the old frontend URL in
   both `src/app.ts:156` and `.env.example:81`) to include the *new* frontend URL alongside
   the old one during the transition.
3. Update `BACKEND_URL` (frontend build-time env, bakes into `NEXT_PUBLIC_API_BASE_URL` via
   `next.config.mjs` rewrites) to point at the new backend URL, and redeploy the frontend.
   Verify end-to-end against the new URL before touching anything else.
4. Update the 16 file references (`README.md`, `scripts/deploy.sh` `BACKEND_URL` constant,
   `scripts/ops-check.ts`, `.github/workflows/ci.yml`, `src/gateway/cors.test.ts`, docs) to
   the new URLs.
5. **Soak period**, then remove the old domain alias from both Vercel projects and drop the
   old URL from `ALLOWED_ORIGINS`.

Vercel project IDs (`prj_krZ34...`, `prj_TiPX9...`) never change through this — the deploy
script's `BACKEND_PID`/`FRONTEND_PID` constants stay as-is.

## Phase 4 — Demo credentials (single deploy, but update the security guard in lockstep)

1. Choose the new published demo email domain and password (e.g. `owner@ascend.dev`,
   a new `DEMO_PASSWORD` value in `src/identity/service.ts:62`). No real domain needs to be
   registered — `SENDGRID_API_KEY` is unset by default, so password-reset emails to this
   address already silently no-op in dev per `.env.example`; this has never been a
   deliverable mailbox.
2. Update `DEMO_PASSWORD` (1 constant, 9 backend references resolve automatically) and the
   hardcoded email list literals at `src/identity/service.ts:419-420,445`.
3. **Critical**: `src/identity/neutralize-demo.test.ts` and the neutralization logic it
   tests exist to scramble this *exact* email+password combination if ever found in a
   production database — this is what stops the well-known demo login from working against
   real customer data. Update the literal it checks for in the same commit as step 2, and
   re-run that test as a hard gate before merging (a stale guard is a real security
   regression, not just a cosmetic miss).
4. Propagate the new email/password to the remaining ~17 files: `scripts/seed-demo.ts`,
   `scripts/seed-e2e.ts`, `scripts/smoke.ts`, `web/mocks/handlers.ts` +
   `web/mocks/mockHandlers.ts`, `web/app/login/page.tsx` (placeholder text),
   `web/e2e/fixtures.ts` + `web/e2e/helpers.ts` + `web/e2e/global.setup.ts` +
   `web/e2e/login.spec.ts`, `README.md`, `web/README.md`,
   `docs/getting-started/local-development.md`, `desktop/README.md`.
5. Announce the new demo credentials wherever they're publicly documented (README is public
   on GitHub) before or at the same time as the deploy, so the published login keeps working
   continuously for anyone using the live demo.

## Suggested execution order

Phases are independent of each other (no phase blocks another) — recommended order is
**2 → 4 → 3 → 1**, cheapest/lowest-risk first, ending with the cookie rename once the team
has a working rhythm with the dual-write pattern from Phase 3's alias approach.

## Explicit non-goals of this plan

- Does not touch anything already resolved by #63/#64 (cosmetic names, design tokens).
- Does not propose renaming the GitHub repository itself (`Sricharangellu/Ascend` — already
  correctly named).
- Does not cover the Vercel *team* name (`gellusricharan-4715s-projects`) — cosmetic only,
  not customer-facing, out of scope.

## Rollback

Every phase is additive-before-subtractive (dual-write/dual-read, alias-before-retire), so
rollback at any point before the final "stop supporting the old value" step is just
re-deploying the previous commit — the old identifiers are still live and accepted. Only
the final cutover step of each phase is not trivially reversible; do those last, deliberately,
and only after the soak period confirms the new identifiers are working end-to-end.
