# Ascend — Product Experience Review (code-verified)

Date: 2026-07-30T222326Z  
Roles applied: Principal Product Designer · Enterprise Solutions Architect · Senior UX Engineer  
Branch: `cursor/product-experience-review-4fe7`  
Method: navigation tree + page inventory + FE↔BE contract checks + design-system audit against `AGENTS.md` / `ENTERPRISE_UX_SPEC` patterns. **Evidence over wishlist.**

## Executive verdict

Ascend has real operational depth (POS, catalog, inventory, purchasing, finance, reports, recommendations). The product does **not** yet feel enterprise-ready end-to-end: navigation teaches poorly, several “live” pages silently show empty/wrong data, POS stubs break cashier trust, and the design system is inconsistently applied (raw controls + default Tailwind palettes dominate).

This pass ships Critical correctness + dead-control removals (see §Shipped). The rest is a prioritized roadmap.

---

## Cross-cutting findings

| # | Observation | Priority | Effort | Business impact |
|---|---|---|---|---|
| C1 | Design system incomplete for lists — no `DataGrid`; `Pagination` almost unused; most tables hand-rolled | High | L | Inconsistent density; catalogs/reports hard to scale |
| C2 | Command palette lands on list hubs, not records (`CommandPalette.hrefForHit`) | High | S | Search feels broken for power users |
| C3 | Dual auth models: nav uses `hasFeature`, many pages use `hasRole("manager")`; `PermissionGuard` unused | High | M | Confusing “I can see it but can’t act” / reverse |
| C4 | Large orphan surface (verticals, shipping, workforce, notifications, module marketplace) not in `NAV_TREE` | Medium | M | Features exist but are undiscoverable |
| C5 | Setup / Settings / Account settings naming split | Medium | S | Trust & findability |
| C6 | Silent `.catch(() => {})` on load paths (inventory overview, gift cards, POS deduct) | Critical | S–M | False empty states; lost money/stock signals |
| C7 | Partial/mock surfaces in normal Inventory nav (pipeline receiving/issues/errors) while only 4 items use `partial: true` | Critical | S | Operators trust broken UIs |
| C8 | One owner-style dashboard; no role variants (cashier / inventory / accountant) | Medium | L | Wrong default home per role |
| C9 | Approvals fragmented (deposits, AI, permission requests, workflows config-only) — no inbox | High | L | Manager context-switching |
| C10 | AuthShell still shows brand mark “F”; system font stack | Low | S | Brand polish |

Effort: **S** <1 day · **M** few days · **L** multi-day / multi-PR.

---

## Module reviews (8-point format)

### Shell & navigation (`EnterpriseShell`)

1. **Current:** Top bar + collapsible left rail; 4-layer visibility (partial / module / capabilities / features); command palette ⌘K.
2. **UX issues:** Help → `/help` 404 (**fixed this PR**); Sell “Switch” register noop (**fixed**); Purchase vs Purchasing labels; Help/username Mac-centric kbd.
3. **Missing:** Breadcrumbs, global filter bar, bottom nav for tablet POS, help center, register switcher.
4. **Enterprise practice:** Role-aware IA; command palette opens entities; no dead chrome.
5. **Recs:** Entity deep-links in palette; rename Purchase→Cost entry; hide BE-missing inventory tabs behind `partial`; unify Settings naming.
6. **Priority:** Critical (dead chrome) / High (palette, IA)
7. **Effort:** S–M
8. **Impact:** Daily trust + discoverability

### Onboarding / auth

1. **Current:** Login, signup (business type), onboarding wizard (retail-ready only), MFA page is Preview/mock.
2. **UX issues:** Post-login → `/terminal` (good for cashier, odd for owner); `/store/login` not in public middleware prefixes.
3. **Missing:** Guided first-sale checklist tied to role; SSO live.
4. **Practice:** Role-based first destination; progressive disclosure of packs.
5. **Recs:** Owner → dashboard; cashier → terminal; wire MFA or remove Preview page from prod nav paths.
6. **Priority:** High
7. **Effort:** M
8. **Impact:** Activation & security posture

### Dashboard

