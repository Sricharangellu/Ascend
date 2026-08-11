# AUDIT 2026-08-11T010000Z — Product search, filtering, sorting and counts

Session: Claude Code web — `claude/ascend-product-ux-optimization-s6khv3`
Directive: Sri, 2026-08-11 — product experience / search / filtering / catalog UX
optimization across the back-office catalog and the customer storefront. Explicit
instruction: inspect the current implementation first, preserve what works,
improve what does not, and finish and test each improvement before the next.

Status label: **built_verified** for everything claimed below. Each defect was
reproduced against the real backend before the fix and re-run after.

---

## 1. Baseline — what the audit actually found

The product experience is broad and mostly well-built: 1,694 lines of catalog
service, 37 product-detail tab components, variants with per-channel ordering,
multi-UPC barcodes, price history, bulk price ops, CSV import/export, compliance
fields, retail/wholesale field isolation. The problem was not missing features.
It was that **the product list asked the server the wrong questions and did the
rest in the browser.**

### 1.1 The headline defect: catalog search never worked in production

`GET /api/v1/catalog` parsed exactly five query parameters:

```ts
// src/modules/catalog/routes.ts — readQuery(), before
{ category, status, limit, offset, excludeMasters }
```

The catalog UI has always sent `q`:

```ts
// ProductsTab.load(), before
if (debouncedQ) params.set("q", debouncedQ);
```

`q` was not read. It was dropped on the floor. Typing in the box labelled "Name
or SKU" returned the same unfiltered page.

