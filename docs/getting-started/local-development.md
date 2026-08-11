# Local development — run the backend against your own Postgres

This is the **developer** setup for running the Ascend backend locally against a
Postgres you control (local or a managed provider). It is different from the
product-onboarding guides in this folder (`01-onboarding.md`, `02-hardware.md`),
which are written for store operators, not developers.

> Status, honestly: **retail is the only pack proven end-to-end** (backend unit
> tests + `npm run smoke` exercise the full POS lifecycle). The other verticals in
> the README feature list exist as code but are **Partial** or **Planned** — see
> [`WORK/FORWARD_PLAN.md`](../../WORK/FORWARD_PLAN.md) for the honest per-area
> status. Don't treat every listed feature as production-ready.

## Prerequisites

- **Node.js 20+** and **npm 10+**. `.nvmrc` pins **Node 24**, which CI uses; 20+ is a safe floor.
- **PostgreSQL 16+** — a local server, a Docker container, or a managed instance
  (Neon, Railway, Supabase, etc.).
- `psql` on your PATH — **optional**, only needed for the canonical migration
  runner (`db/migrations/run.sh`) and manual DB inspection.

## 1. Environment variables

**`npm run dev`, `npm start` and `npm run db:check` auto-load `.env`.** There is
no dotenv dependency — the scripts pass Node's built-in
`--env-file-if-exists=.env` (see `package.json`), so copying `.env.example` to
`.env` and filling it in is enough for those three commands. Nothing else is:
`npm test`, `npm run smoke`, the seed scripts and `db/migrations/run.sh` all read
the ambient environment, so export the variables in your shell when you use them.

Two variables matter for a working local backend:

| Variable | Required? | Notes |
|---|---|---|
| `DATABASE_URL` | **Yes** | e.g. `postgresql://finder:finder@localhost:5432/finder_dev`. `openDb()` throws immediately if it is unset. For managed pooled providers, use the **pooled** connection string (see `.env.example`). |
| `JWT_SECRET` | **Yes** | ≥ 32 random chars. There is **no development fallback** — the server boots without it, but every authenticated request then returns `500 misconfigured` (see `src/gateway/auth.ts`). |
| `PORT` | No | Defaults to `3000`. `.env.example` and Docker use `3001`. |
| `PG_SSL` | Only for SSL DBs | In development SSL is **off** by default. For a managed Postgres that requires TLS (Supabase does), set `PG_SSL=true`. Set `PG_SSL=false` for a local/CI Postgres that has no SSL. Logic: `src/shared/db.ts` → `sslConfig()`. |
| `PG_POOL_MAX` | No | Max pool connections per process (default 10). Lower it for free-tier managed plans. |

Everything else in `.env.example` (Redis, Stripe, SendGrid, metrics, …) is
optional for local development and degrades gracefully when unset.

The normal path — copy the template and fill in the two required values:

```bash
cp .env.example .env
# edit .env: set DATABASE_URL and a real JWT_SECRET (>=32 chars)
npm run db:check                   # confirms .env reaches a usable Postgres
```

For the commands that do **not** read `.env` (tests, smoke, seeds, `run.sh`),
export the variables into the shell instead:

```bash
export DATABASE_URL='postgresql://finder:finder@localhost:5432/finder_dev'
export JWT_SECRET='dev-only-secret-at-least-32-characters-long'
```

If you `source .env` rather than exporting by hand, quote any value containing a
space first (`.env.example` ships `STORE_NAME=Ascend Demo`) or `source` prints a
harmless "command not found" on that line:

```bash
set -a; source .env; set +a
```

`.env` is gitignored (`.gitignore` → `.env*`) and `npm run hygiene` fails the
build if one is ever staged, so real credentials stay out of the repo. Only
`.env.example` is tracked — never put a live password in it.

### Connecting to Supabase

Take the connection string from **Project Settings → Database → Connection
string → Shared Pooler** and use **session mode (port 5432)**:

```dotenv
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
PG_SSL=true
PG_POOL_MAX=5
```

Four things bite people here, and `npm run db:check` reports all four before it
opens a socket:

- **`PG_SSL=true` is required**, even locally. TLS is off by default outside
  production, and Supabase refuses plaintext connections. The pooler's
  certificate is publicly signed, so Node's bundled CAs verify it — you do not
  need `PG_CA_CERT`, and you should not reach for `PG_SSL_NO_VERIFY=1`.
- **Use session mode (5432), not transaction mode (6543).** `openDb()` pins the
  schema with the `options=-c search_path=…` startup parameter, which the
  transaction-mode pooler does not carry (it also disallows prepared
  statements). Session mode supports every Postgres feature this backend uses.
