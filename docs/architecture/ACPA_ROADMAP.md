# ACPA — Ascend Commerce Platform Architecture: Transformation Roadmap

Companion to CTO_CHARTER.md and ENGINEERING_ORG.md. Adopted 2026-07-14.
Goal: evolve Ascend toward a ServiceNow-of-Commerce platform **incrementally**,
never rewriting, never breaking business velocity.

## Reconciliation: ACPA phases vs. actual current state (code-verified)

| ACPA Phase | Status in the real codebase |
|---|---|
| 1a Tenant platform | **Exists.** tenant_id on every table, RLS backstop, business units, outlets, store_locations. Gap: none blocking. |
| 1b Identity platform | **Exists.** Users/roles/custom roles/permissions/teams/SSO/API-key scopes. ABAC = future story. |
| 1c Enterprise data model | **Mostly exists.** Product/Customer/Supplier/Order/Invoice/Payment/Ledger/Document(POs)/Workflow/Event are single-owner concepts. Guard: the "no duplicate entities" rule is what the retail-UX audits enforce (e.g. one product editor). |
| 2 Bounded contexts | **Exists** (52 modules, module-owned writes). Amendment: cross-domain SQL *reads* accepted (ENGINEERING_ORG.md ruling). Postgres *schema-per-domain* (identity.*, finance.*) — **REJECTED for now**: 100+ migrations assume one schema per tenant-DB layout; rename churn with zero behavior gain. Revisit only at service extraction. |
| 3 Workflow platform | **Seed exists** (workflows module: definitions/instances; PO approval workflow; SO fulfillment transitions). Next story: unify approval patterns behind one engine — *after* a second approval domain (requisitions) exists to generalize from. |
| 4 Rules engine | **Proto-rules exist** (approval tiers config, margin rules, promotion engine, tax resolution). Story: extract a shared `evaluateRules()` only when a third rule family needs it. |
| 5 Event platform | **The real gap.** In-process bus, sequential dispatch, no persistence → crash loses financial events (Rule 4 violation). **← Migration 1, implemented now.** |
| 6 Extensions | Partial (webhooks w/ signatures, API keys w/ scopes, integrations page). Connector registry is the queued story (ERP gap doc §12). |
| 7 AI foundation | Not started. Depends on 5 (event history) + 3 (actions). Deliberately last. |

## Migration 1 (this commit) — Durable financial events (transactional outbox v1)

**Objective:** financial events must never be lost (Rule 4 / FINANCIAL RULES).
**Current state:** `purchase_order.received`, `bill.created`, `bill.paid`,
`payment.captured` dispatch in-process only; a crash between the business
write and handler completion silently loses ledger postings / auto-bills.
**Proposed change:** an `event_outbox` table + dual dispatch: rows are written
alongside the business operation, the existing synchronous dispatch is
preserved (zero behavior change), rows are marked delivered on success, and a
reconciler (boot + interval) redelivers pending rows **only to registered
durable consumers** (accounting postings, billing auto-bill — both already
idempotent). Non-idempotent consumers (inventory stock increment) are *not*
redelivered — their at-most-once semantics are unchanged from today, no
regression.
**Why not full async now:** moving all consumers async breaks synchronous
consistency tests and needs the worker runtime (scale step 6). Dual dispatch
closes the durability hole first; latency offload follows with the worker.
**Impacted modules:** shared (outbox), accounting, billing, purchasing, app boot.
**Risks:** double-delivery → mitigated by consumer idempotency (hasPosting /
billFromPO existing-check) + delivery marking; reconciler runaway → capped
attempts with backoff.
**Rollback:** revert commit; outbox table is additive.
**Future evolution:** Phase-2 worker consumes the outbox asynchronously →
inventory gains idempotency keys (movements.ref) → all consumers move behind
the outbox → read models (reporting) feed from the same stream.

## Epic backlog (EM-owned, in order)
1. **E1 Durable events** — M1 (this commit) → M1.2 worker-driven dispatch (with runtime move) → M1.3 all-consumer migration + idempotency keys.
2. **E2 Procurement completion** — requisitions → GRN → 3-way match → GRNI (parked slices; also feeds workflow-engine generalization).
3. **E3 Scale mechanics** — batch bulk ops (step 4), pooling + runtime (step 6), reporting read models.
4. **E4 Workflow/rules generalization** — unify PO+requisition approvals; extract rule evaluation.
5. **E5 Extension platform** — connector registry over webhooks; extension points doc.
6. **E6 AI foundation** — permissioned action layer over modules; only after E1/E4.

**Standing rejections re-affirmed:** microservices, Kafka, K8s, multi-DB,
schema-per-domain rename, low-code engine v1.
