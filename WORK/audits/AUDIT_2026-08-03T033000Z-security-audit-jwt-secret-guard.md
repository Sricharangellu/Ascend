# AUDIT — Fresh security audit + JWT_SECRET placeholder fail-fast guard

Date: 2026-08-03T03:30:00Z
Branch: `fix/security-jwt-secret-placeholder-guard` (off `origin/develop` @ `801b7a4`)

## Why

Sri asked for a security audit and gap fixes. `WORK/FORWARD_PLAN.md`'s existing
"Security review" section was written 2026-07-18 and is stale — several items
it flags as open were already fixed in later merged PRs (webhook-secret
fail-closed, PR #104; JWT algorithm pin + login timing side-channel + log
redaction, PR #57). Ran a fresh, code-verified pass instead of trusting the
old doc, covering: auth/session, RBAC/tenant isolation/RLS, SQL injection,
XSS, secrets/config, dependency vulnerabilities, CORS/headers, webhook/payment
signature verification.

## Findings summary

**Confirmed solid** (verified against current code, not just docs):
- JWT: algorithm pinned to HS256 everywhere it's verified; bcrypt cost 10
  password hashing; per-IP rate limiting + 10-attempt/30-min lockout; timing
  side-channel closed (`DUMMY_PASSWORD_HASH`); refresh tokens are single-use
  hash-stored with a small reuse-grace window; logout revokes + clears cookies;
  access token kept in-memory only (refresh token httpOnly cookie) — XSS can't
  steal either.
- MFA backend is real (TOTP via `otpauth`, hashed backup codes), not mocked —
  the live `/login` flow calls it correctly. (One dead, fully-mocked page,
  `web/app/login/mfa/page.tsx` with `MOCK_VALID_CODE`, is unreachable via the
  real login flow and gated out by `web/middleware.ts` even if visited
  directly — Low, cosmetic, flagged in FORWARD_PLAN below, not fixed this
  pass since it's dead code, not a live hole.)
- RBAC: `requireRole`/`requirePermission`/`requireCapability`/`requireModule`
  are fail-closed (deny on DB/query error). RLS is dynamically applied to
  *every* table with a `tenant_id` column (`src/modules/rls/index.ts`,
  registered last so new modules are auto-covered), verified against real
  Postgres with a non-superuser role in `tenant-isolation.test.ts`. Spot-
  checked route files across automotive/healthcare/customers/catalog/
  accounting/team/settings — all tenant-scoped, all gate mutations.
  (`db/rls/policies.sql`, a hand-written 12-table doc whose header claims RLS
  "is NOT yet activated," is stale and misleading now that the dynamic module
  supersedes it — flagged below, not deleted this pass since it's docs-only
  and lower priority than the live findings.)
- SQL injection: zod validation on 51+ route files; every template-literal
  SQL construction found interpolates only fixed literals from a hardcoded
  map/ternary, never raw user input — always binds real values as `@params`.
- XSS: exactly one `dangerouslySetInnerHTML` in all of `web/`
  (`ReceiptView.tsx:110`, a static print-CSS `<style>` block, no user data).
  Zero `.innerHTML =` assignments.
- CORS/headers: backend allowlist strict in production, permissive in dev;
  Helmet + explicit security headers. Frontend middleware has CSP, HSTS,
  X-Frame-Options, Permissions-Policy.
- Stripe webhook: raw-body route mounted before `express.json()`, signature
  verified via `stripe.webhooks.constructEvent`, 503/400 on missing
  secret/signature — no bypass path.
- `npm audit` (backend root): 1 low only (body-parser DoS, fix available).

**Real gap found and fixed this pass (Medium):**
- `JWT_SECRET` was only checked for *presence* in production, not quality.
  `.env.example` ships the literal placeholder
  `change-me-min-32-chars-random-string`. An operator who copies that file to
  a real `.env` without editing it gets a server that boots fine and signs
  valid tokens with a secret published in the public repo — anyone can forge
  an owner-level JWT for any tenant with `jwt.sign({...}, "change-me-min-32-
  chars-random-string", { algorithm: "HS256" })`.
  - Fix: `src/app.ts`, added a hard production-only check rejecting the
    documented placeholder (plus a small set of other common low-entropy
    values: `changeme`, `secret`, `your-secret-key`) and anything under 32
    characters, alongside the existing missing-var check.
  - New test file `src/app.env-guard.test.ts` (4 cases): rejects the exact
    placeholder, rejects a short secret, rejects a low-entropy value
    case/whitespace-insensitively, and confirms a real 32+-char secret still
    boots the app normally against a live throwaway-schema Postgres.
  - Verified none of the existing tests that set `NODE_ENV=production` and
    call `buildApp()` break: `src/gateway/ops.test.ts` uses a 34-char secret
    (`test-secret-finder-pos-production`), CI's two production-mode jobs
    (`.github/workflows/ci.yml`) use 33/34-char secrets — none match the
    placeholder set, none are under 32 chars. Ran `ops.test.ts` directly
    against real Postgres after the change: still 2/2 passing.

**Dependency gap found, NOT fixed this pass (High, needs a real dev machine):**
- `web/`'s `next` is pinned to `14.2.29`. `npm audit` in `web/` reports 2 high
  advisories, all fixed by 14.2.35+ (still 14.x, no breaking major bump):
  DoS via Server Components (GHSA-mwv6-3258-q52c, GHSA-5j59-xgg2-r9c4) and
  SSRF via Server Actions/rewrites (GHSA-89xv-2m56-2m9x, GHSA-p9j2-gv94-2wf4).
  - Attempted the bump (`"next": "14.2.35"` in `web/package.json` +
    `npm install`) in this session but could not complete it: this sandbox's
    `web/node_modules` was originally populated on macOS (darwin-arm64) and
    reconciling it against Linux (this sandbox's actual platform) means npm
    has to re-resolve optional platform binaries for essentially every
    package with native deps (esbuild, rollup, SWC, the `@unrs` resolver,
    etc.) — the install consistently exceeded this environment's 45-second
    execution ceiling across 4 attempts, each one leaving `ENOTEMPTY`
    directory-rename conflicts that the next attempt had to clean up before
    making further progress, never converging to a rewritten
    `package-lock.json`. Reverted `web/package.json` back to `14.2.29`
    rather than commit a version bump whose lockfile was never actually
    regenerated (that would break `npm ci` for anyone pulling this branch).
  - **Action for Sri** (single command, run on a normal dev machine, not
    this sandbox): `cd web && npm install next@14.2.35 && npm run typecheck
    && npm run lint && npm run build` — then commit the `package.json` +
    `package-lock.json` diff. Low risk: patch-level bump within the same
    major/minor line the app is already built against.

## Sandbox note (unrelated fix, worth recording)

This sandbox's root `node_modules/esbuild` only had the `darwin-arm64`
native binary (macOS host), not `linux-arm64` (this container's actual
platform) — `tsx`-based test execution (`npm test`, or any ad hoc `--import
tsx --test` run) failed outright before this session with `esbuild ... You
installed esbuild for another platform`. Fixed for this session only via
`npm install @esbuild/linux-arm64@0.28.0 --no-save` (not committed — it's a
`node_modules`-only, non-lockfile change, and `--no-save` keeps
`package.json`/lockfile untouched). This is what let the new
`app.env-guard.test.ts` actually run against a real ephemeral Postgres in
this session instead of only being typechecked. Future sessions in a fresh
sandbox will likely need the same one-line fix before `npm test` works.

## Verification

- `npx tsc --noEmit -p .` (backend): clean.
- `npm run hygiene` / `gap:scan` / `table:scan`: all pass, unchanged counts
  (no routes/schema touched).
- `src/app.env-guard.test.ts`: 4/4 passing against real ephemeral Postgres.
- `src/gateway/ops.test.ts` (pre-existing, most likely to interact with this
  change): re-ran directly, 2/2 still passing.
- Frontend-only findings (Next.js bump) explicitly not applied — see above.

## Branch status

`fix/security-jwt-secret-placeholder-guard`, built directly on current
`origin/develop` (`801b7a4`) — clean fast-forward candidate. Push command for
Sri: `git push origin fix/security-jwt-secret-placeholder-guard:develop`