- **The pooler user is `postgres.<project-ref>`**, not `postgres`. Supavisor
  routes on that suffix and rejects the login without it.
- **Percent-encode reserved characters in the password** — `@` → `%40`,
  `/` → `%2F`, `?` → `%3F`, `#` → `%23`, `[` → `%5B`, `]` → `%5D`. Node's URL
  parser splits on the *last* `@` while libpq splits on the *first*, so a raw
  `@` can work in `npm run dev` and still send `psql` and
  `db/migrations/run.sh` to the wrong host.

Prefer the pooler host over the direct `db.<project-ref>.supabase.co` connection:
direct connections consume the project's `max_connections` budget and are
IPv6-only on projects without the IPv4 add-on.

`PG_POOL_MAX` is per process, but Supabase's client limit is per project and
shared with every other process and tool — `psql`, the seed scripts and
`db:check` all draw on the same budget. Keep it at 5 on free/small plans.

## 2. Install dependencies

```bash
npm install            # backend (repo root)
cd web && npm install  # frontend (only if you also want the UI)
cd ..
```

## 3. Migrations — they run automatically on startup

**You do not run a separate migrate command for local dev.** On boot,
`buildApp()` applies every module's migrations under a Postgres advisory lock and
records each by content hash in a `schema_migrations` table, so a **fresh, empty
database is fully provisioned the first time you start the backend**
(`src/app.ts`). Subsequent starts skip already-applied migrations.

The lock is taken by polling `pg_try_advisory_xact_lock` rather than by blocking,
so a wait for another instance is bounded by `PG_MIGRATION_LOCK_WAIT_MS` and
fails with a message that names the lock. The migration transaction also runs
under its own, larger `PG_MIGRATION_TIMEOUT_MS` — boot-time DDL is meant to be
slow, so it is not charged the `PG_TX_TIMEOUT_MS` budget that exists to cap
runaway *business* transactions.

There is also a **separate, optional** canonical SQL path — `db/migrations/*.sql`
applied via `db/migrations/run.sh` (tracked in its own `migrations_applied`
table, requires `psql`). That path is the human-readable DDL of record and the
only way to run `down` rollbacks; it is **not required** to run the app locally.
See [`db/README.md`](../../db/README.md) for it, plus the RLS policies, seeds, and
backup/restore scripts.

## 4. Check the connection before you start the backend

```bash
npm run db:check                        # uses .env
npm run db:check -- "postgresql://…"    # or check a specific URL
```

`db:check` runs in two phases. First it validates `DATABASE_URL` and the
TLS/pool environment as pure string checks — un-encoded password characters, TLS
off against a remote host, the wrong Supabase pooler port, a pooler user missing
its project ref — and stops before dialling if any of them would fail. Then it
opens a pool through the **same `openDb()` the server uses**, so the
`search_path` startup option and `sslConfig()` are exercised for real, and
reports the server version, database, user, negotiated TLS, and how much of the
schema exists. It is read-only, exits non-zero on failure, and only ever prints
the connection string with the password redacted.

"Schema not provisioned yet" is the expected result on a brand-new database —
step 5 fixes that.

## 5. Start the backend

```bash
npm run dev        # tsx watch src/server.ts — reloads on change (loads .env)
# or, non-watch:
npm start
```

You should see logs like `migration lock acquired` → `migrations complete` →
`Ascend started` with the port. Re-running `npm run db:check` afterwards reports
the table and migration counts instead of "not provisioned".

## 6. Verify it is connected to Postgres

```bash
curl -s http://localhost:3001/healthz    # liveness + build version
curl -s http://localhost:3001/readyz     # readiness — checks the DB + modules
```

`/readyz` returns `"status":"ok"` with `"db":"connected"` and a `modules` array
**only when the pool can reach Postgres**. If the DB is down or `DATABASE_URL` is
wrong, `/readyz` fails while `/healthz` may still return `ok` — so `/readyz` is the
real "am I talking to Postgres" check.

### (Optional) seed a demo tenant to log in

```bash
ALLOW_E2E_SEED=1 DATABASE_URL="$DATABASE_URL" npx tsx scripts/seed-e2e.ts
```

This inserts the `tnt_demo` tenant + `owner@ascend.dev` / `AscendDemo!2026`.
The credentials are **public and well-known** and the script bypasses production
guards — run it **only** against a disposable local/dev database, never
production (the script refuses without `ALLOW_E2E_SEED=1`).

## How this differs from the embedded-postgres test harness

