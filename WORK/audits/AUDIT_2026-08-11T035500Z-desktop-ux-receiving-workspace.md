# AUDIT 2026-08-11T035500Z — Desktop UI/UX: design-token repair, focused workspace, Scan & Receive

**Session:** Claude Code web — `claude/ascend-desktop-ui-ux-fx9qif`
**Directive:** Improve the existing ASCEND desktop UI/UX and cut clicks on the
supplier → purchase → receive → bill workflow. Explicitly *not* a redesign:
"Inspect → Preserve → Improve → Simplify → Validate."

Status label: **`built_verified`** for everything claimed below (typecheck, lint,
239/239 vitest, production build with mocks off, hygiene). Not claimed:
Playwright e2e and real-browser visual QA — see "Not run".

---

## 1. Baseline — what the audit actually found

Read before changing anything: `tailwind.config.ts`, `app/globals.css`,
`components/*` (28 primitives), `EnterpriseShell.tsx`, the purchasing/receiving/
vendors/bills pages, and the backend `src/modules/purchasing/*`.

### 1.1 Three token-layer defects, each rendering as *nothing*

Tailwind emits no CSS for a colour stop that is not declared. These stops were
referenced across the app but never existed:

| Family | Declared before | Used in code | Result |
|---|---|---|---|
| `info-*` | **nothing at all** | `info-50`, `info-200`, `info-600` | `Badge variant="blue"` had **no background, text colour, or border** |
| `success-*` | 50/100/500/600/700 | + `200`, `300`, `400`, `800` | borderless alert boxes |
| `warning-*` | 50/100/500/600/700 | + `200`, `300`, `800` | borderless alert boxes |
| `danger-*` | 50/100/500/600/700 | + `200`, `300`, `400` | borderless alert boxes |

Twelve dead stops in total, across ~20 call sites.

Also dead: `Card` asked for `shadow-[var(--shadow-sm)]` and **no `--shadow-sm`
variable was ever declared** — every Card in the product rendered flat.
`boxShadow.focus` was still keyed to `rgba(1,55,252,…)`, the *retired* `#0137FC`
brand, so focus rings did not match the primary colour.
`scrollbar-hide` was used by the sidebar and the POS category strip; the utility
was declared as `hide-scrollbar`, so neither hid a scrollbar.

### 1.2 Badge contrast failed WCAG AA on four of seven variants

Badge text is 10–11px semibold — small text, so 4.5:1 applies, not 3:1.
Measured against each variant's own background:

| Variant | Before | Ratio | After | Ratio |
|---|---|---|---|---|
| green | `success-600` | **3.37:1 FAIL** | `success-700` | 5.51:1 PASS |
| orange / yellow | `warning-600` | **2.76:1 FAIL** | `warning-800` | 6.53:1 PASS |
| red | `danger-600` | **3.71:1 FAIL** | `danger-700` | 5.07:1 PASS |
| purple | `brand-600` | **4.19:1 FAIL** | `brand-700` | 5.36:1 PASS |
| blue | `info-600` | n/a (invisible) | `info-600` | 4.60:1 PASS |

The corrected values are the ones `globals.css` had *already nominated* as
`--color-success-text` / `--color-warning-text` etc. The Badge was simply
reading the wrong stop. Backgrounds and borders are untouched.

### 1.3 The Scan & Receive backend was complete and had no client

`src/modules/purchasing/receiving-session-routes.ts` ships, tested and mounted:

- `POST /receiving/sessions` — begin (one open session per PO)
- `POST /receiving/sessions/:id/scan` — barcode match, over-qty / expiry / cost-variance outcomes
- `PATCH /receiving/sessions/:id/lines/:lineId` — qty, cost + reason, lot, expiry, location
- `GET  /receiving/sessions/:id/intelligence/:productId` — **full cost intelligence**
- `POST /receiving/sessions/:id/close` / `/cancel`

