# AUDIT 2026-08-11T042000Z — Procure-to-Pay design & implementation integration

Status: `built_verified` for what shipped; `partial` for the brief as a whole.
Branch: `claude/ascend-p2p-design-audit-grl7ez`. Scope claimed in `WORK/LOCK.md`.

---

## 0. The design reference could not be read — say so first

The brief's central input is a Claude Design document:

```
https://claude.ai/design/p/424883f3-6b3c-46de-8613-59d47766fe69?file=ASCEND+Procure+to+Pay.dc.html
```

**It is not reachable from this session.** Evidence:

| Attempt | Result |
|---|---|
| `WebFetch` on the full share URL | `HTTP 403 Forbidden` |
| `WebFetch` on the URL without query params | `HTTP 403 Forbidden` |
| `WebFetch` on `claude.ai/code/artifact/<same uuid>` | `artifact not found — it may have been deleted, or it has not been shared with you` |
| Artifact listing, `scope: all` (owned + shared) | 7 artifacts, none of them this one |
| `grep` for a local copy (`*.dc.html`, "Procure to Pay") across the repo | no copy in the tree |

So **Phase 2 of the brief ("Analyze the reference design") was not performed against the
actual design**, and every "ADOPT / REJECT / HYBRID" verdict below is therefore made against
the brief's own stated criteria — the operational questions it lists in Phase 2 — and against
code, not against pixels. That is reported as a gap rather than papered over: judgements about
a document nobody in this session could open would be invented.

One closely-related document **was** readable and is used as supporting context: the account's
own artifact *"Product, Purchasing & Receiving — Enterprise Audit"* (`64b0f8be…`, 2026-07-23).
**Every claim taken from it was re-verified against the current tree**, and several had already
been closed by later work — see §2.

---

## 1. Method

Phase 1 was done first and in full: the purchasing/receiving backend (`src/modules/purchasing/*`
— service, routes, receiving sessions, receiving dashboard, EDI, vendor history), the schema and
its indexes, and every purchasing/receiving/vendor surface in `web/`. Nothing was changed until
the read was done.

---

## 2. The 2026-07-23 audit, re-verified against the current tree

Re-checking rather than inheriting mattered — a third of it had moved.

| Claim (2026-07-23) | Status on 2026-08-11 | Evidence |
|---|---|---|
| No receiving-session concept exists | **NO LONGER TRUE** | `receiving-sessions.ts` (33 KB), `receiving-session-routes.ts`, `receiving-dashboard.ts` all exist: begin / dock / scan / update-line / close / cancel, with `held_qty` and `rejected_qty` per line |
| No quality/inspection hold | **NO LONGER TRUE** | `hold`/`reject` flags on the scan route; `quality_hold` is a real session status; the dashboard counts `quality_holds` and `quality_hold_units` |
| No PO approval/reject UI | **STILL TRUE** | `grep -ril "approve" web/app` returns no purchasing-order surface. Fixed by this change |
| PO list does not link to PO detail | **STILL TRUE** | `OrdersTab.tsx` had no `href`/`router.push` to `/purchasing/:id`. Fixed by this change |
| `/purchasing/new` 404s from 4 places | **STILL TRUE, and it is 5** | 1 in `catalog/[id]/_components/SupplierPriceComparisonTab.tsx`, 4 in `vendors/[id]/page.tsx`. Fixed by this change |
| One-click "Receive" posts an empty body = receive everything | **STILL TRUE** | `OrdersTab.tsx:82`. Fixed by this change |
| Purchase requisitions have zero frontend | **STILL TRUE** | 9 backend routes (`/requisitions`, submit/approve/reject/convert); `grep -ril requisition web/` → nothing. **Not fixed here** — see §7 |
| EDI never sends file bytes | **STILL TRUE** | unchanged; needs a product decision, already filed in `LOOP_STATE.md` |
| Two supplier surfaces (`/purchasing` tab vs `/vendors`) | **STILL TRUE** | not fixed here — see §7 |

---

## 3. What the code actually does — findings this audit adds

Verified directly, not carried over.

### 3.1 The list silently showed one page as the whole list — CRITICAL, fixed

