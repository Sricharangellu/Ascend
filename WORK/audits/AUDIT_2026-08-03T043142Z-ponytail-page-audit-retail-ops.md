# Ascend — Ponytail Page Audit (Retail Ops Cluster)

| Field | Value |
|---|---|
| Date (UTC) | 2026-08-03T04:31:42Z |
| Protocol | ASCEND Enterprise UI Audit — Ponytail Page-by-Page (13 fields) |
| Scope | **40** remaining `page.tsx` routes: SELL, CATALOG, INVENTORY/PURCHASING/FULFILLMENT (completes the 141-route tree with companion `AUDIT_2026-08-03T042838Z-ponytail-page-audit-clusters.md`) |
| Method | Code-read of every page + children + NAV_TREE + mock allowlists. Prefer CONSOLIDATE/REFACTOR over REWRITE. |
| Companion | Master index: `AUDIT_2026-08-03T043142Z-ponytail-master-index.md` |

---

## Consolidation map (highest leverage)

| Target hub | Absorb / demote |
|---|---|
| `/terminal` | `/sell` (alias KEEP) |
| `/orders` + `/orders/[id]` | `/sales`, `/payments`, customer half of `/returns` |
| `/discounts` | `/catalog/promotions` (mock/partial until BE) |
| `/purchasing` + `[id]` | inventory Orders tab, suppliers↔vendors, `/inventory/reorder` |
| `/inventory/pipeline` | issues↔errors, reorder alerts; receive status |
| `/inventory/receive-stock` | floor receive workstation (keep); PO ReceiveTab = shortcut |
| Locations hub | `/inventory/locations` + `/operations` location tabs |
| `/delivery` | `/shipping` as list tab |
| `/warehouse` | gated shell → link real pages (not reimplement) |

Systemic DS debt on almost every page: raw `<button>`/`<input>`, `slate`/`#hex`, custom tabs. Fix via REFACTOR waves, not rewrites.

---

## Master matrix (40 pages)

| Route | Decision | Priority | Note |
|---|---|---|---|
| `/terminal` | KEEP | Critical | Live POS |
| `/sell` | KEEP (alias) | Low | → terminal |
| `/sales` | CONSOLIDATE | High | → orders history |
| `/orders` | REFACTOR | High | Absorb sales/payments |
| `/orders/[id]` | KEEP | High | Canonical detail |
| `/quotes` | REFACTOR | Medium | Dead filter; DS |
| `/returns` | CONSOLIDATE | High | Split customer/vendor |
| `/payments` | CONSOLIDATE | Medium | → order detail |
| `/service-orders` | REFACTOR | Low | Gate if unused |
| `/display` | KEEP | Medium | Second screen |
| `/catalog` | REFACTOR | High | TabBar + tokens |
| `/catalog/[id]` | REFACTOR | Critical | Collapse 14 tabs; kill orphans |
| `/catalog/categories/[id]` | REFACTOR | Medium | DS |
| `/catalog/price-book` | KEEP (alias) | Low | → pricing |
| `/catalog/promotions` | CONSOLIDATE | High | Mock; → discounts |
| `/pricing` | REFACTOR | Medium | Keep partial |
| `/discounts` | KEEP | High | Real API |
| `/gift-cards` | REFACTOR | Medium | Empty/error states |
| `/loyalty` | REFACTOR | Medium | DS + setup overlap |
| `/inventory` | CONSOLIDATE | Critical | Misnamed; dead `_components` |
| `/inventory/transfers` | KEEP (alias) | Low | → ?tab=transfers |
| `/inventory/expiry` | KEEP (alias) | Low | → expiry-pool |
| `/inventory/expiry-pool` | KEEP | Medium | FEFO home |
| `/inventory/pipeline` | CONSOLIDATE | Critical | Hub for procure status |
| `/inventory/receive-stock` | KEEP | High | Floor workstation |
| `/inventory/errors` | REFACTOR | High | Fix In Review; merge issues |
| `/inventory/counts` | KEEP | Medium | Real cycle counts |
| `/inventory/reorder` | CONSOLIDATE | High | → purchasing/pipeline |
| `/inventory/serials` | REFACTOR | Low | Product picker |
| `/inventory/locations` | CONSOLIDATE | High | ↔ operations |
| `/purchase` | REFACTOR | Medium | Rename Cost entry |
| `/purchasing` | KEEP | Critical | PO hub |
| `/purchasing/[id]` | KEEP | High | Detail |
| `/purchasing/edi-imports` | REFACTOR | Medium | Link error center |
| `/vendors` | CONSOLIDATE | High | ↔ purchasing suppliers |
| `/vendors/[id]` | REFACTOR | Medium | 360 DS |
| `/warehouse` | CONSOLIDATE | Medium | Partial/mock shell |
| `/operations` | CONSOLIDATE | High | Split setup vs ops |
| `/delivery` | KEEP | High | Fulfillment wizard |
| `/shipping` | CONSOLIDATE | High | → delivery list |