`ReceiveLineIntelligence` already computed last purchase cost, previous vendor
cost, average, historical low/high, trend, variance %, variance band, lead time,
MOQ, fill rate, stock on hand, previous lot + rotation warning.

**None of it had ever been rendered.** The only client was
`/purchasing/receiving`, a list that could `close` sessions it had no way to
open. There was no route at `/purchasing/receiving/[id]`.

### 1.4 A one-click blind full receipt, mislabelled

`OrdersTab`'s `Receive` button posted `POST /orders/:id/receive` with an **empty
body**. The backend reads that as "receive every open line at full remaining
quantity" (`routes.ts:401-410`). So a single mis-click posted a complete receipt
into inventory — no counts, no costs, no lots, no expiry, no confirmation, no
undo. The button said only "Receive".

The same list printed raw PO **UUIDs** in the PO column, despite the backend
returning `po_number` on both list and detail — the client type omitted the field.

---

## 2. Click-count measurement (§36)

### Receive a delivery against a known PO

| | Before | After |
|---|---|---|
| Clicks to first counted item | **6** | **2** |
| Surfaces | 3 (list → detail → modal) | 1 (focused workspace) |
| Nav depth | Inventory ▸ Purchasing ▸ PO ▸ tab ▸ modal | row → workspace |
| Cost context while receiving | **none** | PO / last received / previous vendor / average / range / trend / variance % |
| Correcting a line | reopen modal, re-read rows | edit the row in place |
| Review before posting | none | built into the workspace |

Before: Inventory → Purchasing → find PO → open PO → *Receive* tab →
"Open receive form" → type into modal → Confirm receipt.
After: Purchasing → **Scan & Receive** on the row → scan. Each subsequent item
is one scan with zero clicks, because focus returns to the field automatically.

### Correct a miscount discovered at review

| | Before | After |
|---|---|---|
| Clicks | 4 (close review → reopen form → find line → edit → save) | **1** (click the finding, edit the row) |

### Identify a PO by number

| | Before | After |
|---|---|---|
| Reading a PO in the list | 8-char UUID slice | `PO-118` |

---

## 3. What changed

### Design system (evolved, not replaced — §3/§31)
- `tailwind.config.ts` — filled the four semantic ramps to 50–900 and added the
  whole `info` family. **Purely additive**: every stop that already existed keeps
  its exact value, so nothing that renders today changes; the dead classes simply
  come alive. `-200` stops were chosen to equal the `--color-*-border` variables
  already in `globals.css`.
- `globals.css` — declared `--shadow-sm/md/lg` (light + dark), added the
  procure-to-pay `--color-stage-*` lifecycle tokens, aliased `scrollbar-hide`.
- `Badge.tsx` — AA-correct text stops; status map extended to the receiving and
  three-way-match vocabulary (exception, variance, over_received, short, damaged,
  quality_hold, unmatched, duplicate…) under one documented colour rule; added
  `statusLabel` and `StatusBadge`.
- New `LifecycleTrail.tsx` — Ordered → Received → Billed → Paid as one strip.
  Distinguishes the four stages by **position and fill**, not by minting more
  hues (§17). `buildLifecycle` is pure and unit-tested.

### Shell / navigation (§6, §7, §30)
- `EnterpriseShell` — focused-workspace mode. `isFocusedRoute()` is a single
  exported, tested predicate holding the whole §30 policy, overridable per page
  via a `focus` prop. Sidebar auto-collapses on task routes, stays open on
  browsing routes, and **a manual toggle wins for the rest of the session**.
- New `WorkspaceHeader.tsx` — sticky breadcrumb + heading + supplier + status +
  facts + actions, so collapsing the nav never costs the operator their place.
- Tokenised the shell's raw `slate-*`/`red-*`/`amber-*` classes and the
  hardcoded `#F5F5F5` page background (these broke dark mode).

