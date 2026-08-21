# Click audit — product lookup, and the receiving scan

> ## ⚠ READ FIRST — most of this audit's implementation was SUPERSEDED by PR #229
>
> While this work was in flight, **PR #229 ("server-side product search, filters,
> sorting and facets", branch `claude/ascend-product-ux-optimization-s6khv3`)
> independently built the same feature and merged to `develop` first.** This is
> the duplicate-work collision `AGENTS.md` calls the costliest failure class —
> the second occurrence on this repo in a week (see the 2026-08-06 #197/#198
> collision in `LOOP_STATE.md`), and the cause is the same both times: **neither
> session claimed the area in `WORK/LOCK.md` before starting.** This session did
> claim it — at `2026-08-11T040000Z`, scoped to `catalog/**` — but #229's branch
> was already open and unclaimed, so the lock could not prevent it.
>
> **Resolution, following this repo's own precedent:** develop's implementation
> wins wherever the two overlap, and this branch keeps only what is genuinely
> additive. Everything below in §1–§4 about `CatalogService.list()`, `?q=`,
> server-side filters/sort, `/catalog/counts`, `ProductsTab`, the MSW mock and
> the OpenAPI catalog parameters describes **work that was dropped** — #229
> delivers that surface, differently (`/catalog/facets` rather than
> `/catalog/counts`, an inlined predicate rather than a shared module).
>
> The **findings** in §1–§3 remain accurate and are worth reading: they diagnose
> a real defect, independently reproduced, and #229 fixes the same one. The
> **click measurements** in §2 remain valid as a description of the before/after
> that shipped, via #229's code rather than this branch's.
>
> **What this branch actually ships is in §9.** It is a much smaller, purely
> additive set: five `pageSize`/`limit` fixes (including the POS grid and the
> kitchen display, both still broken on `develop` today), the receiving
> case-barcode fix, a `ConfirmDialog` double-submit guard, and the first
> real-stack E2E for catalog search.

**Session:** Claude Code web, branch `claude/ascend-click-audit-optimization-sj5jko`
**Date:** 2026-08-11
**Directive:** Sri, 2026-08-11 — audit ASCEND against the "ASCEND Click Audit"
reference design, eliminate unnecessary clicks / screens / typing / repeated
searches, then implement the highest-value workflow end to end.

---

## 0. The reference design could not be read

`https://claude.ai/design/p/424883f3-6b3c-46de-8613-59d47766fe69` returns **HTTP
403** to this session, on both the `?file=…&via=share` and bare forms. It is not
publicly readable and this environment has no credential for it.

So this audit did **not** inspect the reference. It was benchmarked against the
improvement categories the directive itself enumerates (reduced navigation,
inline/quick/contextual actions, search and filter improvements, scan-first
workflows, better defaults, bulk operations, keyboard efficiency). Every finding
below comes from reading ASCEND's own code, not from the reference. Section 6
("Design integration") reports what was adopted from *those categories* and is
explicit that "adopted from the reference" cannot be claimed for any of it.

---

## 1. Headline finding

Product lookup — the directive's priority workflow **#1 (product search)**, and a
dependency of **#2 (inventory lookup)** and **#4 (barcode lookup)** — is not slow.
**It does not work.**

`CatalogService.list()` accepted `category`, `status`, `limit`, `offset`,
`excludeMasters` and nothing else. `readQuery()` in `catalog/routes.ts` read the
same five. There was no `q`.

Three separate frontend surfaces send `q` to that endpoint:

| Call site | What the operator is doing |
|---|---|
| `catalog/_components/ProductsTab.tsx:253` | the main catalog search box |
| `catalog/categories/[id]/page.tsx:71,228` | "add a product to this category" |
| `catalog/[id]/_components/VariantsTab.tsx:234` | "find the product to link as a variant" |

All three sent `?q=<term>` to a backend that dropped it, and none applied a
name/SKU filter client-side either — `visibleProducts` filtered on tax class,
brand, age restriction, type and price, never on the search term. **Typing a
product name into the catalog search box returned the same unfiltered first page
of results, always.**

### Why it survived

The MSW mock at `web/mocks/mockHandlers.ts` **did** implement `q` filtering
(name / sku / barcode). So in `npm run dev` and in every mock-backed test,
search worked. Only production was broken. This is a concrete instance of the
hazard `AGENTS.md` warns about — a mock more capable than the server hides the
defect rather than surfacing it. The mock is now held to the real contract
(§4), so the two cannot diverge again silently.