---

## Per-page 13-field audits

### `/terminal`

1. **Business Purpose:** Live POS — sell, tender, receipt; Cashier; continuous; revenue.
2. **Strengths:** Real APIs; barcode POS resolution; offline queue; register guard; shared terminal components.
3. **Weaknesses:** Hold/Drawer/Print/Return stubs or cosmetic; no customer attach; catalog pageSize 200; DS uneven.
4. **Duplicates:** `/sell` alias; return mode vs `/returns`; discount modal vs `/discounts`.
5. **Complexity:** High — multi-screen state machine.
6. **Ponytail:** Keep single Sell hub; hide stubs until real; deep-link customer display.
7. **Reuse:** ProductGrid, CartPanel, TenderScreen, ReceiptView, Button, Toast.
8. **UX:** Customer search; gift-card tender; hide fake Return mode.
9. **Tech:** Extract outlet picker; rename BroadcastChannel from finder-pos-display.
10. **Perf:** Virtualize product grid if >200 SKUs.
11. **A11y:** Tender ≥44px + focus rings; shortcuts already good.
12. **Decision:** KEEP
13. **Priority:** Critical

### `/sell`

1. **Purpose:** Alias to terminal.
2–5. Zero cost; Low complexity.
6. Never build a second POS.
7–11. N/A.
12. **KEEP (alias)** 13. **Low**

### `/sales`

1. **Purpose:** Sales history list + void; Manager; daily.
2. **Strengths:** Cursor pagination; ConfirmDialog void.
3. **Weaknesses:** Raw controls; hex; no EmptyState; overlaps `/orders`.
4. **Duplicates:** `/orders` list/void/refund.
5. **Complexity:** Med.
6. **Ponytail:** Merge into Orders as History tab.
7. **Reuse:** ConfirmDialog, EmptyState, TableSkeleton, Button.
8. **UX:** Row → `/orders/[id]`.
9. **Tech:** Share void/refund helpers.
10. **Perf:** Debounce search.
11. **A11y:** aria-expanded on rows.
12. **CONSOLIDATE** → `/orders` 13. **High**

### `/orders`

1. **Purpose:** Order ops list; Manager/Cashier; daily.
2. **Strengths:** Real API; EmptyState/Skeleton/Button/Modal; role gate.
3. **Weaknesses:** Modal detail duplicates `/orders/[id]`; slate tokens.
4. **Duplicates:** `/sales`, `/payments`, refunds.
5. **Complexity:** Med.
6. **Ponytail:** Row → detail page; absorb sales/payments.
7. **Reuse:** Existing primitives; OrderLinesTable.
8. **UX:** Status tablist roles.
9. **Tech:** Shared order-actions module.
10. **Perf:** Prefetch detail optional.
11. **A11y:** tablist/tab.
12. **REFACTOR** 13. **High**

### `/orders/[id]`

1. **Purpose:** Order 360 — lines, payments, returns, activity.
2. **Strengths:** Timeline API; Can RBAC; real mutations.
3. **Weaknesses:** Custom ConfirmModal; raw buttons; thin returns tab.
4. **Duplicates:** `/payments`, `/returns` refund.
5. **Complexity:** Med–High.
6. **Ponytail:** Canonical surface; deep-link payments/returns here.
7. **Reuse:** ConfirmDialog, Button, Badge, EmptyState.
8. **UX:** Sticky primary actions.
9. **Tech:** Delete local ConfirmModal.
10. **Perf:** Lazy tabs OK.
11. **A11y:** aria-selected tabs.
12. **KEEP** 13. **High**

### `/quotes`

