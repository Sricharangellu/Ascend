# AUDIT — Mobile experience review + first integration wave

- **UTC**: 2026-08-11T04:20:00Z
- **Session**: Claude Code web — `claude/ascend-mobile-design-integration-mb7l8e`
- **Scope**: Review Ascend against the "ASCEND Mobile" design reference, decide what materially
  improves mobile usability, integrate it. Directive is explicit that the reference is a
  *reference*, not a source of truth.

---

## 0. The reference design could not be read

`https://claude.ai/design/p/424883f3-6b3c-46de-8613-59d47766fe69?file=ASCEND+Mobile.dc.html`

- `WebFetch` → **HTTP 403**.
- `DesignSync` → *"needs design-system authorization, but `/design-login` requires an interactive
  terminal"*. This is a non-interactive container.

So **no design comparison in this audit is based on having seen the reference.** Everything below
is derived from Ascend's own workflows, `docs/ENTERPRISE_UX_SPEC.md`, and WCAG 2.1 AA. The
"Reference design analysis" and "Rejected improvements" sections a full review would contain are
**not answerable** and are recorded as open rather than filled in with plausible-sounding content.

To unblock: use Claude Design's *Send to Claude Code Web*, or paste the `.dc.html` into the repo.

---

## 0b. CORRECTION (2026-08-15) — an existing "Ascend Mobile" app was missed

`artifacts/ascend-mobile/` is a **tracked, committed Expo / React Native app whose
`artifact.toml` title is literally "Ascend Mobile"** (last touched 2026-08-03). **This audit did
not look at it.** `artifacts/` is excluded from lock claims as "another environment's tree", and
that was taken as a reason not to read it — wrong, since the brief was to inspect the existing
mobile experience and this *is* one.

What it is, having now read it:

- Four tabs: **Dashboard / Inventory / Orders / Search** (`app/(tabs)/_layout.tsx`), native
  `NativeTabs` on iOS 26 with a classic `Tabs` fallback.
- **No POS/register and no barcode scanning.** `orders.tsx` refers to "POS terminal" as a separate
  device. So it is a manager/monitoring companion, not a floor-operator app.
- Dark-first tokens with `primary: '#5D5FEF'` (`constants/colors.ts`).

**Consequence for §2.** The web `MobileTabBar` this wave added (Home / Sell / **Scan** / Stock /
Orders + More) **diverges from that IA** and was designed without reference to it. The divergence
is defensible — the web app owns the register and the scanner and the native app owns neither, so
the two have genuinely different primary tasks — but it was arrived at by omission, not by a
decision. **Flagged for Sri: align, keep both, or hybridise.** Not resolved here.

**Consequence for finding #8.** That row calls `#5D5FEF` "the purple retired before" the blue, which
reads as though it is gone. It is not: it is still hard-coded in at least five live `web/` spots —
`components/terminal/ProductGrid.tsx`, `components/terminal/RegisterSessionGuard.tsx`,
`components/KpiCard.tsx` (x2) and `app/(protected)/catalog/[id]/_components/InventoryTab.tsx` — and
it is the *current* primary of the native app. The manifest fix in this wave was still right (the
manifest disagreed with the web token layer), but "three brand colours shipping at once"
**understated** the drift rather than overstating it, and the remaining hard-coded usages were not
filed. Filed now in `WORK/LOOP_STATE.md`.

---

## 1. Current mobile audit (before this change)

### Structural

| # | Finding | Evidence |
|---|---|---|
| 1 | **No mobile navigation.** The only nav on a phone was the top-bar hamburger opening the desktop rail as a 220px overlay — 10 collapsed sections, target link 3 taps deep, at desktop row density. | `EnterpriseShell.tsx` `LeftRail`, width `compact && !expanded ? 0 : 220` |
| 2 | **The drawer never closed on navigation.** Links are client-side `<Link>`s with no close handler, so every mobile navigation left the drawer covering the page it had just opened. | `LeftRail` child links had no `onClick` |
| 3 | **33 of 106 protected pages contain zero responsive prefixes**; 514 responsive utilities across the whole app. Desktop-first by construction. | `grep -c '(sm|md|lg|xl):' app/(protected)/**/page.tsx` |
| 4 | **Tables overflow horizontally.** `DataTable` renders one `<table>` in an `overflow-x-auto`; an 8-column list is ~1100px against a 375px screen, so ~70% of every row sat behind a sideways scroll. | `DataTable.tsx` |

