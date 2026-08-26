# AUDIT 2026-08-26T04:37:09Z — Where and why Ascend can break

**Session:** Claude Code web — branch `claude/app-failure-points-doc-rq6fw1` (cut from `develop`, tip `e693cd8`)
**Directive:** Sri, 2026-08-26 — *"why & where could this or does application fail or break — make a document to review in human language."*
**Type:** Point-in-time review. Read-only: no code was changed by this pass.

---

## How to read this

This is a plain-language walk through the places Ascend is most likely to fall over, written for
a person deciding what to fix, not for a compiler. Each item says **what breaks**, **why it
breaks**, **what it looks like when it happens**, and **where the code is**, so anyone can go
check it themselves.

Two honesty notes up front, because they change how much weight to give each item:

- **Everything here comes from reading the code and the repo's own audit trail.** This sandbox has
  no `node_modules` and no database, so `npm run typecheck`, `npm test`, `npm run verify` and the
  structural scans could not be run. Nothing below is claimed as "reproduced" unless the repo
  already recorded a reproduction (SCALABILITY.md, DEPLOYMENTS.md, the audits in `WORK/audits/`).
- **Where an existing repo document already measured something, this file cites it instead of
  re-asserting it.** The measured performance work lives in `docs/architecture/SCALABILITY.md`;
  the deployment situation lives in `docs/architecture/DEPLOYMENTS.md`. This file's job is to put
  everything in one human-readable place and add the things nobody had written down yet.

Severity is judged on **what a retailer loses** — money, data, or the ability to sell — not on how
interesting the bug is.

| Tier | Meaning |
|---|---|
| 🔴 **Stops the business** | The shop cannot sell, cannot log in, or loses money/data |
| 🟠 **Silently wrong** | Everything looks fine; the numbers or the state are not |
| 🟡 **Degrades under load or over time** | Works today, breaks at scale or after months of data |
| ⚪ **Latent** | Dormant code that will break the day someone wires it up |

---

## The short version

If you read nothing else:

1. **Nobody in this repo can prove where production runs, and nothing here deploys to it.** That is
   the single biggest risk, and it makes every other fix undeliverable. (§1)
2. **The frontend ships with fake data turned on by default.** A build that forgets one environment
   variable serves a fully convincing demo of a shop that doesn't exist. (§2)
3. **A POS terminal that retries a checkout creates a second order.** There is no idempotency on
   order creation, and the offline replay path sends a de-duplication header the backend never
   reads. (§3)
4. **Checkout spends 90% of its time doing work that shouldn't be in the request**, which is
   measured, documented, and still open. (§4)
5. **Backups have been reported green while producing nothing**, and the scheduled jobs that would
   catch that run from a branch that is hundreds of commits stale. (§1, §7)

---

## 1. Deployment and environment — the biggest hole 🔴

This is where the application most plausibly "is broken right now," and the repo already says so.
`docs/architecture/DEPLOYMENTS.md` is an open reconciliation document, not a description of a
working system.

### 1.1 The deploy pipeline points somewhere other than production

Production is claimed to be Render (`https://ascend-prod.onrender.com`, reconfirmed by Sri
2026-08-08). But `scripts/deploy.sh`'s `deploy_backend` targets **Vercel**, and `ci.yml`'s deploy
jobs target Vercel project IDs that are either deleted (`Project not found`) or serving an
unrelated app. There is no `render.yaml`, no Render deploy hook, no workflow that touches Render.

**What this means in practice:** merging a fix to `develop`, `staging`, or even `master` does not
put that fix in front of a customer. Someone has to do something manual that this repo does not
describe. A green CI run means "the tests passed", not "production has this."

**Why it matters most:** every other item in this document is unfixable in production until this
one is. You can fix the checkout bug perfectly and no shop will ever receive the fix.

### 1.2 The frontend freezes the backend address at build time