1. **Current:** Dense KPIs, recommendations→progress tasks, charts, top lists.
2. **UX issues:** Outlet filter was decorative (**fixed**); Avg Sale Value = Avg Order Value (duplicate); Top Customers maps `orderCount`←`units`.
3. **Missing:** Role dashboards; pending-approvals strip; sparkline CQRS (PR #132 open separately).
4. **Practice:** One job per role’s first screen; filters must affect data.
5. **Recs:** Drop or differentiate AOV card; fix customer units label; surface AI/deposit approvals.
6. **Priority:** High
7. **Effort:** S–M
8. **Impact:** Owner decision speed

### POS / Terminal

1. **Current:** Product grid, cart, tender, barcode POS resolution, register guard, offline banner.
2. **UX issues:** Hold / Cash drawer / Print / Return mode stubs or cosmetic; no customer attach; no gift-card tender; catalog capped 200; Quick Sell pointed at `/register` (**fixed** → `/terminal?product=` + auto-add).
3. **Missing:** Held sales, drawer kick, line returns, customer/loyalty attach, gift card tender.
4. **Practice:** Cashier can complete sale with ≤3 intents; stubs never look “live”.
5. **Recs:** Hide stub actions or implement; customer search modal; gift-card tender; paginate catalog.
6. **Priority:** Critical
7. **Effort:** M–L
8. **Impact:** Core revenue path

### Catalog

1. **Current:** List with pagination + bulk; 15-tab detail with group labels (shipped).
2. **UX issues:** Raw controls / hex; CreditsTab orphan; Quick Sell broken (**fixed**); high tab cognitive load.
3. **Missing:** Shared DataGrid; credits concept (NEEDS-SRI).
4. **Practice:** Fewer tabs or progressive sections; bulk with failure detail.
5. **Recs:** Collapse transactions/purchasing sub-tabs; adopt primitives; delete CreditsTab file or gate.
6. **Priority:** Medium
7. **Effort:** M
8. **Impact:** Merchandising speed

### Inventory & purchasing

1. **Current:** Overview, receive, counts, pipeline, expiry-pool, serials, reorder, purchasing hub, cost-entry, vendors, EDI.
2. **UX issues:** Overview silent errors + hardcoded suppliers; Returns tab hits missing BE; pipeline receiving/issues/summary allowlisted but nav-visible; duplicate receive + reorder paths; EDI no file bytes.
3. **Missing:** Receiving sessions / issues engine (NEEDS-SRI); single receive journey.
4. **Practice:** One receive path; Preview gate incomplete surfaces.
5. **Recs:** `partial: true` on BE-missing tabs; consolidate receive into PO detail; error banners on overview.
6. **Priority:** Critical (false-live) / High (consolidation)
7. **Effort:** S–M
8. **Impact:** Stock correctness & buyer trust

### Customers / returns / loyalty / gift cards

1. **Current:** Customer list+detail+merge; returns full-order refund; loyalty CRUD; gift card issue/void.
2. **UX issues:** Import dead + fake checkboxes (**fixed**); edit pencil dead (**fixed**→detail); returns no line-level; gift cards not on POS; gift card list silent fail.
3. **Missing:** Partial returns; POS earn/redeem; import.
4. **Practice:** No decorative controls; tender methods match back-office products.
5. **Recs:** Line returns; POS customer+GC; surface gift-card load errors.
6. **Priority:** High
7. **Effort:** M
8. **Impact:** Service recovery & loyalty ROI

### Finance / accounting / reports

1. **Current:** Finance AR+expenses; bills page; accounting aging+deposits+COA; reports sub-nav.
2. **UX issues:** `/reports/ar-aging` + `/reports/inventory` wrong shapes → empty forever (**fixed**); Finance AP tab unreachable inline (**fixed**→`/bills`); Finance Aging → reports; AR shows raw IDs; duplicate COA/deposits surfaces.
3. **Missing:** Journal UI; AR aging SQL rewrite; customer names on aging; time-cards truncation notice.
4. **Practice:** One owner for AP/AR/COA; reports match contracts; deep links to parties.
5. **Recs:** Join customer names on aging BE; collapse Finance↔Accounting ownership; Pagination on report lists.
6. **Priority:** Critical (contracts) / High (IA)
7. **Effort:** S–L
8. **Impact:** Cash collection & close process

### Insights / AI / workflows / team / settings

1. **Current:** Insights forecasting+scheduled reports; AI assistant approve/reject; workflows definitions; team directory; settings hub.
2. **UX issues:** Workflows “New Chain/Edit” no handlers; approval chains not enforced (GAPS); custom-roles vs FEATURE_GROUPS dialects; AI layout weak on mobile.
3. **Missing:** Unified approvals inbox; trigger wiring (NEEDS-SRI); invitations/sessions tabs per spec.
4. **Practice:** Don’t ship dead CTAs; one permission vocabulary.
5. **Recs:** Hide workflow chain CTAs until wired; unify permission codes; link dashboard→AI pending.
6. **Priority:** High
7. **Effort:** M
8. **Impact:** Governance & manager load

---

## Role lenses (what each role needs next)

| Role | Primary job | Biggest friction today | First fix |
|---|---|---|---|
| Cashier | Sell fast | POS stubs; no customer/GC; return mode fake | Hide stubs; customer attach |
| Inventory manager | Receive / transfer / count | Silent failures; false-live pipeline tabs | Error banners; partial gate |
| Purchasing | Reorder → PO → receive | Duplicate paths; EDI inert | One receive journey |
| Accountant | AR/AP/aging/close | Empty aging/inventory reports; split COA | Contract fixes (shipped); join names |
| Manager/Owner | Exceptions & approvals | Fragmented approvals; one dashboard | Approvals strip; outlet filter (shipped) |
| Admin | Users & permissions | Two permission dialects | Unify FEATURE_GROUPS |

---

## Recommended roadmap (do not rebuild shipped Product/Reports phases)

### Wave A — Trust (Critical) — **this PR starts**
1. Fix report FE contracts (AR aging, inventory valuation) ✅  
2. Fix Quick Sell + terminal deep-link ✅  
3. Wire dashboard outlet filter ✅  
4. Remove dead Help / Switch / Import / fake checkboxes / Finance AP dead panel ✅  
5. Next: `partial: true` on BE-missing inventory pipeline/errors tabs; replace silent catches with error UI  

### Wave B — Cashier & buyer speed (High)
6. POS: customer attach, gift-card tender, hide or implement Hold/Drawer/Print/Return  
7. Command palette → entity detail URLs  
8. Consolidate Purchase / Purchasing / receive-stock labels & entry points  
9. Finance customer/supplier deep links + aging party names (BE join)  

### Wave C — Enterprise consistency (Medium)
10. Adopt `Button`/`Input`/`Select`/`EmptyState`/`Pagination` on retail-critical lists (not full DataGrid yet unless Sri prioritizes)  
11. Role-aware default home + lighter cashier dashboard  
12. Unified Approvals inbox (deposits + AI + permission requests)  
13. Settings naming consolidation  

### Wave D — NEEDS-SRI / evidence-gated
Receiving sessions, EDI bytes, approval-chain triggers, credits concept, CQRS sparkline job, custom-roles contract, production deploy reality (`DEPLOYMENTS.md`).

---

## Shipped in this PR (`built_verified` pending CI)

| Change | Why |
|---|---|
| `/reports/ar-aging` reads `AgingReport.parties/buckets` | Was permanently empty |
| `/reports/inventory` reads `rows` + totals | Was permanently empty |
| Catalog Quick Sell → `/terminal?product=` + auto-add | Was 404 `/register` |
| Dashboard outlet select drives `outlet_id` query | Was decorative |
| Remove Help 404, Register Switch noop, Import customers dead CTA, fake row checkboxes | Dead chrome destroys trust |
| Customer edit → `/customers/:id` | Pencil did nothing |
| Finance Payables → `/bills`; Aging → `/reports/ar-aging`; delete unreachable AP panel | Same class as prior Aging cleanup |

## Verification plan

- `cd web && npm run typecheck && npm run lint`
- Spot-check: AR aging / inventory reports render rows when BE has data; Quick Sell adds line; outlet filter changes requests; Finance Payables lands on Bills.

## Honest limits

- Not a visual redesign of every page — that would violate “evidence before infrastructure” and blast-radius rules.
- Vertical packs remain orphaned by design until business-pack IA is decided.
- PR #132 (sparklines live orders) remains separate / open.
