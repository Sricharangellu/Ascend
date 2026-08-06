# Security Policy

Ascend handles payment tender, inventory valuation, payroll-adjacent time
records and customer PII for retail, wholesale and distribution businesses. A
vulnerability here has a cash value. This document says how to report one and
what the platform's security controls currently are — honestly, including where
they are incomplete.

## Reporting a vulnerability

Report privately. Do **not** open a public issue, and do not include a working
exploit in the first message.

- **Preferred:** GitHub → Security → Advisories → *Report a vulnerability*
  (private disclosure, visible only to repository maintainers).
- **Fallback:** email the repository owner directly.

Please include: affected endpoint or module, the version/commit, what an
attacker gains, and the smallest reproduction you have. If you have tested
against a live deployment, say which one.

**Targets:** only your own tenant on a deployment you control, or a local
checkout. Do not test against another tenant's data — tenant isolation is the
control most worth reporting a hole in, and demonstrating one by reading real
customer data is not an acceptable proof.

### What to expect

| Stage | Target |
|---|---|
| Acknowledgement | 3 business days |
| Initial assessment (severity + whether we can reproduce) | 10 business days |
| Fix or documented mitigation for critical/high | 30 days |
| Public disclosure | Coordinated, after a fix ships |

These are targets for a small team, not a contractual SLA. If a report goes
unanswered past the acknowledgement window, escalate by replying on the same
thread.

## Supported versions

Ascend is a continuously-deployed hosted platform, not a versioned download.
Only the currently-deployed release (`master`) is supported. Fixes are not
backported to older commits.

## Security controls in place

Code-verified, not aspirational. Each row names where it lives.

| Control | Where |
|---|---|
| Authentication (JWT sessions + API keys) | `src/gateway/auth.ts`, `src/identity/` |
| MFA (TOTP + backup codes) | `src/identity/` |
| SSO / OIDC (per-tenant IdP config) | `src/modules/sso/` |
| Role-based authorization (cashier < manager < owner) | `requireRole`, `src/gateway/auth.ts` |
| Fine-grained permissions + custom roles | `requirePermission`, `src/modules/custom_roles/` |
| API-key scope enforcement | `requireScope`, `src/gateway/auth.ts` |
| Tenant isolation in SQL | every business query filters `tenant_id` |
| Tenant isolation backstop (Postgres RLS) | `src/modules/rls/`, `db/rls/policies.sql` |
| Parameterised SQL only (no string interpolation of values) | `src/shared/db.ts`, enforced by a CI guard |
| Request validation | zod via `parseBody`, `src/shared/http.ts` |
| Rate limiting (per-IP and per-tenant, Redis-backed when configured) | `src/gateway/rateLimit.ts` |
| Brute-force limits on login / register / SSO | `src/app.ts` |
| Account lockout | `src/identity/lockout.test.ts` |
| Password hashing (bcrypt) | `src/identity/service.ts` |
| Security headers + CSP | `src/app.ts` (API), `web/middleware.ts` (app) |
| CORS allowlist | `src/app.ts` |
| Database TLS with certificate verification | `sslConfig()`, `src/shared/db.ts` |
| Webhook secret encryption (fails closed) | `src/modules/webhooks/` |
| Stripe webhook signature verification | `src/app.ts` |
| Constant-time comparison for infrastructure secrets | `secretsMatch()`, `src/app.ts` |
| Audit logging | `src/modules/audit_log/`, `src/shared/audit.ts` |
| Append-only financial records | `journal_entries`, `product_price_history`, `po_approvals` |
| Secret scanning (gitleaks, gating) | `.github/workflows/security.yml`, `.gitleaks.toml` |
| Dependency advisories | `.github/workflows/security.yml`, `.github/dependabot.yml` |
| SBOM (CycloneDX) | `.github/workflows/security.yml` |
| Unguarded-mutation-route guard | `tools/route-guard-scan.mjs` |
| Non-root container runtime | `Dockerfile` |

## Known gaps

Stated plainly because a security policy that lists only strengths is not one.
Full detail, with severities and a remediation order, is in the 2026-08-06
infrastructure audit under `WORK/audits/`.

- **No SAST.** No CodeQL or equivalent static analysis runs on this codebase.
- **No container image scanning.** The image builds in CI but is never scanned.
- **No penetration test** has been performed.
- **Authorization debt.** A documented set of mutating routes carries no role
  check; each is classified in `tools/route-guard-allowlist.json`, and the ones
  marked `GAP:` are real.
- **No production backup has ever run.** `PROD_DATABASE_URL` is unset, so the
  honest RPO is total loss, not the ≤24h the workflow implies.
- **No secrets manager.** Credentials live in GitHub Actions secrets and host
  environment variables; there is no central rotation or access audit.
- **No formal compliance certification.** Ascend is not SOC 2, PCI DSS or
  HIPAA certified. Card data is handled by Stripe and never touches Ascend's
  database, which keeps PCI scope at SAQ-A — but that is a scope argument, not
  an attestation.

## Out of scope

- Findings against third-party services (Stripe, Supabase, Vercel, SendGrid) —
  report those to the vendor.
- Missing security headers on endpoints that serve no HTML.
- Rate-limit thresholds you consider too generous, absent a demonstrated impact.
- Automated scanner output with no analysis of exploitability.
- Social engineering, physical access, or denial of service by volume.

## Safe harbour

Good-faith research conducted within this policy — private reporting, no access
to other tenants' data, no service degradation, no data destruction — will not
be pursued. Tell us before you publish.
