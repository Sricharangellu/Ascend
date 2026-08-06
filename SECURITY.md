# Security Policy

Ascend is a multi-tenant POS / business operating platform. It processes card
payments, holds customer records, and is the book of record for inventory and
money movement for the businesses that run on it. Security reports are handled
accordingly.

## Reporting a vulnerability

**Do not open a public GitHub issue for a security problem.**

Report privately through GitHub's coordinated disclosure flow:
**[Security → Report a vulnerability](https://github.com/Sricharangellu/Ascend/security/advisories/new)**.
That creates a private advisory visible only to the maintainers, and gives us a
place to work on a fix and credit you before anything is public.

Please include, where you can:

- what the issue is and which component it affects (backend module, gateway,
  frontend route, workflow, dependency);
- reproduction steps or a proof of concept;
- what an attacker gets out of it — cross-tenant data, privilege escalation,
  money movement, denial of service;
- the commit or deployed URL you tested against.

### What to expect

| Stage | Target |
|---|---|
| Acknowledgement | 3 business days |
| Initial assessment + severity | 7 business days |
| Fix or documented mitigation for critical/high | 30 days |
| Public advisory | After a fix ships, coordinated with the reporter |

This is a small team, not a 24/7 security operation. If something is being
actively exploited, say so in the first line of the report and we will treat it
as an incident rather than a queue item.

## Scope

**In scope** — anything in this repository that ships:

- `src/` — the Express backend, gateway middleware, and all domain modules
- `web/` — the Next.js frontend, its middleware, and its API client
- `db/` — migrations, RLS policies, backup and restore scripts
- `.github/workflows/` — CI/CD, including supply-chain and secret handling
- `Dockerfile`, `docker-compose.yml`, `scripts/deploy.sh`

**Out of scope:**

- `artifacts/` — a parallel, unbuilt, undeployed codebase kept in-tree for
  historical reasons. Nothing in it is reachable from any entry point of the
  shipping application, and it is excluded from CodeQL analysis for that reason.
- Findings that require an already-compromised host, an already-stolen
  credential, or physical access to POS hardware.
- Missing security headers or configuration on hosts we do not control
  (Vercel/Supabase/Stripe platform surfaces — report those to those vendors).
- Automated scanner output with no demonstrated impact. Volumetric denial of
  service against a preview deployment is not a finding.

## Security properties this codebase is meant to hold

These are the invariants worth testing against. A break in any of them is a
valid report, and several are enforced by CI checks that will name themselves in
the failure output:

- **Tenant isolation.** Every business table is tenant-scoped, every business
  query filters by tenant, and Postgres row-level security is enabled on every
  table carrying a `tenant_id` as a backstop (`src/modules/rls`). Any path that
  returns another tenant's row is critical, with or without RLS.
- **Authentication.** All `/api/v1/*` routes require a verified JWT (HS256) or a
  hashed API key; tokens missing `tenantId`/`sub` are rejected. Refresh tokens
  are stored hashed, rotated on use, and single-use outside a short reuse-grace
  window.
- **Authorization.** Mutating routes carry a role, permission, scope, capability
  or module guard. `npm run authz:scan` fails CI on a `PUT`/`PATCH`/`DELETE`
  route with none of them, so an unguarded mutation reaching `develop` is itself
  a reportable gap in that scanner.
- **Business-package isolation.** `requireCapability` and `requireModule` fail
  **closed** — a tenant without a capability gets 403 and is not told the surface
  exists. (`requirePlan`, an entitlement gate rather than an isolation boundary,
  deliberately fails open.)
- **SQL.** All caller-supplied values are bound as parameters. CI rejects string
  interpolation into `.query()` outside a reviewed, shrink-only allowlist of
  identifier-only sites.
- **Money.** Integer cents everywhere; ledger and price-history tables are
  append-only. A path that mutates a posted financial record is a finding.
- **Secrets.** Never committed. `tools/hygiene-check.mjs` fails the build on a
  tracked `.env` or an embedded credential; the logger redacts `authorization`,
  `cookie`, `password`, `token`, `secret` and `apiKey` paths at every level.
- **Transport.** Postgres TLS certificates are verified by default;
  `PG_SSL_NO_VERIFY` is an explicit escape hatch that logs a warning on every
  boot. Treat a deployment that sets it as a misconfiguration worth reporting.

## Known accepted risks

Listed so a reporter does not spend time on something already understood and
tracked. Full reasoning and remediation plans live in
`WORK/audits/` and `docs/architecture/GAPS.md`.

- **RLS is permissive when the tenant context is unset.** The policy allows all
  rows when `app.tenant_id` has no value, so RLS is a backstop for a forgotten
  `WHERE` clause inside an authenticated request, not an independent boundary.
  Application-layer tenant filtering is the primary control.
- **`web` carries known dependency advisories.** They resolve only through the
  `next` 14 → 16 and `vitest` 2 → 4 major migrations, tracked as F-24/F-25. The
  root has zero advisories and is gated in CI at `high`.
- **The frontend CSP allows `'unsafe-inline'` for scripts.** Required by the
  current Next.js App Router setup; tightening it needs nonce-based CSP.
- **No production database backup has ever run.** The mechanism is drilled and
  works; the `PROD_DATABASE_URL` secret is unset, so scheduled runs take no
  backup. This is an availability/recovery risk, not a confidentiality one.

## Supported versions

Only the current `master` tip is supported. This is a continuously-deployed
application, not a versioned distribution — there are no backported security
releases for older commits.