---

## 2. Click map — measured, not estimated

Counts are of discrete operator actions (click, keystroke-run, scan) from the
catalog list to the intended product. "Catalog of N" assumes the default page
size of 50.

### 2.1 Find a product by name

| | Before | After |
|---|---|---|
| Type the name | 1 (no effect) | 1 |
| Click "Search" | 1 (no effect) | — (button removed) |
| Page through the catalog to find it visually | `ceil(N/50) − 1` clicks, worst case | 0 |
| Scroll/scan each page visually | 1 per page | 0 |
| Click the row | 1 | 1 |
| **Total, 500-product catalog (worst case)** | **~21** | **2** |
| **Screens** | 1 (paged ~10×) | 1 |

The before-count is unbounded in the catalog size; the after-count is constant.
For a 5,000-product catalog the before-case is ~200 actions. Reporting this as a
"90% reduction" would understate it — the old path does not scale, and an
operator who did not know to page would conclude the product did not exist.

### 2.2 Look a product up by scanning its barcode

| | Before | After |
|---|---|---|
| Focus the search box | 1 | 1 |
| Scan | 1 | 1 |
| Read the result list, click the row | 2 | 0 — resolves and opens directly |
| **Total** | **4** (and only if `q` had worked — it did not, so in practice: unbounded) | **2** |

`Scan → Resolve → Action`, the shape the directive asks for, replacing
`Scan → Search → Open → Select`.

### 2.3 Filter the catalog (brand / type / price / tax class / age)

Before: the filter *appeared* to work and silently acted on the loaded page
only. Click count was similar; **the answer was wrong**. Filtering by brand
searched 50 rows out of N and displayed the match count beside the unfiltered
total — "Showing 1 of 4,312" meant "1 on this page". The remaining 4,262 rows
were never consulted. Sorting had the same defect: "sort by price ascending"
sorted the loaded page, so the cheapest row shown was the cheapest of 50, not of
the catalog.

After: all nine filters and all sorts are applied by the server; both numbers
describe the same filtered set. This is a **correctness** fix that happens to
reduce clicks (chips are one click, and no re-paging is needed to trust a
filter), not a click optimisation.

### 2.4 Receive a case against a PO by scanning it

| | Before | After |
|---|---|---|
| Scan the case barcode | 1 → **fails**: "Barcode X not found on this PO" | 1 → highlights the line |
| Fall back: read the PO, find the line by eye, click it | 2–3 | 0 |
| **Total** | **3–4, after a scan that appeared to be an error** | **1** |

---

## 3. Root causes (all three are the same class)

1. **A frontend contract nothing enforced.** `tools/api-gap-scan.mjs` checks that
   frontend→backend *paths* exist. Nothing checks that the *parameters* a page
   sends are read. `?q=` was sent to a live, existing, 200-returning route for as
   long as the search box has existed.
2. **Business logic forked instead of reused.** The product-search predicate
   lived only inside `SearchService` (⌘K palette); the catalog needed one and had
   none. The receiving desk wrote its own barcode matcher rather than calling the
   canonical resolver. `AGENTS.md` names this the costliest failure class, and
   both instances behaved exactly as it predicts — the same scan gave different
   answers at the till, in ⌘K, and at the receiving desk.
3. **A page answering questions about the catalog.** Chip counts, master/variant
   detection, filtering and sorting were all computed from the ~50 rows the
   client happened to hold. A page cannot answer a question about row 51.

---

### 3.1 The same blind spot found a second, live defect — reported, not fixed

> **SUPERSEDED by §8.1 (second pass, same day).** The deferral reasoned about
> below is **wrong**: the Cursor Cloud claim enumerates specific `terminal/`
> files and does not include `ProductGrid.tsx`. All five call sites are now
> fixed. This section is kept unedited so the record shows what was decided and
> why it was wrong, rather than quietly reading as if the right call was made.

While confirming no other consumer relied on `?q=` being ignored, a grep of
every `/api/v1/catalog?` call site turned up **three sending `pageSize=`**, which
the backend also does not read (it reads `limit`):

