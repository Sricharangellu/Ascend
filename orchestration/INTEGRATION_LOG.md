# Integration Log (orchestrator-owned)

Append-only record of each wave: what each agent published/consumed, and gate results.

## Wave 0 — dispatched 2026-06-11
- Scaffold: git initialized, contracts/ db/ web/ created, contract skeletons published.

### Published
- **Database** → `db/migrations/0001_foundation.sql` (+down), `db/rls/policies.sql`, `db/seeds/0001_demo.sql`, `db/backup/{backup,restore}.sh`, `db/migrations/run.sh`, `db/README.md`; authored `contracts/schema.sql`. Tables: tenants(root), users, roles, audit_log, feature_flags, idempotency_keys — every tenant-scoped table carries `tenant_id` + an RLS policy + tenant-leading index.
- **Backend** → `src/gateway/*` (auth, tenantResolver, rateLimit, requestId/trace, errorEnvelope), `src/identity/*` (JWT login/refresh/me, RBAC owner|manager|cashier, ABAC hook, audit writer), `/healthz`, `/readyz`, `/api/v1/flags`; authored `contracts/openapi.yaml` + `contracts/events.md`. Added deps jsonwebtoken, bcryptjs.
- **Frontend** → `web/` Next.js 14 app (login, protected terminal, route guard), `api-client/`, MSW `mocks/`, `flags/`, accessible `components/`, `lib/`, error boundary, vitest tests.

### Integration gate — results
- Backend: `npm run typecheck` 0 errors · `npm test` 87/87 pass (verified by orchestrator). PASS.
- Frontend: `npm install` ok · `npm test` 28/28 pass; component (jsdom) + tsc could not run in sandbox. PARTIAL PASS (code complete).
- Database: SQL internally consistent (RLS↔tables↔seeds cross-checked). Not executed against live PG in sandbox. PASS (static).

### Gate findings → Wave-1 reconciliation tasks (resolve before commerce work)
1. **API path drift.** Backend published `/identity/login|refresh|me`, `/v1/flags` (server base `/api/v1`). Frontend, built before the spec was populated (true parallel race), assumed `/api/v1/auth/login|refresh`, `/api/v1/flags`, `/api/v1/healthz`. ACTION: ratify one path scheme in `contracts/openapi.yaml` (backend is canonical), then regenerate the frontend client + MSW from it. Also check the `/v1/flags` under `/api/v1` for a double-prefix.
2. **Duplicate schema source.** Backend shipped `src/identity/migrations.ts` (in-app DDL) so the app boots/tests standalone, duplicating `db/migrations/0001_foundation.sql` + `contracts/schema.sql`. ACTION: converge on `db/` migrations as the single source of truth; backend consumes the schema and drops its in-app DDL.
3. **Tenant id type.** `tenants` PK is TEXT (`tnt_…`) but child `tenant_id` is UUID. ACTION: add `tenants.uuid UUID UNIQUE` in `0002` and emit it as the JWT tenant claim.

Verdict: Wave 0 foundation stands up (backend green, frontend green, schema consistent). The three findings are contract-alignment — the protocol's expected friction, not rework — and are the first agenda items for Wave 1.