`web/next.config.mjs` reads `BACKEND_URL` inside `rewrites()`. Next.js evaluates rewrites during
`next build` and bakes them into `routes-manifest.json`. So the backend address is **compiled into
the bundle**, not read at runtime.

Consequence, already observed: every production build between the 2026-07-20 cutover and
2026-08-08 baked in `ascendhq-api.vercel.app`, which answers HTTP 404. A frontend proxying every
`/api/*` call to a dead host **cannot log anyone in** — and no amount of correct backend hosting
fixes it, because the wrong address is inside the shipped JavaScript.

**The trap that remains:** the fallback is better now (`ascend-prod.onrender.com`), but the shape
of the bug is unchanged. Change where the backend lives, and every frontend build made before that
change is silently wrong. Redeploying the backend is not enough; the frontend must be rebuilt.

### 1.3 Scheduled workflows run from the default branch, which is far behind

GitHub runs `schedule:` workflows from the **default branch only**. As documented on 2026-08-08,
`master` was 245 commits behind `staging`. So the ops fixes that landed on `develop` — the uptime
monitor's repo-variable indirection, the backup job's "green lie" fix, the entire `security.yml`
workflow — are **inert for the runs that actually matter**.

This is a nasty class of failure because the dashboard is green. The workflow *name* runs; a
different, older *file* executes.

**Direct consequence for §7:** the background-job tick workflow (`.github/workflows/jobs-tick.yml`)
is subject to the same rule. If that file is not on the default branch, the 15-minute tick it
promises does not happen, and the outbox and every scheduled job stall — silently.

### 1.4 Backups reported success while producing nothing

The daily backup job returned `success` on runs that produced zero artifacts (run `31250642991`,
`total_count: 0`). `backup.yml` on `develop` has since been fixed to raise a warning annotation and
write "this run is green but produced no artifact — the production RPO is unbounded, not ≤24h" into
the job summary. Per §1.3, the fixed version only takes effect on scheduled runs once it reaches
the default branch.

**In blunt terms:** until a `db-backup-*` artifact is confirmed attached to a real run, assume the
recovery point objective is *total loss*, not 24 hours.

### 1.5 Environment configuration is a long list of quiet degradations

`buildApp()` in `src/app.ts` hard-fails in production on only two variables — `JWT_SECRET` (with a
good placeholder/entropy check) and `DATABASE_URL`. Everything else *warns and carries on*:

| Missing variable | What silently stops working |
|---|---|
| `SENDGRID_API_KEY` | Password reset and all transactional email fail silently |
| `STRIPE_SECRET_KEY` | Card payments return 503 |
| `STRIPE_WEBHOOK_SECRET` | The Stripe webhook endpoint returns 503 — payment confirmations never arrive |
| `REDIS_URL` | Rate limits become per-instance; cross-instance events (live updates) stop |
| `METRICS_TOKEN` | Metrics scraping disabled |
| `CRON_SECRET` / `JOBS_TICK_SECRET` | `/jobs/tick` returns 503 — **no background jobs at all** |
| `WEBHOOK_SECRET_KEY` | Creating or rotating a webhook subscription fails closed |
| `ALLOWED_ORIGINS` | Falls back to a hardcoded list of Vercel hostnames (§5.4) |

The failure mode is the same each time: a log line nobody is reading, and a feature that quietly
isn't there. Fail-fast is right for the two that are fatal; the rest deserve at minimum a
startup summary surfaced somewhere a human looks.

### 1.6 `.replit` describes a project this repo is not

`.replit` runs `pnpm --filter @workspace/api-server ...` for both of its validation workflows. This
repo is npm-based at the root, and there is no `@workspace/api-server` package or
`pnpm-workspace.yaml` (removed during the npm-root restore; see the 2026-08-15 Replit import audit).
Anyone opening this in Replit gets two failing workflows on first run, for reasons that have nothing
to do with their change.

---

## 2. The mock/demo switch — the app can look perfect and be entirely fictional 🟠

