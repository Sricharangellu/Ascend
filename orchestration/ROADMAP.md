# Finder — Living Roadmap (backlog for scheduled dev agents)

**Product framing:** Finder is a standalone POS/business-management platform.
`ERP_BENCHMARK.md` (the erp.fairtradetx.com 18-prompt spec) is **inspiration
only** — a source of feature ideas — not a spec Finder must match or depend
on. Don't frame work as "closing benchmark gaps"; frame it as "this is a
useful feature for Finder's users." Skip/deprioritize benchmark items that
don't fit Finder's own direction (e.g. don't chase exact terminology,
1:1 page parity, or the full 60+ report list for its own sake).

This file is the shared backlog for the two scheduled developer agents (see
`AGENT_BACKEND_CYCLE.md` and `AGENT_FRONTEND_CYCLE.md`). Each run:

1. Picks the **first unchecked item in its lane**.
2. Implements it, verifies it, commits it.
3. Checks it off (`- [x]`) and adds a one-line note with the commit hash.
4. If the work surfaced new follow-ups, appends them to the bottom of its lane
   (don't reorder existing items — keep the queue stable across runs).
5. If a lane is empty, the agent picks the top item from "Cross-cutting"
   (claim it by moving it into your lane with your tag, so the other agent
   doesn't duplicate it).

Source material: `ERP_BENCHMARK.md` (parity matrix), `BACKEND_HANDOFF.md`
("Suggested UI" notes per module), `CONTINUE_IN_ANTIGRAVITY.md` §6,
`SECURITY_AUDIT.md` recommended-next, `DB_REVIEW.md` §6.

---

## Backend lane (src/, db/, contracts/, scripts/)

- [ ] BE-1: Finish the RBAC matrix — apply `requireRole("manager")` from
      `src/gateway/auth.ts` to remaining sensitive mutations: purchasing
      vendor-credits/returns/PO-receive, discounts create/status, accounting
      deposit create, sales-order cancel/void, giftcard/customer redeem
      overrides. List each route touched in the commit message.
- [ ] BE-2: Refresh-token rotation/revocation — make refresh tokens single-use
      (rotate on `/api/identity/refresh`, invalidate the old one), add a
      revocation check on logout. Add tests.
- [ ] BE-3: Reports — add `sales-by-rep` and `sales-by-vendor` pivots plus a
      basic P&L (`GET /api/v1/reports/pnl?range=`) using existing
      income/expense accounts from the COA.
- [ ] BE-4: Multi-store filter — add `storeIds[]` to the JWT (from `outlets`)
      and accept `?storeIds=` on the major list endpoints (orders, inventory,
      sales-orders, invoices) filtering by `store_id`.
- [ ] BE-5: Per-customer discount usage limit enforcement at redeem time
      (SECURITY_AUDIT M2 follow-up #4) — `discounts.evaluate`/`redeem` should
      check `per_customer_limit` against a usage ledger keyed by customer.

## Frontend lane (web/)

- [ ] FE-1: Purchasing/Receiving UI — suppliers list, create PO (with
      lot/expiry lines), receive flow; surface `costCents` + margin on the
      inventory grid. Wire to `/api/v1/purchasing/*`.
- [ ] FE-2: Accounts (AP/AR) surface — bills/invoices lists with aging buckets
      from `GET /reports/ar-aging` and `/ap-aging`; pay actions.
- [ ] FE-3: Near-expiry/markdown report — table from
      `GET /api/v1/inventory/expiring` + `/expired`, with a lot column on the
      main inventory grid and a "Return to vendor" action
      (`/purchasing/returns`).
- [ ] FE-4: Operations — Locations grid (assign products to bins via
      `/fulfillment/assign`) + Pick & Pack queue
      (`/fulfillment/pick-lists`, pick line, pack).
- [ ] FE-5: Settings — Chart of Accounts tree editor
      (`/accounting/accounts*`) + Batch Deposits list/create/approve
      (`/accounting/deposits*`).
- [ ] FE-6: Audit existing `web/mocks/lightspeedHandlers.ts` against live
      backend routes; flip any still-mocked endpoints used by built pages to
      live `apiGet`/`apiPost` calls.

## Cross-cutting (claim into your lane when picked up)

- [ ] DB-1: Enable Postgres row-level security on tenant tables as
      defense-in-depth (DB_REVIEW §6).
- [ ] DB-2: Distributed rate limiting via Redis (SECURITY_AUDIT H1 follow-up) —
      the in-memory limiter doesn't share state across serverless instances.
- [ ] PERF-1: Cursor pagination on the largest list endpoints (orders,
      inventory, invoices, sales orders).
- [ ] PROD-1: Reconcile `master` with `backend-cycle3`/`dev`/`testing`/`prod`
      (diverged since commit `af02e27` — see chat history 2026-06-13). Needs a
      human call on merge strategy; agents should NOT attempt this
      automatically.

---

## Run log (most recent first)

_Agents append a one-line entry here each run: date, agent, item, commit._