1. **Purpose:** Quotation CRUD/convert; Sales; periodic.
2. **Strengths:** Real quotes API; convert-to-sale.
3. **Weaknesses:** Raw UI; dead “Valid after” filter; silent catch.
4. **Duplicates:** Near orders conceptually.
5. **Complexity:** Med.
6. **Ponytail:** Keep B2B path; wire or remove dead filter.
7. **Reuse:** Modal, Input, Select, EmptyState.
8. **UX:** EmptyState; ConfirmDialog delete.
9. **Tech:** Surface API errors.
10. **Perf:** Server filter later.
11. **A11y:** Focus rings.
12. **REFACTOR** 13. **Medium**

### `/returns`

1. **Purpose:** Customer refunds + vendor returns strip.
2. **Strengths:** Real refund + purchasing returns; ConfirmDialog; deep-link orderId.
3. **Weaknesses:** Full-order refund only; dual domains on one page.
4. **Duplicates:** Order refund; vendor returns elsewhere.
5. **Complexity:** Med.
6. **Ponytail:** Split — customer under Sell/Orders; vendor under Purchasing.
7. **Reuse:** KpiCard, ConfirmDialog, EmptyState.
8. **UX:** Line-level returns later; show customer name.
9. **Tech:** Combine completed+refunded fetches.
10. **Perf:** One orders query.
11. **A11y:** aria-pressed filter chips.
12. **CONSOLIDATE** 13. **High**

### `/payments`

1. **Purpose:** Per-order tender audit.
2. **Strengths:** Real payments API; KpiCards.
3. **Weaknesses:** Read-only; no EmptyState; order-picker UX.
4. **Duplicates:** `/orders/[id]` payments tab.
5. **Complexity:** Low–Med.
6. **Ponytail:** Fold into order detail (+ EOD report).
7. **Reuse:** EmptyState, Badge.
8. **UX:** Register-scoped payments list when BE exists.
9. **Tech:** Register/session endpoint later.
10–11. Fine / touch targets.
12. **CONSOLIDATE** 13. **Medium**

### `/service-orders`

1. **Purpose:** Repair tickets; Shop; periodic.
2. **Strengths:** Real CRUD + status transitions.
3. **Weaknesses:** Raw create form; weak empty.
4. **Duplicates:** Distinct from retail orders (OK).
5. **Complexity:** Med.
6. **Ponytail:** Keep; hide from retail-default nav if unused.
7. **Reuse:** Modal, Input, EmptyState.
8. **UX:** Status board optional.
9. **Tech:** Permission on transitions.
10–11. Fine / form labels.
12. **REFACTOR** 13. **Low**

### `/display`

1. **Purpose:** Customer-facing cart screen.
2. **Strengths:** Idle/cart/complete; no API load.
3. **Weaknesses:** Not in nav; hard-coded navy; channel name `finder-pos-display`.
4. **Duplicates:** None.
5. **Complexity:** Low.
6. **Ponytail:** Keep; “Open display” from terminal.
7. **Reuse:** formatMoney.
8. **UX:** Larger type; store name.
9. **Tech:** Rename channel; aria-live cart.
10. **Perf:** Excellent.
11. **A11y:** aria-live polite.
12. **KEEP** 13. **Medium**

### `/catalog`

1. **Purpose:** Product/category hub; Merchandiser; daily.
2. **Strengths:** Real APIs; ProductsTab pagination/bulk/import; EmptyState.
3. **Weaknesses:** Raw tabs; slate/blue; silent category fail.
4. **Duplicates:** Orphan inventory CatalogTab.
5. **Complexity:** Med.
6. **Ponytail:** Keep Products hub; shared TabBar.
7. **Reuse:** ProductsTab primitives.
8. **UX:** Tab count badges.
9. **Tech:** Token cleanup.
10. **Perf:** Paginated — good.
11. **A11y:** tab roles.
12. **REFACTOR** 13. **High**

### `/catalog/[id]`

1. **Purpose:** Product detail; Merchandiser; daily.
2. **Strengths:** Real detail APIs; grouped tabs.
3. **Weaknesses:** 14 tabs; orphaned unused tab components (SalesTab, CreditsTab, UnitsTab, etc.).
4. **Duplicates:** Pricing vs `/pricing`; purchasing/expiry vs inventory pages.
5. **Complexity:** High.
6. **Ponytail:** Collapse to ~6 sections; delete or wire orphans.
7. **Reuse:** Button, Badge, EmptyState; lazy tab chunks.
8. **UX:** Overview-first progressive disclosure.
9. **Tech:** Remove dead tab files.
10. **Perf:** Lazy-load tabs.
11. **A11y:** Horizontal scroll + keyboard.
12. **REFACTOR** 13. **Critical**

