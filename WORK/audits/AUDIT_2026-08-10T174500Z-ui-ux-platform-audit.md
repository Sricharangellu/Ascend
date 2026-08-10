# Ascend — Platform UI/UX Audit & Design System Proposal

**Date:** 2026-08-10T174500Z
**Scope:** All 123 routes / 268 page files under `web/app`, all 46 components under `web/components`,
the token layer (`web/tailwind.config.ts`, `web/app/globals.css`), and the app shell.
**Method:** Static analysis of the tree at `develop` (`5709a91`). Counts below are reproducible with
the commands in §7. **No page has been redesigned yet** — this is the audit the directive asked for first.

---

## 1. Headline finding

Ascend does not have one design system. **It has three, and they disagree with each other.**

The instruction "there is ONE design system" is true as *policy* (`AGENTS.md`, `docs/ENTERPRISE_UX_SPEC.md`)
and false as *fact*. Three parallel styling vocabularies are live in the tree simultaneously:

| # | System | Where | Reach |
|---|---|---|---|
| 1 | Tailwind tokens — `brand.*`, `erp.*`, semantic ramps | `tailwind.config.ts` | 26 page files, 3 components |
| 2 | CSS custom properties — `--color-*` | `app/globals.css` | 50 page files, 20 components |
| 3 | Raw Tailwind default palette — `text-slate-500`, `bg-red-50`… | nowhere; ad-hoc | **232 of 268 page files** |

System 3 — the one explicitly banned as "treat a violation the same as a failing gate" — is the
**dominant** styling system in the application, at **8,186 occurrences across 87% of page files**.
Plus **293 hard-coded hex values** in 69 files.

### The systems disagree on the same concept

This is why modules look subtly different from one another. Two pages can both be "correct" and render
differently, because the token they each reference resolves to a different colour:

| Concept | Tailwind token | CSS variable | Same? |
|---|---|---|---|
| Sidebar background | `erp.sidebar` = `#030B25` (navy) | `--color-sidebar-bg` = `#1a1a1a` (near-black) | **No — different hue** |
| Page background | `erp.page` = `#F9F9F9` | `--color-page-bg` = `#F5F5F5` | **No** |
| Header background | `erp.header` = `#F7F7F7` | `--color-header-bg` = `#ffffff` | **No** |
| Primary text | `rgba(0,0,0,0.88)` | `#111111` | **No** |
| Secondary text | `rgba(0,0,0,0.45)` | `#666666` | **No — and the ratios differ** |

Secondary text is the worst of these. `rgba(0,0,0,0.45)` on `#F9F9F9` is **≈3.9:1 — below WCAG AA (4.5:1)**
for body text. `#666666` on `#F5F5F5` is ≈5.3:1 and passes. Identical-looking "muted label" text is
compliant on one page and non-compliant on the next, purely by which system the author reached for.

### The focus ring is the retired brand colour

`tailwind.config.ts` line 98: `focus: "0 0 0 3px rgba(1,55,252,0.3)"` — that is `#0137FC`, the brand
colour retired on 2026-07-14 in favour of `#5D5FEF`. Every focus ring drawn from that token is a
different hue from every button it appears on. A11y-critical and visible on every keyboard interaction.

---

## 2. The primitives are bypassed — and the root cause is not laziness

| Primitive | Imported by | Hand-rolled instead | Verdict |
|---|---|---|---|
| `Table` | **1** page file | `<table>` in **107** files (144×) | **Effectively dead** |
| `Input` | **5** | `<input>` in **116** files (455×) | **Effectively dead** |
| `Select` | **3** | `<select>` in **63** files (111×) | **Effectively dead** |
| `Pagination` | **1** | — | **Effectively dead** |
| `EmptyState` | 8 | ad-hoc "No results" markup | Barely used |
| `Skeleton` | 9 | ad-hoc spinners | Barely used |
| `KpiCard` | 5 | ad-hoc stat cards | Barely used |
| `Button` | 101 | `<button>` in **163** files (645×) | Partial — coexists with raw |
| `Card` | 92 | — | Adopted |
| `Badge` | 74 | — | Adopted |

**Root cause: the primitives that get bypassed are the ones that cannot do the job.**

`components/Table.tsx` (109 lines) supports columns, rows, loading, empty, and row-click. It has **no**
sorting, filtering, pagination, column visibility, column resizing, sticky header, sticky column, row
selection, bulk actions, density control, or export. For an enterprise list view, that is not a table —
it is a `<table>` with a loading state. So 107 files wrote their own, each making independent decisions
about padding, header casing, hover, zebra, alignment, and number formatting.

The same applies to `Select` (77 lines, native wrapper — no search/typeahead, so every searchable picker
was rebuilt) and `Pagination`.