| Call site | Asks for | Actually gets |
|---|---|---|
| `web/components/terminal/ProductGrid.tsx:86` | `pageSize=200` | **50** — `clampLimit(undefined)` defaults to 50 |
| `web/app/(protected)/pricing/page.tsx:245` | `pageSize=200` | **50** |
| `web/components/setup/RetailSetupChecklist.tsx:43` | `pageSize=1` | 50 rows it discards (it only reads `total`) — harmless, just wasteful |

The first one matters: **the POS product grid — the highest-frequency screen in
the app — shows a cashier the first 50 products of the catalog and nothing
else**, silently, with no "load more" and no indication anything is missing.

**Not fixed here, deliberately.** `web/components/terminal/**` sits inside the
Cursor Cloud "Wave B POS customer + gift card" claim, which is still `ACTIVE` in
`WORK/LOCK.md`; this branch's claim explicitly excludes it and routing around it
was the whole point of that exclusion. The fix is one word per call site
(`pageSize` → `limit`), but it belongs in a change that can verify the POS grid
still renders correctly with 200 rows — which is a different concern from
product lookup. Filed in `LOOP_STATE.md` with the exact fix.

It is also the strongest available argument for §7.1: two unrelated parameter
names, four call sites, three live defects, zero failing checks.

## 4. What changed

### Backend