This is the failure mode most likely to fool a human, including the people building it.

### 2.1 Mocks are on by default

`web/next.config.mjs`:

```js
NEXT_PUBLIC_MOCK: process.env.NEXT_PUBLIC_MOCK ?? "true",
```

The default is **on**. A production build that doesn't explicitly set `NEXT_PUBLIC_MOCK=false`
ships with Mock Service Worker intercepting every API call. The app then looks completely healthy:
products, sales, dashboards, reports — all fabricated in the browser, all convincing, none of it
touching a database.

This is exactly why `AGENTS.md` insists on `NEXT_PUBLIC_MOCK=false npm run build` as the proof of
production wiring, and why "a page exists" is banned as evidence of completion. The safety rule is
written down; the default still points the wrong way.

**Recommendation:** invert the default (`?? "false"`) and make mock mode opt-in. A forgotten
variable should produce a visibly broken app, not a beautifully fake one.

### 2.2 Demo mode persists in the browser indefinitely

`web/mocks/MockWorkerInit.tsx` also activates mocks at runtime when the URL carries `?demo=1` or
when `localStorage["ascend_demo"] === "1"`. The `?demo=1` parameter is stripped from the URL after
it sets the flag, so **the visible evidence disappears while the state persists.**

A salesperson demoing on a customer's machine, or a developer who once clicked a demo link, leaves
that browser in mock mode until localStorage is cleared. Any bug report from that browser is
describing fiction.

### 2.3 Some API surfaces only exist as mocks

`AGENTS.md` lists the frontend prefixes with no real backend behind them:
`/api/v1/promotions`, `/api/v1/documents`, `/api/v1/golf`, `/api/v1/pricing`, `/api/v1/warehouse`.

With mocks on, those pages work. With mocks off — i.e. in any real deployment — they 404. The
mitigation is `NEXT_PUBLIC_SHOW_PARTIAL_PAGES=true` gating partial pages out of navigation, but the
routes remain reachable by direct URL, bookmark, or a link from another page.

Storefront customer auth is handled more honestly: `web/contexts/StoreAuthContext.tsx` detects that
`/api/v1/ecommerce/auth/*` is mock-only and disables login/register up front in "preview mode"
rather than failing after submit. That's the pattern the other five prefixes should follow.

---

## 3. Money and data integrity — the things you cannot undo 🔴

A POS that occasionally double-charges or loses a sale is worse than one that is down, because the
damage is discovered later, by the customer.

### 3.1 Order creation has no idempotency key

`POST /api/v1/orders` has no de-duplication mechanism. A terminal that times out and retries — the
normal behaviour of a till on flaky shop wifi — creates a **second order**.

This is recorded in `SCALABILITY.md` §7 as the highest-severity open gap, and it is the one
acceptance criterion a retry can violate silently. Payments have idempotency (§3.2); orders do not.

### 3.2 The offline replay path sends a header nobody reads

This one is new to this audit, and it compounds §3.1.

- `web/lib/offlineOutbox.ts` and `web/public/sw.js` both replay queued requests with
  `"X-Idempotency-Key": item.id`, on the documented assumption that "the backend deduplicates
  replayed requests correctly."
- **The backend never reads that header.** Grepping `src/` finds no reader of `X-Idempotency-Key`.
- The middleware that *would* have handled the standard `Idempotency-Key` header
  (`src/orchestration/idempotency/idempotency-middleware.ts`) is **exported but never mounted on
  any route**.
- And if it were mounted, it reads the tenant from `req.tenantId` — a property nothing in this
  codebase ever sets (auth lives on `res.locals.auth`). It would fall back to the literal string
  `"default"`, meaning **every tenant would share one idempotency namespace**.

What *does* work: `PaymentsService.capture()` de-duplicates on an `idempotencyKey` field **in the
request body**, with a fingerprint check that rejects the same key reused for a different request
(`src/modules/payments/service.ts`). That is a genuinely good implementation — it just isn't the
mechanism the offline queue is using.

