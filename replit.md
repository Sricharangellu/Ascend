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