`listOrders` is keyset-paginated with `clampLimit(undefined) = 50`. `OrdersTab` called
`apiGet("/api/v1/purchasing/orders")` with no params and rendered `res.items` as *all* purchase
orders. The frontend type made it unfalsifiable: `PurchaseOrdersResponse` was declared as
`{ items: PurchaseOrder[] }` — `nextCursor` was **dropped from the contract**, so nothing in the
UI could know more existed. A tenant with 200 POs saw 50 and no indication of the rest.

`receive-stock/page.tsx` has the same defect and additionally filters that one page **in the
browser** for pending POs — so a pending PO older than the newest 50 is invisible at the
receiving desk. (Not fixed here; out of claimed scope, filed in §7.)

### 3.2 Nothing in the system could answer "what is overdue?" — fixed

`purchase_orders` had **no expected/ETA column at all**. The receiving dashboard's `late_pos`
proxies it as `created_at < now − 7 days`, which measures a PO's *age*, not its lateness. The
brief asks for "Expected date" and "What is overdue?" — neither was answerable.

### 3.3 The approval gate is real and had no operator — fixed

`assertApproved()` runs at the top of `receive()` and hard-blocks with `409 approval_pending`.
`approveOrder`/`rejectOrder` are implemented, tier-gated and audited into an append-only
`po_approvals` table. **No UI reached any of it**, and `approval_status` was not even rendered,
so a blocked PO looked identical to a healthy one and its "Receive" button produced an
unexplained 409. Any tenant that enables approval tiers bricks receiving with no visible cause.

### 3.4 The product picker had a hard 200-product ceiling — fixed

The create-PO form loaded `/api/v1/inventory/levels?pageSize=200` into a `<select>`. Product 201
onward **could not be ordered at all**, and every visit paid for a 200-row payload it mostly
discarded.

### 3.5 Design-system violations in the module

`OrdersTab` carried a raw `<table>`, 6 raw `<input>`, 3 raw `<select>`, and ~30 raw-palette
classes (`border-slate-300`, `bg-red-50`, `bg-emerald-50`, `bg-blue-50`, `bg-amber-50`) — each a
hard violation of `AGENTS.md`'s Design System Rules. It also rendered `"No purchase orders yet."`
while still loading, i.e. an empty state that asserts a fact it has not yet checked.

### 3.6 The scan endpoint has no caller — NOT fixed, highest remaining value

`POST /purchasing/receiving/sessions/:id/scan` accepts barcode, qty, lot code, expiry,
manufacture date, unit-cost override + reason, location, `hold` and `reject`. It is
**never called from anywhere in `web/`** (verified by grep). Meanwhile
`receive-stock/page.tsx:114` does its own client-side barcode match:

```ts
const line = selectedPO.lines.find((l) => l.product_barcode === code || l.product_sku === code);
```

That is a second, weaker implementation of barcode resolution living in the browser — exactly
what the brief says not to do. It compares against one denormalised field per PO line, so a
**case UPC does not resolve**, and a successful scan only highlights a row: it enters no
quantity. The canonical resolver already exists on the server and is unused.

### 3.7 Document attachment fabricates data — NOT fixed, out of claimed scope

`receive-stock/page.tsx:149` posts `size_bytes: Math.round(Math.random() * 500000 + 50000)`.
No file is ever read or uploaded; the UI records a name and an **invented** size. Filed in §7.

---

## 4. Verdicts, using the brief's own framework