### Accessibility (all WCAG 2.1 AA, which `AGENTS.md` calls non-negotiable)

| # | Finding | Evidence |
|---|---|---|
| 5 | **Pinch-zoom was disabled app-wide** — `maximumScale: 1, userScalable: false`. Fails **SC 1.4.4 Resize Text**. Added to suppress iOS focus-zoom, whose real cause is <16px inputs. | `app/layout.tsx` |
| 6 | **No button met the 44px touch target.** `Button` sizes were `h-8` (32px) / `h-10`; `min-w-[44px]` was set but never `min-height`, so every control failed on the axis a thumb actually misses. | `Button.tsx` `sizeClasses` |

### Brand / token drift (three different brand colours shipping at once)

| # | Finding | Evidence |
|---|---|---|
| 7 | `themeColor: "#2563eb"` — a **blue** from the brand retired 2026-07-14. This is the phone status-bar colour. | `app/layout.tsx` |
| 8 | `theme_color: "#5D5FEF"` — the **purple** retired before that. PWA splash. | `app/manifest.ts` |
| 9 | Primary `Button` carried `shadow-[rgba(5,95,255,0.1)…]` — a blue edge under a teal face. | `Button.tsx` |
| 10 | **The login logo mark was a hard-coded `"F"`** — the initial of the retired *Finder* brand — rendered beside the word "Ascend" on the first screen every user sees. `AGENTS.md` Hard rules forbid exactly this. | `AuthShell.tsx` ×2 |

### PWA / install path

| # | Finding | Evidence |
|---|---|---|
| 11 | **The PWA icons did not exist.** `manifest.ts` referenced `/icons/icon-192.png` and `/icons/icon-512.png`; `web/public/` contained only two service workers. Every "Add to Home Screen" produced a browser-default icon — on the one platform where the installed app *is* the entry point. No typecheck, lint, test or build catches a missing static asset. | `ls web/public` |

### Scanning + receiving (the directive's priority area)

| # | Finding | Evidence |
|---|---|---|
| 12 | **CORRECTNESS — case UPCs received 1 unit instead of `pack_size`.** The canonical `receiving-sessions.scan()` resolves a barcode through `product_barcodes` (which carries `kind` + `pack_size`) but `resolveBarcode` selected only the product columns and threw the pack size away. Scanning one case of 12 received **1 each**. Receiving writes inventory movements, so the error compounds into stock-on-hand, COGS and reorder points. | `receiving-sessions.ts` `resolveBarcode` |
| 13 | Related: a per-case cost supplied with a case scan was stored as an each-cost and compared against a per-each PO cost, tripping a spurious `cost_override_required` on a correctly-priced delivery. | same |
| 14 | Related: the over-qty guard compared scanned units to base units, so a case scan could not be detected as an overage. | same |
| 15 | **The receiving desk never called the canonical resolver.** It string-matched `l.product_barcode === code \|\| l.product_sku === code` against the PO line — i.e. the single barcode denormalised onto that line. Every alternate code in `product_barcodes` (case UPC, vendor UPC, secondary each-code) reported "not found on this PO" while sitting on the pallet. No audit trail, no cost/expiry validation. Directly contradicts the directive's Phase 11. | `receive-stock/page.tsx` `handleScan` |
| 16 | **A scan did not count.** It highlighted the row yellow for 2s and changed no quantity, so "scanner-first receiving" still required hand-typing every case count. | same |
| 17 | **`GET /catalog/barcode/:code/pos` had no MSW handler.** The terminal already called it; MSW is `onUnhandledRequest: "warn"`, so in demo/dev mode every scan fell through to the network as a console warning. | `mocks/mockHandlers.ts` |

### What was already good (kept, not rebuilt)

- `DataTable` is genuinely capable and its a11y is real — `aria-sort`, labelled checkboxes, live
  regions, `<caption>`. It needed a mobile layout, not a rewrite.
- The four-layer nav gate (partial → capability → permission) is well factored and pure-testable.
  The tab bar reuses it rather than inventing a second gate.
- `Input` already had `min-h-[44px]`.
- Design tokens are consolidated and contrast-annotated; the drift above is in the few places that
  bypassed them, not in the token set.
- `resolvePosBarcode` already returns packaging + pricing + stock — the right resolver existed and
  simply was not being called by receiving.

---

## 2. Adopted changes

