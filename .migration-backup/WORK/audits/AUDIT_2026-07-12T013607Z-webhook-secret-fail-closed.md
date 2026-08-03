# Audit — Webhook secret production fail-closed

Date: 2026-07-12T01:36:07Z
Session: Claude session A (Opus 4.8, "next" → Phase-4 hardening)
Status label: **Built and verified**

## What (FORWARD_PLAN Phase 4 — "Encrypt webhook secrets")

Webhook-secret encryption (AES-256-GCM, DB-16) already existed in
`src/modules/webhooks/service.ts`, but `WEBHOOK_SECRET_KEY` was only a **soft startup
warning**. In production without the key, `encryptSecret` silently returned plaintext, so
creating a webhook subscription would persist a customer's secret **unencrypted** — a real
credential exposure.

This slice makes that operation **fail closed in production**, matching the codebase's
existing per-feature fail-closed pattern (`/metrics` → `503 metrics_unconfigured`): the
server still boots and serves everything else; only the specific insecure operation is
refused.

## Changes

- `src/modules/webhooks/service.ts` — `encryptSecret` now throws
  `HttpError(503, "webhook_encryption_unconfigured", …)` when `NODE_ENV=production` and no
  valid `WEBHOOK_SECRET_KEY` is configured. Dev/test behaviour is unchanged (plaintext
  fallback for local ergonomics). Single choke point: the only secret-storing call site
  (`subscribe`) flows through it.
- `src/app.ts` — updated the startup warning text for `WEBHOOK_SECRET_KEY` to state the
  now-accurate consequence: creating/rotating a webhook subscription fails closed with 503
  until the key is set (was: "may use plaintext dev fallback").
- `src/modules/webhooks/webhooks.test.ts` — two new tests:
  - encrypt→decrypt round-trip with a configured key (asserts `v1:` versioned envelope,
    plaintext not stored verbatim).
  - production + unset key → `encryptSecret` throws 503 `webhook_encryption_unconfigured`.
  Both save/restore `NODE_ENV` and `WEBHOOK_SECRET_KEY` in `finally`.

No web changes, no DB schema changes, no other modules touched.

## Verification

- PASS: `npm run typecheck`.
- PASS: webhooks test file in isolation (embedded Postgres) — 12/12, incl. the 2 new tests.
- PASS: `npm test` — **384/384** (0 fail; +2 vs the 382 baseline in
  `AUDIT_2026-07-11T222436Z`).
- PASS: `npm run smoke` — 20/20 (smoke does not create webhooks / does not run as
  production, so the new guard does not affect the POS lifecycle).
- PASS: `node tools/hygiene-check.mjs` — 909 files, no junk.

## Operator note

To enable outbound webhooks in production, set `WEBHOOK_SECRET_KEY` to 32 random bytes
hex-encoded (64 chars), e.g. `openssl rand -hex 32`. Until then, webhook subscription
creation returns `503 webhook_encryption_unconfigured` by design.

## Remaining Phase-4 items (unchanged)

Still open from `AUDIT_2026-07-11T222436Z-fresh-end-to-end.md`:
1. **Rotate the leaked Vercel token in `deploy.sh`** (in git history) — human-only,
   highest priority. Working-tree fix removes the hardcoded value; commit it after
   rotation.
2. Require Redis for shared rate limiting/events in production.
3. Verify Stripe webhook/payment flow against real Stripe; DB backup/restore; migration
   rollback runbook; monitoring/alerting.
4. Playwright golden-path e2e in CI.
5. Paid-plan → module entitlement enforcement (the one honest backend disclaimer).
