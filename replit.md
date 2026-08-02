# Ascend POS — Replit Workspace

## Project Overview

**Ascend** is a multi-tenant enterprise POS / ERP SaaS platform for tobacco, vapor, hemp, and specialty retail. It is a full-stack application with:

- **Frontend** (`artifacts/ascend`): React + Vite + Wouter + Tailwind v3 + MSW mocking. Preview at `/`.
- **Backend** (`artifacts/api-server`): Express 4 + raw-SQL PostgreSQL modular monolith. Runs at the `API Server` workflow port.

The frontend runs in **mock mode by default** (MSW service worker) — no backend required to demo. Set `VITE_MOCK=false` to disable mocking and hit the real API.

---

## Key Architecture Decisions

- **Next.js → Vite**: Original app was a Next.js 14 App Router project ported to React + Vite. Next.js shims live in `artifacts/ascend/src/lib/` (`router.ts`, `link.tsx`).
- **Routing**: Wouter replaces Next.js routing. All routes are defined in `artifacts/ascend/src/App.tsx`.
- **Auth**: JWT-based. `useAuth()` in `src/lib/useAuth.ts`; protected routes gated via `src/pages/(protected)/layout.tsx`.
- **Mocking**: MSW (`src/mocks/`) intercepts API requests in dev/demo mode. Worker file is at `public/mockServiceWorker.js`.
- **Tailwind**: v3 with PostCSS (`postcss.config.js` + `tailwind.config.ts`). Brand color `#5D5FEF`.

---

## Development

### Frontend
```bash
pnpm --filter @workspace/ascend run dev
```
Opens at the default preview path `/`.

### Backend
```bash
pnpm --filter @workspace/api-server run dev
```
Requires `DATABASE_URL` env var (Replit PostgreSQL). See environment secrets.

### Demo mode (no backend needed)
Navigate to `/login?demo=1` and click Sign In, or set `VITE_MOCK=true` (the default).

---

## Environment Variables

| Variable | Service | Purpose |
|---|---|---|
| `DATABASE_URL` | api-server | PostgreSQL connection string |
| `JWT_SECRET` | api-server | JWT signing secret |
| `SESSION_SECRET` | api-server | Session encryption |
| `REDIS_URL` | api-server | Optional Redis for caching/pub-sub |
| `STRIPE_SECRET_KEY` | api-server | Payments |
| `VITE_API_BASE_URL` | ascend | API base URL (default: same origin) |
| `VITE_MOCK` | ascend | `"false"` to disable MSW mocking |

---

## Database Backup & Restore

### How backups work

The API server runs a **daily background job** (`db_backup`) that calls `pg_dump` and writes a timestamped `.sql` file to `backups/` at the repo root.  Dumps older than 7 days are pruned automatically.  The job is self-rescheduling — it re-enqueues itself 24 hours ahead, so no cron daemon is required.

Environment variables:
| Variable | Default | Purpose |
|---|---|---|
| `BACKUP_DIR` | `./backups` | Directory where dump files are written |
| `BACKUP_RETAIN_DAYS` | `7` | Days of dumps to keep before pruning |
| `BACKUP_ENABLED` | `true` | Set to `"false"` to disable automated dumps |

### Remote backup storage (survives a workspace reset)

When `BACKUP_S3_BUCKET` is set, every successful `pg_dump` is **also uploaded to an
S3-compatible bucket** (AWS S3, Cloudflare R2, Backblaze B2, MinIO, …). Local copies
are still kept for `BACKUP_RETAIN_DAYS` for fast restores. If the upload fails, the
backup job fails (and retries / alerts via `BACKUP_ALERT_EMAIL`) — a dump that only
exists on the workspace disk is not treated as a successful backup.

| Variable | Default | Purpose |
|---|---|---|
| `BACKUP_S3_BUCKET` | — | Bucket name. Setting this enables remote uploads |
| `BACKUP_S3_KEY` | `backups/` | Key prefix inside the bucket |
| `BACKUP_S3_ENDPOINT` | — | Custom endpoint URL for R2/B2/MinIO (omit for AWS S3) |
| `BACKUP_S3_REGION` | `us-east-1` | Bucket region (`auto` for R2) |
| `BACKUP_S3_ACCESS_KEY_ID` | `AWS_ACCESS_KEY_ID` | Access key (store as a Replit Secret) |
| `BACKUP_S3_SECRET_ACCESS_KEY` | `AWS_SECRET_ACCESS_KEY` | Secret key (store as a Replit Secret) |

List and pull remote dumps:

```bash
# List all dumps in the bucket (newest first):
pnpm --filter @workspace/api-server db:backup:remote-list

# Download one into ./backups/ ready for restore.sh:
pnpm --filter @workspace/api-server db:backup:remote-pull ascend-backup-<timestamp>.sql
```

