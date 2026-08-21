# AUDIT 2026-08-11T192040Z — application-wide list UX: shared search/filter/reset + column-scoped search

Session: Claude Code web — `claude/ascend-ui-redesign-f05uhs`
Directive: Sri, 2026-08-11 — application-wide UI/UX redesign against the supplied
reference screens (search bar with column selector, filter button, reset, consistent
tables/forms, responsive, accessible, no fake controls).

This audit records what was **actually changed and verified**, and — more importantly —
what the directive asked for that is **not** done. The directive's own definition of done
says the task is not complete because a few pages look better; this session did not
complete it, and says so below rather than reporting a green tick.

---

## 1. What the audit of the existing UI found

The starting assumption ("build a design system") was wrong: Ascend already has one.
`docs/ENTERPRISE_UX_SPEC.md` §0 defines "Structure & Signal", `web/app/globals.css` holds
the token layer, `web/tailwind.config.ts` points at it, and `PageShell` / `DataTable` are
capable primitives. The real defect is **adoption**, measured on this tree:

| Measure | Count |
|---|---|
| Route `page.tsx` files under `web/app` | 123 |
| Files that hand-roll `<table>` | 109 |
| Files that use the `DataTable` primitive | 5 |
| Files that use the `PageShell` primitive | 3 |
| Pages with their own search input | 24 |
| Pages offering a **search-column selector** | 0 |

So the gap the directive names — a standard search bar, contextual column selection,
a filter popover, a working reset — genuinely did not exist anywhere, while the
*styling* system it would live in already did. The work was therefore scoped as
"build the missing shared control and the backend contract under it", not
"introduce a design system".

## 2. The headline defect: the column selector had no backend