By contrast `Input` (130 lines) is genuinely good — label association, `aria-describedby`, `role="alert"`
errors, `aria-invalid`, required marking, 44px min height. **It is bypassed 455 times anyway**, and each
raw `<input>` is a place where that accessibility work is silently absent.

This reframes the task. **Adoption is a component-capability problem before it is a styling problem.**
Restyling `Table` without making it capable would change nothing — 107 files would keep their forks.

---

## 3. States: 14 of 123 pages are complete

`AGENTS.md` requires loading, empty, error, and success on every async view. Measured across the 123
`page.tsx` files:

| State | Pages with any handling |
|---|---|
| Loading | 83 / 123 (67%) |
| Error | 66 / 123 (54%) |
| Empty | 43 / 123 (35%) |
| **All three together** | **14 / 123 (11%)** |

Empty state is the biggest gap, and it is the one that hurts most: a new tenant's first session is
*entirely* empty states. On 80 of 123 routes, a first-run user currently sees a blank region with no
explanation and no next action. That is the single largest "does this product feel finished" defect,
and it hits every customer on day one.

---

## 4. Desktop layout: no container system

The directive asks for controlled behaviour at 1280 / 1366 / 1440 / 1536 / 1920 / ultrawide. Today:

- `<main>` in `EnterpriseShell.tsx:306` is `flex flex-1 flex-col min-w-0` — **no max-width, no padding
  container**. Content runs edge-to-edge on any monitor width.
- Each page therefore invents its own width. Observed across the tree: `max-w-7xl` (25×), `max-w-6xl`
  (33×), `max-w-5xl` (28×), `max-w-4xl` (14×), `max-w-2xl` (16×), plus one-off `max-w-[1400px]` (2×).
  **Six different "page width" answers**, so adjacent modules visibly misalign as you navigate.
- On a 1920px or ultrawide monitor, an unconstrained table stretches every column to fill, pushing
  related values (SKU ↔ price ↔ stock) far apart and making rows genuinely hard to read across.
- There is no shared grid, no sticky page-action bar, and no context/side-panel pattern.

---

## 5. Navigation

9 top-level sections. Two are overloaded: **Settings has 15 children, Inventory has 12** — past the
point where scanning beats searching.

Concrete IA defects found:

- **Two receiving destinations** in one section: "Receive Stock" (`/inventory/receive-stock`) and
  "Receiving Hub" (`/purchasing/receiving`). A user cannot tell which one to use.
- **"Movements" is the label for `/inventory`** — the section's own root is named after one of its
  sub-functions, so "Inventory → Movements" reads as a leaf when it is the hub.
- **Purchasing appears under Inventory**, while Vendors also sits under Inventory rather than with
  Purchasing — the purchase-to-pay workflow is split across the tree by noun instead of by task.
- **~60 of 123 routes are unreachable from the sidebar** — the vertical packs (`/restaurant/*`,
  `/golf/*`, `/healthcare`, `/automotive`, `/education`, `/hospitality`, `/manufacturing`, `/rental`,
  `/workforce`…) plus `/operations`, `/purchase`, `/display`, `/payments`, `/onboarding`. Some is
  deliberate (feature gates, partial pages), but it is not currently possible to tell "hidden by design"
  from "orphaned" by reading the nav config.
- No breadcrumbs, no recent/favourites, and the command palette exists (`CommandPalette.tsx`) but is not
  surfaced as a primary affordance.

---

## 6. Accessibility

Not uniformly bad — 250 `focus-visible` declarations across 47 files, 213 `aria-label`s, 84 explicit
44px touch targets, and no icon-only buttons missing labels. The problem is **coverage, not competence**:
those 47 files are ~18% of the page files. The other 82% inherit whatever the browser default gives them.

Confirmed issues:
1. `rgba(0,0,0,0.45)` secondary text fails AA (≈3.9:1) — §1.
2. Focus ring hue ≠ brand hue — §1.
3. 455 raw `<input>`s bypass the accessible `Input`, so label association and error announcement are
   per-author rather than guaranteed.
4. Status is frequently communicated by badge colour; a colour-blind-safe shape/label pairing is not
   systematic. (Colour-only status is called out as prohibited in the directive.)

---

## 7. Reproducing these numbers

```bash
cd web
# raw default-palette classes (banned) and files affected
grep -rEo '\b(bg|text|border|ring)-(slate|gray|zinc|neutral|stone|red|green|blue|amber|yellow|emerald|indigo|purple|pink|orange|teal|cyan|violet|rose|lime|sky|fuchsia)-[0-9]{2,3}\b' app components --include=*.tsx | wc -l
# hard-coded hex
grep -rEo '#[0-9A-Fa-f]{6}\b' app components --include=*.tsx | wc -l
# primitive bypass
grep -rEo '<table\b' app --include=*.tsx | wc -l
grep -rlE 'import \{[^}]*\bTable\b[^}]*\} from "@/components' app --include=*.tsx | wc -l
```