### On-demand backup (CLI)

```bash
# From the repo root (DATABASE_URL must be set):
pnpm --filter @workspace/api-server db:backup

# Or directly:
DATABASE_URL=<your-connection-string> bash artifacts/api-server/scripts/backup.sh
```

### On-demand export (HTTP)

Any authenticated **owner** can download a full SQL dump via the API:

```
GET /api/v1/admin/db/export
Authorization: Bearer <owner-jwt>
```

The response streams a `ascend-backup-<timestamp>.sql` file attachment directly from `pg_dump`.

### Restore procedure

> ⚠️ Restore **replaces all data** in the target database. Back up the current state first if in doubt.

**Step 1 — identify the dump file to restore:**
```bash
ls -lh backups/
```

**Step 2 — run the restore script:**
```bash
# From the repo root:
DATABASE_URL=<your-connection-string> bash artifacts/api-server/scripts/restore.sh backups/ascend-backup-<timestamp>.sql
```
The script asks for confirmation before making any changes.

**Step 3 — restart the API server:**
```bash
# In Replit, use the "Restart" button on the API Server workflow,
# or from the shell:
pnpm --filter @workspace/api-server run dev
```
The server will re-apply any pending migrations automatically on startup.

**What the restore covers:**
- All tables in the `public` schema (customers, orders, products, tenants, users, …)
- Schema structure (DDL) + data rows

**What it does NOT cover:**
- Database users / roles (excluded via `--no-owner --no-acl`)
- Other schemas (only `public` is dumped)

### Recovery from a full database reset

If the Replit PostgreSQL database is wiped (e.g. via the Replit dashboard):

1. Obtain the new `DATABASE_URL` from the Replit database panel and update the secret.
2. Run the restore script against the most recent backup in `backups/`.
3. Restart the API server — migrations will run and any new tables will be created automatically.

If the **entire workspace** was reset (local `backups/` gone too), pull the latest
dump from remote storage first:

```bash
pnpm --filter @workspace/api-server db:backup:remote-list
pnpm --filter @workspace/api-server db:backup:remote-pull ascend-backup-<timestamp>.sql
DATABASE_URL=<connection-string> bash artifacts/api-server/scripts/restore.sh backups/ascend-backup-<timestamp>.sql
```

---

## User Preferences

- Keep Tailwind v3 (not v4) — original design tokens depend on it.
- Keep MSW mock mode on by default for demos.
- Wouter shims should stay API-compatible with Next.js `useRouter`, `usePathname`, `useSearchParams`.

---

## Operating Boundary — Sandbox Only

**This workspace is a sandbox/prototype environment. It is NOT a deploy target for the main Ascend repo.**

- **Never touch `master`, `staging`, or production config or secrets.** This workspace has no connection to the real Ascend GitHub repo (`Sricharangellu/Ascend`) and must not be used to push, deploy, or modify anything in that repo's production or staging tiers.
- **Never connect to or rely on the prod or staging Supabase projects.** All database work in this workspace uses the Replit-managed PostgreSQL instance only.
- **`JWT_SECRET` and all other secrets are sandbox-local.** They must be freshly generated and stored only in Replit's Secrets manager — never reused from the production or staging environments, and never committed to files.
- **Stop and flag to Sri any request that would deploy, touch prod config, or touch prod/staging secrets.** Do not execute such requests. This follows the environment-routing rules in the original repo's `docs/architecture/ORCHESTRATION.md` (that file exists in the Ascend GitHub repo, not in this workspace).
- **Open decision (Sri's):** Whether this workspace will eventually be reconciled back to the real Ascend repo, or remain a separate standalone copy, has not been decided. Do not assume either outcome.

### Git-safety rule (2026-07-30)

- **NEVER push this workspace's local `master` (or any branch) to the `origin` remote (`Sricharangellu/Ascend`) unless Sri explicitly asks for that specific push, in that moment.** Not "this looks ready" — an explicit, direct ask. This applies to the agent, to any task agent's work merged locally, and to any automation run on the agent's behalf.
- Local `master` commits, task-agent merges via the `subrepl-*` remotes, and Replit checkpoints are all fine and expected — only the push to `origin` is restricted.
- If work here ever seems genuinely ready for the real repo: **don't push it.** Tell Sri what it is and let a human decide whether and how it gets ported (directory layouts differ — this workspace's `artifacts/*` vs the real repo's `web/` + `src/` — so it needs rework and re-verification against real gates anyway).
- The local branch stays named `master`: renaming could break Replit's platform-managed task-agent auto-merge tooling, whose branch targeting cannot be safely verified, so the no-push rule above is held as the boundary instead of a rename.