| Area | Verdict | Reasoning |
|---|---|---|
| Server-side filters + saved views on the PO list | **ADOPT** | Improves visibility, scales with data, removes a silent-truncation bug |
| Expected date + Overdue view | **ADOPT** | The brief requires it; it was unanswerable |
| Approval actions in the list and an explained 409 | **ADOPT** | Exception handling: what happened → why it matters → what action is available |
| PO row links to PO detail; show `po_number` not `id` | **ADOPT** | Table stakes; the opaque id is not an operator-facing identifier |
| Confirm + honest label on full receive | **ADOPT** | Irreversible action, one click, no confirmation |
| Type-ahead product search in PO creation | **ADOPT (hybrid)** | Better UX **and** removes the 200-cap defect, while `POST /orders` keeps owning unit conversion — presentation improved, canonical logic untouched |
| Keyboard-wedge scan input (vs a camera flow) | **KEEP CURRENT** | A text input + Enter is better for screen-reader and scanner users alike; more input modes is not automatically better |
| Backend receiving-session state machine | **KEEP CURRENT** | Already richer than the workflow described; it needs a *client*, not a redesign |
| Unit/UOM conversion staying server-side | **KEEP CURRENT** | Canonical; the new UI previews it and reports the server's `unitConversions` as fact |
| A separate `/purchasing/new` page | **REJECT** | 5 links pointed at a page that never existed. A new route adds a navigation step to the brief's target flow; prefilling the hub's create panel from `?supplier=`/`?product=` fixes the 404s **and** removes a page transition |
| Cursor paging in `DataTable` | **HYBRID** | The primitive only knew offset+total; the API deliberately returns no total. Added an additive `serverCursor` mode rather than inventing a total or bypassing the primitive |
| GRNI / dual-AP-posting redesign | **NEEDS BUSINESS VALIDATION** | Real and serious, but it is an accounting-policy decision, not a UI change |

---

## 5. What changed

**Backend** (`src/modules/purchasing/`)

- `index.ts` — new migration `ALTER_PO_EXPECTED_DATE`: nullable `expected_date`, plus
  `po_tenant_created_idx (tenant_id, created_at DESC, id DESC)` (the existing
  `po_tenant_status_idx` leads with `status`, so the unfiltered keyset scan could only use
  `tenant_id` as an equality prefix and had to sort the rest) and a partial
  `po_tenant_expected_idx` for the overdue predicate. Additive; legacy rows stay `NULL`.
- `service.ts` — `listOrders` gains 9 server-side filters and per-row roll-ups
  (`supplier_name`, `line_count`, `ordered_qty`, `received_qty`, `remaining_qty`, `bill_count`,
  `invoice_status`, `is_overdue`) via two `LEFT JOIN LATERAL` aggregates **in the same query as
  the page** — no request per row. New `PurchaseOrderListRow` and `OrderListFilters` types.
  `createOrder` accepts `expectedDate` / `notes`.
- `routes.ts` — `GET /orders` parses filters through a Zod schema. An unknown value is a **400**,
  not a silently-dropped predicate: a filter that quietly does nothing shows a full list the user
  believes is a filtered one. `POST /orders` accepts `expectedDate`/`notes`.

**Frontend**

- `web/api-client/types.ts` — `PurchaseOrder` corrected (it was missing `po_number`,
  `receive_status`, `approval_status`, `notes`); `PurchaseOrdersResponse` now carries
  `nextCursor`/`limit`; new `PurchaseOrderListRow`, `PurchaseOrderListQuery`.
- `web/components/DataTable.tsx` — additive `serverCursor` mode.
- `web/components/Select.tsx` — now `forwardRef`, so a validation error can move focus to its
  field (WCAG 2.1 AA expects the error to be reachable, not merely displayed).
- NEW `web/app/(protected)/purchasing/_lib/orders.ts` — saved views, query building, attention
  ranking, receive-all copy, and 409 → instruction translation. Pure, unit-tested.
- `web/app/(protected)/purchasing/_components/OrdersTab.tsx` — rebuilt on `DataTable` with 11
  columns, 5 saved views, server search + supplier filter, cursor paging, approve/reject/receive
  with `ConfirmDialog`, and separated load vs action errors.
- NEW `.../NewOrderPanel.tsx` — vendor → products → quantities → pricing → terms → review →
  submit in one panel, with type-ahead product search against `/api/v1/search`.
- 5 dead `/purchasing/new` links repointed to `/purchasing?tab=orders&supplier=…&product=…`.
- `web/mocks/mockHandlers.ts` — order mocks now mirror the real contract **including applying
  the filters**; a mock that ignored them would make every saved view look like it works.

---

## 6. Verification