### `/catalog/categories/[id]`

1. **Purpose:** Category detail + product assign.
2. **Strengths:** Real APIs; search modal.
3. **Weaknesses:** Raw UI; custom modals.
4. **Duplicates:** CategoriesTab list ops.
5. **Complexity:** Med.
6. **Ponytail:** Keep detail; simplify assign.
7. **Reuse:** Modal, Button, EmptyState.
8. **UX:** Breadcrumb to catalog.
9. **Tech:** ConfirmDialog delete.
10–11. Debounced search / focus trap.
12. **REFACTOR** 13. **Medium**

### `/catalog/price-book`

1. **Purpose:** Redirect → `/pricing?tab=customer-overrides`.
12. **KEEP (alias)** 13. **Low**

### `/catalog/promotions`

1. **Purpose:** Campaigns/coupons/bundles UI.
2. **Strengths:** Full UI; Can RBAC.
3. **Weaknesses:** `/api/v1/promotions` mock; nav partial; 1090-line monolith.
4. **Duplicates:** `/discounts` (real).
5. **Complexity:** High.
6. **Ponytail:** Stay gated; absorb into Discounts until BE.
7. **Reuse:** Split tabs; Modal/Table/EmptyState.
8. **UX:** One “Promotions & Discounts” IA.
9. **Tech:** Code-split; never un-partial without BE.
10–11. Tab fetch / form a11y debt.
12. **CONSOLIDATE** → `/discounts` 13. **High**

### `/pricing`

1. **Purpose:** Price books/overrides/tiers (advanced).
2. **Strengths:** Rich model; RBAC.
3. **Weaknesses:** Mock API; partial nav; 858-line monolith.
4. **Duplicates:** Product PricingTab; price-book alias.
5. **Complexity:** High.
6. **Ponytail:** Keep gated; slim retail defaults.
7. **Reuse:** Split tabs; KpiCard.
8. **UX:** Sell+cost first; advanced secondary.
9. **Tech:** Real pricing module before un-gating.
10–11. Code-split / raw-control debt.
12. **REFACTOR** 13. **Medium**

### `/discounts`

1. **Purpose:** Real POS discount rules.
2. **Strengths:** Real `/api/v1/discounts`; TableSkeleton; status workflow.
3. **Weaknesses:** Raw table; subtitle says “Promotions”; no EmptyState.
4. **Duplicates:** Mock promotions page.
5. **Complexity:** Med.
6. **Ponytail:** Canonical rules surface.
7. **Reuse:** Table, EmptyState, Badge.
8. **UX:** Clear naming vs Campaigns.
9. **Tech:** Design-system Table.
10–11. Fine / keyboard status select.
12. **KEEP** 13. **High**

### `/gift-cards`

1. **Purpose:** Issue/check/void; Manager.
2. **Strengths:** Real giftcards API; role gate.
3. **Weaknesses:** Silent list catch; no EmptyState/Skeleton; not on POS tender.
4. **Duplicates:** Tender gift_card on terminal (missing).
5. **Complexity:** Low–Med.
6. **Ponytail:** Keep; wire POS tender separately.
7. **Reuse:** Input, EmptyState, ConfirmDialog void.
8. **UX:** Confirm void; copy code.
9. **Tech:** Surface list errors.
10–11. Fine / named amount buttons.
12. **REFACTOR** 13. **Medium**

### `/loyalty`

1. **Purpose:** Tiers/members/rewards ops.
2. **Strengths:** Real loyalty APIs; children skeletons.
3. **Weaknesses:** Raw tabs; summary chips not KpiCard; setup/loyalty alias overlap.
4. **Duplicates:** setup loyalty reexport settings.
5. **Complexity:** Med.
6. **Ponytail:** Keep ops; no duplicate CRUD in setup.
7. **Reuse:** KpiCard, TabBar.
8. **UX:** Member search first.
9. **Tech:** Token cleanup.
10–11. Fine / tab roles.
12. **REFACTOR** 13. **Medium**

### `/inventory`

