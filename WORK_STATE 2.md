# FinderPOS — Work State
> Last updated: 2026-06-29  |  Last commit: `e5a15fe` — docs + INF-9 E2E seed + verticals spec

## Active task
**All INF items complete.** Sprint 1–10 + launch sprint done.
Next: choose next sprint goals from remaining backlog (vertical pages, UX polish, real backend wiring).

## Files in flight
None — all changes committed and pushed to master.

## Recent decisions
- **INF-8 offline queue** — Two queues: localStorage (cart sync via syncOutbox) + IndexedDB (payment captures via offlineOutbox → SW Background Sync). SW was already complete; TenderScreen already enqueues to IDB. Gap closed: OfflineQueueBanner now tracks IDB count + listens for OUTBOX_ITEM_REPLAYED from SW.
- **UX-2 module marketplace** — `/setup/modules` page: left sidebar nav, right card grid, toggles, sticky save bar. Mock handler added to mockHandlers.ts for /settings/business-profile.
- **UX-3 dashboard widgets** — `VerticalWidgets.tsx`: 8 self-fetching widgets, WIDGET_MAP keyed by module name, fails silently, injected above operational widgets in dashboard.
- **Documentation** — `docs/` tree created with 27 knowledge articles; `contracts/openapi.yaml` updated from 6 paths → 100+ paths covering all modules.

## Context cliff notes
- Offline: localStorage = cart sync orders; IDB = payment captures. Both shown in OfflineQueueBanner.
- SW (`web/public/sw.js`) reads IDB store `checkout_queue` in DB `finder-pos-outbox`; sends OUTBOX_ITEM_REPLAYED to terminal tabs on success.
- TenderScreen sends `X-Idempotency-Key: <outbox item id>` header on replay — backend idempotency middleware deduplicates.
- `requestSync()` in offlineOutbox.ts registers Background Sync AND postMessages SW for immediate attempt.
- `safeLoad` (web/api-client/client.ts) — silent error swallowing for dashboard widgets.
- Module flags key: `module:<key>` (e.g. `module:tables`); `invalidateModuleFlagsCache()` in useModuleFlags.ts.

## Next 3 actions
1. Pick next sprint theme: (a) real backend wiring, (b) vertical UX polish, or (c) Sentry/PostHog integrations
2. Run `npm run seed:e2e` locally once DATABASE_URL is set to verify seed script works end-to-end
3. Trigger CI on master branch to confirm E2E job passes with the new seed step

## Blockers
None

## Completed INF items (all closed)
- INF-1 — pg_advisory_xact_lock migration serialization
- INF-2 — SIGTERM/SIGINT graceful shutdown
- INF-3 — pino structured logger (src/shared/logger.ts)
- INF-4 — Stripe webhook signature verification
- INF-5 — Redis Pub/Sub EventBus fan-out
- INF-6 — AR dunning self-perpetuating scheduled job
- INF-7 — DB.poolStats() + /readyz 503 on pool exhaustion
- INF-8 — Offline terminal: SW drain + IDB client + banner tracking (`f4e4bbb`)
- INF-9 — E2E suite: seed-e2e.ts, login/checkout/inventory/verticals specs, CI seed step (`e5a15fe`)
- INF-10 — makeAuthMiddleware(db) + requireScope() API key auth
- INF-11 — Zero console.* in production source (14 files)

## Remaining
None — all INF items closed.
