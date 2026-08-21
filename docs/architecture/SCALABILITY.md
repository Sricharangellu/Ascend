# Ascend — Scalability & Capacity

Target: **20,000 registered users**, 2,000–5,000 concurrently active, multi-tenant,
multi-store, POS-heavy.

This document records what was **measured**, what was **fixed**, and what is **still
blocking** that target. Everything below comes from `EXPLAIN (ANALYZE)`, a timed
benchmark, or an HTTP load test against a production-shaped dataset — never from
reading code. Where something was not measured, it says so.

Reproduce any number here with the harness in [`scripts/perf/`](../../scripts/perf):

```bash
# 1. Build a production-shaped dataset (2.1M order lines, 300k orders, 40k products)
psql "$DATABASE_URL" -v tenants=20 -v products=2000 -v orders=15000 \
     -f scripts/perf/seed-scale.sql

# 2. Query plans + latency budgets for the critical paths (non-zero exit on regression)
DATABASE_URL=... TENANT=t_perf_3 npx tsx scripts/perf/explain.ts

# 3. HTTP load test against a running server
BASE_URL=http://127.0.0.1:3001 JWT_SECRET=... \
  npx tsx scripts/perf/load-test.ts --profile=target --seconds=30

# 4. Where does checkout time actually go?
DATABASE_URL=... npx tsx scripts/perf/profile-checkout.ts
```

Measurement environment for every number below: 4 vCPU / 16 GB container,
PostgreSQL 16 local, one Node process, load generator on the same host. Absolute
numbers will differ in production (a network hop to managed Postgres makes
round-trip counts matter *more*, not less); the ratios and the bottleneck
ordering are what transfer.

---

## 1. Verdict

**NOT READY for 20,000 users — one blocker remains.**

The blocker is not the database and not the query plans; both were fixed and are
now comfortably inside budget, and Postgres runs at ~10% CPU under the heaviest
load tested. It is that **POS checkout runs a synchronous orchestration workflow
inside the HTTP request** — 90% of checkout latency, and 1.2 s p50 at a load the
read endpoints serve inside budget. Details and the exact remediation are in §5.

The separate capacity fact, which is not a defect: a single Node instance
saturates **one CPU core** at ~120 req/s. That is a scaling decision (run more
processes, §6), not something to fix in code.

| Acceptance criterion | Status |
|---|---|
| No critical scalability bottlenecks remain | ❌ one remains (§5) |
| Critical APIs meet latency targets | ⚠️ reads yes at baseline; POS no |
| Database queries optimised and indexed | ✅ measured, §3 |
| No major N+1 queries remain | ✅ on the audited paths, §3 |
| APIs have bounded pagination | ⚠️ partial — 53 unbounded SELECTs catalogued, §7 |
| Horizontal application scaling works | ✅ no in-process state blocks it, §6 |
| Background processing is queue-based | ❌ checkout's is not (§5) |
| POS transactions are idempotent | ❌ no idempotency key on order creation (§7) |
| Payments cannot be duplicated by retries | ⚠️ payments have idempotency; order creation does not |
| Multi-tenant isolation verified | ✅ existing suite + new session-context tests (§4) |
| Rate limiting implemented | ✅ and now actually tiered (§4) |
| Production observability complete | ⚠️ metrics/logs/traces exist; alerts undefined |
| Backups and recovery tested | ✅ pre-existing DR drill in CI (not re-run here) |
| Load tests pass | ❌ see §5 |

---

## 2. What was fixed

Each entry is a separate commit with a regression test and a measurement.

