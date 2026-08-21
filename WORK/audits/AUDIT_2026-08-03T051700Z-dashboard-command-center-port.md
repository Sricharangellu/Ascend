# AUDIT — Dashboard command-center port (canonical `web/`)

UTC: 2026-08-03T05:17:00Z  
Branch: `cursor/dashboard-display-data-45ad`  
Status labels: dashboard command center = `built_unverified` (unit/type gates green; browser E2E not re-run in this cloud session). Sparklines = `built_verified` (17/17 reports tests incl. new live-orders sparkline case).

## What

Ported the Phase 13/14 enterprise command-center dashboard that landed under Replit’s `artifacts/ascend/` tree into the canonical Next.js app at `web/app/(protected)/dashboard/`, and fixed empty KPI sparklines by reading live completed orders instead of the never-written `daily_sales_summary` CQRS table.

## Spec decisions preserved from the Phase 13 notes

- KPIs with no real backend (customer satisfaction, warehouse capacity %, Active Users) omitted — not faked.
- Sketch emojis → inline SVG icon system.
- Module / pipeline / quick-action links point at real routes only (`/inventory/transfers` not `/inventory/pipeline` for transfers; `/catalog?new=product`).
- Cash movement fetch is scoped to the selected dashboard date range (`from=`).
- Chart colors use hex `#5D5FEF` (recharts CSS-var mismatch).
- Dark-mode surface/border/semantic tokens added to `web/app/globals.css`.
- Side-rail titled **Recommendations** (rule-based), not “AI Command Center”.
- Gross Profit shows `"—"` when `grossProfitCents` is null (never falls back to revenue).
- BackupHealthCard omitted — `/api/v1/admin/db/backup-status` is not in mainline `src/`.
- Expiring-soon count from `/api/v1/inventory/expiry-summary` (not the expiry writeoff pool).

## Gates

| Gate | Result |
|---|---|
| Backend `tsc` (Ascend `tsconfig` from clean tip `0f30096`) | PASS |
| `reports.test.ts` (embedded Postgres) | **17/17 PASS** (incl. new sparkline test) |
| `web` typecheck | PASS |
| `web` lint | PASS (0 errors; 4 pre-existing hook warnings) |
| `web` vitest dashboardRecommendations + progressPanel | **17/17 PASS** |
| `npm run hygiene` | FAIL — pre-existing Replit contamination (duplicate `.migration-backup/AGENTS.md`); not introduced here |

## Incident note (NEEDS-SRI)

`origin/develop` tip `74f7d91` re-introduced the Replit pnpm workspace (`package.json` stub requiring pnpm, `artifacts/` monorepo, duplicate `AGENTS.md`). Same class as the 2026-08-02 incident reverted by PR #145. This PR ports dashboard UI into canonical `web/` + sparklines into `src/`; it does **not** attempt a full decontamination revert — that needs Sri’s explicit go-ahead.

## Out of scope

- Intermittent 401s during load (expired-token / task #32).
- Landing #119 Executive Workspace PO approvals (separate PR; overlapping product surface).
- Full browser E2E against demo owner in this session.
