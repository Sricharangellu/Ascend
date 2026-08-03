# Reliability / Failure-Resilience Gap Scan

Date: 2026-07-22
Basis: code inspection (`src/`, `db/`, `web/`, `docs/architecture/`, `WORK/`) against
an enterprise reliability/failure-architecture checklist Sri supplied (infra
outage, network failure, app failure, DB problems, integration failure,
hardware failure, data corruption, security, human failure, scale,
synchronization, backup/DR, monitoring, queue architecture, offline-first).
Verdict per item: **Built & verified**, **Partial**, or **Gap**. Infra-only
items (multi-region cloud, Kubernetes, PagerDuty) are **not scored** — they
don't apply to the current Vercel + managed-Postgres deployment model; see the
DR-notes appendix at the end instead.

## 0. Where Ascend already meets the bar

Verified in code, not aspiration:

- **Offline-first checkout** — transactional outbox pattern (`src/modules/sync/service.ts`:
  "every domain [write] ... while offline the queue simply accumulates"),
  `web/lib/offlineOutbox.ts`, `web/lib/useOffline.ts`, `OfflineBanner.tsx` /
  `OfflineQueueBanner.tsx`, and a `queued_offline` payment status
  (`src/modules/payments/service.ts`). This is the Square/Toast/Lightspeed
  pattern the checklist calls for.
