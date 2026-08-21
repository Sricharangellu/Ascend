# ADR-008: Authorization on mutating routes is enforced by a scanner that understands the code, not a grep

Date: 2026-08-06 · Status: Accepted
Owner: Claude Code session — enterprise platform audit (`claude/ascend-erp-platform-audit-a80478`)

**Context:** `ci.yml`'s `guard` job carried a step named "No unguarded mutation routes
(router.patch/delete without requireRole)" from the day the pipeline was written. It was
inert twice over.

First, the step ended in `|| echo "All mutation routes have role guards ✓"`. That discards
the pipeline's exit status, so the step printed a ✓ and exited 0 on every run it ever made.
It had never once evaluated the codebase. This is the same shape as the SQL-injection
guard's defect (`\(` left an unclosed BRE group, grep exited 2, a leading `!` inverted the
error into a pass), which was fixed in `c00a485`. Both were filed together in
`WORK/LOOP_STATE.md` as F-1 and F-2; this ADR closes F-2.

Second — and this is why fixing the `|| echo` alone was not enough — the detection was
wrong. The grep only recognised the literal text `requireRole` on the route's own line.
This repo's dominant convention is a hoisted alias, `const mgr = requireRole("manager")` at
the top of a route file, then `router.patch("/x", mgr, handler(...))`. That pattern appears
in more than twenty route files. It also missed `router.use(guard)` applied above a block of
routes, and the four other authorization functions this codebase actually uses:
`requirePermission`, `requireScope`, `requireCapability`, `requireModule`.

Run as written against the tree, it produced **39 findings, of which roughly 35 were false**.
A check that goes red on arrival with mostly-noise gets deleted rather than fixed — the same
dynamic that keeps `duplicate-code-scan` and `dead-code-scan` report-only today.

The trigger for this ADR now: an infrastructure/platform audit could not honestly score
authorization coverage against a check that had never run.

**Decision:** Replace the grep step with `tools/route-authz-scan.mjs`, run in CI as
`npm run authz:scan` and included in `npm run verify`.

The invariant it establishes: **every `PUT`, `PATCH` and `DELETE` route in `src/` either
carries an authorization guard or appears in the scanner's allowlist with a written
reason.** A guard counts if it is `requireRole`, `requirePermission`, `requireScope`,
`requireCapability`, `requireModule`, `requireManagement` or `requirePlan` — applied
directly, through a local `const` alias declared in the same file, or through an earlier
`router.use(...)` in that file.

Three scope decisions, each deliberate:

1. **`POST` is excluded.** In a POS, `POST` is the normal cashier action — ring a sale, take
   a payment, open a tab, clock in. Requiring a manager guard on `POST` would be wrong for
   the product, not merely noisy. `PUT`/`PATCH`/`DELETE` edit or destroy existing records,
   where "who may do this" is a real question on every route.
2. **This is about authorization, never authentication.** `src/app.ts` mounts
   `makeAuthMiddleware` + `tenantResolver` on the whole `/api/v1` prefix, so an unguarded
   route here is reachable by any signed-in user *of that tenant* — never by the public.
3. **The allowlist is shrink-only**, matching the SQL guard's posture. An entry means
   "reviewed, and cashier-level access is correct for this route", and carries the reason.
   Never add one to make CI green.

Turning the check on found **4 genuine unguarded mutations** out of the 39 the grep
reported. One was fixed in code in the same change: `DELETE /api/v1/quotes/:id` allowed any
cashier to issue a real `DELETE FROM customer_quotations` (cascading its lines) on a
customer-facing commercial document, with no soft-delete column to recover from and no
`audit_log` entry recording who removed what. It is now `requireRole("manager")`, with a
regression test that fails against the previous routes.ts. The other three were reviewed and
allowlisted: restaurant table-status and kitchen-bump (floor-service actions), purchasing
requisition edit (a request, editable before its separately-gated approval), and — added
after reading the surrounding code — the customer address edit/delete pair, which the
`customers` module already documents as deliberately open ("Addresses/notes/loyalty stay
open — those are retail-legitimate").

**Alternatives considered:**

- *Fix the `|| echo` and leave the grep.* Rejected: 39 findings, ~35 false, on the first
  run. See above.
- *Widen the grep to match the known aliases.* Rejected as a trap. It would work until
  someone names an alias something else, and it would still miss `router.use`. The failure
  mode is silent under-reporting on a security check — the worst possible bias.
- *Enforce at runtime instead — make the router refuse to register an unguarded mutation.*
  Genuinely attractive, and stronger than a static check. Rejected for now because it
  changes application behaviour rather than CI behaviour, and it would need every existing
  deliberate exception encoded in the router before it could be switched on. Worth
  revisiting once the allowlist has been stable for a few months.
- *Do nothing; rely on review.* Rejected. The four findings had all passed review already.

**Consequences:**

Adding an unguarded `PUT`/`PATCH`/`DELETE` now fails CI with the file, line, method and path
named. Adding a new guard helper means adding its name to `GUARD_FNS` — a one-line change,
and the scanner failing loudly is the correct behaviour until someone does.

`POST` remains uncovered by design, so a genuinely sensitive `POST` (a bulk write, a
destructive command modelled as a create) still depends on review. That is an accepted,
named limitation, not an oversight — revisit it if a real incident comes through a `POST`,
not speculatively.

A general lesson worth carrying: **a check that cannot fail is worse than no check, because
it is counted as coverage.** Two of this repo's guards had that property simultaneously.
Every new guard should ship with a demonstration that it fails against a known-bad input.
This one was validated exactly that way — it exited 1 and named 4 real findings before its
allowlist existed.

**Supersedes:** none.

**Related Issues:** F-2 in `WORK/LOOP_STATE.md` (closed by this change); F-1, its twin,
closed by `c00a485`.

**Related PRs:** the enterprise platform audit PR.