**Net effect:** an offline sale replayed twice (service-worker Background Sync racing the
main-thread polling fallback, or a network timeout where the request actually succeeded) can create
duplicate orders, and duplicate payments unless the caller happens to pass a body-level
`idempotencyKey`.

### 3.3 There are two offline queues, and they behave differently

| Queue | Storage | Holds | Replayed by |
|---|---|---|---|
| `web/lib/syncOutbox.ts` | localStorage | Cart/order sync (`create_order`) | `OfflineQueueBanner` on reconnect, or a manual button |
| `web/lib/offlineOutbox.ts` | IndexedDB | Payment captures | Service worker Background Sync, with a main-thread polling fallback |

Two queues with two storage mechanisms, two replay triggers, and no shared ordering guarantee.
An offline sale is an **order** in one queue and a **payment** in the other. If one replays and the
other doesn't (localStorage cleared, service worker unregistered, quota exceeded — `syncOutbox`
swallows quota errors as "best effort"), you get an unpaid order or a payment against an order that
was never created.

### 3.4 The offline sync engine's uploader is a no-op

`src/modules/sync/service.ts` implements a proper outbox — every domain event lands in `sync_queue`
as `pending`, with retry, exponential backoff, and a max-attempts dead-letter. But:

```ts
private uploader: Uploader = () => {};
```

The default uploader does nothing, and **nothing in production calls `setUploader`** — the only
references are the class's own definition and tests. So `pushSync()` "succeeds" for every row and
marks it `synced`.

The doc comment is honest about it ("An uploader **simulates** pushing one queued event to the
cloud ledger"), but the effect is that the sync status a user sees — pending / synced counts,
"all queued sales synced" — is reporting on uploads that never happen. If anyone is treating
`sync_queue.status = 'synced'` as evidence that data reached anywhere, that belief is wrong.

### 3.5 Order events are published after the transaction commits

`SCALABILITY.md` §5 item 3 states it plainly: `orders.create` publishes `order.created` *after*
commit, so a crash in the window between commit and dispatch loses the event — and with it the
accounting posting, the inventory application, and the workflow run that hang off it.

The fix already exists in the codebase and is unused at that call site: `EventBus.stage(tdb, ...)`
writes the outbox row **inside** the caller's transaction, exactly so it commits or rolls back
atomically with the business write (`src/shared/events.ts`).

### 3.6 Outbox redelivery only covers consumers that opted in

`src/shared/outbox.ts` is explicit and correct about its own limits, and they are worth
understanding rather than assuming they're stronger than they are:

- Only event types with a **registered durable consumer** are persisted before dispatch. Everything
  else is fire-and-forget.
- Redelivery goes only to those durable consumers — deliberately, because redelivering to a
  non-idempotent consumer (an inventory increment) would double-apply.
- Non-idempotent consumers therefore keep **at-most-once** semantics: a crash mid-dispatch loses
  their effect permanently.
- After 10 failed attempts a row goes to `status = 'failed'` and stops being retried. Nothing in
  the codebase alerts on that state; you find it by querying the table.

### 3.7 Stripe webhooks are acknowledged before they are handled

In `src/app.ts`, the Stripe webhook verifies the signature, then does:

```ts
void events.publish(`stripe.${event.type}`, ...).catch(err => logger.error(...));
res.status(200).json({ received: true });
```

Stripe is told "received" before the handler runs. If the handler throws, Stripe sees a 200, never
retries, and the event is gone — logged, but gone. That's a defensible trade (Stripe requires a
fast 200) *provided* the event is durably persisted first. It isn't: the outbox is only involved if
that event type has a registered durable consumer.

---

## 4. Performance and load 🟡

All of this is measured — see `docs/architecture/SCALABILITY.md`, which is the authority. Summarised
here because "the till is slow at 5pm" is a failure that a shop feels immediately.

### 4.1 Checkout runs a whole orchestration workflow inside the HTTP request