By **default** (no `DATABASE_URL` in the environment), `npm test`
(`scripts/test.ts`) boots a **throwaway embedded Postgres** cluster
(`embedded-postgres`) on a random port, runs every `*.test.ts` in its own unique
schema for isolation, and tears it down. So you can run `npm test` and
`npm run smoke` **without** installing any Postgres.

**Important caveat:** the harness only falls back to embedded Postgres when
`DATABASE_URL` is **unset** — `ensurePg()` uses `DATABASE_URL` as-is if it is set
(`scripts/pg-harness.ts`). Because the setup above exports `DATABASE_URL` into
your shell, running `npm test` in that **same shell** will execute against **your
dev database** (each test still isolates itself in a unique schema, but it runs on
your server, not an ephemeral one). To force the self-contained harness, run tests
in a shell where `DATABASE_URL` is not exported, e.g.:

```bash
env -u DATABASE_URL npm test
```

So: **default test harness = ephemeral and self-contained; local dev = your own
persistent Postgres via `DATABASE_URL`** — just don't let an exported
`DATABASE_URL` leak into your test runs unless you intend it.

## Troubleshooting

Run `npm run db:check` first for anything connection-related — it names the cause
and the fix directly instead of leaving you to decode a driver error.

| Symptom | Likely cause / fix |
|---|---|
| `DATABASE_URL is not set` on start | No `.env` in the repo root and nothing exported. `npm run dev`/`start`/`db:check` load `.env`; other commands need `export DATABASE_URL=…`. |
| Requests return `500 misconfigured` / "JWT_SECRET … not set" | `JWT_SECRET` missing. It has no dev fallback. |
| `ECONNREFUSED` / connection refused | Postgres not running, or wrong host/port in `DATABASE_URL`. Start it (`docker-compose up postgres` brings up Postgres 16 on 5432). |
| `Connection terminated due to connection timeout` on a managed DB | The host resolved but the port never answered — usually a firewall or egress policy blocking 5432/6543. Confirm from an unrestricted network. |
| SSL / `self-signed certificate` errors on a managed DB | Set `PG_SSL=true`. For a local no-SSL DB, leave it unset (dev default is off). A verification failure against Supabase normally means a TLS-intercepting proxy — pass its CA via `PG_CA_CERT`, don't set `PG_SSL_NO_VERIFY=1`. |
| `password authentication failed` against Supabase | Wrong password, or a reserved character in it left un-encoded. Re-copy from the dashboard and percent-encode (`@` → `%40`, …). |
| `Tenant or user not found` from Supabase | The pooler user must be `postgres.<project-ref>`; plain `postgres` only works on a direct connection. |
| `too many connections` | Lower `PG_POOL_MAX`; use the provider's **pooled** connection string. On Supabase the limit is per project and shared across every process and tool. |
| Tables missing after start | Check the logs for `migrations complete`. If migrations errored, the advisory lock/hash record prevents partial re-runs — inspect `schema_migrations`. |
| `Timed out … waiting for the migration lock on schema …` | Another process is mid-migration on the same schema and did not finish. That is the message doing its job: it names the lock instead of surfacing later as an unrelated query timeout. Find the holder (`SELECT * FROM pg_locks WHERE locktype = 'advisory'`) before raising `PG_MIGRATION_LOCK_WAIT_MS` — a stuck holder needs killing, not a longer wait. |
| `/readyz` not `ok` | The pool can't reach Postgres — recheck `DATABASE_URL`, that the DB exists, and network/SSL. |

## Notes for changing auth, e2e, or tenant behavior

- **Tenant isolation is application-layer first, RLS second.** Handlers scope
  every query by the JWT's tenant; RLS is a **defense-in-depth backstop** that
  only takes effect when `app.tenant_id` is set — which the gateway does per
  authenticated request via `AsyncLocalStorage` (`src/shared/tenant-context.ts` +
  `src/shared/db.ts`). Both layers are proven by
  [`src/gateway/tenant-isolation.test.ts`](../../src/gateway/tenant-isolation.test.ts);
  keep and extend that test rather than relying on RLS alone.
- **Frontend/e2e auth is finicky locally.** The web app keeps the access token
  **in memory** with a cookie-based silent refresh (`web/lib/auth.ts`). This is
  robust in production but sensitive to hard navigations in the two-port local
  Playwright harness. Read `web/playwright.config.ts` before changing auth or e2e
  behavior. To run the frontend against this backend, set
  `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001` and `cd web && npm run dev`.

## Fastest path (all Docker)

If you'd rather not install Postgres, `docker-compose up` brings up Postgres +
backend (:3001) + frontend (:3000) with `DATABASE_URL`/`JWT_SECRET` injected by
the compose file — no `.env` loading needed. Use the manual path above when you
want to run the backend against your own or a managed Postgres.