1. **Purpose:** Intended stock home; actually **movements** (PO/transfers/returns).
2. **Strengths:** Real endpoints; cursor; `?tab=` deep-link.
3. **Weaknesses:** Misnamed; silent errors; hardcoded suppliers; orphaned `_components/*` unused.
4. **Duplicates:** Purchasing orders; vendor returns; operations transfers.
5. **Complexity:** Med.
6. **Ponytail:** Rename Movements **or** revive LedgerTab as Overview; delete dead components.
7. **Reuse:** Orphan LedgerTab/AdjustModal; Button/EmptyState.
8. **UX:** Need on-hand stock home.
9. **Tech:** Wire or delete `_components`.
10–11. Cursor OK / tab a11y.
12. **CONSOLIDATE / REFACTOR** 13. **Critical**

### `/inventory/transfers` · `/inventory/expiry`

1. **Purpose:** Redirect aliases (transfers tab / expiry-pool).
12. **KEEP (alias)** 13. **Low**

### `/inventory/expiry-pool`

1. **Purpose:** FEFO pool + upcoming + dispose.
2. **Strengths:** Real expiry APIs; Button/Badge/Skeleton.
3. **Weaknesses:** slate/red drift; empty not EmptyState.
4. **Duplicates:** Product ExpiryTab.
5. **Complexity:** Med.
6. **Ponytail:** Keep expiry home.
7. **Reuse:** EmptyState, erp tokens.
8. **UX:** Link product → catalog.
9. **Tech:** ConfirmDialog discard.
10–11. Fine / tab a11y.
12. **KEEP** 13. **Medium**

### `/inventory/pipeline`

1. **Purpose:** PO pipeline board (6 tabs).
2. **Strengths:** Structured pipeline APIs.
3. **Weaknesses:** Summary/receiving/issues allowlisted/incomplete; overlaps receive/reorder/errors.
4. **Duplicates:** receive-stock, reorder, errors.
5. **Complexity:** High.
6. **Ponytail:** Single procurement status board; 3 tabs Overview|Queue|History; `partial` incomplete tabs.
7. **Reuse:** Receive components from receive-stock.
8. **UX:** Action queue first.
9. **Tech:** Share types with purchasing.
10. **Perf:** Lazy tabs.
11. **A11y:** Finish tab roles.
12. **CONSOLIDATE** 13. **Critical**

### `/inventory/receive-stock`

1. **Purpose:** Floor PO receive + scan.
2. **Strengths:** Real receive; barcode; per-line location; extracted components.
3. **Weaknesses:** Triple receive UX with PO detail + pipeline.
4. **Duplicates:** purchasing ReceiveTab; pipeline Receiving.
5. **Complexity:** High.
6. **Ponytail:** Canonical floor tool; others deep-link here.
7. **Reuse:** ReceiveLinesCard, PendingPOsTable.
8. **UX:** Entry from pending PO.
9. **Tech:** Share mutation with PO detail.
10–11. Fine / scan labeling.
12. **KEEP** 13. **High**

### `/inventory/errors`

1. **Purpose:** Error check center.
2. **Strengths:** Real errors APIs; drill-down.
3. **Weaknesses:** In Review ≈ Open bug; raw pills; pipeline Issues overlap; allowlisted categories.
4. **Duplicates:** Pipeline IssuesTab.
5. **Complexity:** Med.
6. **Ponytail:** One ops queue; fix In Review filter; gate incomplete.
7. **Reuse:** ErrorsSummary/List.
8. **UX:** Single queue.
9. **Tech:** Pass `status=in_review`.
10–11. Fine / tab roles.
12. **REFACTOR** 13. **High**

### `/inventory/counts`

1. **Purpose:** Cycle count sessions.
2. **Strengths:** Real counts API; solid workflow.
3. **Weaknesses:** Custom modal; overlaps warehouse mock counts.
4. **Duplicates:** Warehouse cycle-counts.
5. **Complexity:** Med–High.
6. **Ponytail:** Keep real; warehouse links here.
7. **Reuse:** Modal, ConfirmDialog, EmptyState.
8. **UX:** Mobile gap entry.
9. **Tech:** DS modal.
10–11. Fine / focus trap.
12. **KEEP** 13. **Medium**

### `/inventory/reorder`