The documented blocker. `POST /api/v1/orders` is 46 ms uncontended and **1,224 ms p50 under
baseline load**, against a 200 ms budget. Profiling shows `publish:order.created` is **90% of the
request** — `EventBus._dispatch` awaits every subscriber sequentially, and `order.created` kicks off
the workflow engine, an accounting posting, and the inventory application, all before the cashier's
screen can move.

Ruled out by measurement, not argument: slow SQL (zero statements logged), WAL fsync (not
dominant), pool size (within noise).

**Verdict in the repo's own words: NOT READY for the 20,000-user target.**

### 4.2 One process saturates one core at ~120 req/s

Not a defect — a capacity fact. It becomes a failure the moment someone assumes a single instance
scales with the customer count. Combined with §4.1 (checkout burning CPU it shouldn't), the ceiling
arrives sooner than the arithmetic suggests.

### 4.3 53 unbounded queries

Service code contains 53 `SELECT`s with no `LIMIT` that aren't aggregates or single-row lookups.
Most are small per-tenant config reads. The ones that grow without bound: `permission_requests`,
`product_batches`, workforce shifts and time-off, `team` members (an org with 20,000 users returns
all of them in one response), and reports that scan every product.

These fail gradually and then suddenly: fine for a year, then one tenant's page times out and takes
a pooled connection with it.

### 4.4 Migrations run at every cold start, behind one global lock

`buildApp()` runs every module's migrations on boot, serialised by a single Postgres advisory lock
(`MIGRATION_LOCK_KEY = 7381920`), with a wait of up to 5 minutes (`PG_MIGRATION_LOCK_WAIT_MS`).

The design is sound — hash-checked migrations, so instances that queue behind a peer then skip
everything — and the code carries an unusually good comment explaining a CI failure it caused. The
operational risk is what it implies:

- **A cold-start storm serialises.** Scale from 1 to 10 instances and nine of them wait on the
  tenth. On the Vercel serverless entry (`api/index.js`) this happens per cold instance.
- **A stuck migration blocks every boot**, not just one, until the lock wait expires — at which
  point instances start failing to boot rather than serving stale-but-working code.
- **The health checks disagree during this window:** `/healthz` answers 200 from a process that
  cannot reach Postgres; `/readyz` is the one that proves the database. The Dockerfile correctly
  probes `/readyz` with a 60s start period. Anything else pointed at `/healthz` will route traffic
  to a broken instance.

---

## 5. Authentication, permissions, and tenant isolation 🟠

### 5.1 Two guards fail open, two fail closed — deliberately, and worth knowing which

| Guard | On database error | Consequence |
|---|---|---|
| `requirePlan` | **Fails open** — access granted | A subscriptions outage gives everyone the top plan |
| `requireCapability` | **Fails closed** — 403 | A database blip turns off paid features for every tenant at once |
| `requireModule` | **Fails closed** — 403 | Same; a capabilities query hiccup hides a vertical's whole module |

The reasoning is documented and defensible (entitlements shouldn't lock out paying customers;
business-pack isolation must be deny-by-default). But the *availability* shape is worth stating
plainly: **a transient database problem doesn't just slow Ascend down — it removes features from
the UI**, and the 403 message deliberately doesn't say why. Support will hear "my inventory module
disappeared", not "the database was slow."

Note also that `CapabilitiesContext` on the frontend fails **open** — every capability check returns
true during a capabilities outage. So during the same incident the UI shows features the server is
now refusing. That combination produces the worst user experience available: visible buttons that
return "not available for your account."

### 5.2 Permission changes take up to 15 minutes to take effect

Access tokens are JWTs carrying `role`, `permissions`, and `storeIds`, with a 15-minute TTL
(`src/identity/tokens.ts`). Revoking a role or a permission does not invalidate tokens already
issued. A dismissed employee keeps their access for up to 15 minutes.

That's a normal, accepted trade-off for stateless auth — it just needs to be a *known* one, because
"I removed their access" and "their access is removed" are not the same sentence here.

### 5.3 Tenant isolation depends on a session variable that pooling mode can invalidate

Isolation is enforced by Postgres RLS reading `app.tenant_id`, set per connection. `src/shared/db.ts`
handles this carefully: it detects a Supabase **transaction-mode** pooler (port 6543), where
consecutive statements can land on different server connections, and disables the single-statement
fast path there — falling back to an explicit transaction, which is correct under any pooling mode.

The risk is the manual override. `PG_SESSION_CTX=on` **forces** the fast path for "a pooler we
cannot classify." Set that against a transaction-mode pooler — a different provider, a changed URL,
a well-meaning performance tweak — and a statement can execute on a connection carrying **another
tenant's** session context. That is the one failure in this document that leaks data across tenants.

The code is right; the escape hatch is sharp. It deserves a louder warning than an env var, and
ideally a startup probe that verifies session state actually survives between statements.

### 5.4 CORS falls back to a hardcoded list of hostnames

With `ALLOWED_ORIGINS` unset, the allowlist is six literal Vercel hostnames in `src/app.ts`, kept
additive through the rebrand. Move the frontend to a new domain and forget the env var, and every
browser request is blocked by CORS — with an error message that points at the browser, not at the
configuration. (Same-origin rewrites hide this in the normal path, which makes it *harder* to
diagnose when it does bite, not easier.)

### 5.5 API keys map scopes onto roles

In `makeAuthMiddleware`, an API key with the `admin` scope becomes `role: "manager"`; anything else
becomes `cashier`. Any route gated on `requireRole("owner")` is unreachable by API key, and any
route gated on `manager` is reachable by any key holding `admin`. That's a coarse mapping to keep in
mind when adding role gates — the scope system and the role system are not the same axis, and they
meet at one line of code.

---

## 6. Third-party dependencies ⚪🟡

| Dependency | Failure handling | The gap |
|---|---|---|
| **Stripe** | 503 when unconfigured; circuit breaker on the gateway | Webhook acked before handling (§3.7) |
| **Redis** | Optional everywhere; in-memory fallback | Rate limiting **fails open** on Redis error (`.catch(() => next())`); without Redis, limits are per-instance, so N instances = N× the intended limit; cross-instance events (live SSE updates) stop entirely |
| **Anthropic** | Circuit breaker: 5 failures → 30s open, with a correct 4xx-vs-5xx distinction | Good. This is the model the others should follow |
| **SendGrid** | Warned at boot | Password resets fail *silently* — the user sees "check your email" forever |

The Redis rate-limit fail-open is the notable one: the component that exists to protect the service
under attack is the component that switches itself off when the infrastructure is unhealthy — i.e.
exactly during an attack.

---

## 7. Background jobs and scheduling 🟠

Nothing in Ascend's background layer runs on its own. Two mechanisms exist, and both have a way of
being quietly absent:

1. **In-process timers.** The outbox sweep is a `setInterval(..., 60_000).unref()` in `buildApp()`.
   This works on a long-lived server (Render). It **does not work on serverless** — the interval is
   frozen between invocations. `api/index.js` is a Vercel serverless entry, so on that deployment
   path the sweep effectively doesn't exist.
2. **The `/jobs/tick` endpoint**, called by an external scheduler. It accepts two credentials
   (`CRON_SECRET` via `Authorization: Bearer` for Vercel Cron; `JOBS_TICK_SECRET` via
   `X-Jobs-Tick-Secret` for everything else) and returns **503 in production if neither is set**.

The history here is instructive: `.env.example` documented both secrets from the start, but the code
only ever read `CRON_SECRET`. An operator on a non-Vercel host who followed the documentation
exactly got a 503 and no background jobs at all — silently. That's fixed. But the replacement
scheduler is a GitHub Actions workflow (`jobs-tick.yml`, every 15 minutes), which brings §1.3's rule
with it: **scheduled workflows run the default branch's copy of the file.** If that workflow isn't
on the default branch, the tick doesn't happen.

**What stops when the tick stops** — and none of it announces itself:

- Outbox redelivery — failed financially-critical events stay undelivered indefinitely
- The trial-expiry sweep — trials never expire
- AR dunning — invoice chasing stops (and because the job re-enqueues *itself* 24h out, one missed
  chain never restarts on its own)
- Reservation expiry, payment reconciliation, register close, ecommerce sync, idempotency-key purge

**Recommended check, right now:** call `/jobs/tick` manually against production with the correct
secret and look at `jobsProcessed` and the outbox counts in the response. That one request answers
whether the background layer has been running at all.

---

## 8. Dormant code that will break the day it is used ⚪

Not currently causing failures. Listed because each is a trap set for the next person, and this
repo has already been bitten by exactly this pattern once (`AccountingPostingWorkflow` wrote to a
`journal_entries` schema no migration ever created, so every posting threw and was swallowed —
retired, and documented in `bootstrapOrchestration`).

### 8.1 The CQRS command layer is registered and unreachable

`bootstrapOrchestration` registers eight sets of command handlers on a `CommandBus`. **Nothing in
`src/` ever calls `.dispatch()`** outside tests. The bus is fully wired and completely dormant.

### 8.2 …and its idempotency store does not match the table it writes to

This matters because it's what the dormant layer would hit first. `idempotency_keys` is created in
`src/identity/migrations.ts` with columns `(id, tenant_id, key, response, created_at, expires_at)`,
where `id` is a `TEXT PRIMARY KEY` with no default. But
`src/orchestration/idempotency/idempotency-store.ts`:

- `SELECT result FROM idempotency_keys ...` — there is no `result` column
- `INSERT INTO idempotency_keys (key, tenant_id, workflow_id, result, ...)` — no `workflow_id`
  column, no `result` column, and `id` (NOT NULL, no default) is omitted

No migration anywhere adds those columns. Every command handler in `src/orchestration/handlers/`
calls `idempotency.check()` on its first line. **The moment anything dispatches a command, it
throws.** Meanwhile `PaymentsService` uses the same table correctly, via the `response` column —
so the table isn't wrong, the second consumer is.

### 8.3 The idempotency middleware is exported, never mounted, and would key on `"default"`

Covered in §3.2. Three separate defects in one 40-line file, all invisible while it's unmounted.

---

## 9. Frontend behaviour ⚪🟡

- **The auth gate trusts a readable cookie hint.** `web/middleware.ts` gates protected routes on a
  non-httpOnly `ascend_session_hint` (falling back to the legacy `finder_session_hint`). That's the
  right design — the real refresh token stays httpOnly — but it means a browser that blocks or
  clears that one cookie bounces to `/login` on every navigation even with a perfectly valid
  session, and a stale hint sends the user to a protected page that then 401s.
- **CSP `connect-src` is built from a build-time variable.** `NEXT_PUBLIC_API_BASE_URL` is read in
  middleware; if the API origin ever differs from what was baked in, the browser blocks the calls
  and the console error names the CSP, not the config.
- **`'unsafe-inline'` is in the production script-src.** Documented as-is; it materially weakens the
  CSP's XSS protection.
- **Partial pages are hidden, not disabled.** `NEXT_PUBLIC_SHOW_PARTIAL_PAGES` removes them from
  navigation; direct URLs still resolve.
- **The frontend has never been performance-audited.** `SCALABILITY.md` §7 item 5 states this
  outright: no bundle analysis, no page-level measurement, no virtualised-table review. On a POS,
  where the terminal is often the cheapest hardware in the building, that's a real unknown.

---

## 10. Why these keep happening (the process failure under the technical ones)

Almost every item above shares one shape: **something reported success while doing nothing.**

- A backup job exits 0 with no artifact.
- A sync engine marks rows `synced` through an uploader that is an empty function.
- A cron entry in `vercel.json` calls a host the backend doesn't run on.
- A scheduled workflow runs an old copy of itself from a stale default branch.
- A frontend serves a complete, convincing shop out of a mock worker.
- A middleware is exported, looks mounted in its own doc comment, and never runs.

The repo has already built good defences against this — the honest status labels in `AGENTS.md`, the
rule that a feature isn't complete because a page exists, the structural scanners
(`gap:scan`, `contract:scan`, `authz:scan`, `table:scan`), and `DEPLOYMENTS.md`'s discipline of
citing evidence or writing UNKNOWN. Those work. The gap they don't cover is **the runtime lie**: code
that compiles, passes typecheck, satisfies every scanner, and does nothing.

The scanners are static. What's missing is a small set of checks that assert an *effect* — a backup
artifact exists, a tick actually processed jobs, a sync row reached a destination, a production build
has mocks off. `table:scan` proves two modules don't disagree about a table name; nothing proves a
module agrees with the table's actual columns (§8.2 is exactly that gap).

---

## 11. If you fix five things

In order. The first two are prerequisites for everything else being real.

1. **Establish one deployable path to production and prove it end-to-end.** Whichever host wins,
   this repo must contain the automation that deploys to it, and a smoke test that hits the live
   URL after deploy. Until then, no fix below reaches a customer. (§1.1, §1.2)
2. **Get the ops workflows onto the default branch and confirm they do work**, not just that they
   run: a backup artifact that exists, a `/jobs/tick` response with real numbers, an uptime probe
   pointed at the address production actually answers on. (§1.3, §1.4, §7)
3. **Make retries safe.** Add an idempotency key to order creation, and make the backend honour the
   `X-Idempotency-Key` header the offline queue has been sending all along — with the tenant read
   from `res.locals.auth`, not the phantom `req.tenantId`. Then reconcile the two offline queues, or
   collapse them into one. (§3.1, §3.2, §3.3)
4. **Flip the mock default to off** and make demo mode visibly, persistently labelled while it's
   active. A forgotten env var should break loudly, not lie convincingly. (§2.1, §2.2)
5. **Move checkout's orchestration off the request path** using the queue and the `stage()` API that
   already exist. This is the documented blocker, and it fixes durability (§3.5) and latency (§4.1)
   in the same change. (`SCALABILITY.md` §5 has the four-step remediation.)

Honourable mention, cheap and high-value: either delete `src/orchestration/idempotency/` or fix it
against the real schema, and either delete the no-op sync uploader or implement it. Both are small
changes that remove a trap someone will otherwise walk into at the worst possible moment.

---

## What this pass did NOT verify

Stated rather than implied, per this repo's own rule:

- **No gate was run.** No `npm run typecheck`, no `npm test`, no `npm run verify`, no structural
  scans — this container has no `node_modules` and no Postgres. Every finding is from reading source
  or from a prior, cited measurement.
- **No live probe.** Production, staging, and dev were not contacted. The deployment findings are
  `DEPLOYMENTS.md`'s, as of 2026-08-08, not re-confirmed today.
- **The default branch's contents were not inspected.** `master` is not present in this clone, so
  §1.3's "which workflows are inert" cannot be re-stated as current fact — only that the mechanism
  applies and was true when last measured.
- **No failure injection.** Postgres/Redis/Stripe outage behaviour, worker crashes, and
  concurrent-oversell races were not exercised. `SCALABILITY.md` §7 item 6 already flags this as
  never having been done.
- **Coverage is deliberately uneven.** 53 backend modules exist; this pass followed the money and
  the boot path — gateway, database layer, events/outbox, orders, payments, inventory, sync,
  identity, orchestration, and the frontend's data-source switch. Vertical modules (healthcare,
  automotive, rental, education, entertainment, hospitality, manufacturing, restaurant, golf) were
  not read. Their shared infrastructure is covered here; their own logic is not.