- **Immutable inventory ledger** — `inventory_movements` is append-only,
  `CHECK`-constrained reasons, never updated/deleted
  (`db/migrations/0002_commerce.sql`); FORWARD_PLAN records it as
  "immutable and tested." `inventory.stock_qty` is a maintained cache next to
  the ledger, not the ledger itself (see Gap #4 below for the one real
  deviation from the checklist's "never store, always calculate" ideal).
- **Retry with backoff + idempotency** — `src/orchestration/policies/retry.policy.ts`
  (`DefaultRetryPolicy`, `FinancialRetryPolicy` — only retries
  connection/timeout/deadlock/serialization errors, never 4xx or idempotency
  conflicts), plus `idempotency-store.ts` and `orders.idempotency_key`.
- **Saga / compensation pattern** — `WorkflowRunner` + `CompensationRunner`
  (`src/orchestration/workflow-runner.ts`) runs compensations in reverse on
  step failure — this is the checklist's "queue-based architecture, ERP fails
  → checkout continues" pattern, already generalized across workflows.
- **Immutable audit log** — `src/shared/audit.ts` + `src/modules/audit_log`,
  `audit_logs.view` permission, no delete path.
- **Rate limiting** — Redis-backed rolling-window limiter (SEC-9, already
  shipped per `WORK/LOCK.md` released claims), not the naive fixed-window the
  checklist warns about.
- **Tenant isolation** — app-layer scoping + Postgres RLS backstop, verified
  clean of cross-tenant leaks (LOOP_STATE iteration 9).
- **Backups with explicit RPO/RTO** — `db/backup/backup.sh` / `restore.sh`
  already target **RPO ≤ 5 min / RTO ≤ 30 min**, WAL-archive + pg_dump, and
  document a **quarterly DR drill checklist**. This is ahead of the checklist,
  not behind it — the gap is whether the cron/CI wiring is actually live in
  prod (see Gap #9).
- **Structured monitoring** — `src/shared/monitoring.ts` emits aggregator-
  friendly JSON (Datadog/CloudWatch/Logtail-compatible) with request/trace/tenant
  IDs, optional Sentry envelope with no SDK dependency; `gateway/metrics.ts` +
  `orchestration/telemetry/orchestration-metrics.ts`.
- **Deployment rollback** — Vercel-dashboard instant rollback documented in
  `docs/architecture/PIPELINE.md`.
- **Soft delete / feature flags** — soft-delete exists in `catalog/service.ts`;
  feature-flag surface exists (`settings` module, `moduleRegistry.ts`).

## 1. Gap — Payment gateway is a single point of failure

`src/modules/payments/service.ts` and `stripe.ts` integrate Stripe only. There
is no second gateway and no circuit breaker around the Stripe calls — a Stripe
outage degrades to `queued_offline`, which is good for network loss but does
**not** cover "Stripe itself is down while the network is fine." The checklist
is explicit: never stop checkout on one gateway's failure.

**Recommendation:** don't build a second live gateway speculatively (real
integration cost, no evidence Sri wants a second processor yet). Instead: (a)
add a circuit breaker around the Stripe client so a string of failures fails
fast into `queued_offline` instead of hanging/retrying per request, and (b)
document the second-gateway seam (interface + adapter boundary) so adding
Adyen/Authorize.net later is a contained change, not a rewrite.

## 2. Gap — No circuit breaker pattern anywhere in the codebase

Retry-with-backoff exists (`retry.policy.ts`) but nothing tracks "N consecutive
failures → open the circuit → short-circuit further calls for a cooldown."
Every external call (Stripe, webhooks, future tax/accounting integrations)
retries fresh every time, which is fine for a single request but means a
sustained outage still lets every checkout pay the full retry+timeout cost
instead of degrading immediately. This is the single highest-leverage,
narrowly-scoped fix available (see Task #4).

## 3. Partial — Tax/accounting integration fallback unverified

No dedicated `tax` module was found (tax appears to be computed inline in
orders/pricing rather than as an external API call), so "cached tax rate while
API is down" may not even be a live failure mode today. Flagging as
**Partial, not Gap** — needs a definitive check of how/where tax rates are
sourced before treating it as actionable work.

## 4. Partial — Inventory quantity is a maintained cache, not purely derived

`inventory.stock_qty` is stored and updated in place (comment in the migration:
"stock_qty is updated in-place; history is in inventory_movements"), which
differs from the checklist's "current stock is calculated, not stored." This
is a defensible, common pattern (cache next to ledger) *as long as* the two
never drift. Existing bug history (`AUDIT_2026-07-16T063000Z-inventory-oversell-race.md`,
`..._134500Z-transfer-number-race.md`) shows drift has been a real, recurring
class of bug here — which argues for either (a) a scheduled reconciliation job
that diffs `stock_qty` against `SUM(inventory_movements.delta)` and alerts on
mismatch, or (b) moving to compute-on-read for low-traffic paths (reports)
while keeping the cache for the hot checkout path. Not re-litigating the prior
race-condition fixes — this is about adding a standing detector so the next
drift is caught automatically instead of by incident.

## 5. Gap — No object storage / receipt-image pipeline

No S3/Cloudinary/object-storage integration and no `image_url`-type column in
the product schema. Receipts render via browser `window.print()`
(`web/components/terminal/ReceiptView.tsx`), not a stored artifact. Likely
low-priority given no evidence this is blocking anything today — noted for
completeness, not recommended as next work.

## 6. Gap — No printer/scanner/cash-drawer hardware resilience

The checklist's "receipt printer offline → retry queue," "cash drawer won't
open → manual unlock," and "payment terminal offline → fallback" have no
counterpart in `web/components/terminal/**`. Ascend's POS terminal is a
browser tab using `window.print()`; there's no reconnect/retry queue for a
real thermal printer or terminal device. This may be genuinely out of scope
until Ascend targets real hardware (vs. browser-print), so treat as a
**documented gap, not a task** unless Sri is targeting physical hardware
integration soon.

## 7. Gap — No DB read-replica / connection failover

Single `DATABASE_URL`, no replica config, no evidence of automatic primary-
dead → replica-promoted handling. Reasonable for current scale (managed
Postgres likely already does failover at the provider level), but worth
naming explicitly since the checklist treats DB failure as "the worst possible
failure."

## 8. Partial — Deployment safety is rollback-only, not staged

`PIPELINE.md` documents instant rollback via Vercel, which covers "bad release,
revert fast" but not canary/staged rollout (checklist's "enable 10 stores,
monitor, enable everyone"). Feature flags exist at the settings/module level,
which is a reasonable substitute for staged *feature* rollout even without a
staged *deployment* rollout — so this is a smaller gap than it first looks.

## 9. Verify, don't assume — backup automation liveness

`backup.sh`/`restore.sh` exist with real RPO/RTO targets and a DR-drill
checklist, but this scan didn't confirm the cron/CI wiring that's supposed to
invoke them is actually active in the production environment (vs. just being
runnable scripts). Flagged as a verification task, not a build task.

---

## DR / future-infra appendix (not actionable now)

These checklist sections assume infrastructure Ascend doesn't run today
(self-managed Kubernetes, multi-region active-active, dedicated DNS/CDN
failover, PagerDuty). Vercel + managed Postgres already provides platform-level
redundancy for most of this. Keeping as notes only, per Sri's direction — not
turning into backlog items unless the deployment model changes:

- Multi-region active-active / active-passive DR, global load balancer, DNS
  failover across providers.
- Kubernetes auto-healing / liveness probes (Vercel's own platform handles the
  equivalent for serverless functions).
- Dedicated on-call paging (PagerDuty/Opsgenie) beyond the existing Gmail
  cloud-watchdog notification.
- SSL certificate auto-renewal monitoring (Vercel manages this already for
  the current domains).

---

## Priority ranking for FORWARD_PLAN

1. Circuit breaker around external calls (Stripe first; generalized so
   webhooks/future integrations reuse it) — Gap #1 + #2, narrowly scoped,
   code-addressable today.
2. Inventory reconciliation job (`stock_qty` vs. `SUM(movements)`, alert on
   drift) — Gap #4, directly motivated by prior real race-condition bugs.
3. Verify backup/restore cron wiring is live in prod — Gap #9, verification
   only, cheap to close.
4. Document the second-payment-gateway adapter seam (no new gateway yet) —
   Gap #1's non-code half.
5. Everything else in this report — named for completeness, not queued.