1. **Purpose:** Suggestions → draft POs.
2. **Strengths:** Real suggestions + create-po; vendor confirm.
3. **Weaknesses:** Triple with purchasing ReorderTab + pipeline alerts.
4. **Duplicates:** Same create-po API thrice.
5. **Complexity:** Med.
6. **Ponytail:** One reorder UI under purchasing/pipeline.
7. **Reuse:** KpiCard, purchasing ReorderTab.
8. **UX:** Keep vendor-grouped confirm pattern.
9. **Tech:** Deduplicate fetch/create.
10–11. Fine / modal focus.
12. **CONSOLIDATE** 13. **High**

### `/inventory/serials`

1. **Purpose:** Serial receive/status.
2. **Strengths:** Real serials API.
3. **Weaknesses:** Manual product id; custom modals.
4. **Duplicates:** Adjacent to service-orders.
5. **Complexity:** Med.
6. **Ponytail:** Keep; product typeahead.
7. **Reuse:** Modal, Badge, catalog search.
8. **UX:** Scan serial.
9. **Tech:** DS pass.
10–11. Fine.
12. **REFACTOR** 13. **Low**

### `/inventory/locations`

1. **Purpose:** Store map aisle/shelf/bin + product-location assign.
2. **Strengths:** Real store-locations / product-locations.
3. **Weaknesses:** Overlaps operations + warehouse location models.
4. **Duplicates:** Four location systems.
5. **Complexity:** Med–High.
6. **Ponytail:** One Locations IA with type filter.
7. **Reuse:** operations StockLocationsTab patterns.
8. **UX:** Clarify store map vs WMS bins.
9. **Tech:** Document canonical API per use.
10–11. Fine / map labels.
12. **CONSOLIDATE** 13. **High**

### `/purchase`

1. **Purpose:** Post-receive cost confirmation.
2. **Strengths:** Clear valuation job; margin badge; Button/Card.
3. **Weaknesses:** Nav label confusable with Purchasing.
4. **Duplicates:** Name collision; cost also on PO billing.
5. **Complexity:** Low–Med.
6. **Ponytail:** Rename “Cost entry”; link from receive success.
7. **Reuse:** Input, EmptyState.
8. **UX:** Batch confirm; cost deltas.
9. **Tech:** Input primitive.
10–11. Fine.
12. **REFACTOR** 13. **Medium**

### `/purchasing`

1. **Purpose:** PO / suppliers / reorder hub; Buyer; daily.
2. **Strengths:** Tab composition; real purchasing APIs; feature-flag quotes.
3. **Weaknesses:** Suppliers overlap vendors; ReorderTab duplicates inventory reorder.
4. **Duplicates:** Inventory Orders tab; vendors; reorder pages.
5. **Complexity:** Med.
6. **Ponytail:** Canonical purchasing home; one vendor entity; one reorder UI.
7. **Reuse:** Existing `_components/*`.
8. **UX:** Prominent row → `[id]`.
9. **Tech:** Align supplier↔vendor copy.
10–11. Fine / TabBar a11y.
12. **KEEP** 13. **Critical**

### `/purchasing/[id]`

1. **Purpose:** PO detail — lines/receive/billing/credits.
2. **Strengths:** Real detail APIs; role-gated receive.
3. **Weaknesses:** Receive overlaps receive-stock.
4. **Duplicates:** Receive workstation; vendor credits; finance bills.
5. **Complexity:** High.
6. **Ponytail:** Keep; CTA “Open receive workstation”.
7. **Reuse:** Lines/Receive/Billing/Credits tabs.
8. **UX:** Status-driven primary action.
9. **Tech:** Share receive mutation.
10–11. Price history lazy / aria-current tabs.
12. **KEEP** 13. **High**

### `/purchasing/edi-imports`

1. **Purpose:** EDI upload → validate → history.
2. **Strengths:** 3-step flow; refresh after upload.
3. **Weaknesses:** File bytes not uploaded (NEEDS-SRI); raw tabs; mock suppliers in upload.
4. **Duplicates:** edi_parse in error center.
5. **Complexity:** Med.
6. **Ponytail:** Keep honest; link failures to Error Center; don’t fake parse.
7. **Reuse:** Upload/Queue/History components.
8. **UX:** Default Queue for return users.
9. **Tech:** Shared TabBar; real multipart when decided.
10–11. Fine.
12. **REFACTOR** 13. **Medium**

### `/vendors`