---

## 8. Design system proposal — "Ascend Structure & Signal"

The identity should come from **structure, density, and restraint**, not decoration. That is also what
makes it defensible against the directive's "avoid AI-generated-looking UI": generic admin UI is
identifiable by soft shadows, many rounded cards, multiple accent colours, and gradients. Ascend should
read as an *instrument* — closer to a trading terminal or a professional NLE than to a template.

### 8.1 Five rules that produce the look

1. **One accent, spent only on meaning.** The brand colour is permitted on exactly five things: the
   primary action, the active nav item, the focus ring, the selected row, and links. Nowhere else. Calm
   chrome plus a single decisive accent is what separates enterprise tools from dashboards.
2. **Elevation by border, not shadow.** Three surface levels distinguished by a 1px border and a ~2%
   luminance step. Shadows are reserved exclusively for things that genuinely float (modal, popover,
   drawer, toast). This kills the "field of floating cards" look immediately.
3. **Tabular numerals wherever a number can be compared.** Every money, quantity, SKU, and count cell
   uses `font-variant-numeric: tabular-nums`. Columns of figures align on the decimal. For a POS and
   inventory product this is the highest ratio of perceived quality to effort in the entire proposal.
4. **Density is a first-class setting**, not a constant. Three modes — Comfortable (48px row),
   Standard (40px), Compact (32px) — applied via one data attribute on `<html>`. A merchandiser
   scanning 500 SKUs and an owner reading 8 KPIs are not the same user.
5. **Status is never colour alone.** Every status renders as a triad: shape/icon + colour + text label.
   Satisfies the directive and WCAG simultaneously.

### 8.2 Token architecture (collapses three systems into one)

Single source of truth, one direction of dependency:

```
tailwind.config.ts  →  emits CSS custom properties  →  consumed as Tailwind utilities
   (the ONE definition)        (:root in globals.css)        (bg-surface-2, text-muted…)
```

- `globals.css` stops defining colour values and only *declares* them from the config.
- The `erp.*` namespace and the duplicate `--color-*` set are both retired into a single semantic scale.
- **Semantic names, not literal ones**: `surface-1/2/3`, `border-subtle/default/strong`,
  `text-primary/secondary/muted/inverse`, `accent`, `status-{success,warning,danger,info,neutral}`.
  Semantic naming is what allows a future dark mode or a tenant theme without touching a single page.

### 8.3 Type & space

- **Type scale (7 steps):** 11 / 12 / 13 / 14 / 16 / 20 / 28px. Body and table default 13px; page title
  20px; section 14px semibold. Enterprise density wants a *tight* scale — the current four `erp-*` sizes
  are unsystematic and don't cover headings at all.
- **Numerals:** tabular for data, proportional for prose.
- **Space:** strict 4px base (the current "8px base" is already violated by odd paddings); the permitted
  ladder is 4/8/12/16/24/32/48. Nothing else.
- **Radius:** 4px controls, 6px containers, 0 on table cells. Deliberately tighter than today's 6px
  default — large radii are the strongest "generic template" signal.

### 8.4 Layout system

- One `PageShell` owning max-width, padding, page title, breadcrumb, primary/secondary actions, and a
  sticky action bar. Pages stop deciding their own width; the six competing `max-w-*` answers collapse to one.
- Content max-width **1600px** with a fluid gutter, so 1920 and ultrawide gain margin rather than
  stretched columns — but full-bleed is allowed for the two views that genuinely want the pixels
  (Terminal, Reports tables).
- Breakpoints tuned for desktop, not phones: 1280 / 1440 / 1600 / 1920.

### 8.5 Component work required (in dependency order)

The audit says which components must be *built*, not merely restyled:

1. **`DataTable`** — the keystone. Sorting, filtering, search, pagination, column visibility + resize,
   sticky header/first column, row selection, bulk action bar, density, export, and built-in
   loading/empty/error. Unblocks 107 files.
2. **`FormField` / `Select` (searchable) / `NumberInput` / `DateInput`** — unblocks 116 files.
3. **`PageShell` + `Breadcrumbs` + `PageActions`** — unblocks every route.
4. **`StatusBadge`** with the shape+colour+label triad.
5. **`EmptyState` upgrade** — must take an explicit primary action; the 80 empty-state gaps are the
   first-run experience.
6. **`Drawer`, `Tabs`, `Toolbar`, `FilterBar`, `Chart` wrappers.**