| # | Defect | Before | After |
|---|---|---|---|
| 1 | Every authenticated query wrapped in its own transaction (4 round trips for 1 statement) | 0.85 ms p50/query, 3,448 q/s at concurrency 100 | 0.38 ms p50, 6,579 q/s — **2.2× latency, 1.9× throughput** |
| 2 | POS stock check sequentially scanned all order lines, once per basket line | **1,086 ms** for a 3-line basket | **1.1 ms** — 945× |
| 3 | Inventory levels page aggregated every order line in the tenant, per page | **312 ms** | **26 ms** — 12× |
| 4 | One INSERT per order line; one SELECT per line on cart update | O(lines) round trips | 1 statement |
| 5 | Inventory applied per line, each its own transaction and row lock | ~10 round trips × lines, unordered locking | 1 transaction, ordered locking |
| 6 | No statement timeout outside explicit transactions | unbounded — one query could pin a connection forever | bounded by `PG_STATEMENT_TIMEOUT_MS` |
| 7 | Rate-limit tiers were dead code — every tenant limited as `standard` | 10 req/s for every customer on every plan | tier resolved from subscription plan |
| 8 | `/readyz` returned 503 whenever any request queued for a connection | whole fleet reports unready at peak | queue is healthy; only a stuck queue fails |
| 9 | `/readyz` returned **500** when the pool was saturated | reads as "endpoint broken" | 503 "database unreachable" |

### 2.1 The per-query transaction (biggest structural win)

`shared/db.ts` wrapped every tenant-scoped statement in `BEGIN` → `set_config` →
statement → `COMMIT` so Postgres RLS could see `app.tenant_id`. That is four
network round trips, and four times the connection hold time, for a statement
Postgres already executes atomically.

It now keeps `app.tenant_id`/`app.request_id` at the **session** level on the
pooled connection and only re-issues `set_config` when the connection's context
actually changes — one round trip for the overwhelming majority of checkouts.

Two things make this safe rather than clever:

- **Clearing is as important as setting.** A statement with no tenant context
  (background jobs, migrations, `/metrics`) landing on a connection still set to
  some tenant would be silently RLS-filtered to that tenant. An empty context
  resets the session values instead of inheriting them, and that case is tested.
- **It is disabled where it cannot hold.** A transaction-mode pooler (Supabase
  port 6543) routes consecutive statements to different server connections, so
  session state is meaningless there. `sessionCtxEnabled()` detects that from the
  connection string and falls back to the old transaction-per-statement path,
  which is correct under any pooling mode. `PG_SESSION_CTX=off` forces it.

`statement_timeout` and `idle_in_transaction_session_timeout` now ride in on the
pool's startup options, which costs nothing at query time and closes the hole
where non-transactional queries had no timeout at all.

---

## 3. Database

193 tables, 504 indexes. Measured against 2.1M order lines / 300k orders / 40k
products / 2.0M inventory movements.

**The hot tables are well indexed.** `products`, `orders`, `order_lines`,
`inventory_movements` all carry `(tenant_id, …)` composites that match their
access patterns. No index was added during this audit — both major query defects
were fixed by making the SQL usable by indexes that already existed, which is the
cheaper fix in reads, writes, storage and maintenance.

**The recurring defect was a missing tenant prefix.** A predicate on
`ol.product_id` alone cannot use `order_lines_tenant_product_idx (tenant_id,
product_id, order_id)` because the leading column is absent, so Postgres falls
back to a full scan. That single pattern caused both #2 and #3 above. A repo-wide
scan found no further instances on `order_lines`; the other call sites all filter
`ol.tenant_id`.

`scripts/perf/explain.ts` now pins six critical queries to a latency budget *and*
asserts no sequential scan on the tables that matter, exiting non-zero on
regression. Current state:

```
ok   pos.checkout/stock-check                  1.11 ms  (budget 50 ms)
ok   inventory.levels/page                    18.69 ms  (budget 150 ms)
ok   orders.list/page                          0.06 ms  (budget 50 ms)
ok   catalog.list/page                         0.07 ms  (budget 50 ms)
ok   order.detail/lines                        0.03 ms  (budget 25 ms)
ok   inventory.movements/product-history       0.09 ms  (budget 25 ms)
```

### Known database gaps (not fixed)

- **17 unindexed foreign keys.** Most are on low-traffic tables and are covered
  for tenant-scoped reads by a `(tenant_id, fk)` composite. They still matter for
  `ON DELETE CASCADE`, which matches on the FK column alone and therefore scans.
  Not fixed because no measurement showed it mattering yet; adding 17 indexes on
  that basis would be exactly the speculative indexing this audit avoided.