1. **Purpose:** Vendor directory + credits/returns panel.
2. **Strengths:** Real vendors + credits/returns; TableSkeleton; role-gated credit.
3. **Weaknesses:** Overlaps purchasing SuppliersTab.
4. **Duplicates:** Suppliers; returns; credits.
5. **Complexity:** Med.
6. **Ponytail:** One vendor master data page.
7. **Reuse:** Detail patterns.
8. **UX:** Primary click → `/vendors/[id]`.
9. **Tech:** Align APIs in UI copy.
10–11. Fine.
12. **CONSOLIDATE** 13. **High**

### `/vendors/[id]`

1. **Purpose:** Vendor 360.
2. **Strengths:** Lazy subresources; real subroutes.
3. **Weaknesses:** Raw tabs; read-heavy.
4. **Duplicates:** PO list / credits / receiving elsewhere.
5. **Complexity:** High.
6. **Ponytail:** Keep 360; deep-link mutations out.
7. **Reuse:** Badge, EmptyState, TableSkeleton.
8. **UX:** KPI header; fewer tabs.
9. **Tech:** DS pass.
10. **Perf:** Lazy subresources — good.
11. **A11y:** Tab keyboard.
12. **REFACTOR** 13. **Medium**

### `/warehouse`

1. **Purpose:** WMS dashboard (locations/receiving/putaway/picks/counts).
2. **Strengths:** Broad IA; RBAC; tabbed.
3. **Weaknesses:** Mock `/api/v1/warehouse`; nav partial; reimplements real inventory pages; local KpiCard; emoji icons.
4. **Duplicates:** counts, receive-stock, operations picks, delivery, locations.
5. **Complexity:** High.
6. **Ponytail:** Keep gated; become shell that links real pages — don’t reimplement.
7. **Reuse:** `@/components/KpiCard`; link-out cards.
8. **UX:** Partial badge in UI.
9. **Tech:** Stay mock-labeled until BE.
10–11. N/A / drop emoji-only meaning.
12. **CONSOLIDATE** 13. **Medium**

### `/operations`

1. **Purpose:** Fulfillment locations, pick lists, outlets/registers, stock locations.
2. **Strengths:** Real fulfillment/outlets APIs; Table/Modal/Button.
3. **Weaknesses:** Kitchen-sink; outlets belong in Setup; locations overlap.
4. **Duplicates:** setup/outlets; inventory locations; delivery picks.
5. **Complexity:** High.
6. **Ponytail:** Split — Outlets→Setup; Stock locations→Inventory; Pick lists→Delivery.
7. **Reuse:** StockLocationsTab, Table, Modal.
8. **UX:** Don’t mix setup with pick/pack.
9. **Tech:** Move outlet CRUD to setup.
10–11. Fine / tab a11y.
12. **CONSOLIDATE** 13. **High**

### `/delivery`

1. **Purpose:** SO pick→pack→ship→deliver→invoice wizard.
2. **Strengths:** Real fulfillment+shipping+billing; Skeleton; role gate; steps.
3. **Weaknesses:** Overlaps `/shipping` mutations; ops pick lists.
4. **Duplicates:** Shipping; operations picklists.
5. **Complexity:** Med–High.
6. **Ponytail:** Keep wizard; shipping = list/tracking only.
7. **Reuse:** Skeleton, Button, Card, EmptyState.
8. **UX:** Clear next-action CTA.
9. **Tech:** Share ship/deliver helpers with shipping.
10–11. Detail fan-out OK / step aria-current.
12. **KEEP** 13. **High**

### `/shipping`

1. **Purpose:** Shipment list + ship/deliver/cancel.
2. **Strengths:** Real shipping API; Badge/Button; filters.
3. **Weaknesses:** No loading state; raw filters; overlaps delivery actions.
4. **Duplicates:** Delivery ship/deliver.
5. **Complexity:** Med.
6. **Ponytail:** List/tracking only; mutations from delivery wizard.
7. **Reuse:** KpiCard, TableSkeleton, EmptyState, Input.
8. **UX:** Add loading/empty.
9. **Tech:** loading flag; shared action helpers.
10–11. Fine / aria-pressed filters.
12. **CONSOLIDATE** → `/delivery` 13. **High**

---

## Status

`built_verified` for audit completeness of this cluster (static code audit). No product code in this file’s commit scope beyond docs/lock updates in the companion PR.