| Gate | Result |
|---|---|
| Backend `typecheck` | PASS |
| Backend `npm test` | see §6.1 |
| `src/modules/purchasing` isolated | **36/36 PASS** (31 pre-existing + 5 new) on real PostgreSQL 16 |
| **New backend tests proven to fail first** | The 4 filter tests were run against the pre-fix route (filters stripped): **4 fail**, then 4 pass with the fix |
| `hygiene-check.mjs` | PASS (2216 files) |
| `gap:scan` | PASS — 474 backend / 385 frontend paths, no unexplained FE→BE gaps (this is what proves the new page's calls hit real routes) |
| `table:scan` | PASS (166 names, no collisions) |
| `authz:scan` | PASS (49 route files, 0 unguarded) |
| Web `typecheck` | PASS |
| Web `lint` | PASS — 0 warnings, 0 errors |
| Web `vitest` | **261/261 across 32 files** (+27 new, +1 new file) |
| Web `NEXT_PUBLIC_MOCK=false build` | PASS, 87.4 kB shared JS |

### 6.1 Not run / caveats

- **Playwright e2e** — no built-and-served real-stack pair in this container; CI runs the golden
  paths on the PR. Reported as not done rather than softened.
- **No browser or visual QA.** The new list has not been looked at by a human in a real browser.
- **Load/perf measurement** — the index and single-query roll-up changes are reasoned from the
  query plan shape, not from a measured before/after on a large dataset. Stated as such in §8.
- The local Postgres needed `max_connections = 600`: every test builds a whole app with its own
  pool and pools are not closed, so 36 sequential tests exhaust the default 100. Environmental,
  not a code defect, but worth recording — it is the same class of false failure `AGENTS.md`
  warns about.

---

## 7. Remaining gaps (evidence attached; next iteration)

Ordered by value. Each was verified in this session.

1. **Wire the receiving scan endpoint** (§3.6). The single highest-value remaining item: a
   complete backend scan/hold/reject/lot/expiry/cost-override flow with no client, next to a
   weaker duplicate in the browser that cannot resolve a case UPC. Requires touching
   `web/app/(protected)/inventory/receive-stock/**`, deliberately excluded from this claim.
2. **Receiving desk loads one page and filters it client-side** (§3.1) — now trivially fixable:
   call `?status=ordered&receiveStatus=partial` against the filters added here.
3. **Document attachment invents a file size** (§3.7). Either upload real bytes or label the
   control as not implemented; it currently records fiction.
4. **`receive-stock` swallows session-begin failures** (`catch { session = null }`) and falls back
   to the legacy one-shot receive, masking the real cause of the failure.
5. **`loadList` has a bare `catch { /* ignore */ }`** — an API failure renders as "no pending POs".
6. **Purchase requisitions still have zero frontend.** 9 tested backend routes, no page.
7. **Two supplier surfaces** — `/purchasing?tab=suppliers` (name + email) vs `/vendors` (full
   profile + scorecard). One should become canonical.
8. **Dual AP posting** — receiving posts Dr Inventory / Cr AP unconditionally, while bill entry +
   three-way match "posts" without touching the ledger. Accounting-policy decision (GRNI), filed
   as NEEDS-SRI, not patched.
9. **`exclude_from_po` is written and never read** — a draft/archived product can still be added
   to a PO.

---

## 8. Performance

Reasoned, not measured (see §6.1):

- **Removed** an unconditional `/api/v1/inventory/levels?pageSize=200` fetch on every visit to the
  purchasing hub, replaced by a debounced search returning ≤8 rows.
- **Removed** the client-side supplier-name lookup (`suppliers.find(...)` per row, per render) —
  the name is now joined server-side.
- **Roll-ups add no round trips**: `line_count`/`ordered_qty`/`received_qty`/`bill_count` come
  from two `LEFT JOIN LATERAL` sub-selects on the same page query. The obvious alternative — a
  `GET /orders/:id` per row — would have been 25 extra requests per page.
- **New index** `po_tenant_created_idx` matches the keyset scan's exact ordering; the pre-existing
  `po_tenant_status_idx` did not (it leads with `status`).
- **Filtering moved server-side**, so a filtered view now reads one page of matches instead of
  fetching 50 rows and hiding some of them.

---

## 9. Recommendation

**Needs Minor Improvements.**

The purchase-order half of Procure-to-Pay is production-ready as changed: it is filterable,
navigable, paginated, honest about what it does not know, and its approval gate finally has an
operator. What keeps it short of "Production Ready" for the brief as a whole is (a) the design
reference was never readable, so the comparison the brief actually asked for is unperformed, and
(b) the receiving desk still runs its own barcode matching in the browser while a better server
implementation sits unused — item 1 in §7, and the thing to do next.