- **Ten tables with a `tenant_id` column but no index leading with it**
  (`bom_lines`, `customer_groups`, `event_consumptions`, `event_outbox`,
  `feature_flags`, `password_reset_tokens`, `product_attributes`,
  `supplier_balances`, `user_mfa`, `workflow_steps`). `event_outbox` and
  `workflow_steps` are the two that grow without bound and should be looked at
  first.
- **No partitioning.** At the modelled growth (§8) `order_lines` reaches ~50M
  rows in three years for a large tenant population. Index-only access keeps that
  workable, but `inventory_movements`, `audit_log` and `event_outbox` are
  append-only and time-ordered — the natural candidates for range partitioning
  plus a retention policy. Not implemented; no measurement yet justifies the
  operational cost.
- **RLS is bypassed by superusers.** The policies are correct, but they only bind
  when the application connects as a non-superuser role. The existing isolation
  test proves this properly by connecting as a dedicated `NOSUPERUSER
  NOBYPASSRLS` role. Verify the production role has neither attribute.

---

## 4. Multi-tenancy, security and limits

- **Isolation.** The pre-existing cross-tenant suite (`gateway/tenant-isolation.test.ts`)
  proves both layers — API scoping and the RLS backstop — through a non-superuser
  role. The DB-layer rewrite is the riskiest possible change to that guarantee, so
  it ships with `shared/db-session-context.test.ts`: 13 tests covering tenant
  switching on a shared connection, the unscoped-query reset path, transaction
  locality, and the conservative fallback. All run with `PG_POOL_MAX=1`, forcing
  every tenant through one connection.
- **Rate-limit tiers were dead code.** `RATE_TIERS` defined `premium` and
  `enterprise`, but `tenantRateLimitMiddleware` was mounted without a `tierOf`
  resolver, so every tenant fell through to `standard` — 10 req/s sustained.
  An enterprise customer running twelve tills across four stores was throttled
  the same as a single-till starter account. Tiers are now resolved from the
  subscription plan and cached with a TTL (sync read, background refresh, degrade
  to `standard` on lookup failure).
- **The per-IP limiter is now tunable** (`GLOBAL_RATE_LIMIT_CAPACITY`/`_REFILL`).
  It was hard-coded at 120 burst / 40 rps. Behind a NAT, a corporate proxy, or a
  misconfigured `TRUST_PROXY_DEPTH`, an entire customer site arrives as one IP —
  and the whole site would have been capped at 40 req/s with no way to change it.
- **Not audited in this pass:** MFA, session/refresh-token handling, CSRF, file
  uploads, webhook signature verification, dependency CVEs. `SECURITY.md` and the
  `security.yml` workflow cover parts of this; none of it was re-verified here and
  none of it should be assumed from this document.

---

## 5. THE BLOCKER — synchronous orchestration in the POS checkout

**Symptom.** `POST /api/v1/orders` is 46 ms uncontended and **1,224 ms p50** at
baseline load — 5–15× the read endpoints sharing the same instance, against a
budget of 200 ms. In-process (no HTTP, no load generator) checkout throughput
plateaus at ~111/s while average latency grows 72 ms → 292 ms from concurrency 8
to 32: the signature of a serial resource inside the request, not of a slow
query.

**What it is not.** This was chased through every usual suspect first, and the
elimination matters as much as the answer:

| Hypothesis | Test | Result |
|---|---|---|
| Slow SQL | `log_min_duration_statement=150` during load | **zero** statements from the checkout path |
| WAL fsync | `synchronous_commit=off` | 1,148 → 936 ms; not dominant |
| Connection pool too small | pool sizes 10 / 25 / 50 under identical load | 1,218 / 1,104 / 1,070 ms — within noise |
| CPU saturation | process sampling | Node under 50% of one core |

**What it is.** `scripts/perf/profile-checkout.ts` times every domain event the
checkout publishes:

```
concurrency=32  throughput=111.5/s  avg=291.9ms
  create:total                       avg=291.89ms
  publish:order.created              avg=261.45ms  (90% of request)
  publish:workflow.step_completed    n=3568        (4 per order)
  publish:inventory.adjusted         n=2194
  publish:workflow.completed / started / checkout.completed / accounting.entry_requested
```

`EventBus._dispatch` awaits subscribers **strictly sequentially**, and
`order.created` triggers a whole workflow-engine run, an accounting posting and
the inventory application — all inside the HTTP request. 90% of a POS checkout is
work that has no business being on the synchronous path.

**Remediation (not implemented — needs its own cycle).**

1. Keep synchronous only what the customer's next action depends on: the order
   row, its lines, and the inventory decrement that protects against oversell.
2. Move the workflow-engine run, the accounting posting, and the SSE/notification
   fan-out onto the existing `job_queue` (which already has `FOR UPDATE SKIP
   LOCKED`, retries, backoff and dead-lettering — the infrastructure exists and is
   used by other jobs).
3. Stage the outbox row **inside** the order transaction using the `EventBus.stage()`
   API that already exists for exactly this. Today `orders.create` publishes
   *after* commit, so a crash between the two loses the event — the durability
   hole the outbox pattern exists to close.
4. Re-run `profile-checkout.ts` and the `target` load profile to confirm.

Expected result: checkout back near its 46 ms uncontended cost, and its CPU cost
per request cut proportionally — which matters twice over, since §6 shows the
per-instance ceiling is a saturated core.

---

## 6. Capacity, as measured

Single Node instance, 4 vCPU shared with Postgres and the load generator.

| Profile | In-flight | Throughput | Reads p95 | POS p50 | Errors |
|---|---|---|---|---|---|
| baseline | 40 | 124 req/s | 86–280 ms | 1,224 ms | 0 (excl. business 400s) |
| target | 200 | 117 req/s | 683–1,880 ms | 6,750 ms | 0 |
| stress | 400 | 117 req/s | 1,887–3,778 ms | 12,671 ms | 0 |

**The per-instance ceiling is one CPU core, not the database.** Under load the
Node process sits at **100–110% CPU** (single-threaded, so 100% is saturation)
while Postgres uses ~10% and the connection pool has headroom. That is why
throughput is flat at ~120 req/s across a 10× concurrency range, and why pool
sizes 10/25/50 measured within noise of each other: adding concurrency to a
saturated core only adds queueing.

A read-only run confirms it is the process, not the write path: reads alone reach
the same ~124 req/s. So the ~120 req/s figure is a **CPU ceiling per instance**,
and the checkout blocker in §5 is a *latency* and *CPU-cost* problem on top of it,
not the throughput cap. (An earlier draft of this document attributed the
throughput ceiling to §5; the read-only measurement disproved that, and the
correction is recorded here rather than quietly rewritten.)

**The per-tenant rate limiter behaves exactly as designed.** Driving a single
enterprise tenant with one read scenario as hard as possible: 42,942 requests
attempted in 30 s, **6,050 served = 202 req/s**, the rest 429. The enterprise
tier's sustained rate is 200 req/s. That is the limiter working, not a defect —
and it is the number to raise when one tenant legitimately needs more.

