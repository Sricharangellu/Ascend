# Audit — Fresh End-to-End Truth Pass

Date: 2026-07-11T22:24:36Z
Session: Claude session A (Opus 4.8, "work on this project" → fresh audit)
Status label: **Built and verified** for the local gate suite; **Not production-ready** overall
(one live secret leaked in git history + production ops/security items from FORWARD_PLAN Phase 4 remain).

## Scope

Read-only truth pass over the whole repo: ran every gate that can run locally and
inspected module/page live-vs-mock status. No product code changed. Follows
`WORK/README.md` rules; claimed in `LOCK.md` before starting.

## Gate results (all green)

### Backend
| Gate | Result |
|---|---|
| `npm run typecheck` | **PASS** |
| `npm test` | **PASS — 382/382** (0 fail; up from 354 at 2026-07-06) |
| `npm run smoke` | **PASS — 20/20**, full POS lifecycle end-to-end |
| `node tools/hygiene-check.mjs` | **PASS** (908 files scanned; no duplicate/backup/conflict junk) |

Smoke proves the core retail spine on a real embedded Postgres: product create →
receive stock → open register w/ float → cash sale → tax/discount → payment capture →
order + immutable inventory movement → refund → end-of-day report → register close →
Z-report reconcile (variance surfaced) → audit log entries for
`order.created`, `payment.captured`, `order.refunded`, `register.session_opened/closed`.

### Frontend (`web/`)
| Gate | Result |
|---|---|
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** (pre-existing `react-hooks/exhaustive-deps` warnings only) |
| `npm test` | **PASS — 152/152** (up from 102 at 2026-07-06) |
| `npm run build` | **PASS** (144 routes compiled) |

Every item on the FORWARD_PLAN release-gate checklist that is locally checkable now
passes: backend typecheck/tests, web typecheck/lint/build, core POS flow on real
backend, payment/refund tested, inventory ledger immutable+tested, tenant isolation
tested, RBAC tested.

## Live vs mock status (honest labels)

- **Frontend is genuinely wired to the real API, not mocks.** 184 call sites go through
  the typed client `web/api-client/client.ts` (bearer token, `{error:{code,message,requestId}}`
  envelope parsing, one silent 401 refresh-and-retry). MSW (`web/mocks/handlers.ts`) is
  dev/test-only, not the production path. The FORWARD_PLAN's older "mock-heavy frontend"
  concern is now **stale** — that risk has largely been paid down.
- **Backend is clean.** 50 modules, 46 test files, exactly **one** honest disclaimer in
  product code (`src/modules/settings/service.ts:477` — paid-plan→module enforcement not
  yet implemented). No broken stubs, no `throw "not implemented"`.
- **Progress tracking UI is built** — `web/app/(protected)/dashboard/_components/ProgressPanel.tsx`
  consumes live `/api/v1/progress` (tasks/summary/evidence/system-verify) and the dashboard
  can create tasks. This closes the "next product step" named in
  `AUDIT_2026-07-06T175615Z-progress-truth-tracking.md`. **Built but not verified** (renders
  from real API; no dedicated e2e for the panel yet).

## Security

### FINDING — leaked Vercel deploy token (must rotate)
`deploy.sh` hardcodes a live Vercel token (`vcp_210z…`). It is committed to git history
(introduced in `a9834c2`) and still present in `HEAD:deploy.sh`. The working tree has an
**uncommitted** fix that removes it and reads `VERCEL_TOKEN` from the environment instead.

- Removing the line from the file is **not sufficient** — the token is in history and is
  readable by anyone with repo/clone access.
- **Action required (human, cannot be done from code):** revoke/rotate the token in the
  Vercel dashboard, then commit the working-tree `deploy.sh` fix. History scrubbing
  (filter-repo/BFG) is optional hardening but rotation is the real fix.
- Scan of the rest of the tree found no other hardcoded secrets (the only other match,
  `sk_test_local_hmac_only` in `payments/webhook.test.ts`, is a fake offline-HMAC test key).

### Strong posture (verified)
- Multi-tenant scoping is pervasive: 3092 `tenant_id`/`tenantId` references in module code,
  153 `requirePermission`/`requireRole`/`requireAuth` checks.
- **RLS is real defense-in-depth** — `src/modules/rls/index.ts` dynamically runs
  `ENABLE`+`FORCE ROW LEVEL SECURITY` and a `tenant_isolation` policy on every table with a
  `tenant_id` column. `app.tenant_id` is set automatically per authenticated request via
  AsyncLocalStorage (`shared/tenant-context.ts` + `shared/db.ts`), so a forgotten
  `WHERE tenant_id` can no longer leak rows. Policy is permissive when the context is unset
  (backwards-compat), so enforcement depends on the context being set — which the gateway
  does on every authenticated request.
- Tenant isolation has a dedicated gate: `src/gateway/tenant-isolation.test.ts`.

## Remaining gaps (from FORWARD_PLAN, unchanged by this pass)

These are **Phase 4 production-hardening** items — not code defects, but why this is not
yet "production launch" ready:
1. **Rotate the leaked Vercel token** (above) — highest priority, time-sensitive.
2. Production env: require Redis for shared rate limiting/events (currently optional →
   per-instance in prod without it).
3. Encrypt webhook secrets (`WEBHOOK_SECRET_KEY`); metrics token already fails closed
   (`503 metrics_unconfigured`).
4. Verify Stripe webhook/payment flow against real Stripe; DB backup/restore test;
   migration rollback runbook; monitoring/alerting.
5. Playwright golden-path e2e in CI (unit/integration/smoke all pass; full browser e2e
   not run in this pass).
6. Paid-plan → module entitlement enforcement (the one honest backend disclaimer).

## Verdict

The codebase is materially healthier than the FORWARD_PLAN executive summary (dated
2026-07-05) describes. The core retail spine is **built and verified** end-to-end on a
real backend; the frontend is really integrated, not a mock shell; multi-tenant security
is serious and tested. The blocking items are now **operational/production-hardening**,
led by the leaked-token rotation — not missing features or a mock-heavy UI.

Recommended next work item (once a human rotates the token): commit the `deploy.sh` fix,
then start Phase 4 production hardening (Redis-backed rate limiting + Stripe/webhook
verification), OR add Playwright golden-path e2e to CI to close the last release-gate line.
