# ADR-012: The job runtime is triggerable by any scheduler, not only Vercel Cron

Date: 2026-08-06 · Status: Accepted
Owner: Claude Code session — ERP infrastructure audit

**Context:** `GET /jobs/tick` (ACPA M1.2) is how background work actually runs:
each call drains due jobs from `job_queue` and reconciles the transactional
outbox (ADR-003). Trial expiry, AR dunning, payment reconciliation, inventory
reconciliation, demand snapshots, reservation expiry and outbox retention all
depend on something calling it.

It authenticated on `CRON_SECRET`, sent as `Authorization: Bearer`. That is
specifically *Vercel Cron's* convention — Vercel injects that header
automatically when the env var is set. No other scheduler does.

`.env.example` had documented a second mechanism since the endpoint was written:

> Set ONE of:
>   `CRON_SECRET` — Vercel's own convention …
>   `JOBS_TICK_SECRET` — for any other scheduler; send as `X-Jobs-Tick-Secret`.

`JOBS_TICK_SECRET` was read nowhere in `src/`. Verified 2026-08-06 by grep
across `src/`, `scripts/` and `api/`: zero references. So an operator on a
non-Vercel host who followed this repo's own documentation and set
`JOBS_TICK_SECRET` got, in production, a `503 cron_unconfigured` from the
fail-closed branch — and therefore no background jobs at all, silently, with the
outbox filling up behind it. The documentation described a feature that did not
exist, in the direction that fails quietly rather than loudly.

This stopped being hypothetical when production was claimed to move to Render.
Render has cron jobs; it has no Vercel Bearer convention. Under the documented
configuration, the platform's entire background runtime was reachable only from
the one host it was supposedly no longer on.

**Decision:** `/jobs/tick` accepts either credential, and the runtime is host-portable:

- `CRON_SECRET` via `Authorization: Bearer <secret>` — Vercel Cron.
- `JOBS_TICK_SECRET` via `X-Jobs-Tick-Secret: <secret>` — Render cron, GitHub
  Actions `schedule`, Kubernetes CronJob, an external uptime service, `curl`.

Each credential is only valid in its own transport: a `JOBS_TICK_SECRET` value
presented as a Bearer token is rejected, and vice versa. This keeps the two
mechanisms independent rather than collapsing them into "any secret in any
header", so rotating one does not silently widen the other.

Fail-closed behaviour is unchanged and is the invariant worth stating: **in
production, with neither secret configured, the endpoint returns 503 and runs
nothing.** An unauthenticated job runtime is a remote trigger for every
background mutation in the platform; it must never default open.

Both comparisons are constant-time (`secretsMatch()`, SHA-256 then
`timingSafeEqual`). These endpoints are reachable without a session, so the
secret is the only control, and a plain `!==` leaks shared-prefix length through
response timing. The same helper now covers the `/metrics` bearer token, which
had the identical shape.

**Alternatives considered:**

- *Delete `JOBS_TICK_SECRET` from `.env.example`.* Cheapest, and it resolves the
  contradiction in the wrong direction — it makes the platform Vercel-only by
  documentation fiat, at the exact moment the platform is trying to leave
  Vercel.
- *Accept `JOBS_TICK_SECRET` as a Bearer token too.* One fewer branch, and it
  makes the two secrets interchangeable, so an operator who rotates one and not
  the other keeps a live credential they believe is retired.
- *Reuse the existing `METRICS_TOKEN`.* Rejected: metrics scraping is read-only
  and the job tick mutates every module. Merging their credentials means anyone
  who can read Prometheus can drive the job runtime.
- *Drop endpoint auth and rely on network policy* (private service, IP
  allowlist). Defensible on a host that offers it, and it makes correct
  behaviour depend on host configuration this repo cannot see or test — the same
  class of invisible dependency the deployment incident is made of.

**Consequences:**

- The backend can be scheduled on any host. Migrating off Vercel no longer
  requires a code change to keep background jobs running.
- Two secrets can now be live at once. That is intended during a migration (both
  schedulers overlapping) and should not outlive one — the tick is idempotent
  (`FOR UPDATE SKIP LOCKED` plus consumer idempotency), so concurrent ticks from
  two schedulers are safe, just wasteful.
- ~~`vercel.json` still declares the cron at `0 6 * * *` — **daily**.~~
  **RESOLVED 2026-08-10 — the evidence bar below was met.** This ADR set the
  bar as "confirm the backend is no longer on Vercel at all", and Sri confirmed
  from the Render dashboard on 2026-08-08 that production is Render service
  "Ascend Prod" (`srv-d9lo8jm7bikc739dnsn0`, Docker runtime, deploying from this
  repo's `master` branch).

  That confirmation makes the picture worse than "daily latency", which is how
  it had been recorded. A Vercel cron cannot reach a Render service, so the
  entry was not ticking `/jobs/tick` **at all** in production — the outbox never
  redelivered and no scheduled job ever ran. The latency was not 24 hours; there
  was no tick.

  Applied, per this ADR's own prescription that the block "should be deleted
  rather than tuned": `vercel.json`'s `crons` block is removed, and
  `.github/workflows/jobs-tick.yml` replaces it — a scheduled GitHub Actions
  caller using the `JOBS_TICK_SECRET` / `X-Jobs-Tick-Secret` path this ADR
  created for exactly this case. Deleting the block without adding the
  replacement would have converted a visible-in-config gap into a silent one.

  The new interval is `*/15 * * * *`. The old daily schedule was never a
  considered choice — it was the Vercel Hobby plan's cron limit, a platform
  constraint that no longer applies.

  **Still open:** the secret must be set in *two* places for the replacement to
  do anything — on the Render service and as a repo secret. Until both exist the
  workflow warns loudly and processes nothing, by design (see the guard comment
  in the workflow, which follows `backup.yml`'s hardened precedent).

**Supersedes:** none.

**Related Issues:** none.

**Related PRs:** none.
