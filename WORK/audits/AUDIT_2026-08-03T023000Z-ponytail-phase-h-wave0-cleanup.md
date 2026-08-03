# AUDIT — Ponytail Phase H: Wave 0 cleanup (brand strings + fake-save/mock-only gating)

Date: 2026-08-03T02:30:00Z
Branch: `fix/ponytail-phase-h-wave0-cleanup` (off `origin/develop` @ `801b7a4`)
Source: `WORK/audits/AUDIT_2026-08-02T230500Z-ponytail-enterprise-ui.md` (142-route
Cursor audit, `cursor/ponytail-enterprise-ui-audit-72bc`), Wave 0 backlog.

## Context

Continuing the Ponytail UI-audit fix sequence (Phases E/F/G already
shipped/prepared). The next queued item, finding #4 (`/team/custom-roles` vs
`/settings/permissions`), is explicitly flagged **NEEDS-SRI** in the audit
("blocked on Sri contract decision" — Wave 2 backlog line: "custom-roles ↔
permissions (NEEDS-SRI) | CONSOLIDATE") because it requires choosing which
backend API surface (`/custom-roles` vs `/settings/custom-roles`) becomes
canonical. Not something to decide unilaterally — deferring until Sri weighs
in, per this repo's own governance pattern for NEEDS-SRI items.

Picked up the four Wave 0 ("Critical" priority, smallest-scope) items instead.

## What was done

1. **Brand string cleanup** (audit: "Fix brand strings (`finder-pos.app`, the
   'F' logo)"): the product is Ascend; found leftover pre-rebrand strings in
   3 user-visible locations plus the auth-pages logo mark.
   - `web/components/AuthShell.tsx` — logo glyph `F` → `A` (single component,
     used by all 7 auth pages: signup, login, mfa, forgot/reset-password,
     security-alert, device-verification — one edit point, page `<title>`
     and PWA manifest already said "Ascend" correctly).
   - `web/app/(protected)/settings/kiosk/page.tsx` — `KIOSK_URL`
     `finder-pos.app/kiosk` → `ascend.app/kiosk`.
   - `web/app/(protected)/settings/b2b/page.tsx` — `PORTAL_URL`
     `finder-pos.app/b2b/portal` → `ascend.app/b2b/portal`.
   - `web/app/(protected)/ecommerce/page.tsx` — storefront URL display string
     `store.finder-pos.app/demo` → `store.ascend.app/demo`.
   - Left alone (internal, non-user-visible, out of scope): BroadcastChannel/
     IndexedDB/cache key names (`finder-pos-outbox`, `finder-pos-display`,
     `finder-pos-shell-v2`), backend CORS allowlist entries in `src/app.ts`,
     Sentry tag string, trial-expiry job's fallback `APP_URL`/`EMAIL_FROM`,
     and ~76 `test-secret-finder-pos` JWT fixtures in `*.test.ts` files —
     changing these has real (if small) config/test-fixture risk for zero
     user-visible benefit, so not touched this pass.

2. **Kiosk fake-save gating** (audit: "Badge/hide kiosk until save is real"):
   confirmed `handleSave` in `settings/kiosk/page.tsx` is a pure no-op —
   `await new Promise(r => setTimeout(r, 700))` then flips local UI state;
   no `apiPost`/`apiPatch` call exists in the file at all, so every toggle
   (enabled, pin, idle timeout, show-prices, allowed methods) silently
   reverts on reload. Rather than inventing a backend contract for this
   speculatively (that's a REWRITE decision, not this pass's scope), applied
   the exact convention this repo already uses for mock-backed pages: added
   `partial: true` to the "Kiosk Mode" nav entry in
   `web/components/EnterpriseShell.tsx`, matching the existing Warehouse/
   Pricing/Promotions/Document Center pattern (hidden from nav unless
   `NEXT_PUBLIC_SHOW_PARTIAL_PAGES=true`, per the doc comment on the
   `partial` field itself).

3. **`/inventory/errors` (Error Center) gating**: confirmed all of it
   (summary, list, detail/PATCH) is MSW-mock-only — grepped `src/modules/
   inventory/` for `errors` routes and found none; the only implementation
   is `web/mocks/mockHandlers.ts` lines ~8134-8178. Added `partial: true` to
   its nav entry, same convention as above.

## Deliberately not done this pass (documented, not silently skipped)

- **`/inventory/pipeline`**: audit calls out 3 of its 6 tabs (Overview/
  Summary, Receiving, Issues) as mock-only, but Pending, Reorder Alerts, and
  History are backed by real routes (`src/modules/inventory/pipeline-
  routes.ts`, covered by `pipeline-views.test.ts`). Marking the whole route
  `partial: true` would hide genuinely-working functionality alongside the
  fake tabs — this needs tab-level badging, not page-level nav hiding. Next
  candidate, not a same-session drive-by.
- **`/sales` "mock history"**: audit's own claim looks stale. Re-verified
  directly — `sales/page.tsx` calls a real `apiGet('/api/v1/sales/history')`
  backed by a genuine SQL-joined route in `src/modules/sales/routes.ts`
  (orders/customers/users/inventory_locations/order_lines/payments,
  keyset-paginated), covered by tests in `sales.test.ts`. No action taken;
  this finding appears to have already been fixed in a prior pass and the
  audit doc (written same day, different branch) wasn't re-synced against
  it. No re-audit doc correction made here since this is a read-only
  finding, not a change to defend.
- Confirmed via `Grep` on `web/e2e/**`: zero references to `/settings/kiosk`
  or `/inventory/errors`, so gating either route behind `partial` cannot
  break e2e specs (same check applied before Phase G's shim deletions).

## Verification

- `npx eslint` (from `web/`) on all 5 touched files: clean, zero warnings.
- `npm run hygiene`: ✓ 1096 files scanned, no junk/secrets/broken links.
- `npm run gap:scan`: ✓ no unexplained FE→BE gaps (456 backend / 381 frontend
  paths, 21 allowlisted — unchanged from before this pass, as expected for a
  nav-gating + string change with no route additions/removals).
- `npm run table:scan`: ✓ 161 table names, no collisions (unaffected, no
  schema touched).
- Frontend-only change; no DB/schema/config impact.

## Branch status

`fix/ponytail-phase-h-wave0-cleanup`, single commit, built directly on current
`origin/develop` (`801b7a4`) — clean fast-forward candidate, no rebase
required. Push command for Sri:
`git push origin fix/ponytail-phase-h-wave0-cleanup:develop`