`GET /api/v1/catalog` accepted `q` (fixed by PR #229 on 2026-08-11) but had no notion of
*which column* to search. A UI column selector would have been decoration — the exact
"fake control" the directive forbids. Fixed properly:

- `src/modules/catalog/service.ts` — `SEARCH_FIELD_COLUMNS` maps each selectable field to
  the concrete product columns it searches; `buildProductSearch()` takes a `field` and
  narrows the predicate. `barcode` deliberately still searches the `product_barcodes`
  table (alternate/case UPCs), because scoping to "UPC" and then failing to find a case
  UPC reads as a bug.
- `src/modules/catalog/routes.ts` — `readSearchField()` **400s** on an unknown value.
  Silently widening back to `all` returns MORE rows than asked for and looks like a
  broken filter.
- `contracts/openapi.yaml` — `searchField` documented on both `/catalog` and
  `/catalog/facets`, with the enum and the rejection behaviour.
- `web/mocks/mockHandlers.ts` — the MSW mock mirrors the same column map. This matters:
  the previous `q` defect survived for months precisely because the mock implemented `q`
  and the server did not, so `npm run dev` looked correct.

### Proof the tests bite

The five new backend tests were run against the **unmodified** route layer
(`searchField` parsing commented out) before being trusted:

```
not ok 59 - searchField: scoping to a column excludes matches from other columns
not ok 60 - searchField: barcode scope drops name matches but keeps alternate barcodes
not ok 61 - searchField: an unknown field is rejected, not silently widened
not ok 62 - searchField: facet counts describe the same scoped set as the list
# tests 76 / pass 72 / fail 4
```

The fifth (`'all' and an absent field behave identically`) passes either way **by
design** — it asserts an equivalence, not a narrowing, and guards the default path
against regression. Recorded here rather than counted as a discriminator.

## 3. What was built

- **`web/components/ListControls.tsx`** — the one search / column-scope / filter /
  reset bar. Native `<select>` for the column scope (keyboard, SR and mobile behaviour
  for free); filter popover is a labelled `role="dialog"` that closes on Escape and
  returns focus to its trigger; Reset is *disabled, not hidden*, when nothing is active;
  active-filter count is announced, not just rendered as a bare number; result count
  lives in a polite live region and names the active scope ("2 results in SKU").
  Also exports `FilterField` + `filterControlClass` so every page's popover matches.
- **`web/hooks/useListQuery.ts`** — the unified state model. Guarantees that every
  change to search / scope / filter / sort / page-size returns to page 1 **in the same
  render** (not in an effect, which fetches twice), debounces the search term separately
  from the box, restores filters wholesale from `defaultFilters` on reset (so a filter
  added later is covered without editing `reset()`), and optionally syncs to the URL with
  `history.replaceState` rather than a router push.

## 4. Pages migrated

| Page | Before | After |
|---|---|---|
| `catalog/_components/ProductsTab.tsx` | 9 inline controls + "More filters" disclosure + bespoke "Clear filters" | `ListControls`; **7-column scoped search wired to the server**; filters in the popover; reset also clears scope and sort |
| `customers/_components/CustomerTable.tsx` | `Input` + `Select` + conditional "Clear filters" | `ListControls`; 5-column scope over the loaded set |
| `vendors/page.tsx` | raw `<input>` + 5 `aria-pressed` pill buttons, all `slate-*` classes | `ListControls`; 6-column scope; status filter in the popover; tokens |

`ProductsTab`'s reset previously left the sort untouched, so "Clear filters" could leave
the list reordered with nothing to show for it. It now clears sort and scope too.

### Honest note on client-side scoping

Customers and Vendors filter an already-loaded set in the browser. Their column scope is
therefore real (it narrows which fields are compared across the **whole** loaded set),
but it is *not* a server contract. Both files carry a comment saying so: if either
endpoint ever paginates, the scope silently becomes "within this page" and must move
server-side. Only the catalog's scope is a true API parameter today.

## 5. Gates (this container, real PostgreSQL 16, Node 22)

| Gate | Result |
|---|---|
| Backend `npm run typecheck` | PASS |
| Backend `npm test` | **940/940, 0 fail** (includes the 5 new `searchField` tests) |
| Backend `npm run smoke` | **20/20, full POS lifecycle end-to-end** |
| Web `tsc --noEmit` | PASS |
| Web `next lint` | PASS — 0 warnings, 0 errors |
| Web `vitest run` | **273/273 across 34 files** (baseline 243/32 — +30 tests, 0 failures) |
| Web `NEXT_PUBLIC_MOCK=false next build` | PASS |
| `hygiene` | PASS |
| `gap:scan` | PASS |
| `contract:scan` | PASS |
| `authz:scan` | PASS |
| `table:scan` | PASS |

Baselines were captured **before** any edit (web 243/243; catalog backend green) so the
deltas above are differences, not absolutes quoted from a clean tree.

## 6. NOT done — the directive's remaining scope

This is the important section. The directive asked for an application-wide redesign
across ~12 module families; this session delivered the shared control, its backend
contract, and **3 of 24** pages that have a search box.

- **21 list pages still have their own search bar** and no column scope:
  `inventory/_components/{CatalogTab,LedgerTab}`, `inventory/{locations,serials}`,
  `inventory/errors/_components/ErrorsListTab`, `team`, `warehouse`, `returns`,
  `service-orders`, `pricing`, `loyalty/_components/MembersTab`,
  `documents/_components/AllDocumentsTab`, `delivery/_components/ShipmentsPanel`,
  `catalog/{promotions,categories/[id]}`, `catalog/[id]/_components/VariantsTab`,
  `golf/{bookings,members,pro-shop}`, `automotive`, `healthcare`.
- **109 files still hand-roll `<table>`** rather than using `DataTable`. Untouched.
- **`PageShell` adoption is still 3 pages.** Page headers, breadcrumbs and width are
  still per-page decisions everywhere else.
- **`useListQuery` is not yet used by any page.** It is built, exported and tested
  (15 tests), but the three migrated pages kept their existing local state so the
  migration stayed reviewable. Adopting it is the next step, and is what unlocks URL
  state / deep-linkable filters.
- **Dashboards, forms, POS/terminal, reports, settings** — not touched.
- **Responsive/iPad and accessibility passes** were done *for the new component only*
  (touch targets, focus, roles, live regions, Escape/focus-return are asserted in
  `tests/listControls.test.tsx`). No app-wide audit was run.
- **Playwright e2e** — not run. No built-and-served real-stack pair in this container;
  CI runs the golden paths on the PR.
- **Server-side search for customers/vendors** — not built. Both still load their full
  list; that is pre-existing behaviour, not a regression introduced here.
- **Hard-coded hex remains in `ProductsTab.tsx` outside the region replaced here.** The
  new bar is token-clean (verified: 0 raw hex, 0 raw `slate-*`/`gray-*` in
  `ListControls.tsx` and `useListQuery.ts`), and the filter-bar region it replaced was
  converted (`#E8E8E8`→`border-line`, `#555`→`text-content-secondary`, `bg-brand-50`→
  `bg-accent-50`). The rest of that file still violates the token rule at
  `ProductsTab.tsx:472,474,479,483,489,705,720,730,754,755` and below — the card header,
  the metric strip and the whole hand-rolled `<table>` (`#111`, `#888`, `#FAFAFA`,
  `#F0F0F0`, `bg-slate-50`, `bg-blue-50`, `hover:bg-[#4849d0]`). Deliberately not fixed
  in this pass: converting them means restyling a 300-line table in the same diff as a
  control swap, which would make both unreviewable. It is a real outstanding violation,
  not an accepted exception — and the correct fix is migrating that table to `DataTable`
  rather than recolouring it in place.

## 7. Blockers

None. The remaining work is volume, not difficulty: the control, the contract pattern
and the tests now exist, so each further page is a mechanical migration plus (where the
list is server-paginated) the matching `searchField` on its endpoint.