**Nothing fails.** No 5xx, no connection exhaustion, no dropped requests, and
`/readyz` stays 200 throughout — the system degrades in latency, which is the
correct failure mode, and the readiness fix (#8) is what keeps a busy fleet in
rotation. The ~6% 400s are business rejections (out-of-stock, archived product)
produced by the seeded dataset, not failures.

**Extrapolating to the target** (arithmetic, not a claim): 5,000 concurrently
active ERP users at one request per 25 s is ~200 req/s sustained. At ~120 req/s
per instance that is **2 instances for throughput alone**, plus headroom for
spikes — call it 4. But latency at that load misses budget because of §5, so the
honest sequence is: fix §5, re-measure, then size. Publishing an instance count
derived from a path that spends 90% of its time on work that should be
asynchronous would be misleading.

The `extreme` profile (800 in-flight, ~20,000 active users) was **not run**
against a single instance: it would only have measured queue depth behind a
saturated core. Run it against a multi-instance deployment after §5 is fixed.

### Horizontal scaling

No blocker found, and it is the main lever available. Sessions are JWT-based (no
server-side session store), rate limiting uses Redis when `REDIS_URL` is set, the
event bus fans out over Redis Pub/Sub, and background jobs are claimed with
`FOR UPDATE SKIP LOCKED`. Instances are interchangeable.

Because the ceiling is a single core per process, **the cheapest capacity win is
more processes**: a 4 vCPU host should run ~3 app processes, not one. Nothing in
the code prevents it today.

The one thing to get right when adding instances is the **connection budget**:
`PG_POOL_MAX` × instances must stay under the database's limit (and under
Supabase's per-project pooler client limit). Pool size measurably did *not* help
throughput, so size it for safety, not speed — 10–25 per instance.

## 7. Known gaps, not fixed

Listed with impact so they can be prioritised rather than rediscovered.

1. **No idempotency key on order creation.** `POST /api/v1/orders` has no
   idempotency mechanism: a POS terminal that retries after a network timeout
   creates a second order. Payments have idempotency; order creation does not.
   **High severity for the stated target** — the brief calls for exactly this,
   and it is the one acceptance criterion that a retry can violate silently.
2. **53 unbounded `SELECT`s** in service code (no `LIMIT`, not an aggregate, not
   a single-row lookup). Most are per-tenant configuration reads that are
   naturally small; the ones that grow without bound are `permission_requests`,
   `product_batches`, `workforce` shifts/time-off, `team` members (an org with
   20,000 users returns all of them), and the reports that scan every product.
   Not capped in this pass because capping a list endpoint changes its API
   contract and each needs its own decision about pagination vs. background
   export.
3. **Outbox rows are written outside the business transaction** (§5, item 3).
4. **No alert definitions.** The metrics exist (`db_pool_connections`, job queue
   depth, outbox age, request latency); nothing declares thresholds or routes
   them anywhere.
5. **Frontend not audited.** No bundle analysis, no page-level measurement, no
   virtualised-table review. Out of scope for the time available; stated rather
   than implied.
6. **Failure-injection testing not run.** Postgres/Redis/payment-provider outage
   behaviour, worker crashes and concurrent-oversell races were not exercised.
   The circuit breaker in `shared/circuit-breaker.ts` has unit tests but was not
   validated end-to-end under a real dependency outage.

---

## 8. Data growth

Modelled from the seeded shape (7 lines/order, 1 payment and ~7 movements per
completed order), for 20,000 users across ~2,000 tenants at 50 orders/tenant/day:

| Table | Rows/year | 3 years | 5 years |
|---|---|---|---|
| orders | 36M | 110M | 180M |
| order_lines | 255M | 765M | 1.3B |
| inventory_movements | 255M | 765M | 1.3B |
| payments | 36M | 110M | 180M |
| audit_log | ~110M | 330M | 550M |
| event_outbox | ~250M | — | — (retention job exists) |

At this scale the index-only access paths still work, but three things become
necessary rather than optional: **range partitioning** on the append-only tables,
a **retention/archival policy** for `audit_log` and `inventory_movements`, and
moving historical reporting off the transactional tables. None of this is urgent
at 20,000 users in year one; all of it is cheaper to design now than to retrofit.

---

## 9. Configuration added

| Variable | Default | Purpose |
|---|---|---|
| `PG_STATEMENT_TIMEOUT_MS` | `PG_TX_TIMEOUT_MS` (30s) | Per-statement timeout on every connection, including outside transactions |
| `PG_IDLE_TX_TIMEOUT_MS` | 60000 | Kills sessions holding an idle open transaction |
| `PG_SESSION_CTX` | auto | Single-statement fast path; auto-disabled on a transaction-mode pooler |
| `PG_READY_MAX_WAITING` | 10 | Multiple of `PG_POOL_MAX` beyond which `/readyz` reports degraded |
| `GLOBAL_RATE_LIMIT_CAPACITY` | 120 | Per-IP burst |
| `GLOBAL_RATE_LIMIT_REFILL` | 40 | Per-IP sustained req/s |