| File | Change |
|---|---|
| `src/shared/product-search.ts` **(new)** | The one definition of "does this product match what was typed". Matches name, SKU, the legacy `products.barcode` column, **and `product_barcodes`** (each/box/case/vendor/alt UPCs). Escapes `%`, `_` and `\` so a SKU like `COF_250` is a literal, not a wildcard. |
| `src/modules/search/service.ts` | ⌘K now composes that fragment instead of its own copy. Side effect: the palette now finds products by case/alt barcode, which it never could. |
| `src/modules/catalog/service.ts` | `list()` gains `q`, `brand`, `kind`, `priceMin/MaxCents`, `taxClass`, `ageRestricted`, `sort`, `dir` — all server-side, tenant-scoped, sharing one WHERE builder with the counts so chips and rows cannot disagree. Selects a computed `is_master`. New `counts()`: whole-catalog totals in one grouped pass. |
| `src/modules/catalog/routes.ts` | `readQuery()` reads the new params. New `GET /counts`, registered before `/:id` (this module has been bitten by route shadowing before — there is a regression test for it). Sort column is an allowlist, not a passthrough: it is interpolated into `ORDER BY`, where a bind parameter cannot be used. |
| `src/modules/catalog/index.ts`, `db/migrations/0002_commerce.sql` | New partial index `products_tenant_barcode_idx (tenant_id, barcode)`. Three hot paths filter `tenant_id AND barcode` — `getByBarcode`'s fallback on every POS scan, `assertBarcodeAvailable` on every product write — and the only existing index was barcode-only, against the file's own tenant-leading convention. |

### Frontend

| File | Change |
|---|---|
| `catalog/_components/ProductsTab.tsx` | All filters + sort to the server. Client-side page filtering deleted. Redundant "Search" button removed (results are live and debounced; the button implied they were stale until clicked — the same call already made on `/customers`). Chips read `/catalog/counts`, and render `—` rather than `0` when unavailable. Type column reads server `is_master`. Filter bar rebuilt on `Input`/`Select`/`Button` primitives; archive confirm moved from a bare `fixed inset-0` div to `ConfirmDialog` (real `<dialog>` + focus trap + Escape). **Scan-to-open**: a term matching `^\d{8,14}$` is resolved via the canonical barcode endpoint and, if known, opens the product directly. |
| `inventory/receive-stock/**` | New `findScannedLine()` — exact barcode, then SKU, then the canonical resolver's product id. The page now calls `GET /api/v1/catalog/barcode/:code` before matching, best-effort: an unknown code or a failed request degrades to exactly the previous behaviour. |
| `web/mocks/mockHandlers.ts` | Mock brought up to the real contract (all filters, sort, `is_master`, `/counts`). |
| `catalog/_components/ProductsTab.tsx` (dead code) | `filterSummary` — an 11-entry array of active-filter chip labels, rebuilt on every render and **rendered nowhere**. Dead before this change (confirmed against `HEAD`), not orphaned by it, and not flagged by lint. Removed as part of rewriting the filter layer it belonged to. |
| `web/api-client/types.ts` | `CatalogCounts`; `is_master` on `CatalogProduct`. |
| `web/components/ConfirmDialog.tsx` | New `busy` prop disabling both buttons and Escape while a confirm is in flight. **Caught during self-review**: the inline dialog this change replaced had `disabled={archiving}` on its confirm button, and moving to the primitive silently dropped it — a double-click would have sent two DELETEs. Extending the primitive rather than re-adding a bespoke button is what `AGENTS.md` requires, and every other `ConfirmDialog` caller doing async work now has the guard available. |

### Deliberately not changed

- **Archive still requires a confirm.** Directive Phase 6 — click reduction must
  not strip safeguards from destructive actions. Only the dialog's mechanics
  improved.
- **Full re-tokenisation of the catalog table body.** `LOOP_STATE.md` lists
  `catalog` as remaining UI/UX Phase 3 work. The controls this change touches are
  migrated to primitives and tokens; the table cells still carry raw hex
  (`#111`, `#888`, `#FAFAFA`). Doing half and calling the route migrated would
  be false, so it is reported as still outstanding.
- **`?q=` is not index-backed.** `ILIKE '%term%'` cannot use a btree index. At
  SMB catalog sizes a tenant-filtered scan is fine, and this is what the ⌘K
  palette has always done. If catalogs grow past ~10⁵ rows this needs `pg_trgm`.
  Stated rather than quietly claimed as fast.

---

## 5. Verification

| Gate | Result |
|---|---|
| Backend `typecheck` | PASS |
| Backend `npm test` (full suite) | **917/917, 0 failures** on real PostgreSQL 16 (~19.6 min). See §5.4 for the timeline. |
| Backend `npm run smoke` | **PASS — 20 steps, full POS lifecycle** end-to-end |
| `catalog` module isolated | **68/68** (54 pre-existing + 14 new) |
| `search` module isolated | 12/12, unchanged by the predicate swap |
| Web `typecheck` | PASS |
| Web `lint` | PASS, 0 warnings |
| Web `vitest` | **251/251 across 32 files** (was 234/234 across 31; +17 new) |
| Web `NEXT_PUBLIC_MOCK=false build` | PASS, 123 routes, 87.4 kB shared JS |
| `hygiene-check` | PASS (2216 files) |
| `gap:scan` | PASS — 475 backend / 383 frontend paths, 17 allowlisted (was 474/382: the new `/catalog/counts` route and its caller, correctly paired) |
| `table:scan` | PASS (166 names) |
| `authz:scan` | PASS (49 files, 0 unguarded) |

### 5.1 The tests were verified to catch the bug

New tests were run against the **pre-fix** `service.ts`/`routes.ts` before being
trusted: **12 of the 14 new backend tests failed**, then all 14 passed with the
fix. The two that pass either way are guards on the new code rather than
regression proofs — "blank `q` is not a filter" and "non-numeric price bounds are
ignored rather than read as zero" (a `priceMax` coerced to `0` would filter the
catalog to free items). Recorded as such rather than counted as proof.

The receiving fix was proven the same way: reverting `findScannedLine` to
exact-match-only makes **"matches a case barcode via the canonical resolver's
product id"** fail, and only that test.

One test fixture was wrong and the code was right: the first
"q matches the legacy barcode column" run returned 2 rows because the fixture
reused `0123456789012`, which the demo seeder assigns to `GRO-COFFEE-001`. The
fixture was changed; search was behaving correctly.

### 5.4 Timeline note — the suite finished after the commit, and passed

The first commit on this branch (`c4339f4`) was made while the backend suite was
still running, at 579 of 917 tests. It was recorded then as **in progress and
not claimed as passed**, here and in the PR body, rather than rounded up.

It has since completed: **917/917, 0 failures**, ~19.6 min on real PostgreSQL 16.
`npm run smoke` then passed as well — 20 steps, full POS lifecycle. Both rows in
the table above now carry the real result, and the PR body was corrected to
match. Kept as a note rather than deleted, so the record shows what was known at
commit time versus what was known afterwards.

Why it is slow here: each test builds a fresh app that serialises on a global
migration advisory lock, and `PG_POOL_MAX` had to be dropped to 4 (see §5.3),
putting it at roughly 4s/test. This is the same harness constraint already filed
in `LOOP_STATE.md` (2026-08-07), not a new problem.

### 5.2 Not run

- **Playwright e2e.** No built-and-served real-stack pair in this container; CI
  runs the golden paths on the PR. Note the standing blind spot recorded in
  `LOOP_STATE.md` (2026-08-06): `storageState` does not capture `sessionStorage`,
  so no e2e spec can see a manager-gated control. Product search is not
  manager-gated, so it would be exercised — but "e2e passed" still means reads
  only.
- **Browser / visual QA.** No browser was driven. The filter bar's rebuild on
  design-system primitives is verified by typecheck, lint, build and component
  tests, **not** by looking at it.
- **Mobile tap audit (directive Phase 15).** Not performed. The mobile card list
  benefits from the search fix identically, but no separate one-handed analysis
  was done. Listed in §7.
- **Load/stress testing.** Same blocker as prior audits: no reachable TESTING
  tier.

### 5.3 Environment notes

Backend tests ran against **real PostgreSQL 16** (system service; embedded
Postgres cannot `initdb` as root here). `max_connections` had to be raised from
100 to 800 — 68 tests each build an app with its own pool and exhausted the
default with `sorry, too many clients already`, an environment limit, not a code
failure. Node here is 22, not the pinned 24; the 3 documented jsdom
`Blob`/`FileReader` failures did not occur and the suite passed 250/250.

---

## 6. Design integration

**Adopted** — from the improvement categories in the directive, since the
reference itself was unreadable (§0): instant/debounced search with no submit
button; quick-filter chips carrying honest counts; scan-first resolution
(`Scan → Resolve → Action`); server-side filtering so the result set is the
answer; contextual barcode resolution reused from the canonical owner.

**Rejected**: removing the archive confirmation (Phase 6 forbids it); inline
price editing in the list row — real, but it moves money, and doing it properly
needs an approval/threshold decision that is Sri's, so it is filed in §7 rather
than half-built; a `pg_trgm` index (adds an extension dependency to every
deployment for a problem no current tenant has).

**Hybrid**: the chips already existed as page-local counters and already acted as
filters — they kept both roles and gained correct numbers, rather than being
replaced with a new control.

---

## 7. Remaining opportunities

Ordered by frequency × time saved × risk reduced.

1. **A parameter-level gap scanner.** `gap:scan` proves paths exist; nothing
   proves the params a page sends are read. That blind spot is what let a dead
   search box live in three places. Highest leverage item here — it prevents the
   whole class.
2. **Product quick-edit (price / cost) from the list row.** The most frequent
   product edit still costs `row → detail → tab → field → save`. Needs a decision
   on the safeguard: threshold-triggered confirm, approval chain, or audit-only.
3. ~~**The other two `q` call sites need converting to typeaheads.**~~
   **Withdrawn on inspection — they already are.** `categories/[id]/page.tsx`
   (250ms debounce) and `VariantsTab.tsx` (300ms debounce) are both proper
   debounced typeaheads that were returning the first 20 products regardless of
   what was typed. The backend fix repairs both with **no frontend change**, so
   this is not remaining work — it is two more workflows already fixed. Recorded
   here rather than deleted because the first draft of this audit claimed the
   opposite.
4. **Receiving is implemented three times** — `inventory/receive-stock` (scan,
   PO-driven), `purchasing/receiving` (stateful sessions dashboard), and
   `purchasing/[id]/ReceiveTab`. Only the first was audited here. Which one is
   canonical is a product decision.
5. **`/customers` and `/orders` list filtering** — worth checking for the same
   page-local filtering defect; `/orders` was already migrated to server paging
   and deliberately dropped client-side search for this reason, which suggests
   the pattern is not uniform.
6. **Mobile tap audit** (directive Phase 15), not performed here.
7. **A server-side CSV export endpoint.** "Export CSV" has always exported the
   loaded page. That was unremarkable when filters were client-side (the page
   *was* the result), but beside the now-honest "Showing 50 of 500 matching
   products" it read as a promise to export all 500. Relabelled to
   "Export this page (N)" — accurate, and no behaviour change — but exporting a
   filtered set is a real need and wants a real endpoint.
8. **`TableSkeleton` keys its `<th>` cells by header text**, so a caller passing
   two blank headers (the catalog list passes `["", "Product", …, ""]`) triggers
   a React duplicate-key warning on every load. Surfaced by the new component
   test; **pre-existing and not caused by this change**. One-line fix (key by
   index) in a shared primitive — left out deliberately, since it touches every
   page that renders a skeleton and this branch is scoped to product lookup.

---

## 8. Second pass (2026-08-11, post-merge) — closing the gaps this audit left open

The first pass shipped PR #228 and left four things open. This section records
what happened to each. Nothing here was rounded up.

### 8.1 The POS pagination defect: fixed, after correcting a wrong call

§3.1 deferred it because `web/components/terminal/**` "sits inside a Cursor
Cloud claim still marked ACTIVE". **That reasoning was wrong.** Re-reading the
claim shows it enumerates *specific files*:

```
src/modules/payments/{service,routes,payments.test}.ts;
web/api-client/types.ts;
web/components/terminal/{TenderScreen,CustomerAttachModal,ShortcutsOverlay}.tsx;
web/app/(protected)/terminal/{page.tsx,_components/{…}}
```

`ProductGrid.tsx` is not in it. No claim in `WORK/LOCK.md` names it, and the
only claim touching `pricing/**` is RELEASED. The blocking exclusion was
**self-imposed** — my own claim wrote `NOT web/components/terminal/**`, which is
broader than the lock it was deferring to. Deferring a one-word fix to a live
cashier-facing defect on that basis was not justified.

Fixed — and the sweep found **five** call sites, not three:

| File | Was | Now | Impact |
|---|---|---|---|
| `web/components/terminal/ProductGrid.tsx` | `catalog?pageSize=200` | `limit=200` | POS grid showed a cashier 50 products, not 200 |
| `web/app/(protected)/pricing/page.tsx` | `catalog?pageSize=200` | `limit=200` | price-override picker capped at 50 |
| `web/app/(protected)/pricing/page.tsx` | `customers?pageSize=200` | `limit=200` | same, customers |
| `web/app/(protected)/restaurant/kitchen/page.tsx` | `orders?status=open&pageSize=50` | `limit=50` | **KDS** asked for 50 open orders, got the default |
| `web/components/setup/RetailSetupChecklist.tsx` | `catalog?pageSize=1` | `limit=1` | harmless (reads `total` only), but wasteful |

**`pageSize` is not universally wrong** — `GET /api/v1/inventory/levels` genuinely
reads it (`src/modules/inventory/routes.ts:164`). The three call sites using it
*there* were correct and are untouched. A blanket rename would have broken them.

Guarded by `web/tests/paginationParamContract.test.ts`, which fails against the
pre-fix source and knows about the one legitimate exception. It also self-tests
its own matcher, because a guard that cannot fail proves nothing.

### 8.2 Inventory lookup by barcode — a real inconsistency the first pass missed

§4 claimed the search predicate now has "one owner". Checking that claim
properly (`grep` for surviving `name ILIKE` predicates) showed it was **true for
catalog and ⌘K only**. `InventoryService.levels()` still had its own:

```sql
(p.name ILIKE @q OR p.sku ILIKE @q)   -- no barcode leg at all, term unescaped
```

So scanning a UPC on the inventory page — the brief's **priority workflow #2** —
found nothing, while the identical scan resolved at the till. Now composes the
shared predicate. 3 new tests, each verified to fail against the old one.

**Still not unified, stated rather than glossed:** `ecommerce`, `serial_numbers`
and `ai_assistant` (×2) carry their own narrower product predicates. They are
lower-traffic and none is a scan surface, so they are filed in `LOOP_STATE.md`
rather than swept in here.

### 8.3 E2E — run, and it caught a flaw in its own first draft

Playwright 1.61 and Chromium are both present in this container, so "no
real-stack pair available" was no longer true. Stood up the full runbook —
production build with `NEXT_PUBLIC_MOCK=false` → Next standalone on :3000 →
Express on :3001 → real PostgreSQL 16, seeded — and wrote
`web/e2e/catalog-search.spec.ts`. **5/5 green.**

This is the only layer that crosses the seam the defect lived in: MSW
implemented `?q=` and the server did not, so every mock-backed test passed while
production was broken.

**Verified to catch the bug**, not assumed: reverting `readQuery` to drop `q`
and restarting the backend makes the spec fail.

**And that exercise found a real flaw in my own test.** The first draft asserted
`toBeHidden(MUG_SKU)` after typing — and it **passed against the deliberately
broken backend**. Two reasons: `toBeHidden` is satisfied by an element that does
not exist, and while the fetch is in flight the component swaps the table for a
loading skeleton, so the assertion resolved against the skeleton and never saw
the real answer. This is the same non-waiting defect class already recorded for
`e2e/inventory-receive.spec.ts` in `LOOP_STATE.md`. Rewritten to await the
filtered response and assert the settled row set positively (`toHaveCount(1)`),
after which it fails against the broken backend as it should.

**Reproducing locally:** this container's Chromium is build 1194 while
`@playwright/test` 1.61 expects 1228, so the run needed a throwaway config
setting `launchOptions.executablePath` to `/opt/pw-browsers/chromium-1194/…`.
That config is **not committed** — it hard-codes a container path that would rot,
and CI has the matching browser. The spec itself is committed and needs no
special handling there.

### 8.4 The OpenAPI contract was promising the same dead parameter

`develop` moved 13 commits during the first pass, adding a `contract:scan` gate
(PR #222) that checks `contracts/openapi.yaml` against the real routes. Merging
it surfaced a third instance of this audit's core finding:

**`contracts/openapi.yaml` already documented `q` as a query parameter on
`GET /api/v1/catalog`** — the published API contract had been promising a search
parameter the backend never read. It also documented `cursor`, which that route
does not read either (it pages by `offset`).

Both corrected, the nine new filter/sort parameters documented, and
`/api/v1/catalog/counts` added. `contract:scan` passes at 147 documented
operations (was 146).

### 8.5 What is still open

Unchanged and still honest:

- **Phase 15 mobile tap audit** — not performed. Out of scope for this PR.
- **Catalog table-body re-tokenisation** — the controls this change touches were
  migrated to primitives; the table cells still carry raw hex. `catalog` stays on
  the UI/UX Phase 3 list.
- **The reference design** — still 403. Never read, never inferred.
- **Visual QA** — the E2E drives a real browser and asserts behaviour, which is
  strictly more than before, but nobody has *looked* at the rebuilt filter bar.
- **The parameter-level gap scanner** (§7.1) — `paginationParamContract.test.ts`
  covers `pageSize` specifically, which is the param with a proven history of
  live defects. The general scanner is still the higher-leverage item.

### 8.6 Final post-merge gate results

| Gate | Result |
|---|---|
| Backend `typecheck` | PASS |
| Backend `npm test` | **922/922, 0 failures** on real PostgreSQL 16 (~32 min) — 917 pre-merge plus 5 new (3 inventory barcode, 2 already counted elsewhere) |
| Backend `npm run smoke` | **PASS — 20 steps, full POS lifecycle** |
| `contract:scan` (new gate from develop) | **PASS — 147 documented operations** (was 146) |
| `gap:scan` | PASS — 475 backend / 383 frontend, 17 allowlisted |
| `hygiene` | PASS — 2227 files |
| `table:scan` / `authz:scan` | PASS |
| Web `typecheck` / `lint` | PASS / **0 warnings** |
| Web `vitest` | **253/253 across 33 files** (was 234/234 across 31 at branch start) |
| Web `NEXT_PUBLIC_MOCK=false build` | PASS — 123 routes |
| **E2E `catalog-search.spec.ts`** | **5/5 against the real stack** |

### 8.7 CI cannot be dispatched for this PR — externally actionable blocker

**GitHub Actions has never run on this branch**, across four pushes and both
draft and ready-for-review states. This is not a queue backlog: other branches'
runs from the same period completed successfully (e.g. run `31458705433`,
conclusion `success`), and `GET /pulls/228/check-runs` returns only the Vercel
and Supabase integration checks — **no Actions check suite exists at all**.

Most likely cause: the PR was opened through the GitHub App integration, and
GitHub does not raise `pull_request` workflow runs for events generated by an
app token (its documented loop-prevention behaviour). `ci.yml`'s `push` trigger
is filtered to `[develop, staging, master]`, so a feature branch gets nothing
from that path either.

**It cannot be worked around from here:** `ci.yml` declares only `push` and
`pull_request` — there is no `workflow_dispatch`, so `actions_run_trigger` has
nothing to invoke. Any close/reopen would be another app-token event.

**What a human needs to do (any one of these):**
1. Close and reopen PR #228 from the GitHub UI — a user-generated event does
   raise `pull_request` runs.
2. Push any commit to the branch from a normal user credential.
3. Add `workflow_dispatch:` to `ci.yml`'s `on:` block, which makes CI manually
   runnable for this and every future agent-opened PR. This is the durable fix
   and is worth doing regardless.

Merging is Sri-only in this repo in any case (`AGENTS.md`: a human clicks merge
every time, and green CI is necessary but never sufficient).


---

## 9. Final scope after the PR #229 collision

`origin/develop` moved 40 commits during this session. The last 27 included
**PR #229**, which shipped server-side catalog search, filters, sorting and a
`/catalog/facets` endpoint — the same feature this branch had built.

### 9.1 How the collision was resolved

Verified before deciding, not assumed:

| Concern | On `develop` after #229? | Decision |
|---|---|---|
| `?q=` on the catalog list | **Yes** (own `SEARCH_COLUMNS` predicate, incl. `product_barcodes`) | **Dropped mine.** #229 merged first. |
| Server-side brand / type / price / sort | **Yes** | **Dropped mine.** |
| Whole-catalog chip counts | **Yes**, as `/catalog/facets` | **Dropped mine** (`/catalog/counts`). |
| `ProductsTab` server-side wiring | **Yes** | **Dropped mine.** |
| MSW mock + OpenAPI catalog params | **Yes** | **Dropped mine.** |
| `pageSize` → `limit` (5 call sites) | **No — still broken** | **KEPT.** |
| Receiving case-barcode resolution | **No** | **KEPT.** |
| `ConfirmDialog` `busy` guard | **No** | **KEPT.** |
| Real-stack catalog E2E | **No** (no catalog spec exists) | **KEPT**, rewritten against #229's UI. |

The branch was reset onto `origin/develop` and the kept set re-applied, rather
than merged conflict-by-conflict. Merging would have produced a tree containing
two competing implementations of the same endpoint.

**Net effect: this branch now changes ZERO backend files.** Everything it ships
is in `web/`.

### 9.2 Dropped deliberately, and why — the inventory barcode fix

The inventory-lookup fix (§8.2) is **not** in the final branch, despite being a
real, reproduced defect: `InventoryService.levels()` on `develop` today still
searches `(p.name ILIKE @q OR p.sku ILIKE @q)` — no barcode leg, unescaped term
— so scanning a UPC on the inventory page finds nothing while the same scan
resolves at the till.

It was dropped because fixing it now requires either a shared predicate module
(which would be a **third** variant alongside #229's inlined one and the ⌘K
palette's) or copying #229's predicate by hand (a fourth). Adding either while
#229's ink is still wet makes the drift problem worse, not better. Filed in
`LOOP_STATE.md` as a single unification task to be done once, deliberately,
against #229's implementation as the base.

### 9.3 What this branch ships, verified

| Change | Verification |
|---|---|
| 5 × `pageSize` → `limit` — POS product grid (cashier saw 50 of the catalog), kitchen display (asked 50 open orders, got the default), 2 × pricing pickers, setup checklist | `web/tests/paginationParamContract.test.ts`, proven to fail against the pre-fix source; also self-tests its own matcher, and knows `inventory/levels` genuinely reads `pageSize` so the 3 correct call sites are not flagged |
| Receiving resolves case/box barcodes via the canonical resolver | 6 `findScannedLine` tests; reverting to exact-match-only fails exactly the case-barcode one |
| `ConfirmDialog` `busy` prop | prevents the double-DELETE a double-click would have sent |
| `web/e2e/catalog-search.spec.ts` | the first real-stack catalog test: production build, mocks off, real Postgres |

Gates on the final tree: web `typecheck` PASS, `lint` **0 warnings**,
`vitest` **251/251 across 33 files**. No backend file is touched, so the backend
suite is unchanged from `develop`'s own (it was nevertheless run green at
**922/922** plus smoke on the pre-reset tree).

### 9.4 The lesson, stated plainly

Two sessions burned a combined multi-hour effort building the same feature, for
the second time in a week. The lock protocol did not prevent it because a lock
claim only helps if the *other* session reads it before starting. The durable
fix is not more diligence — it is what `LOOP_STATE.md` already carries as the
top backlog item: **a check that runs in CI**. A parameter-level gap scanner
would have caught the underlying `?q=` defect months ago, before either session
had a reason to go looking.
