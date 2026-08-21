# develop → staging Promotion Package

**Prepared:** 2026-08-02 · **Prepared by:** Claude (Cowork, Sonnet 5), on Sri's request
**Status: PREPARATION ONLY — not executed.** Nothing in this document has been pushed,
merged, or deployed. Per `AGENTS.md`'s branch rules and `docs/architecture/PIPELINE.md`'s
release policy ("nothing reaches `master`/production without Sri's explicit command," and
this repo's own history treats `staging` promotion the same way), the actual
`develop → staging` PR and merge is Sri's action to take.

**Scope of this package:** everything currently on `origin/develop` (tip `498beee`) that
is not yet on `origin/staging` (tip `e55e743`, identical to `origin/master`) — **30
commits** — plus the 3 commits prepared and verified in the prior session
(`pos-shared-metric-cleanup-rebased`: Phase E nav-reachability fixes, Phase F loyalty/
finance cleanup, and this doc's own LOCK.md note), pending push. If those 3 are pushed to
`develop` first (as discussed), they become part of this same promotion; if not, this
package still describes the 30 already on `develop` and the 3 can follow in a second,
smaller promotion.

---

## 1. Complete commit and feature summary

30 commits, `origin/staging..origin/develop`, grouped by theme (not chronological —
see the appendix for the raw `git log` order):

### 1a. UI Ponytail audit fix sequence (5 commits, PRs #134–#138)

| Commit | What it does |
|---|---|
| `6b8afa5` (#135) | Sales History (`/sales`) now returns real customer/cashier/outlet joins instead of hardcoded fabricated fields (`sold_by="Staff"`, a raw placeholder customer UUID) — this was fabricating transaction detail, not just a UI nit. Adopts keyset pagination. |
| `6942db3` (#136) | Returns/refunds now requires confirmation before issuing a refund; removed a customer-search affordance the page couldn't actually back with real search. |
| `fe3d0a8` (#137) | Terminal cleanup: merged duplicate sync debouncers, dropped dead buttons, unified the outlet-source lookup to one path. |
| `3fa58c2` (#134) | Nav: moved "Delivery" into a new "Shipping" rail section and linked the previously-orphaned Shipments page. |
| `498beee` (#138) | Deduped the near-identical local `Metric` stat-card component in `returns/page.tsx` and `payments/page.tsx` into the shared `KpiCard`; surfaced the missing `store_credit` filter option on Payments. |

**Risk:** Low. All UI-layer, additive or dead-code-removal changes to already-real backend
paths. `6b8afa5` is the one with the most behavioral weight (fixes fabricated data), and it
already shipped with its own regression tests.

### 1b. Procurement / demand-planning (1 large commit, `5bc99b5`)

Combines three previously-separate, individually-audited phases into one commit on
`develop`:
- **Phase 6** — MOQ/pack-size-aware reorder rounding, explicit `inventory.safety_stock`
  field (new column, see §3), promised-delivery-date computation on reorder/purchasing
  surfaces.
- **Insights PO bugfix** — `insights.createReorderPOs()` previously inserted into a
  non-existent table (`po_lines`) and hardcoded `unit_cost_cents = 0`; now routes through
  the real `purchasing.createOrder()` (real doc-numbering, real approval gating, real
  audit trail).
- **Phase 7 item 1** — consolidated 5 independently-drifted "sales velocity" formulas
  (reorder suggestions, purchasing recommendations, insights) into one shared
  `src/shared/sales-velocity.ts`. This fixed two real, independent bugs in the process: a
  `LEFT JOIN`-scoped date filter that silently never excluded anything, and a missing
  `status = 'completed'` filter that counted refunded/cancelled orders as sales.

**Risk:** Medium. Touches `catalog`, `inventory`, `insights`, and `purchasing` service
logic broadly (25 files, ~2400 lines). All changes are additive-field/bugfix in nature
(no removed API fields), and each of the three sub-phases shipped with its own dedicated
test suite (per the commit's own stat: 6 new/expanded test files). The insights PO bugfix
in particular changes real *behavior* (draft-PO creation used to 500 every time; now it
works) — worth a manual smoke pass on `/insights` → Forecasting → "Create Draft POs" in
staging specifically, not just an automated check.

### 1c. AI Assistant module (1 commit, `365c282`, ADR-005)

New, additive, **optional-dependency** module: explain-only AI assistant surfaced at
`/ai-assistant`, answering questions about reorder/low-stock/expiry/best-and-slow-sellers
by narrating **deterministic, already-computed** recommendations — the LLM (Anthropic API,
new `@anthropic-ai/sdk` dependency) explains, it does not invent business facts (matches
`AGENTS.md`'s "AI may explain deterministic recommendations later, but it must not invent
business facts" rule). New tables `ai_conversations`/`ai_recommendations` (additive, see
§3). Degrades to an honest "not configured" narration path if `ANTHROPIC_API_KEY` is
unset — confirmed by the module's own test suite (13/13 passing with no key set in the
test harness).

**Risk:** Low for existing functionality (nothing else depends on this module; it's new
surface, feature-gated in nav). The one thing to verify in staging specifically: whether
`ANTHROPIC_API_KEY` should be set there. If unset, the feature will show its honest
"unavailable" state rather than crash — acceptable for a first staging pass, but confirm
this is the intended staging behavior before/at deploy time.

### 1d. UOM / POS unit conversion (1 commit, `ff14442`)

Purchasing/receiving unit-of-measure conversion (ADR-006: base-unit invariant) + POS
barcode resolution improvements. Adds `order_lines.unit_kind`/`unit_qty` columns
(additive, see §3).

**Risk:** Medium — touches the purchasing receive path and the POS cart/checkout barcode
resolution, both money/inventory-adjacent. This is exactly the kind of change the smoke
test's core POS lifecycle (§5) is designed to catch if something regressed.

### 1e. Reliability hardening — Phase 4a (3 commits: `4e68d95`, `2b2a5be`, `73f9530`, merged via `6a023ad`)

- **Circuit breaker** around Stripe calls (`src/shared/circuit-breaker.ts`) — trips after
  N consecutive gateway failures, fails fast (503 `payment_gateway_unavailable`) instead of
  paying full retry/timeout cost per request during an outage. Only genuine
  Stripe API/connection/rate-limit errors trip it; declines/bad-requests don't.
- **Inventory reconciliation job** — new daily scheduled job, read-only, diffs
  `inventory.stock_qty` against `SUM(inventory_movements.delta)` per tenant/product and
  logs structured warnings on drift. Does not auto-correct.
- **Payment gateway seam** — extracted a `PaymentGatewayAdapter` interface so Stripe is
  one implementation, not hardwired into `service.ts` — a pure refactor (verified
  behavior-preserving: full `payments.test.ts`, 17/17, including the card-payment path,
  re-run after the change with zero diffs in outcome).

**Risk:** Low. All three are defensive/observability additions or a pure interface
extraction — nothing in the checkout/payment *happy path* changes shape. The circuit
breaker is the one with real new runtime behavior (it can now reject payment attempts
during a Stripe outage that it previously would have kept retrying) — worth confirming in
staging that a *healthy* Stripe test-mode connection doesn't spuriously trip it.

### 1f. Business-pack matrix generator (1 commit, `1221215`)

New `scripts/generate-business-pack-matrix.ts` (`npm run business:matrix`) — a dev/docs
tool, no runtime code path. Generates `docs/architecture/BUSINESS_PACK_MATRIX.md` from the
same registry objects the backend serves. Zero production risk.

### 1g. Governance, docs, and coordination tooling (remaining ~18 commits)

The bulk of the remaining commits are documentation and cross-environment coordination
work, not application code: the multi-environment (Claude Code / Cursor / Replit)
coordination model, `tools/dashboard.mjs` (a `WORK/LOCK.md` staleness visibility tool),
PR/ADR templates, the `DEPLOYMENTS.md` production-infrastructure investigation (see §2 —
**this is the one that matters for this promotion**), the config/secrets registry now
folded into `PIPELINE.md`, and closing out 4 stale `LOCK.md` claims. One small embedded
code fix worth calling out on its own: `e39a1ee` (#123) also fixed a POS receipt
mislabeling a voided sale as "Order Voided" incorrectly in one code path.

**Risk:** None to negligible — docs/tooling only, with the one exception above (already
covered in §1a's "None found" framing — it's a one-line label fix, not new logic).

---

## 2. Risk assessment

### 2a. Application-code risk: **Low–Medium, well-covered**

Every commit above either shipped with its own dedicated tests (confirmed via each
commit's own message/stat — sales-velocity, procurement, ai-assistant, circuit breaker,
payment gateway seam all have dedicated suites) or is docs/tooling with no runtime path.
No commit in this range removes an existing API response field, drops a table/column, or
changes an authentication/authorization boundary. The current `develop` tip passes every
fast structural gate this sandbox can run: `hygiene` (1094 files clean), `table:scan` (161
table names, zero collisions), `gap:scan` (456 backend / 381 frontend paths, 21
allowlisted, zero unexplained gaps), backend `typecheck` (clean). Frontend `typecheck`/
`lint`/`build` could not be completed in this sandbox (documented environment limit, not
a known failure) — **this is the one gate Sri or CI needs to confirm independently before
merging**, since it's the one this document cannot vouch for directly.

### 2b. Deployment-infrastructure risk: **HIGH — pre-existing, not caused by this promotion, but will block a real staging deploy**

This is the most important finding in this package. Per this repo's own
`docs/architecture/DEPLOYMENTS.md` and `docs/architecture/PIPELINE.md` (both currently on
`develop`, i.e. part of what's being promoted, and both dated as recently as 2026-07-30):

- **The Vercel project `deploy-staging` targets was deleted.** `ci.yml`'s `deploy-staging`
  job (triggered on push to `staging`) deploys using `vars.STAGING_BACKEND_URL` and the
  `STAGING_FRONTEND_ALIAS`/`STAGING_BACKEND_ALIAS` variables — `PIPELINE.md`'s own
  configuration registry marks **all three as DEAD** (`DEPLOYMENT_NOT_FOUND`, confirmed
  2026-07-20, re-confirmed 2026-07-23).
- **Production backend location is itself unconfirmed** (claimed Render, unreachable from
  three independent networks as of 2026-07-30) — a separate, larger open question tracked
  in `DEPLOYMENTS.md`, not blocking for staging specifically but context for how
  unsettled this repo's non-`master` deploy story currently is.
- **Practical consequence:** merging `develop → staging` today will run CI (typecheck,
  test, e2e — all fine), but the `deploy-staging` job will very likely fail or silently
  target a dead endpoint, **not because of anything in this promotion's code**, but
  because the Vercel project it deploys to no longer exists.
- **What is NOT at risk:** the shared testing-tier Supabase database
  (`lqaicxibgrlxwkvxsaji`, us-west-2) is confirmed live and in active use — schema
  self-provisions on backend boot, so the database side of a staging deploy is fine
  whenever the hosting question is resolved.

**Recommendation:** either (a) resolve/recreate the staging backend Vercel target (or
whatever replaces it, if Render is also intended for non-prod tiers) before merging this
PR, or (b) merge the code promotion now but treat the *deploy* step as a known-red,
expected failure until infra is fixed — don't interpret a red `deploy-staging` run as a
code regression from this promotion. Either way, this should be a conscious decision, not
a surprise discovered after merge.

### 2c. Coordination risk: **Low, but worth a quick check**

A second, independent UI-consolidation audit (`cursor/ponytail-enterprise-ui-audit-72bc`,
142 routes, docs-only) and two in-flight UI fix branches
(`cursor/ui-wave-a-trust-leftovers-604f`, `cursor/ui-wave-b-cashier-trust-604f`) exist
unmerged, touching some of the same files this promotion's Phase A–F commits already
changed. None of that is *in* this promotion (they're separate, un-merged branches), so it
doesn't block this PR — but whoever picks those branches up next should rebase onto the
post-promotion `develop`, not the pre-promotion tip, to avoid re-doing already-shipped
work.

---

## 3. Database / schema impact

**All changes in this range are strictly additive.** Verified by diffing every `CREATE
TABLE`/`ALTER TABLE` statement between `origin/staging` and `origin/develop` — zero
`DROP`, zero `RENAME`, zero destructive statements found.

| Change | Table | Type | Notes |
|---|---|---|---|
| `safety_stock` | `inventory` | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS safety_stock INTEGER NOT NULL DEFAULT 0` | Phase 6. Defaults to 0 for every existing row — no behavior change until a value is explicitly set via the new `PUT /inventory/:productId/safety-stock` route. |
| `unit_kind`, `unit_qty` | `order_lines` | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (TEXT, INTEGER) | UOM/POS conversion. Nullable-equivalent additions, no backfill required. |
| `created_by` | `orders` | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS created_by TEXT` | Additive, nullable. |
| `ai_conversations` | new table | `CREATE TABLE IF NOT EXISTS` | AI Assistant module. New table, own index (`tenant_id, created_at DESC`). |
| `ai_recommendations` | new table | `CREATE TABLE IF NOT EXISTS` | AI Assistant module. |

- **Migration mechanism:** this repo has no separate migrations directory — every module
  runs its own idempotent `CREATE TABLE IF NOT EXISTS`/`ALTER TABLE ... ADD COLUMN IF NOT
  EXISTS` on backend boot (`buildApp`). Confirmed via `table:scan`: 161 table names across
  all modules on the post-promotion tree, zero name collisions (the recurring bug class
  from three earlier incidents this quarter has not recurred).
- **RLS:** the `rls` module's migration dynamically scans `information_schema.columns` for
  any table with a `tenant_id` column and applies row-level security automatically — it is
  registered last in `src/modules/index.ts` specifically so it runs after every other
  module's tables exist, including the two new ones above. No manual RLS work needed for
  the new tables.
- **Staging database:** shared with `develop` (Supabase project `lqaicxibgrlxwkvxsaji`),
  confirmed live and already running this exact schema generation on every boot — the new
  columns/tables will self-provision the moment the promoted backend boots against it, no
  manual DB step required.
- **Rollback safety:** because nothing is destructive, rolling the *code* back (§6) does
  not require any DB rollback — old code simply ignores the new columns/tables, which is
  safe by construction (all new columns have defaults; nothing enforces `NOT NULL` without
  one).

---

## 4. Configuration / environment changes

| Item | Type | Required? | Notes |
|---|---|---|---|
| `@anthropic-ai/sdk` (`^0.115.0`) | New `package.json` dependency | N/A (code dependency, not env config) | Added for the AI Assistant module. |
| `ANTHROPIC_API_KEY` | New, **optional** env var | No | AI Assistant degrades to an honest "not configured" response if unset — verified by the module's own test suite running with no key present. Decide whether to set it in staging or deliberately leave it unset for this first pass. |
| `npm run dashboard` | New `package.json` script | N/A | Dev-only visibility tool (`tools/dashboard.mjs`) for `WORK/LOCK.md` staleness — no runtime/deploy impact. |
| `npm run business:matrix` | New `package.json` script | N/A | Dev-only doc generator — no runtime/deploy impact. |
| `.env.example` | **No changes** | — | Confirmed via direct diff — zero lines changed. No existing required variable's meaning or default changed. |
| `STAGING_BACKEND_URL` / `STAGING_BACKEND_ALIAS` / `STAGING_FRONTEND_ALIAS` | Pre-existing, **not new**, but confirmed **dead** | Yes (blocking) | Not something this promotion introduces — flagged here because it's the configuration item that actually blocks a working staging deploy. See §2b. |

No changes to `JWT_SECRET`, `DATABASE_URL`, `STRIPE_*`, `REDIS_URL`, or any other
existing required variable's meaning, default, or validation behavior in this range.

---

## 5. Smoke-test checklist

Two layers: the repo's own automated smoke test (already gates every CI run), plus a
manual pass specifically targeting what changed in this promotion.

### 5a. Automated (`npm run smoke`, runs in CI on every push to `develop`/`staging`/`master`)

Already covers the core retail lifecycle end-to-end against a real (ephemeral) Postgres:
health/module-mount check → login → create taxable + tax-exempt products → receive stock
→ terminal offline toggle → create an order with mixed tax + split payment → confirm
inventory auto-decrement → offline outbox queues events → reconnect drains the queue →
refund restocks inventory → `/metrics` exposes Prometheus output → zero failed workflow
instances → audit log records `order.created`/`payment.captured`/`order.refunded` →
register open with float → cash sale → end-of-day report → register close → Z-report
reconciles. This is unmodified by the promotion and should pass exactly as it does on
`develop` today (it's already green there).

### 5b. Manual/targeted — specific to what this promotion changes

- [ ] **Sales History (`/sales`)** — confirm a real order shows the actual customer name,
      cashier, and outlet (not "Staff"/"Main Outlet"/a placeholder UUID). This was a real
      data-fabrication bug fixed in #135.
- [ ] **Returns (`/returns`)** — attempt a refund; confirm the new confirmation step
      appears before it's issued.
- [ ] **Payments (`/payments`)** and **Returns (`/returns`)** stat cards — confirm they
      render via the shared `KpiCard` (visually consistent tone colors) and that the
      `store_credit` filter chip appears and filters correctly on Payments.
- [ ] **Nav** — confirm "Shipping" appears as its own rail section with "Delivery" and
      the previously-orphaned Shipments page both reachable under it.
- [ ] **Insights → Forecasting → "Create Draft POs"** — this used to 500 every time
      (inserted into a non-existent table). Confirm it now actually creates a purchase
      order with a real PO number and non-zero line costs.
- [ ] **A reorder suggestion for a product with a preferred supplier** (Catalog product
      detail, Inventory Pipeline, or `/inventory/reorder`) — confirm `suggested_qty`
      respects MOQ/case-pack rounding and an `expected_delivery_date` appears.
- [ ] **Purchasing receive flow with a non-base unit** (e.g. receive in cases, verify
      base-unit inventory quantity is correct) — the UOM conversion feature; this is the
      highest-behavioral-risk item in this promotion and deserves a real manual receive,
      not just an automated check.
- [ ] **`/ai-assistant`** — confirm it loads and either answers using the configured key
      or shows its honest "not configured" state — whichever is intended for staging.
- [ ] **A Stripe test-mode payment** (if Stripe test keys are configured in staging) —
      confirm a normal successful charge still works with the new circuit-breaker seam in
      the path (should be invisible in the happy path).
- [ ] **`/readyz`** reports `"db":"connected"` after boot (confirms the new
      tables/columns self-provisioned without error against the shared testing DB).

---

## 6. Rollback procedure

Per `docs/architecture/PIPELINE.md`'s existing rollback section, extended with specifics
for this promotion:

1. **Fastest path — Vercel dashboard rollback** (once staging's deploy target exists/is
   fixed per §2b): promote the previous known-good deployment for the affected project(s)
   directly in the Vercel dashboard. Instant, no git operation needed.
2. **Git-level rollback:** `git revert` the `develop → staging` merge commit and push
   `staging` — this redeploys the pre-promotion `staging` state. Since every schema change
   in this range is additive (§3), the old code will simply ignore the new
   columns/tables — **no database rollback or down-migration is needed**, which is the
   main reason this promotion is safe to revert quickly if something is wrong.
3. **Partial rollback is not recommended.** Because commit `5bc99b5` bundles three
   sub-phases (Phase 6, the insights PO bugfix, and Phase 7 item 1) into one commit,
   reverting only part of it would require a manual patch, not a clean `git revert`. If
   only one sub-feature misbehaves in staging, prefer a forward-fix over a partial
   revert — flag it and this document's author (or whoever's on the branch next) can
   scope a targeted fix.
4. **Circuit breaker specifically:** if it's spuriously tripping against a healthy
   Stripe connection, this is config/threshold tuning, not a rollback candidate — check
   `src/shared/circuit-breaker.ts`'s failure-count/reset-timeout constants before
   reverting the whole reliability-phase-4a commit set.
5. **No secret rotation or irreversible action is part of this promotion** — nothing here
   needs a "point of no return" warning beyond the normal deploy caution.

---

## 7. Post-deployment verification steps

1. **Resolve or explicitly accept §2b before merging** — confirm whether the
   `deploy-staging` CI job has a real target. If not, decide now whether to fix it first
   or merge code-only and treat the deploy job as an expected, tracked failure.
2. Confirm CI is green on the `develop → staging` PR: `Production guard`, `Backend —
   typecheck + test`, `Frontend — typecheck + lint + build`, `e2e` (all four are required
   branch-protection checks per `PIPELINE.md`).
3. If the deploy step runs: confirm `/healthz` and `/readyz` (`"db":"connected"`) on the
   staging origin.
4. Run through the §5b manual checklist against the live staging environment (not just
   CI's ephemeral Postgres) — specifically the UOM receive flow and the Insights
   draft-PO creation, since those are the two with real behavior change.
5. Watch the inventory-reconciliation job's log output (or wait for its next daily run)
   for any unexpected drift warnings on the shared testing database — this is a new,
   read-only detector as of this promotion, so its *first* run in staging is worth a
   look even though it doesn't change any data itself.
6. Re-run this repo's own fast gates against the deployed commit if convenient:
   `npm run hygiene && npm run table:scan && npm run gap:scan` — all three are fast
   (seconds) and already confirmed clean on the exact commit being promoted.
7. Once staging is confirmed healthy, update `WORK/LOOP_STATE.md`'s delivery/release
   status table (currently stale, showing `develop` 30 commits ahead with "nothing has
   promoted develop → staging" as the standing note) to reflect the new sync state.

---

## Appendix: raw commit list (`origin/staging..origin/develop`, newest first)

```
498beee fix(returns,payments): dedupe Metric stat cards into shared KpiCard (#138)
3fa58c2 feat(nav): move Delivery into a new Shipping section, link the orphaned Shipments page (#134)
fe3d0a8 fix(terminal): cleanup — merge sync debouncers, drop dead buttons, unify outlet source (#137)
6942db3 fix(returns): confirm before refund; stop promising customer search it can't do (#136)
6b8afa5 fix(sales): Sales History returns real data instead of fabricated fields (#135)
0623c7e docs(config): authoritative secrets/config registry + external services map (#131)
84778ba docs(REPLIT.md): document the git-safety rule found this session (#130)
64aec15 docs(WORK/LOOP_STATE.md): refresh — stale since 2026-07-19/26, backlog exhausted (#129)
e39a1ee Cursor Cloud dev-env setup notes + fix POS receipt "Order Voided" mistitle (#123)
a74c9ae docs(DEPLOYMENTS.md): third independent network confirms /healthz timeout (#128)
7b13f1d chore(workflow): PR template delivery-standard fields, ADR template, dashboard staleness (#125)
b4b9354 docs(WORK/LOCK.md): close 4 stale ACTIVE claims found by the new dashboard (#126)
97e8fb2 docs(architecture): DEPLOYMENTS.md — deployment reality vs documented claims (#127)
5feddf0 docs(pipeline): flag the Render migration claim as unverified, not settled (#117)
111b7f4 chore(coordination): reconcile claim model, add multi-env bootstrap, dashboard (#124)
6a023ad Merge pull request #120 from Sricharangellu/feature/reliability-phase4a
ff14442 feat(uom,pos): purchasing/receiving unit conversion + POS barcode resolution
f5310f9 docs(WORK): root-cause production heartbeat failures as monitoring config drift
5bc99b5 feat(procurement): Phase 6 reorder intelligence, insights PO bugfix, Phase 7 sales-velocity consolidation
560cae7 docs(WORK): fresh gap audit — heartbeat gone silent, no new code bugs
fc98907 docs(WORK/LOCK.md): record accurate push status for ai-assistant claim
365c282 feat(ai-assistant): finish + verify explain-only AI assistant module
d4b2cc5 docs(architecture): drop stale REPORTS_MODULE_REVIEW.md duplicate
a3f6394 docs(WORK): release Phase 4a/3 claims, repair git-lock note, open PR #120
91045af docs(architecture): reports module UX/architecture review
1221215 feat(settings): developer-facing business-pack matrix generator
73f9530 refactor(payments): extract PaymentGatewayAdapter seam
2b2a5be feat(orchestration): daily inventory reconciliation detector
feda9de docs(WORK/LOCK.md): record release status + git-lock workaround for the circuit-breaker commit
4e68d95 fix(payments,reliability): circuit breaker for Stripe calls + reliability gap-scan audit
```

Plus, if pushed to `develop` first: `eb489d3` (Phase E), `45eaac0` (Phase F), `bba4f9c`
(docs) from `pos-shared-metric-cleanup-rebased`.