### Scan & Receive workspace (§12, §13, §14, §16, §26)
New `app/(protected)/purchasing/receiving/[id]/`:
- `page.tsx` — the workspace. Split view: work left, context right.
- `ScanBar.tsx` — always-focused field, refocuses after every scan/error, `/`
  hotkey, `role="status"` live feedback.
- `ReceivingLinesTable.tsx` — Product / Expected / Received / Remaining / PO cost
  / Cost / Variance / Lot / Expiry / Status / Line total, **all editable in place**.
- `CostIntelligencePanel.tsx` — renders the intelligence payload that had never
  been shown.
- `ReviewPanel.tsx` — shortages, overages, held, rejected, never-scanned, cost
  delta vs PO, total received value; every finding links back to its row so
  corrections happen where they are found (§16).
- `shared.ts` — outcome/variance/totals logic, pure and unit-tested.

### Entry points (§8, §11)
- `OrdersTab` — `Scan & Receive` (primary) and `Receive all` (secondary, now
  honestly labelled and behind a `ConfirmDialog` that spells out the consequence).
  PO numbers replace UUIDs and link to the PO.
- PO detail — receiving modes surfaced on the header: Landed costs / Manual
  receive / **Scan & Receive**.
- Receiving hub — an `Open` action per session. Without it the workspace was
  unreachable from the list.
- New `lib/receiving.ts` — one `startReceivingSession()` used by every entry
  point, so "open the delivery I am about to count" is one call from anywhere.

### Contracts and mocks
- `api-client/types.ts` — receiving-session contract mirrored from the backend;
  `po_number` / `receive_status` added to `PurchaseOrder`.
- `mocks/mockHandlers.ts` — **stateful** receiving-session mocks. Scanning twice
  increments, over-scan reports itself, edits stick. A constant-payload stub
  would have made the workspace look like it worked while hiding the behaviour
  worth exercising. This also repairs `/purchasing/receiving`, which had no mocks
  at all and therefore could not load in mock mode.

---

## 4. A real bug the tests caught

`EditableCell`'s Escape handler called `setDraft(value)` then `.blur()`. React
state updates are asynchronous, so `draft` was still the abandoned value when
`onBlur` fired — **pressing Escape saved the edit it was meant to discard.**
Found by `abandons an edit on Escape without saving`, which failed against the
first implementation. Fixed with a `reverting` ref that the blur handler checks.

---

## 5. Gates

| Gate | Result |
|---|---|
| `tsc --noEmit` | **PASS** |
| `npm run lint` | **PASS** — 0 warnings, 0 errors |
| `npx vitest run` | **PASS — 239/239 across 30 files** (33 new) |
| `NEXT_PUBLIC_MOCK=false npm run build` | **PASS** — `/purchasing/receiving/[id]` emitted, 11.4 kB / 123 kB first load; shared JS unchanged at 87.4 kB |
| `node tools/hygiene-check.mjs` | **PASS** — 2212 files |

The 3 documented Node-22 `Blob`/`FileReader` failures did not occur in this
container.

### Not run — reported, not softened
- **Playwright e2e.** No built-and-served real-stack pair here; CI runs the
  golden paths on the PR.
- **Real-browser visual QA at 1280/1366/1440/1536/1920 (§35).** No browser
  session against a running app. The layout is built for it — the split view
  collapses below `xl` so the intelligence panel never squeezes into an
  unreadable column on a laptop — but that is a design intent, not an observation.
  **This is the largest open item.**
- **Backend suite.** Zero backend files changed; this diff is `web/` only.

---

## 6. Honest scope statement

Delivered: Phases 1–4 of the directive's implementation order (audit, design
system, sidebar/focused workspace, and the supplier → purchase → scan & receive →
review leg), plus the entry-point click reduction.

**Not delivered** (named so nobody reads this as more than it is): unpaid-bill
correction (§18), paid-bill controlled adjustments (§19), returns/credits
reconciliation (§20), three-way-match UI and tolerances (§21/§22), the exception
centre (§23), and the supplier-workspace contextual action bar (§10). Those are
phases 5–9 and remain open.