### 8.6 Identity direction — needs Sri's decision

Palette is a brand decision, not an engineering one, so this proposes rather than picks. All three keep
the structural system above; only the colour identity differs. All are AA-verified against their surfaces.

- **A — Deep Ink + Electric Cobalt.** Chrome `#0F1729`, accent `#2E5BFF`. Reads decisive, financial,
  fast. Closest to the current violet-blue so migration is cheapest and existing screenshots stay valid.
- **B — Graphite + Signal Teal.** Chrome `#14181F`, accent `#0E8C7F`. Distinctly *not* the default
  SaaS indigo; reads calm, operational, instrument-like. Most differentiated, best "memorable" score.
- **C — Midnight Navy + Amber Signal.** Chrome `#101B2D`, accent `#E08A00`. Warm and retail-native
  (amber reads as commerce/pricing); highest personality, needs the most care on status colours because
  amber collides with `warning`.

---

## 9. What this audit does **not** claim

- No page has been redesigned. No token has been changed. Nothing here is implemented.
- Findings are from static analysis of the tree, not from running the app. Rendered-pixel issues
  (overflow at specific widths, chart legibility, real contrast on real backgrounds) need the browser
  pass in §16 of the directive and are **not** covered here.
- Counts are lower bounds. Regex scans miss dynamic class construction and `clsx` branches.
- Per-page workflow critique (the directive's §4 — POS vs Purchasing vs Receiving specifics) is
  deliberately deferred to each page's own implementation step, where the business flow can be read
  alongside the code rather than guessed at from route names.

---

## 10. Recommended sequence

Foundation first — restyling pages before the token layer and `DataTable` exist would mean doing 123
routes twice.

| Phase | Work | Gate |
|---|---|---|
| 0 | *This audit* | — |
| 1 | Identity decision (§8.6) + unified token layer; delete the duplicate systems | Contrast table, visual diff of 3 reference pages |
| 2 | `PageShell`, `DataTable`, form primitives, `StatusBadge`, `EmptyState` | Unit tests + a11y tests per component |
| 3 | Migrate the 8 highest-traffic routes (Dashboard, Terminal, Catalog, Inventory, Purchasing, Receiving, Orders, Customers) — one at a time, complete before next | Full gate + browser QA at 1280/1366/1440/1920 per page |

### Phase 3 progress

| Route | Status | Notes |
|---|---|---|
| `/orders` | **done (code-verified, no browser QA)** | 44 raw-palette classes → 0; hand-rolled `<table>` → `DataTable`; `max-w-7xl` → `PageShell`; 409 → 249 lines. Removed a dead, unreachable second refund/void implementation (see below). Drove two real fixes into the primitives: `DataTable.serverPagination`, and `PageShell.titleAs` (EnterpriseShell already emits an `sr-only` h1, so an h1 here made two per page). |
| `/dashboard` | not started | |
| `/terminal` | not started | POS — needs its own workflow treatment, not a list layout |
| `/catalog` | not started | 52-line shell; the work is in `_components/ProductsTab`/`CategoriesTab` |
| `/inventory` | not started | 514 lines, **0 loading-state markers** — worst state coverage of the candidates |
| `/purchasing` | not started | |
| `/purchasing/receiving` | not started | resolve against `/inventory/receive-stock` first (§5 — two receiving destinations) |
| `/customers` | not started | |

**Bug found and fixed during `/orders` (not a styling issue):** the page carried an
`OrderDetailModal` with its own refund and void handlers that **could never open** — `setSelectedOrder`
was only ever called with `null`, while row clicks navigated to `/orders/[id]`. So a second
implementation of two money-moving operations sat in the tree, unreachable and free to drift from the
live one on the detail page (the dead copy reported failures with `alert()`; the live one uses toasts
and confirm dialogs). The file's own doc comment asserted the inline flow worked. Removed, and the
comment corrected. This is the duplicate-business-logic failure `AGENTS.md` calls the costliest kind.

**Primitive defect found by a test while wiring server paging:** `Previous` was disabled from
`Math.floor(offset / limit) === 0`, so an offset that is not a multiple of the page size (deep link,
changed page size, rows deleted between loads) floored to page 0 and left every earlier row
unreachable. Pagination state is now derived from the offset directly, never a page index.
| 4 | Remaining routes by traffic; each closes its loading/empty/error gap | Same |
| 5 | Enforcement: lint rule banning raw palette classes + raw `<button>/<input>/<select>/<table>` in `app/**` | CI gate — this is what stops system 3 growing back |

**Phase 5 is not optional.** The policy already existed and reached 8,186 violations because nothing
mechanically enforced it. Without a CI gate, any redesign decays to the same state.
