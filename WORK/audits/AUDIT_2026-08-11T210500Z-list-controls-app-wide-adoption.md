# AUDIT 2026-08-11T210500Z — application-wide list-bar adoption, POS search fix, ProductsTab state migration

Session: Claude Code web — `claude/ascend-ui-redesign-f05uhs` (PR #231, continued)
Directive: Sri, 2026-08-11 (follow-up) — finish the ASCEND-wide implementation; do not
stop at the shared primitive.

Continues `AUDIT_2026-08-11T192040Z-list-controls-design-system.md`, which built
`ListControls`/`useListQuery` and migrated 3 pages. This pass took adoption to
**24 of 25 list toolbars**, fixed two real defects found on the way, and migrated
`ProductsTab` onto the unified state model.

---

## 1. Adoption — before this pass → after

| Measure | Session start | Prior pass | Now |
|---|---|---|---|
| Pages using `ListControls` | 0 | 3 | **24** |
| Pages using `useListQuery` | 0 | 0 | **1** (`ProductsTab`) |
| List toolbars with a search box, unmigrated | 24 | 21 | **1** (deliberate — §4) |
| `PageShell` adopters | 5 | 5 | 5 (unchanged) |
| `DataTable` adopters | 5 | 5 | 5 (unchanged) |
| Files hand-rolling `<table>` | 109 | 109 | **109 (unchanged)** |

The table row is the honest one: **no table was migrated to `DataTable` in this work.**
See §6.

## 2. Two real defects found while migrating

### 2.1 POS browsed 50 products and searched only those 50

`ProductGrid.tsx` requested `/api/v1/catalog?pageSize=200`. The endpoint reads `limit`,
so the parameter was dropped and the register browsed the default **50** products. On any
catalog larger than that the grid showed a fraction of the shop and nothing said so.

Worse, its search then ran `.filter()` over those same loaded rows. **Scanning a barcode
for the 201st product returned "no results" at the till, with the product in stock**, and
the cashier could not distinguish that from a genuinely unknown item.

Fixed: correct parameter, plus a real server query (ranked, so an exact UPC comes back
first) with the local filter retained as the instant first response. A failed lookup
leaves local matches on screen rather than blanking the grid.

**Proof:** 3 of the 4 new tests in `tests/terminalProductGrid.test.tsx` fail against the
old implementation. The 4th (no request for an empty box) guards over-fetching and
correctly passes either way.

### 2.2 Two pages fired a server request per keystroke

`automotive` and `healthcare` called `load(v)` directly from the input's `onChange`.
Both are now debounced — and their separate mount-only `load()` was **removed**, because
the debounced effect already runs on mount and keeping both fetched the list twice on
every page open.

### 2.3 Three dead primary buttons removed

`+ Add Location` (warehouse), `+ New Contract` (pricing) and `+ New Code` (promotions)
were styled as primary actions with **no `onClick`, and never had one**. Removed, not
restyled — the same call `CustomerTable` already made for its three dead buttons, and the
directive's "no fake/non-functional UI controls remain". Promotions' `+ New Campaign` is
real and was kept.

## 3. `ProductsTab` → `useListQuery` (the requested migration)

14 pieces of query state plus a `withPageReset` wrapper that every setter had to remember
to be wrapped in, and a hand-listed `clearFilters`. Mapped as:

| Was | Now |
|---|---|
| `filterStatus/Category/Brand/Supplier/TaxClass/AgeRestricted/ProductType`, `priceMin`, `priceMax` | `filters.*` via `DEFAULT_FILTERS` |
| `search` + `debouncedQ` + a manual 300ms effect | `query.search` / `query.debouncedSearch` |
| `searchField` | `query.searchField` |
| `sortCol` + `sortDir` + hand-rolled `handleSort` | `query.sort` / `query.dir` / `toggleSort` |
| `page` + `usePersistedPageSize(...)` | `query.page` / `query.pageSize` (hook gained `pageSizeStorageKey` so persistence was preserved, not dropped) |
| `hasFilters` (hand-enumerated) | `query.isDirty` |

Behaviour verified rather than assumed — all 11 pre-existing tests still pass unchanged,
plus 4 new ones covering exactly what this migration risks:

- one list request per filter change, carrying the **new** offset (the old effect-based
  reset fetched twice — once for the stale page, once after the reset landed);
- first render honours a deep link (`?products_q=…&products_field=sku&…`) — the filtered
  request is the *first* one, not a correction after an unfiltered flash;
- `replaceState`, not push — `window.history.length` is unchanged after filtering;
- Reset clears query **and sort** and the URL together. The old hand-written
  `clearFilters` left an explicit sort applied.

## 4. The one toolbar deliberately NOT migrated

`catalog/[id]/_components/VariantsTab.tsx` — an autofocused typeahead **inside a modal**
for picking a product to add as a variant. It has no filters, no reset and no result set
to count; replacing it with a filter bar would trade a working typeahead for chrome. The
same judgement applies to the "Add Products to Category" picker on the category detail
page (whose *other* search box, the real product-list toolbar, **was** migrated).

Recorded in `ENTERPRISE_UX_SPEC.md` §0 as a rule, so the next agent does not "fix" it.

## 5. The rule that shaped most of these migrations

Most Ascend list endpoints implement `q` as a single free-text parameter with **no
per-column scoping**. Those pages therefore get **no column selector at all** —
`service-orders`, `loyalty/members`, `documents`, `inventory/errors`, `serial-numbers`,
`catalog/categories/:id/products`, `automotive`, `healthcare`.

Adding a selector "for consistency" and filtering the loaded page behind it would be
strictly worse than omitting it: a control that *appears* to narrow the whole list while
actually narrowing one page. Only the catalog has a true server-side `searchField`.

Where a page loads its whole set and filters in the browser, column scoping **is** real
(it narrows which field is compared across every loaded row) and every such page carries
a comment saying it must move server-side if that endpoint ever paginates: inventory
catalog/ledger/locations, team, returns, vendors, customers, delivery, pricing ×2,
warehouse, golf ×3, promotions codes.

## 6. NOT done — remaining scope, exactly

- **109 files still hand-roll `<table>`. Zero were migrated to `DataTable`.** This is the
  largest remaining item and it was not attempted: each migration is a per-table
  behavioural port (row actions, expansion, bulk selection, custom cells), not a
  find-and-replace, and doing it in the same PR as 24 toolbar migrations would have made
  both unreviewable. `DataTable` and `PageShell` adoption are unchanged at 5 each.
- **`useListQuery` is adopted by exactly one page.** The other 23 kept their existing
  local state and gained only the shared bar. They work, but they do not get URL state,
  and their page-reset guarantees remain per-page rather than structural.
- **Dashboards, forms, reports, settings, detail pages, drawers, modals and confirmation
  dialogs** received no design treatment in this pass.
- **Responsive/iPad**: the shared bar is touch-sized (≥44px) and wraps, and POS search now
  covers the whole catalog, which is the biggest tablet-workflow win here. No device-matrix
  pass, no landscape/portrait audit, no tablet-specific table treatment was done.
- **Accessibility**: asserted for `ListControls` (roles, focus return, Escape, live region,
  announced filter counts, labelled scope selector) in `tests/listControls.test.tsx`. The
  migrated pages inherit that for their toolbar only — no app-wide a11y sweep, no contrast
  audit of the pages themselves.
- **Playwright/e2e**: NOT run. No built-and-served real-stack pair in this container; CI
  runs the golden paths on the PR. No fabricated results.
- **Pre-existing hard-coded hex** remains in `ProductsTab.tsx` outside the replaced region
  (its metric strip and hand-rolled table) and in most migrated pages' table markup. The
  bars themselves are token-clean; the tables around them are not, and the right fix is
  the `DataTable` migration above rather than recolouring in place.

## 7. Gates

See §Gates in `WORK/LOCK.md` for this claim. Every number there is from a run in this
container against real PostgreSQL 16, with the pre-change baseline stated where one
exists. One environmental failure is recorded honestly: a mid-session backend run
reported 811 failures, which was `connect ECONNREFUSED 127.0.0.1:5432` — the container's
Postgres had stopped, not a code regression. It was restarted and the suite re-run.