**Why it survived:** `web/mocks/mockHandlers.ts` *did* implement `q`. `npm run
dev` serves MSW mocks, so search worked perfectly in development and did nothing
in production. This is the exact failure mode `AGENTS.md` warns about ("Do not
use `npm run dev` as proof of production backend wiring") and the same class as
the "mock-masked" route drift in loop iterations #1 and #4.

**Reproduced before fixing** — two throwaway tests against real Postgres:

| Query | Expected | Actual (before) |
|---|---|---|
| `?q=Coca` over 3 products | total 1 | **total 3** |
| `?q=Findme` over 56 products | total 1 | **total 60** |

Both now pass.

### 1.2 Filters, sorting and counts were page-scoped

`ProductsTab` filtered by brand, tax class, age-restricted, product type and
price range in a `useMemo` over `products` — the 50 rows currently loaded — and
sorted the same array. The six metric tiles counted that array too, while
displaying catalog-wide `total` immediately beside them.

Consequences on any catalog larger than one page:

- "Brand: Coca-Cola" meant "…among the 50 rows on this page".
- Clicking a column header reordered the page, not the catalog.
- The Active/Draft/Archived/Masters/Variants/Restricted tiles were wrong, and
  wrong *next to a correct number*, which is worse than no number.
- `getProductType()` derived master/variant from `parent_product_id` values
  present **on the loaded page**, so a master whose children sorted onto page 2
  displayed as "Standalone".
- "Export CSV" serialised the loaded page. Exporting a 5,000-product catalog
  silently produced 50 rows.
- Bulk update fanned out one `PATCH` per selected product — 147 selected
  products meant 147 requests, no atomicity, and a failure the UI could only
  describe as "Some updates failed".

`POST /api/v1/catalog/bulk-update` (accepts up to 500 ids, manager-gated,
already tested) existed the whole time and was not being used.

### 1.3 The storefront could not see past its first fetch

`web/app/store/page.tsx` fetched `?status=active&limit=200` once, then filtered
and derived category pills client-side. A shopper searching for the 201st
product got "No products found" — the catalog was there, the page had never
asked for it. There was no pagination at all, and no error state.

### 1.4 Sorting was mouse-only

`SortTh` put `onClick` on a bare `<th>`: not focusable, not keyboard-operable,
not announced as actionable. Sorting the product table was impossible without a
pointer, against the WCAG 2.1 AA requirement in `AGENTS.md`'s Design System Rules.

---

## 2. What changed

### Backend — `src/modules/catalog/`

**Ranked search** (`buildProductSearch`). Matches across `name`, `sku`,
`barcode`, `brand`, `manufacturer`, `alternative_name`, `model_name`, `tags`,
`vendor_upc`, `category`, plus every row in `product_barcodes` (so a case or
alternate UPC scan resolves, not just the primary). Tokens AND together, which
is what makes `12 pack coke` return the 12-pack rather than everything
containing "coke". Relevance follows the documented precedence: exact
barcode → exact SKU → exact supplier SKU → SKU prefix → name prefix → brand
prefix → name contains → other. Active products win ties.

LIKE wildcards in user input are escaped — unescaped, a search for `50%` matched
the entire catalog.

**Server-side filters**: `brand`, `taxClass`, `ageRestricted`, `ecommerce`,
`minPrice`/`maxPrice` (dollars in, integer cents compared), `productType`
(derived in SQL across the whole catalog), `supplier` (preferred vendor id/name,
primary vendor, or any linked `product_suppliers` row). Unknown enum values now
return 400 instead of being silently ignored.

**Whitelisted sorting** (`productOrderBy`). Ten sort keys; `sort` never reaches
SQL as text. `NULLS LAST` in both directions so an unset brand or cost doesn't
fill the top of an ascending sort, and every ordering ends in `products.id` so
paging can't repeat or skip a row.

**`GET /api/v1/catalog/facets`** — data-driven filter options counted over the
whole matching set. Each dimension omits its own filter (`buildListWhere(omit)`),
which is what lets a user switch category after picking one instead of seeing
the facet collapse to their current selection.

**`variant_count`** on list rows, so "is this a master?" is answered per row
instead of inferred from page neighbours.

**Trigram indexes** for the newly-searchable columns, following the existing
guarded `DO $$ … EXCEPTION` pattern in `src/modules/search/index.ts` — on a host
without `pg_trgm` boot continues and search stays correct, just unindexed.
`products.name`/`products.sku` are already indexed by that module and were
deliberately not duplicated.

### Frontend

- `ProductsTab` — every filter, the sort and all counts are now query
  parameters. The client-side `visibleProducts` pass is gone. Active filters
  render as chips that each remove only themselves. Category/brand/supplier
  options and their counts come from the facets endpoint. Bulk update is one
  request. Export walks the filtered set server-side, or exports just the
  selection.
- `SortTh` — the control is a real `<button>` with `aria-sort` on the header.
- `store/page.tsx` — server-side search, category and pagination; facet-driven
  category pills; error and empty states.
- `web/mocks/mockHandlers.ts` — the mock now mirrors the real query, including
  relevance ranking and facets. This is the file whose divergence hid the
  original bug; keeping it honest is the point.
- `components/TableSkeleton.tsx` — one-line key fix (header labels are not
  unique; spacer columns pass `""` and collided, making React warn).

---

## 3. Verification

Run in this container against **real PostgreSQL 16** (embedded-postgres cannot
`initdb` as root here — the same constraint recorded in earlier audits), using
the same `PG_POOL_MAX=1` the repo's own runner sets.

| Gate | Result |
|---|---|
| Backend `typecheck` | PASS |
| Backend `npm test` | **916/916, 0 fail** (17 new tests here) |
| `npm run smoke` | PASS — 20/20 steps, full POS lifecycle |
| Web `typecheck` | PASS |
| Web `lint` | PASS — 0 warnings, 0 errors |
| Web `vitest` | **215/215 across 30 files** (9 new) |
| Web production build (`NEXT_PUBLIC_MOCK=false`) | PASS |
| `hygiene` | PASS — 2,203 files |
| `gap:scan` | PASS — 475 backend / 383 frontend paths, no unexplained gaps (this is what proves `/catalog/facets` resolves to a real route) |
| `authz:scan` | PASS — 49 route files, every mutating route guarded |
| `table:scan` | PASS — 166 names, no collisions |

### 3.1 Notes on how these were run

The full backend suite was **restarted from scratch after the last code change**
rather than reporting the number from an earlier run against stale code. The
first run (pre-`topLevel`) reached 473 tests with 0 failures and was discarded.

`catalog.test.ts` initially failed 5 of its new tests because they assumed an
empty catalog; `CatalogService.seed()` puts four demo products in `tnt_demo`
before any test runs. That was a fault in the tests, not the code — they now
assert against a catalog that contains those rows, which is the more realistic
shape anyway, since a filter has to behave correctly among rows it is not
selecting.

Locally the suite needs `PG_POOL_MAX=1` (what `scripts/test.ts` sets) — each
test builds a whole app with its own pool, and the default of 10 exhausts
Postgres's 100-connection limit partway through this file.

### 3.2 Proof the fix is real, not asserted

The two search defects were written as tests **first**, run against unmodified
code, and confirmed failing (`total 3 !== 1`, `total 60 !== 1`) before any
change. The permanent regression tests in `catalog.test.ts` cover the same
behaviour.

The frontend tests assert on **the requests the component makes**, not on
rendering — that is where the defect lived. `expect(apiPatch).not.toHaveBeenCalled()`
in the bulk-update test fails against the previous implementation by construction.

---

## 4. Deliberately not changed

- **`src/modules/ecommerce`'s `catalog()` (`LIMIT 500`, no pagination).** No
  frontend page calls `/api/v1/ecommerce/catalog` — only the MSW mock references
  it. The storefront reads `/api/v1/catalog`. Left alone rather than rewritten
  speculatively; noted as a latent scaling issue if that route is ever adopted.
- **Storefront scoping to `ecommerce = 1`.** Products default to that flag unset
  and nothing in the seed sets it, so filtering the storefront by it would show
  zero products. Whether the shop should list only online-flagged products is a
  merchandising decision, not something to change while fixing discovery.
- **`ProductsTab`'s raw `<input>`/`<select>`/`<button>` markup.** `AGENTS.md`'s
  Design System Rules require the shared primitives, and this file predates that
  and does not use them. Converting it would change rendered heights
  (`Select` `md` is `h-8`; this page's deliberate "Spec:" chrome is `h-9`) and
  visually regress a page nobody asked me to restyle. Left consistent with the
  file, flagged here as real pre-existing debt rather than silently widened
  scope. New controls added in this change follow the file's existing pattern
  and all carry labels, focus rings and ≥36px targets.
- **Product detail (`catalog/[id]/**`), product creation, import/export
  pipelines, saved views, quick-action menus.** Out of this slice. The directive
  asks for improvements one at a time, fully finished; these are the next ones,
  not half-done ones.

---

## 5. Performance, measured

Run by booting the real app (real migrations, real indexes) and timing the
actual service methods, not hand-written SQL. Numbers below are from a quiet
box; an earlier set taken while the test suite was running was discarded as
too noisy to reason from — in it the *cheapest* variant read slower than a more
expensive one.

At **10,000 products**, everything except search is comfortably fast:

| Operation | Latency |
|---|---|
| filter, category + brand | 5.5 ms |
| filter, price range | 5.8 ms |
| sort, price desc (page 1) | 20.2 ms |
| sort, name asc, deep page (offset 9,000) | 57.3 ms |
| `productType=master` (derived in SQL) | 10.9 ms |
| facets, unfiltered | 43.6 ms |
| facets, scoped to a search | 108.9 ms |
| **search, single token** | **120.7 ms** |
| **search, two tokens** | **160.3 ms** |

**Search is the slow path — ~120 ms at 10k, ~200 ms at 50k.** "Designed for
large catalogs" was too generous a claim: the result is correct and paginated,
but the search path is not sublinear.

Two candidate explanations were ruled out rather than assumed:

- The trigram indexes **are** created correctly — all seven present in
  `pg_indexes` for the test schema, `pg_trgm` installed.
- The raw predicate is fast (1.2 ms). `LIMIT 50` lets a sequential scan
  short-circuit once it has enough rows.

The cost is in the parts that *cannot* short-circuit: the `COUNT(*)` that
produces `total`, and the `ORDER BY` across every match.

### One fix this justified

The alternate-barcode clause was a correlated `EXISTS`. Inside an `OR`, Postgres
cannot flatten that into a semi-join, so it runs as a per-row SubPlan and
re-queries `product_barcodes` for every row the column predicates did not
already match. Rewritten as `products.id IN (SELECT …)`, which evaluates the
inner scan once and hashes the result:

| Query | `EXISTS` (before) | `IN` (after) |
|---|---|---|
| rows, 50k catalog | 201.9 ms | **122.1 ms** |
| `COUNT(*)`, 50k catalog | 182.0 ms | **162.6 ms** |

~26% off a search request end to end. Equivalence was checked in both
directions before adopting it, including the case that would break if the
rewrite were wrong: a term matching **only** an alternate barcode returns 10
rows under both forms (6,250 = 6,250 on a common term). The barcode tests in
`catalog.test.ts` cover the same behaviour.

## 6. Known limitations

- **Not measured at 100k.** Tested at 10k and 50k. Search cost grows roughly
  linearly, so ~100k is expected around 400 ms for the search path — projected,
  not measured, and stated as such. If the catalog gets there, the fix is a
  materialized `search_text tsvector` column with a GIN index, which turns the
  OR-chain into one indexed lookup. Not done here: it is a schema change with
  its own maintenance story, and it should be driven by a real catalog rather
  than a synthetic one.
- **One measurement is not attributable.** The "variant_count subquery on 50
  rows — 75.6 ms" reading had no control for the `ORDER BY name` over 50k rows
  in the same query, so it cannot be blamed on `variant_count`. Recorded, not
  acted on.
- **Playwright e2e not run.** Correcting an earlier claim in this audit: the
  e2e job is gated `if: github.event_name == 'push'`, so it does **not** run on
  a pull request. The golden paths run after the merge to `develop`, not before.
- **Node 22 here, 24 in CI.** The web suite passed anyway; the three documented
  jsdom `FileReader` failures did not occur.