| Area | Change |
|---|---|
| Navigation | New `MobileTabBar` — Home / Sell / **Scan** / Stock / Orders + More, below `md`. Gated by the same capability + permission layers as the rail; Scan and More are never gated so a narrow role cannot be stranded. Safe-area aware. |
| Navigation | Drawer now closes on navigation (`onNavigate`), and stops above the tab bar. |
| Scanning | New `ScanSheet` — global bottom sheet, opened from any page. Resolves via canonical `/catalog/barcode/:code/pos`. Wedge-scanner field (focused on open) + `BarcodeDetector` camera as progressive enhancement. Distinct states for not-found / denied / offline / failed. |
| Receiving | `handleScan` now resolves through the canonical endpoint, matches lines on **product id**, and **counts** the scan — a case scan adds `pack_size`, capped at remaining. New pure `applyScanToEntries`. |
| Backend | `resolveBarcode` returns `kind` + `pack_size`; `scan()` converts qty → base units and cost → per-base-unit throughout (accept/hold/reject, over-qty, audit rows). New `ScanResult.unit`. |
| Tables | `DataTable` renders cards below `md` (`mobileLayout`, `primary`, `mobileHeader`, `mobileHidden`). **Every visible column appears unless it explicitly opts out** — hiding is the caller's decision, never the default. Real `<ul>`/`<dl>` semantics. Only one tree is built (`useIsMobile`), not both. |
| A11y | Pinch-zoom restored; iOS focus-zoom fixed at its cause (16px controls on `pointer: coarse`). 44px touch floor via `.tap-target` on coarse pointers only — desktop density unchanged. |
| Tokens | `themeColor`, `manifest` colours, and the primary-button shadow all repointed at the live tokens. Login "F" → "A". |
| PWA | Icons actually generated (`scripts/generate-pwa-icons.mjs`, dependency-free PNG encoder), declared `any maskable`. |
| Mocks | Added the missing `/catalog/barcode/:code/pos` handler, with a `-CASE` suffix convention so the case path is exercisable in demo mode. |

## 3. Verification

Recorded in the PR body and `WORK/LOOP_STATE.md`. Highlights:

- The 3 case-UPC backend tests were **run against the unfixed code first and all 3 failed** with
  the exact defects above (1 vs 12 units; spurious `cost_override_required`; `matched` instead of
  `over_qty`). They pass after the fix.
- The DataTable "keeps every column" test was proven load-bearing by slicing `bodyCols` to 1 and
  watching it fail.
- Rendered-app QA at 320/375/768/1440 across 8 pages: **no horizontal overflow anywhere**; card
  mode confirmed live on `/inventory`, `/orders`, `/customers`.
- The scan sheet was driven end-to-end in a real browser at 375px: an each code resolves to its
  price, a case code reports "Case of 12" at 12x the unit price, a SKU resolves, and an unknown
  code produces the not-found state.
- **Two defects in this session's own new `ScanSheet` were found by reviewing the diff, not by any
  gate**: camera support was held in a `useRef` set inside an effect, so the flag never reached
  render and the "Use camera" button was unreachable on every supporting device; and
  `CameraScanner`'s effect depended on inline parent closures, restarting `getUserMedia` on every
  keystroke. Both fixed, with a regression test verified against a simulation of the first.
- One backend run reported a single failure in `ai_assistant` ("expected the internal create-po
  call to fail in the test environment"). **Not a code regression** - that test's own comment says
  it depends on nothing listening at `BACKEND_URL`, which defaults to `http://localhost:3000`, and
  a dev server started for visual QA was answering there. Re-run with the port free: 16/16 pass.
  This is the coordination-conflict class `AGENTS.md` warns about; later runs used port 3100.

## 4. Still open

1. **The reference design has never been read** (§0). Any part of the directive that depends on
   comparing against it is not done.
2. **Card mode only reaches `DataTable` adopters.** `/catalog`, `/purchasing`,
   `/inventory/receive-stock` and `/dashboard` still render hand-rolled `<table>`s on mobile and
   still scroll sideways. They fit without page overflow, but they are not carded.
3. **POS terminal is unreviewed for mobile.** It is the highest-frequency retail surface and this
   wave did not touch it beyond the shell.
4. **Receiving submit is still N sequential PATCHes** with no idempotency key — a mid-flight
   failure leaves a partially-applied open session and a retry begins a second one. This is the
   directive's Phase 16 and is the most valuable next piece of work.
5. `receive-stock` still contains raw `<input>`/`<select>` and `slate-*`/`blue-*` literals outside
   the scan row this change touched.
6. Playwright e2e not run (needs a built-and-served real-stack pair); CI runs the golden paths.
