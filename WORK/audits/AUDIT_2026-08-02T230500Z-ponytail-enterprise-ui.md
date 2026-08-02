# Ascend — Ponytail Enterprise UI Audit (Page-by-Page)

| Field | Value |
|---|---|
| Date (UTC) | 2026-08-02T23:05:00Z |
| Protocol | ASCEND Enterprise UI Audit Protocol — Ponytail Page-by-Page Review |
| Scope | All **142** `web/app/**/page.tsx` routes on `origin/master` @ e55e743 |
| Method | Code-read of every page (+ key `_components`, `EnterpriseShell` nav, API gap allowlist, MSW, backend module presence). No product code changes. |
| Preference | Smallest change that reduces complexity. Prefer **CONSOLIDATE** over **REWRITE**. |
| Related prior audits | `AUDIT_2026-07-13T193958Z-retail-ux-architecture.md` (alias inventory; some duplicates already fixed) |
| Status vocabulary | `built_verified` / `built_unverified` / `partial` / `mocked` / `planned` / `missing` |

---

## Executive verdict

Ascend’s UI complexity problem is **not** “ugly pages.” It is **parallel IA** (two report trees, setup vs settings, Purchase vs Purchasing, Sales vs Orders), **preview engines dressed as product** (Promotions, Pricing, Warehouse, Golf, Documents, Error Center, Pipeline fake tabs), and **design-system drift** (raw controls + `slate-*`/`#111` instead of `erp`/`brand` primitives).

**Success metric for this audit:** cut unnecessary surfaces while protecting the retail proof path:

`Signup → Setup → Catalog → Receive/Cost → Terminal sale → Expenses → Dashboard/Reports → Recommendations/Tasks`

**Do not rewrite the POS.** Harden `/terminal`, consolidate aliases and mock theaters, then DS-refactor the keepers.

### Complexity reduction targets (recommended end-state)

| Area | Today (nav / routes) | Ponytail end-state |
|---|---|---|
| Inventory nav | 16 children | ~7: Movements, Purchasing (hub), Receive, Expiry, Counts, Locations, Vendors (+ Serials if enabled) |
| Report URLs | `/reports/*` + `/reporting/*` (26) | `/reports/*` only (+ 308 redirects) |
| Sell history | `/sales` (mocked) + `/orders` (real) | `/orders` only |
| Promo engines | Promotions + Discounts + Pricing | Discounts canonical; Pricing overrides only; Promotions hidden |
| Setup | `/settings` + `/setup/*` + duplicate profile/modules | `/settings` (+ `/settings/modes`) |
| Finance | Finance hub + Accounting + Bills + Invoicing + aliases | Finance summary hub → Bills / Invoicing / Accounting (COA/deposits/aging) |
| Verticals | Golf UI (no BE) + 8 packs | Module-gated preview shells; Golf/Documents stay hidden |

---

## Master decision matrix (all 142 pages)

Legend: **K**=KEEP · **R**=REFACTOR · **C**=CONSOLIDATE · **D**=REDESIGN · **W**=REWRITE · **H**=HIDE/park

### Auth & public (13)

| Route | Decision | Priority | Backend | One-line Ponytail call |
|---|---|---|---|---|
| `/` | D | Medium | n/a | Tokenize; simplify hero; drop indigo/slate marketing cards |
| `/login` | R | High | real | DS inputs; collapse unused SSO; one MFA path |
| `/login/mfa` | C | High | mocked page | Merge into `/login` challenge; stop mock `123456` verify |
| `/login/forgot-password` | K | Medium | real | Light DS refactor |
| `/login/reset-password` | K | Medium | real | Skeleton fallback; DS inputs |
| `/login/device-verification` | H/C | Low | missing | Park until device-trust API |
| `/login/security-alert` | H/C | Low | missing | Park with device-verification |
| `/signup` | R | High | real / partial profile | Kill “F” logo; retail-first types; DS controls |
| `/store` | R | Medium | real catalog | Tokenize; surface errors; paginate |
| `/store/login` | H/K | Low | mocked | Preview gate until ecommerce auth |
| `/store/[id]` | R | Medium | partial | Hide fake Add-to-cart until cart API |
| `/store/account` | R | Low | partial | Badge tokens; surface errors |

### Sell (10)

| Route | Decision | Priority | Backend | One-line Ponytail call |
|---|---|---|---|---|
| `/terminal` | K | Critical | real | Canonical POS — harden, don’t rebuild |
| `/sell` | C | High | real | Redirect → `/terminal` |
| `/sales` | C | Critical | **mocked** | Fold into `/orders` or hide until real history API |
| `/orders` | K/R | Critical | real | Single sales-history home |
| `/orders/[id]` | K | High | real | Detail SoT; share refund/void |
| `/quotes` | R | Medium | real | Share list shell with orders; wire filters |
| `/returns` | K/R | High | real | Keep workbench; share refund action |
| `/payments` | C | High | real | Into order detail / tender audit; rename “Tenders” |
| `/service-orders` | R | Medium | real | Feature-gated; DS modal/inputs |
| `/display` | K | Medium | n/a (BroadcastChannel) | Keep customer pole display |

### Finance (8)

| Route | Decision | Priority | Backend | One-line Ponytail call |
|---|---|---|---|---|
| `/finance` | C | Critical | real | Hub = summaries + deep links; fix AP tab route hijack |
| `/finance/bills` | C | Critical | real | Alias → `/bills` only |
| `/finance/payment-made` | C | High | missing as named | Remove misleading alias |
| `/finance/settings` | C | Medium | n/a | Remove; link `/settings` |
| `/accounting` | C | High | real | Keep COA/deposits/aging; drop duplicate AR/AP pay grids |
| `/bills` | K | High | real | Canonical AP list |
| `/invoicing` | R | High | real | DS + clarify vs billing invoices |
| `/payments` (Sell) | C | High | real | See Sell |

### Catalog & commercial (9)

| Route | Decision | Priority | Backend | One-line Ponytail call |
|---|---|---|---|---|
| `/catalog` | K | High | real | DS tabs; keep ProductsTab density |
| `/catalog/[id]` | R | High | real | Collapse tab sprawl; default Overview |
| `/catalog/categories/[id]` | C | Medium | partial | Into `/catalog?tab=categories` |
| `/catalog/price-book` | C (done) | Low | redirect | Keep redirect |
| `/catalog/promotions` | C/H | Critical | **mocked** | Stay partial; don’t expand; Discounts wins |
| `/pricing` | R | High | partial | Keep Customer Overrides; quarantine engine tabs |
| `/discounts` | K | High | real | **Canonical** promo/coupon surface |
| `/gift-cards` | K | Medium | real | Counter tool; ConfirmDialog on void |
| `/loyalty` | K | Medium | real | One home (not Setup + Catalog confusion) |
| `/catalog/matrix` | — | — | **missing** | Not on master; do not rebuild until needed |

### Inventory & fulfillment (22)

| Route | Decision | Priority | Backend | One-line Ponytail call |
|---|---|---|---|---|
| `/inventory` | R | High | partial | Rename Movements; fix returns; drop hard-coded supplier map |
| `/inventory/pipeline` | C | Critical | partial | Keep real Pending/History/Reorder; hide fake tabs; nest under Purchasing |
| `/inventory/receive-stock` | K | Critical | real | **Canonical receive** |
| `/inventory/expiry` | C (done) | Low | redirect | Keep redirect → expiry-pool |
| `/inventory/expiry-pool` | K | High | real | Canonical expiry |
| `/inventory/errors` | H/C | Critical | **mocked** | Mark `partial: true` or remove from nav **now** |
| `/inventory/counts` | K | High | real | Canonical cycle counts |
| `/inventory/reorder` | C | Critical | real | → `/purchasing?tab=reorder` |
| `/inventory/serials` | R | Low–Med | real | Product picker; feature-gate |
| `/inventory/locations` | C | High | real | Merge location concepts with Operations |
| `/inventory/transfers` | C (done) | Low | redirect | Keep |
| `/purchase` | C | Critical | real | Rename **Cost entry**; nest under Purchasing |
| `/purchasing` | K | Critical | real | **Procurement hub** |
| `/purchasing/[id]` | K | High | real | Receive CTA → receive-stock |
| `/purchasing/edi-imports` | C | Medium | real (honest empty process) | Nest under Purchasing; feature-gate |
| `/warehouse` | H/C | Critical | **mocked** | Thin landing or stay partial-hidden |
| `/delivery` | K | High | real | Relocate out of Inventory; absorb Shipping |
| `/shipping` | C | High | real | Into `/delivery` (orphaned from nav today) |
| `/vendors` | K | Medium | real | Merge Suppliers concept |
| `/vendors/[id]` | K | Medium | real | Keep 360; tokenize |
| `/operations` | C | High | real | Dissolve → Setup + Locations + Delivery |
| `/ecommerce/delivery|shipping` | C | High | re-export ecommerce | Fix misleading aliases |

### Reports (26 = 13 + 13 aliases)

| Route | Decision | Priority | Backend | One-line |
|---|---|---|---|---|
| `/reports` | R | High | real | Slim KPI home; share with dashboard |
| `/reports/sales` | R | High | real | Gate consistently; fetch active tab only |
| `/reports/end-of-day` | K | High | real | Retail Z-report — polish |
| `/reports/p-l` | R | High | real | Statement layout |
| `/reports/purchases` | R | Medium | real | Vendor picker |
| `/reports/sales-by-rep` | C | Medium | real | Into sales “Group by” |
| `/reports/sales-by-vendor` | C | Medium | real | Into sales “Group by” |
| `/reports/inventory` | R | Medium | real | Paginate valuation |
| `/reports/ar-aging` | K | Medium | real | Customer drill-down |
| `/reports/expiry` | C | High | real | → inventory expiry-pool |
| `/reports/cash-movement` | C | Medium | real | → register-closures / EOD |
| `/reports/register-closures` | K | High | real | Cash control center |
| `/reports/time-cards` | C | Medium | real | → Team |
| `/reporting` + 12 children | C | Critical | aliases | 308 → `/reports/*`; delete tree |

### Customers, dashboard, ops misc (covered in §B)

| Route | Decision | Priority | Backend | One-line |
|---|---|---|---|---|
| `/dashboard` | K | Critical | real | Retail proof home; checklist |
| `/customers` | R | Critical | real | Fix **N+1** summaries; DS buttons |
| `/customers/[id]` | R | High | real | Tokenize; keep merge |
| `/insights` | C | Medium | varies | Into reporting/inventory |
| `/tax-compliance` | C/R | High | partial | Rates→settings; hide MSA_SAMPLE |
| `/notifications` | R | Medium | real | DS monolith split |
| `/onboarding` | R | High | real | Fix “F”; share type picker with modes |
| `/ecommerce` | R/C | High | partial | Children are re-exports; promotions mock |
| `/ecommerce/customers|orders|promotions|delivery|shipping` | C | High | aliases | Redirects/tabs; fix delivery/shipping lies |
| `/imports-exports` | K/R | Medium | real | Keep |
| `/integrations` | K/R | Medium | real | Keep |
| `/documents` | H | Critical | **mocked** | Already `partial: true` — keep hidden |
| `/audit-log` | K | Medium | real | Keep |
| `/workflows` | R | Medium | real | DS; honesty on unused approval triggers |
| `/workforce` | C/K | Medium | real | Nest under Team when shown |
| `/appointments` | K | Low | real | Module-gated |
| `/team` | K | High | real | Hub |
| `/team/[id]` | R | High | real | Dedupe permissions UI |
| `/team/custom-roles` | C | High | contract mismatch | → `/settings/permissions` (NEEDS-SRI model) |

### Settings / Setup (20)

| Route | Decision | Priority | Backend | One-line |
|---|---|---|---|---|
| `/settings` | K | Critical | real | Canonical Setup hub |
| `/settings/permissions` | K | High | partial/contract | Canonical RBAC UI |
| `/settings/modes` | K | Critical | real | Canonical business profile/modules |
| `/settings/kiosk` | W/H | High | **missing** | Fake `setTimeout` save + `finder-pos.app` URL |
| `/settings/b2b` | R | High | partial | Kill `finder-pos.app` brand string |
| `/setup` + 10 aliases | C | Critical | aliases | Checklist deep-links — redirect or update checklist |
| `/setup/business-profile` | C | Critical | real dup | → `/settings/modes` |
| `/setup/modules` | C | Critical | real dup | → `/settings/modes` |

### Vertical previews (15)

| Route | Decision | Priority | Backend | One-line |
|---|---|---|---|---|
| `/golf` + 3 children | H | Critical | **mocked** | No `src/modules/golf` |
| `/restaurant/*` (4) | K gated | Low | partial | Preview shells |
| `/healthcare` `/hospitality` `/education` `/entertainment` `/manufacturing` `/automotive` `/rental` | K gated | Low | partial | One VerticalResourcePage template |

---

## Cross-cutting findings (Ponytail)

1. **Alias debt is useful when honest** (redirects for price-book/expiry/transfers) and harmful when it creates parallel IA (`/reporting`, `/sell`, `/finance/*` re-exports that hijack chrome).
2. **Nav honesty gaps:** `/inventory/errors` and Pipeline fake tabs are **not** `partial: true` but are mock/missing in prod — worse than Warehouse/Documents which are gated.
3. **`/sales` is a production footgun:** nav-visible, calls MSW-only `/api/v1/sales/history`.
4. **Design system:** Almost every page violates `docs/ENTERPRISE_UX_SPEC.md` the same way — raw controls + default palette. Fix via shared shells, not 142 one-off redesigns.
5. **Brand violations:** `finder-pos.app` on kiosk + B2B; “F” mark on signup/onboarding.
6. **Reuse first:** `ReportPageShell`, Purchasing hub tabs, Orders list shell, Vertical CRUD shell, shared refund/pay controls, DS primitives only.

---

## Implementation priority waves (smallest → greatest leverage)

### Wave 0 — Honesty (Critical, low code risk)
1. Mark `/inventory/errors` (+ Pipeline summary/receiving/issues tabs) `partial` or hide.
2. Hide or rewire `/sales` (mock history) → `/orders`.
3. Fix brand strings (`finder-pos.app`, “F” logo).
4. Badge/hide kiosk until save is real.

### Wave 1 — Alias & IA consolidation (Critical)
1. 308 `/reporting/*` → `/reports/*`; delete re-export tree after.
2. `/sell` → `/terminal`; `/finance/bills|settings|payment-made` cleanup; ecommerce child alias honesty.
3. Merge `/setup/business-profile` + `/setup/modules` → `/settings/modes`; update checklist links.
4. Inventory nav: nest Purchase (Cost entry), Reorder, EDI, Pipeline under Purchasing; dissolve Operations; move Delivery out.

### Wave 2 — Hub simplification (High)
1. Finance hub summaries only; Accounting drops duplicate pay grids.
2. Shipping → Delivery tab.
3. Promotions stay partial; Pricing quarantine non-override tabs.
4. Custom-roles vs permissions — blocked on Sri contract decision.

### Wave 3 — DS refactor on keepers (High/Medium)
Terminal children, Orders, Catalog ProductsTab, Receive-stock, Bills, Reports EOD/register-closures, Dashboard — primitives + tokens + a11y, **no IA change**.

### Wave 4 — Do not do yet
Full Promotions/Pricing/Warehouse/Golf backends; `/catalog/matrix` rebuild; WMS; speculative Error Center detection engine.

---


# 0. Auth / Public / Sell / Finance (detailed stubs)

## Auth & public

### `/` — landing

1. **Business Purpose:** Prospect acquisition; CTAs to signup/login.  
2. **Primary User + frequency:** Prospects; rare.  
3. **Strengths:** Clear Ascend naming; simple structure.  
4. **Weaknesses:** Hard `slate`/`indigo`; raw `<Link>` CTAs; card-heavy; clashes with enterprise DS.  
5. **Duplicate Features:** Auth messaging on login/signup.  
6. **Complexity:** Low.  
7. **Ponytail:** First viewport = brand + one headline + one CTA; drop feature-card grid from hero.  
8. **Reuse:** AuthShell brand mark; `Button`.  
9. **UX:** Tokenize; retail-honest copy (don’t oversell verticals).  
10. **Tech:** Static OK.  
11. **Perf:** Already light.  
12. **A11y:** CTA contrast + focus rings.  
13. **Decision:** REDESIGN  
14. **Priority:** Medium  
15. **Backend:** n/a  

### `/login`

1. **Purpose:** Staff sign-in (+ optional inline MFA).  
2. **User:** All staff; every session.  
3. **Strengths:** Real identity APIs; AuthShell; validation; loading/error.  
4. **Weaknesses:** Raw inputs; `slate-*`; SSO decorative; MFA duplicated with `/login/mfa`.  
5. **Duplicates:** `/login/mfa`.  
6. **Complexity:** Med.  
7. **Ponytail:** One MFA path; hide SSO until live.  
8. **Reuse:** Shared AuthField with forgot/reset/signup.  
9. **UX:** `Input` primitive; collapse SSO.  
10. **Tech:** Ensure mock-off login always real.  
11. **Perf:** Fine.  
12. **A11y:** Labels strong; password toggle ≥44px.  
13. **Decision:** REFACTOR  
14. **Priority:** High  
15. **Backend:** real  

### `/login/mfa`

1. **Purpose:** Standalone 2FA UI.  
2. **User:** MFA users; per challenge.  
3. **Strengths:** Polished digit UX.  
4. **Weaknesses:** Mock verify (`123456`); not wired from live login path.  
5. **Duplicates:** Inline MFA on `/login`.  
6. **Complexity:** Med.  
7. **Ponytail:** Consolidate into login challenge.  
8. **Reuse:** OTP digit component for device verification later.  
9. **UX:** Call real `/api/identity/login/mfa`.  
10. **Tech:** Remove `setTimeout` mock.  
11. **Perf:** N/A.  
12. **A11y:** Group digit errors.  
13. **Decision:** CONSOLIDATE  
14. **Priority:** High  
15. **Backend:** mocked (page) / real endpoint unused  

### `/login/forgot-password` · `/login/reset-password`

1. **Purpose:** Reset flow.  
2. **User:** Locked-out users; infrequent.  
3. **Strengths:** Real identity endpoints; anti-enumeration; strength meter on reset.  
4. **Weaknesses:** Raw inputs; `Suspense fallback={null}` on reset.  
5. **Duplicates:** None material.  
6. **Complexity:** Low.  
7. **Ponytail:** Keep; share fields.  
8. **Reuse:** Password strength for signup.  
9. **UX:** DS Input; skeleton fallback.  
10. **Tech:** Already solid.  
11. **Perf:** N/A.  
12. **A11y:** `aria-live` on strength.  
13. **Decision:** KEEP  
14. **Priority:** Medium  
15. **Backend:** real  

### `/login/device-verification` · `/login/security-alert`

1. **Purpose:** New-device confirm / reject → reset.  
2. **User:** Rare; **not reached from real login today**.  
3. **Strengths:** Honest Preview banners.  
4. **Weaknesses:** Fully mocked; no session revoke API.  
5. **Duplicates:** MFA “new device” messaging.  
6. **Complexity:** Low.  
7. **Ponytail:** Hide until backend.  
8. **Reuse:** Shared alert layout.  
9. **UX:** Preview gate; DS Buttons.  
10. **Tech:** No login deep-link until events exist.  
11. **Perf:** N/A.  
12. **A11y:** Disabled support CTA needs reason.  
13. **Decision:** CONSOLIDATE / HIDE  
14. **Priority:** Low  
15. **Backend:** missing / mocked  

### `/signup`

1. **Purpose:** Tenant register + business-type lock.  
2. **User:** Owners; once.  
3. **Strengths:** Real register + business-profile; permanence warning.  
4. **Weaknesses:** Legacy “F” logo; emoji types; raw controls; profile errors swallowed; broad vertical list.  
5. **Duplicates:** Type picker vs settings/modes/onboarding.  
6. **Complexity:** Med.  
7. **Ponytail:** Retail-first type list; fix brand.  
8. **Reuse:** Auth fields + modes type picker.  
9. **UX:** Ascend mark; DS Input/Button.  
10. **Tech:** Fail loudly if profile lock fails.  
11. **Perf:** OK.  
12. **A11y:** Selected type announcement.  
13. **Decision:** REFACTOR  
14. **Priority:** High  
15. **Backend:** real (profile error handling partial)  

### `/store` · `/store/[id]` · `/store/login` · `/store/account`

1. **Purpose:** Customer storefront browse / PDP / auth / account.  
2. **User:** Shoppers; secondary to POS.  
3. **Strengths:** Real catalog/variants; PreviewMode on store login; loading/empty patterns.  
4. **Weaknesses:** Hex/`slate`; raw controls; Add-to-cart local-only; ecommerce auth mocked; errors swallowed.  
5. **Duplicates:** Staff catalog (different audience).  
6. **Complexity:** Med.  
7. **Ponytail:** Browse-only until cart/checkout real; keep separate from staff login.  
8. **Reuse:** Product card; money format; Badge.  
9. **UX:** Hide cart CTA; tokenize.  
10. **Tech:** Surface fetch errors; paginate `limit=200`.  
11. **Perf:** Server filter/paginate.  
12. **A11y:** `aria-pressed` on filters; qty labels.  
13. **Decision:** REFACTOR (login KEEP as preview)  
14. **Priority:** Medium / Low  
15. **Backend:** catalog real; auth/cart mocked/missing  

---

## Sell

### `/terminal`

1. **Purpose:** Primary checkout — scan/grid → cart → tender → receipt; offline; register session.  
2. **User:** Cashiers; continuous.  
3. **Strengths:** Real orders/catalog/barcode/inventory; shared terminal kit; offline outbox; display broadcast.  
4. **Weaknesses:** Large surface; some swallowed outlet errors; dual URL via `/sell`.  
5. **Duplicates:** `/sell`.  
6. **Complexity:** High.  
7. **Ponytail:** Canonical sell surface — harden only.  
8. **Reuse:** Already the POS kit.  
9. **UX:** Stronger empty/error for catalog load.  
10. **Tech:** Kill `/sell` alias via redirect.  
11. **Perf:** Virtualize large grids if needed.  
12. **A11y:** Modal focus traps; keypad labels.  
13. **Decision:** KEEP  
14. **Priority:** Critical  
15. **Backend:** real  

### `/sell`

1. **Purpose:** Alias (`export { default } from "../terminal/page"`).  
2. **User:** None distinct.  
3. **Strengths:** Zero logic drift.  
4. **Weaknesses:** Duplicate URL.  
5. **Duplicates:** 100% terminal.  
6. **Complexity:** Low.  
7. **Ponytail:** Redirect only.  
8–12. N/A / redirect.  
13. **Decision:** CONSOLIDATE  
14. **Priority:** High  
15. **Backend:** same as terminal  

### `/sales`

1. **Purpose:** Sales history table.  
2. **User:** Managers/cashiers; daily.  
3. **Strengths:** Filter-bar UX; expandable rows.  
4. **Weaknesses:** Calls **`/api/v1/sales/history` (MSW-only)** — broken in prod; raw controls; hex palette; dead Export; unused date filter.  
5. **Duplicates:** `/orders` + `/orders/[id]`.  
6. **Complexity:** Med.  
7. **Ponytail:** Consolidate to Orders as SoT.  
8. **Reuse:** Filter bar with quotes.  
9. **UX:** Hide/`partial` until rewired.  
10. **Tech:** Point at `/api/v1/orders` or remove nav.  
11. **Perf:** Client filter → server.  
12. **A11y:** `aria-expanded` on rows.  
13. **Decision:** CONSOLIDATE  
14. **Priority:** Critical  
15. **Backend:** mocked  

### `/orders` · `/orders/[id]`

1. **Purpose:** Order list + detail (lines, payments, timeline, void/refund).  
2. **User:** Managers/cashiers; daily.  
3. **Strengths:** Real APIs; DS primitives on list; RBAC; pagination; confirm flows on detail.  
4. **Weaknesses:** Raw status tabs; `alert()` errors; custom ConfirmModal; slate/status hex; list modal overlaps detail.  
5. **Duplicates:** `/sales`, `/payments`, `/returns` refund.  
6. **Complexity:** Med–High.  
7. **Ponytail:** Single history home; slim list modal.  
8. **Reuse:** Status tabs; ConfirmDialog; shared refund hook.  
9. **UX:** Toast not alert; detail deep-links from payments/returns.  
10. **Tech:** Share refund/void actions.  
11. **Perf:** List paginated — good.  
12. **A11y:** Tablist; keyboard row activation.  
13. **Decision:** KEEP (light REFACTOR)  
14. **Priority:** Critical / High  
15. **Backend:** real  

### `/quotes`

1. **Purpose:** Quotation CRUD/convert.  
2. **User:** Sales/managers; B2B-heavy.  
3. **Strengths:** Real `/api/v1/quotes`; role gate; extracted components.  
4. **Weaknesses:** Raw filters; hex chrome; `window.confirm`; silent load failure; unbound date filter.  
5. **Duplicates:** Visual twin of `/sales`.  
6. **Complexity:** Med.  
7. **Ponytail:** Keep feature; share list shell.  
8. **Reuse:** ConfirmDialog; Orders filter bar.  
9. **UX:** Surface errors; wire/remove date filter.  
10. **Tech:** DS controls.  
11. **Perf:** Client filter OK small.  
12. **A11y:** Expand keyboard support.  
13. **Decision:** REFACTOR  
14. **Priority:** Medium  
15. **Backend:** real  

### `/returns`

1. **Purpose:** Receipt lookup + customer refunds + vendor return summary.  
2. **User:** Managers; several×/week.  
3. **Strengths:** Real APIs; manager gate; Card/Button/Badge/TableSkeleton.  
4. **Weaknesses:** Raw search/filters; full-order refund only; slate.  
5. **Duplicates:** Orders refund UI.  
6. **Complexity:** Med.  
7. **Ponytail:** Keep workbench; share refund action.  
8. **Reuse:** KpiCard; order picker.  
9. **UX:** Clarify customer vs vendor sections.  
10. **Tech:** Line-level when BE supports.  
11. **Perf:** Combine order fetches.  
12. **A11y:** `aria-current` on selected order.  
13. **Decision:** KEEP (DS REFACTOR)  
14. **Priority:** High  
15. **Backend:** real (vendor list soft-fail partial)  

### `/payments` (Sell nav)

1. **Purpose:** Per-order tender audit.  
2. **User:** Managers; daily close.  
3. **Strengths:** Real orders+payments; metrics; skeletons.  
4. **Weaknesses:** Thin order picker overlapping detail Payments tab; name collision with AP.  
5. **Duplicates:** `/orders/[id]` payments.  
6. **Complexity:** Med.  
7. **Ponytail:** Consolidate into order detail or register close.  
8. **Reuse:** Payment rows.  
9. **UX:** Rename “Tenders”; `?orderId=` deep link.  
10. **Tech:** Don’t dual-nav.  
11. **Perf:** OK.  
12. **A11y:** Selection keyboard.  
13. **Decision:** CONSOLIDATE  
14. **Priority:** High  
15. **Backend:** real  

### `/service-orders`

1. **Purpose:** Service/repair tickets.  
2. **User:** Service desks; when module on.  
3. **Strengths:** Real API; status workflow; create modal.  
4. **Weaknesses:** Raw controls; custom modal; free-text money.  
5. **Duplicates:** Minimal with core sell.  
6. **Complexity:** Med.  
7. **Ponytail:** Keep gated; low retail prominence.  
8. **Reuse:** Modal/Input/Select; status pattern.  
9. **UX:** Cents-aware money input; EmptyState.  
10. **Tech:** Debounce search.  
11. **Perf:** Debounce reloads.  
12. **A11y:** Drawer close label.  
13. **Decision:** REFACTOR  
14. **Priority:** Medium  
15. **Backend:** real  

### `/display`

1. **Purpose:** Customer pole display via BroadcastChannel.  
2. **User:** Customers at register.  
3. **Strengths:** Idle/cart/thanks states; no fake API.  
4. **Weaknesses:** Hard `#030B25`; silent if channel unsupported.  
5. **Duplicates:** None.  
6. **Complexity:** Low.  
7. **Ponytail:** Keep separate route.  
8. **Reuse:** Totals formatting.  
9. **UX:** “Waiting for register…” fallback.  
10. **Tech:** Document multi-window pairing.  
11. **Perf:** Minimal.  
12. **A11y:** `aria-live` thank-you.  
13. **Decision:** KEEP  
14. **Priority:** Medium  
15. **Backend:** n/a  

---

## Finance

### `/finance`

1. **Purpose:** AR/AP/Expenses hub.  
2. **User:** Owners/managers; daily/weekly.  
3. **Strengths:** Real billing + expenses; role-gated Pay; Expenses MVP home.  
4. **Weaknesses:** AP tab `router.replace("/finance/bills")` lands on Bills re-export — inline AP dead; raw tabs; IDs not names; weak loading.  
5. **Duplicates:** Invoicing, Accounting, Bills.  
6. **Complexity:** High.  
7. **Ponytail:** Hub = summary + deep links; keep Expenses tab.  
8. **Reuse:** ExpensesPanel; PayControl; KpiCard.  
9. **UX:** AR→Invoicing, AP→Bills.  
10. **Tech:** Stop alias hijack.  
11. **Perf:** Lazy tab fetch.  
12. **A11y:** Tablist semantics.  
13. **Decision:** CONSOLIDATE (hub simplify)  
14. **Priority:** Critical  
15. **Backend:** real  

### `/finance/bills` · `/finance/payment-made` · `/finance/settings`

1. **Purpose:** Aliases (bills→`/bills`; payment-made→finance AP sniff; settings→`/settings`).  
2. **User:** Misleading.  
3. **Strengths:** Bills alias points at real Bills.  
4. **Weaknesses:** IA lies; payment-made is not a ledger.  
5. **Duplicates:** Exact.  
6. **Complexity:** Low.  
7. **Ponytail:** Redirect/remove.  
8–12. Redirect hygiene.  
13. **Decision:** CONSOLIDATE  
14. **Priority:** Critical / High / Medium  
15. **Backend:** underlying / missing named feature  

### `/accounting`

1. **Purpose:** COA, deposits, AR/AP tables, aging, dunning.  
2. **User:** Owners/bookkeepers.  
3. **Strengths:** Real accounting+billing+aging; seed COA; deposit approve; dunning.  
4. **Weaknesses:** Re-implements AR/AP pay grids; dense scroll; no skeletons.  
5. **Duplicates:** Finance/Bills/Invoicing.  
6. **Complexity:** High.  
7. **Ponytail:** Keep COA/deposits/aging; link out for pay.  
8. **Reuse:** PayControl; aging.  
9. **UX:** Sub-nav COA | Deposits | Aging.  
10. **Tech:** Split fetch by section.  
11. **Perf:** 6 GETs on mount → sectioned.  
12. **A11y:** Status not color-only.  
13. **Decision:** CONSOLIDATE  
14. **Priority:** High  
15. **Backend:** real  

### `/bills`

1. **Purpose:** Supplier AP bill list (from PO receive).  
2. **User:** Managers; weekly.  
3. **Strengths:** Real billing bills; BillsView; cursor pagination.  
4. **Weaknesses:** Raw select/button; pay lives elsewhere.  
5. **Duplicates:** Finance/Accounting AP.  
6. **Complexity:** Med.  
7. **Ponytail:** Canonical AP list.  
8. **Reuse:** Shared PayControl.  
9. **UX:** EmptyState; optional pay.  
10. **Tech:** DS Select/Button.  
11. **Perf:** Cursor — good.  
12. **A11y:** Filter labels.  
13. **Decision:** KEEP  
14. **Priority:** High  
15. **Backend:** real  

### `/invoicing`

1. **Purpose:** Customer invoice create/lifecycle (`customer-invoices`).  
2. **User:** AR clerks.  
3. **Strengths:** Real API + UPC lookup; builder; status workflow.  
4. **Weaknesses:** Custom overlays; raw controls; dual invoice model vs `billing/invoices` on Finance.  
5. **Duplicates:** Finance AR.  
6. **Complexity:** High.  
7. **Ponytail:** Label domains clearly or unify.  
8. **Reuse:** Modal/Input/Table; money helpers.  
9. **UX:** DS; EmptyState.  
10. **Tech:** Document billing vs customer-invoice relationship.  
11. **Perf:** Paginate list later.  
12. **A11y:** Focus trap on overlays.  
13. **Decision:** REFACTOR  
14. **Priority:** High  
15. **Backend:** real  

---


# 1. Catalog / Inventory / Fulfillment (detailed stubs)

## Catalog & commercial

### `/catalog`

1. **Purpose:** Product + category list; create/import/archive.  
2. **User:** Manager; daily–weekly.  
3. **Strengths:** Real catalog APIs; ProductsTab metrics/pagination/bulk/CSV/labels; EmptyState/TableSkeleton.  
4. **Weaknesses:** Raw tab buttons; `slate`/`blue-600`.  
5. **Duplicates:** Orphan inventory CatalogTab components.  
6. **Complexity:** Med (ProductsTab High).  
7. **Ponytail:** Keep operational density.  
8. **Reuse:** Tab primitive; list patterns.  
9. **UX:** `?tab=` deep links; no-cost/low-stock filters.  
10. **Tech:** DS tabs/tokens.  
11. **Perf:** Ensure server pagination for large catalogs.  
12. **A11y:** Tablist semantics.  
13. **Decision:** KEEP  
14. **Priority:** High  
15. **Backend:** real  

### `/catalog/[id]`

1. **Purpose:** Product workspace (many tabs).  
2. **User:** Manager; daily SKU work.  
3. **Strengths:** Real detail APIs; grouped tabs; stock/expiry badges; duplicate/barcode tools.  
4. **Weaknesses:** Tab sprawl; raw Actions menu; hard colors; Marketing labeled Compliance.  
5. **Duplicates:** Pricing, purchasing, expiry, ecommerce surfaces.  
6. **Complexity:** High.  
7. **Ponytail:** Default Overview; Details | Stock | Buy | History | More.  
8. **Reuse:** Collapse Activity into Overview.  
9. **UX:** Hide ecommerce/compliance until needed.  
10. **Tech:** Lazy tab chunks; remove legacy event names.  
11. **Perf:** Don’t mount all tabs.  
12. **A11y:** Menu focus trap; badges not color-only.  
13. **Decision:** REFACTOR  
14. **Priority:** High  
15. **Backend:** real (credits still NEEDS-SRI)  

### `/catalog/categories/[id]`

1. **Purpose:** Category membership editor.  
2. **User:** Manager; weekly.  
3. **Strengths:** Breadcrumb; stats; search; add modal.  
4. **Weaknesses:** Raw modal/table; hex hover; category↔product routes allowlisted.  
5. **Duplicates:** Catalog Categories tab.  
6. **Complexity:** Med.  
7. **Ponytail:** Side panel on catalog list.  
8. **Reuse:** Modal/Input/Button.  
9. **UX:** Prefer inline tree.  
10. **Tech:** Build membership routes or hide Add/Remove.  
11. **Perf:** Debounced search OK.  
12. **A11y:** Modal focus trap.  
13. **Decision:** CONSOLIDATE  
14. **Priority:** Medium  
15. **Backend:** partial  

### `/catalog/price-book`

1. **Purpose:** Legacy redirect → `/pricing?tab=customer-overrides`.  
2–12. Honest retirement.  
13. **Decision:** CONSOLIDATE (done)  
14. **Priority:** Low  
15. **Backend:** N/A  

### `/catalog/promotions`

1. **Purpose:** Promotion Engine UI (campaigns/coupons/flash/bundles…).  
2. **User:** Marketing; aspirational.  
3. **Strengths:** Ambitious IA; RBAC; campaign CRUD UI.  
4. **Weaknesses:** ~1090 LOC monolith; nav `partial`; `/api/v1/promotions*` mock-only; many inert Creates.  
5. **Duplicates:** `/discounts` (real).  
6. **Complexity:** High.  
7. **Ponytail:** Enterprise theater — Discounts is enough for retail.  
8. **Reuse:** Port useful fields into Discounts later.  
9. **UX:** Stay hidden; Preview banner if shown.  
10. **Tech:** Don’t build BE parity before retail proof.  
11. **Perf:** Code-split if kept.  
12. **A11y:** Dialog traps; no emoji status.  
13. **Decision:** CONSOLIDATE / HIDE  
14. **Priority:** Critical  
15. **Backend:** mocked  

### `/pricing`

1. **Purpose:** Multi-layer pricing engine.  
2. **User:** Wholesale/B2B managers.  
3. **Strengths:** Customer Overrides tab real; deep-link from price-book.  
4. **Weaknesses:** Most tabs `/api/v1/pricing/*` mocked; inert Creates; hex `#5D5FEF`; nav partial.  
5. **Duplicates:** Product PricingTab; promotions; discounts.  
6. **Complexity:** High.  
7. **Ponytail:** Keep overrides; quarantine rest.  
8. **Reuse:** Overrides as “Customer prices”.  
9. **UX:** Default overrides tab; hide engine tabs.  
10. **Tech:** Split page; don’t expand pricing BE yet.  
11. **Perf:** `pageSize=200` → paginate.  
12. **A11y:** Tablist.  
13. **Decision:** REFACTOR  
14. **Priority:** High  
15. **Backend:** partial  

### `/discounts`

1. **Purpose:** Operational discount/coupon rules.  
2. **User:** Manager; weekly.  
3. **Strengths:** Real `/api/v1/discounts`; Card/Button/TableSkeleton; create/edit; status lifecycle.  
4. **Weaknesses:** Subtitle says “Promotions”; gray palette; raw table.  
5. **Duplicates:** Catalog promotions.  
6. **Complexity:** Med.  
7. **Ponytail:** **Canonical** promo surface.  
8. **Reuse:** Absorb naming fields carefully from promotions.  
9. **UX:** Rename “Discounts & coupons”.  
10. **Tech:** Token cleanup.  
11. **Perf:** Fine.  
12. **A11y:** Status dropdown keyboard.  
13. **Decision:** KEEP  
14. **Priority:** High  
15. **Backend:** real  

### `/gift-cards` · `/loyalty`

1. **Purpose:** Issue/void/balance GCs; loyalty tiers/members/rewards.  
2. **User:** Counter (GC); manager (loyalty).  
3. **Strengths:** Real APIs; clear ops layouts; setup/loyalty re-exports loyalty (one impl).  
4. **Weaknesses:** Raw amount chips; silent GC load failure; loyalty raw tabs.  
5. **Duplicates:** Setup loyalty alias; rewards vs discounts.  
6. **Complexity:** Low–Med.  
7. **Ponytail:** Keep; don’t expand CRM before retail proof.  
8. **Reuse:** Balance widget on Register; member lookup from Customers.  
9. **UX:** ConfirmDialog void; clarify programme vs members home.  
10. **Tech:** Surface errors; DS tabs.  
11. **Perf:** Paginate GC list; lazy loyalty tabs.  
12. **A11y:** Announce issue success.  
13. **Decision:** KEEP  
14. **Priority:** Medium  
15. **Backend:** real  

---

## Inventory & fulfillment

### `/inventory` (Overview)

1. **Purpose:** Movements — Orders/Transfers/Returns tabs.  
2. **User:** Store manager; daily.  
3. **Strengths:** Real PO + transfers; `?tab=` deep-link; summary qty/cost.  
4. **Weaknesses:** Hard-coded supplier map; fake “Main Store”; returns allowlisted/missing; orphan `_components`; misnamed “Overview”.  
5. **Duplicates:** Purchasing, pipeline, vendors returns.  
6. **Complexity:** Med.  
7. **Ponytail:** Rename Movements; link PO rows to purchasing detail.  
8. **Reuse:** Single movements hub.  
9. **UX:** Hide Returns until BE.  
10. **Tech:** Remove SUPPLIER_NAME map; purge dead components.  
11. **Perf:** Per-tab fetch.  
12. **A11y:** Sortable header buttons.  
13. **Decision:** REFACTOR  
14. **Priority:** High  
15. **Backend:** partial  

### `/inventory/pipeline`

1. **Purpose:** PO funnel (overview/pending/receiving/reorder/issues/history).  
2. **User:** Receiving/manager; daily.  
3. **Strengths:** Pending/History/Reorder Alerts real + tested; create-PO from alert.  
4. **Weaknesses:** Summary/receiving/issues **not built** (MSW); invents stages beyond POStatus; duplicates receive/reorder/purchasing.  
5. **Duplicates:** receive-stock, reorder, errors, purchasing.  
6. **Complexity:** High IA / Med real.  
7. **Ponytail:** Trim to real tabs; nest under Purchasing.  
8. **Reuse:** Purchasing hub tabs.  
9. **UX:** Receiving CTA → receive-stock.  
10. **Tech:** Hide missing tabs.  
11. **Perf:** Fine when trimmed.  
12. **A11y:** Don’t silent-fail missing APIs.  
13. **Decision:** CONSOLIDATE  
14. **Priority:** Critical  
15. **Backend:** partial  

### `/inventory/receive-stock`

1. **Purpose:** Scan/receive PO lines → post receive.  
2. **User:** Receiving staff; multiple/day.  
3. **Strengths:** Best receiving UX; Card/Button/Badge; real purchasing + locations; extracted line helpers.  
4. **Weaknesses:** Some silent list catches; complex for tiny shops.  
5. **Duplicates:** Pipeline Receiving (fake); PO ReceiveTab; warehouse Receiving (mock).  
6. **Complexity:** High.  
7. **Ponytail:** Canonical receive — keep.  
8. **Reuse:** Embed from purchasing detail.  
9. **UX:** `?po=` deep-link; next-step Cost entry.  
10. **Tech:** Surface errors; ConfirmDialog commit.  
11. **Perf:** Targeted PO refresh.  
12. **A11y:** `aria-live` scan errors.  
13. **Decision:** KEEP  
14. **Priority:** Critical  
15. **Backend:** real  

### `/inventory/expiry` · `/inventory/expiry-pool`

1. **Purpose:** Redirect + canonical Upcoming/Pool disposition.  
2. **User:** Perishable retail managers; daily.  
3. **Strengths:** Honest redirect; real expiring/expiry/disposition APIs; Card/Button/Badge/TableSkeleton.  
4. **Weaknesses:** Token mix; needs ConfirmDialog.  
5. **Duplicates:** Product Expiry tab; reports/expiry.  
6. **Complexity:** Med.  
7. **Ponytail:** Single source — keep pool.  
8. **Reuse:** Dashboard widget.  
9. **UX:** Sort by days-left; bulk discard.  
10. **Tech:** ConfirmDialog; erp tokens.  
11. **Perf:** Paginate lots.  
12. **A11y:** Destructive confirm.  
13. **Decision:** CONSOLIDATE (done) / KEEP  
14. **Priority:** Low / High  
15. **Backend:** real  

### `/inventory/errors`

1. **Purpose:** 13-category Error Check Center.  
2. **User:** Ops; aspirational EDI.  
3. **Strengths:** Clear drill-down IA.  
4. **Weaknesses:** **All APIs allowlisted/missing**; emoji icons; **not** `partial: true` in nav.  
5. **Duplicates:** Pipeline Issues; EDI validate errors.  
6. **Complexity:** High UI / Low value today.  
7. **Ponytail:** Speculative control tower — hide.  
8. **Reuse:** Surface real EDI errors on EDI page.  
9. **UX:** Mark partial immediately.  
10. **Tech:** Nav gate; no detection engine yet.  
11. **Perf:** N/A.  
12. **A11y:** Text over emoji.  
13. **Decision:** CONSOLIDATE / HIDE  
14. **Priority:** Critical  
15. **Backend:** mocked / missing  

### `/inventory/counts`

1. **Purpose:** Cycle count sessions → variance close.  
2. **User:** Stock staff; weekly–monthly.  
3. **Strengths:** Real counts API; Card/Badge/Button; session→lines.  
4. **Weaknesses:** Seeds all SKUs; raw modal; blue-600.  
5. **Duplicates:** Warehouse Cycle Counts (mock).  
6. **Complexity:** Med–High.  
7. **Ponytail:** Keep simple retail counts.  
8. **Reuse:** Canonical; warehouse links here.  
9. **UX:** Filter before seed; variance-only view.  
10. **Tech:** DS Modal; warn on large seed.  
11. **Perf:** Don’t seed entire catalog blindly.  
12. **A11y:** Variance not color-only.  
13. **Decision:** KEEP  
14. **Priority:** High  
15. **Backend:** real  

### `/inventory/reorder`

1. **Purpose:** Suggestions → draft POs.  
2. **User:** Manager; daily–weekly.  
3. **Strengths:** Real reorder-suggestions + create-PO; urgency badges.  
4. **Weaknesses:** Triplicates purchasing ReorderTab + pipeline alerts.  
5. **Duplicates:** Purchasing reorder; pipeline; product tab.  
6. **Complexity:** Med.  
7. **Ponytail:** One reorder surface.  
8. **Reuse:** Prefer purchasing ReorderTab (vendor history).  
9. **UX:** Redirect → `/purchasing?tab=reorder`.  
10. **Tech:** Update dashboard links.  
11. **Perf:** Single fetch path.  
12. **A11y:** Confirm modal focus.  
13. **Decision:** CONSOLIDATE  
14. **Priority:** Critical  
15. **Backend:** real  

### `/inventory/serials` · `/inventory/locations` · `/inventory/transfers`

1. **Purpose:** Serial tracking; store bin map; transfers redirect.  
2. **User:** Specialty / setup / N/A.  
3. **Strengths:** Real serial + store_locations APIs; transfers redirect honest.  
4. **Weaknesses:** Serial receive wants raw Product ID; locations collide with Operations/Warehouse/setup.  
5. **Duplicates:** Location word ×3+.  
6. **Complexity:** Med / Med / Low.  
7. **Ponytail:** Feature-gate serials; one Locations IA; keep transfers redirect.  
8. **Reuse:** Catalog typeahead; shared location types.  
9. **UX:** Rename “Store bin locations”.  
10. **Tech:** Merge ops stock-locations.  
11. **Perf:** Paginate serials; lazy map.  
12. **A11y:** Map not color-only.  
13. **Decision:** REFACTOR / CONSOLIDATE / CONSOLIDATE(done)  
14. **Priority:** Low–Med / High / Low  
15. **Backend:** real / real / redirect  

### `/purchase` (Cost entry)

1. **Purpose:** Post-receive cost confirmation / valuation — **not** PO creation.  
2. **User:** Manager after receive.  
3. **Strengths:** Real cost-entry API; margin vs sell; reference column toggle; strong tokens.  
4. **Weaknesses:** Nav label “Purchase” next to “Purchasing”.  
5. **Duplicates:** Naming clash.  
6. **Complexity:** Low–Med.  
7. **Ponytail:** Rename Cost entry; nest under Purchasing.  
8. **Reuse:** Purchasing tab.  
9. **UX:** Deep-link from receive success.  
10. **Tech:** Route `/purchasing/cost-entry` + redirect.  
11. **Perf:** Fine.  
12. **A11y:** Alerts present.  
13. **Decision:** CONSOLIDATE  
14. **Priority:** Critical  
15. **Backend:** real  

### `/purchasing` · `/purchasing/[id]` · `/purchasing/edi-imports`

1. **Purpose:** Procurement home; PO detail; EDI import queue.  
2. **User:** Manager; daily / per PO / as files arrive.  
3. **Strengths:** Real suppliers/orders/reorder; PO detail tabs; EDI routes honest about empty `created_po_ids`.  
4. **Weaknesses:** Not sole entry (pipeline/receive/purchase/reorder/vendors peers); EDI top-level nav.  
5. **Duplicates:** Reorder/suppliers/orders elsewhere.  
6. **Complexity:** Med–High.  
7. **Ponytail:** Expand Purchasing as hub; nest EDI; receive CTA to receive-stock.  
8. **Reuse:** Hub tabs + redirects.  
9. **UX:** Orders | Receive | Cost | Reorder | Vendors | EDI.  
10. **Tech:** Querystring tabs; feature-gate EDI.  
11. **Perf:** Lazy tabs.  
12. **A11y:** Shared TabBar.  
13. **Decision:** KEEP / KEEP / CONSOLIDATE(nest)  
14. **Priority:** Critical / High / Medium  
15. **Backend:** real  

### `/warehouse`

1. **Purpose:** Full WMS UI.  
2. **User:** Warehouse ops; aspirational.  
3. **Strengths:** Coherent WMS IA; nav `partial: true`; RBAC.  
4. **Weaknesses:** No backend module; ~725 LOC; inert Creates; duplicates receive/counts/locations/delivery.  
5. **Duplicates:** Massive.  
6. **Complexity:** High.  
7. **Ponytail:** Thin landing linking real tools — or stay hidden.  
8. **Reuse:** Links only.  
9. **UX:** Don’t build WMS before retail proof.  
10. **Tech:** Keep partial gate.  
11. **Perf:** N/A.  
12. **A11y:** Real links if landing.  
13. **Decision:** CONSOLIDATE / HIDE  
14. **Priority:** Critical  
15. **Backend:** mocked  

### `/delivery` · `/shipping`

1. **Purpose:** SO fulfillment pipeline; shipment registry.  
2. **User:** Fulfillment; daily when shipping.  
3. **Strengths:** Real sales/fulfillment/shipping/billing; stepper; race-safe detail; shipping list CRUD.  
4. **Weaknesses:** Delivery under Inventory nav; Shipping **orphaned** from nav; ecommerce aliases lie.  
5. **Duplicates:** Ops picks; warehouse picks; each other.  
6. **Complexity:** High / Med.  
7. **Ponytail:** Merge shipping into delivery; move to Orders/Fulfillment.  
8. **Reuse:** Canonical outbound.  
9. **UX:** `?view=shipments`.  
10. **Tech:** Fix ecommerce aliases.  
11. **Perf:** Detail scoped by order — good.  
12. **A11y:** `aria-current` stage.  
13. **Decision:** KEEP (relocate) / CONSOLIDATE  
14. **Priority:** High  
15. **Backend:** real  

### `/vendors` · `/vendors/[id]`

1. **Purpose:** Vendor directory + 360.  
2. **User:** Manager/AP; weekly.  
3. **Strengths:** Real vendors/credits/returns; lazy detail tabs; KPIs.  
4. **Weaknesses:** Overlaps purchasing Suppliers; large pages; slate badges.  
5. **Duplicates:** Suppliers tab; PO credits.  
6. **Complexity:** Med–High.  
7. **Ponytail:** Keep CRM; suppliers deep-link here.  
8. **Reuse:** Shared PO table.  
9. **UX:** Default Profile + POs.  
10. **Tech:** Token cleanup.  
11. **Perf:** Fetch-on-tab — good.  
12. **A11y:** Tablist; PO link names.  
13. **Decision:** KEEP  
14. **Priority:** Medium  
15. **Backend:** real  

### `/operations`

1. **Purpose:** Locations + pick lists + outlets/registers + stock locations.  
2. **User:** Unclear — junk drawer.  
3. **Strengths:** Table/Modal/Button; real fulfillment + outlets.  
4. **Weaknesses:** Duplicates inventory locations, delivery picks, setup outlets; loads all tab data.  
5. **Duplicates:** Many.  
6. **Complexity:** Med–High.  
7. **Ponytail:** Dissolve.  
8. **Reuse:** Redirect tabs to canonical homes.  
9. **UX:** Setup outlets; Inventory locations; Delivery picks.  
10. **Tech:** Tab-scoped fetch if kept temporarily.  
11. **Perf:** Stop eager multi-tab load.  
12. **A11y:** Tablist (Modal already good).  
13. **Decision:** CONSOLIDATE / dissolve  
14. **Priority:** High  
15. **Backend:** real (fragmented)  

---

# A. Reports dual tree

> All `/reporting/*` pages: **re-export only** — Decision **CONSOLIDATE**, Priority **Critical**. See group summary (a). Individual `/reports` pages below.

---

### `/reports` (Overview)

1. **Business Purpose:** Manager KPI overview — sales summary, top products, margin/inventory/low-stock sections.  
2. **Primary User + frequency:** Owner/manager; daily–weekly.  
3. **Strengths:** Real APIs (`/reports/summary`, `top-products`); role gate; composed sections; `ReportsSubNav`; Finder date context.  
4. **Weaknesses:** Overlaps dashboard KPIs; custom `Skeleton`; slate buttons; large page.  
5. **Duplicate Features:** Dashboard summary/top products/charts.  
6. **Complexity:** High.  
7. **Ponytail:** Pill/range chrome; dense multi-section first view.  
8. **Reuse:** Extract shared range + KPI strip with dashboard.  
9. **UX:** Lead with 4 KPIs + links to deep reports; demote secondary sections.  
10. **Tech:** Shared fetch hook; permission from capabilities not hard-coded role strings.  
11. **Perf:** Cache summary with dashboard query key; avoid refetch on every range tick.  
12. **A11y:** Range controls need `aria-pressed`; ensure table sections have captions.  
13. **Decision:** REFACTOR  
14. **Priority:** High  
15. **Backend:** `built_unverified` (real reports module + tests)

### `/reports/sales`

1. **Purpose:** Sales by category/customer/product + revenue trend + CSV.  
2. **User:** Manager; daily/weekly.  
3. **Strengths:** Multi-tab; CSV export; Recharts; real endpoints including `sales-by-product`.  
4. **Weaknesses:** Comment claims owner/manager only but **no client role gate** (unlike siblings); local TableSkeleton; slate tabs.  
5. **Duplicates:** Dashboard category/customer; overview top products.  
6. **Complexity:** High.  
7. **Ponytail:** Tab + chart + table stacked; heavy.  
8. **Reuse:** Shared RangeToggle used by by-rep/by-vendor.  
9. **UX:** Default to product tab for retail; collapse chart.  
10. **Tech:** Add consistent role/feature gate; use DS `Button`/`Tabs`.  
11. **Perf:** Fetch active tab only, not all three + trend.  
12. **A11y:** Tablist pattern; chart needs text alternative.  
13. **Decision:** REFACTOR  
14. **Priority:** High  
15. **Backend:** `built_unverified`

### `/reports/end-of-day` (= `/reporting/closing`)

1. **Purpose:** Z-report / day close (sales, tenders, cash drawer, top items).  
2. **User:** Manager/cashier lead; daily (end of shift).  
3. **Strengths:** Clear domain model; date picker; real `/reports/end-of-day`.  
4. **Weaknesses:** Raw date input; limited empty/`no_session` polish; slate/red utility classes.  
5. **Duplicates:** Register closures + cash movement cover drawer detail.  
6. **Complexity:** Med–High.  
7. **Ponytail:** Good operational job if tightened to one scroll story.  
8. **Reuse:** Share cash drawer block with register-closures detail.  
9. **UX:** Primary CTA “Close day / Print Z”; status badge first.  
10. **Tech:** Use `Input` date; print stylesheet.  
11. **Perf:** Single endpoint already — fine.  
12. **A11y:** Date label association; variance color not sole signal.  
13. **Decision:** KEEP (polish)  
14. **Priority:** High (retail proof)  
15. **Backend:** `built_unverified` (tested)

### `/reports/p-l`

1. **Purpose:** P&L — revenue, COGS, gross, expenses, net.  
2. **User:** Owner; weekly/monthly.  
3. **Strengths:** Role gate; range toggle; KPI cards; real `/reports/p-l`.  
4. **Weaknesses:** Local skeletons; slate chrome.  
5. **Duplicates:** Finance/accounting pages may overlap.  
6. **Complexity:** Med.  
7. **Ponytail:** Statement layout should dominate, not marketing cards.  
8. **Reuse:** Shared RangeToggle + money row component.  
9. **UX:** Waterfall statement > card grid.  
10. **Tech:** DS tokens; export CSV.  
11. **Perf:** OK.  
12. **A11y:** KPI labels + values paired.  
13. **Decision:** REFACTOR  
14. **Priority:** High  
15. **Backend:** `built_unverified`

### `/reports/purchases`

1. **Purpose:** Purchase/AP summary by PO.  
2. **User:** Purchasing manager; weekly.  
3. **Strengths:** Real API; Badge statuses; range filter.  
4. **Weaknesses:** Filter by raw vendor **ID** text (not vendor picker); raw controls; no error state from `useQuery`.  
5. **Duplicates:** `/purchase`, `/purchasing`, `/vendors`.  
6. **Complexity:** Low–Med.  
7. **Ponytail:** Filter UX is developer-shaped.  
8. **Reuse:** Vendor Typeahead from purchasing.  
9. **UX:** Vendor search; link row → PO detail.  
10. **Tech:** Surface query errors; DS Input/Select.  
11. **Perf:** limit 200 OK; server aggregates preferred.  
12. **A11y:** Table headers; filter labels.  
13. **Decision:** REFACTOR  
14. **Priority:** Medium  
15. **Backend:** `built_unverified` (professional+ gate noted in routes)

### `/reports/sales-by-rep`

1. **Purpose:** Revenue by sales rep.  
2. **User:** Sales manager; weekly.  
3. **Strengths:** Role gate; loading/error/empty; real API.  
4. **Weaknesses:** Duplicated RangeToggle/TableSkeleton vs by-vendor; slate.  
5. **Duplicates:** Nearly identical to sales-by-vendor.  
6. **Complexity:** Low.  
7. **Ponytail:** Clone page smell.  
8. **Reuse:** One `GroupedSalesReport` parameterized by dimension.  
9. **UX:** CONSOLIDATE with by-vendor under Sales → “Group by”.  
10. **Tech:** Shared component.  
11. **Perf:** OK.  
12. **A11y:** Shared table a11y.  
13. **Decision:** CONSOLIDATE (into sales grouping)  
14. **Priority:** Medium  
15. **Backend:** `built_unverified`

### `/reports/sales-by-vendor`

1. **Purpose:** Revenue by vendor.  
2. **User:** Merchandising; weekly.  
3. **Strengths / Weaknesses / Dupes:** Same as by-rep (clone).  
4. **Complexity:** Low.  
5. **Decision:** CONSOLIDATE  
6. **Priority:** Medium  
7. **Backend:** `built_unverified`

### `/reports/inventory`

1. **Purpose:** Inventory valuation at cost/retail.  
2. **User:** Owner/ops; weekly.  
3. **Strengths:** Real `/reports/inventory-valuation`; KPI cards + table.  
4. **Weaknesses:** Overlaps inventory overview / low-stock sections on reports home.  
5. **Complexity:** Med.  
6. **Ponytail:** Valuation table is the job — keep dense.  
7. **Reuse:** Share with `InventoryValuationSection` on overview.  
8. **UX:** Sort/filter SKU; export.  
9. **Tech:** Pagination (API supports limit/offset).  
10. **Perf:** Paginate; don’t load all SKUs.  
11. **A11y:** Numeric alignment; sort buttons named.  
12. **Decision:** REFACTOR  
13. **Priority:** Medium  
14. **Backend:** `built_unverified`

### `/reports/ar-aging`

1. **Purpose:** AR aging buckets for B2B credit.  
2. **User:** AR/finance; weekly.  
3. **Strengths:** Clear buckets; totals; amber/red aging cues; real API.  
4. **Weaknesses:** Color via raw red/amber utilities; no customer drill-down link.  
5. **Duplicates:** Customer financials on `/customers/[id]`.  
6. **Complexity:** Med.  
7. **Ponytail:** Table-first is correct.  
8. **Reuse:** Aging cell component for AP if added.  
9. **UX:** Click-through to customer; export.  
10. **Tech:** Tokens for aging severity.  
11. **Perf:** OK.  
12. **A11y:** Don’t rely on color alone for 60/90d.  
13. **Decision:** KEEP (token polish)  
14. **Priority:** Medium (B2B)  
15. **Backend:** `built_unverified` (+ sweep endpoint unused in UI)

### `/reports/expiry`

1. **Purpose:** Expired / expiring lots.  
2. **User:** Inventory ops; daily for perishable retail.  
3. **Strengths:** Uses inventory APIs (`expiring`, `expired`, `expiry-summary`); summary KPIs.  
4. **Weaknesses:** Overlaps `/inventory/expiry` + `/inventory/expiry-pool`; raw badge colors.  
5. **Duplicates:** Inventory expiry pages.  
6. **Complexity:** Med.  
7. **Ponytail:** Should live under Inventory, not Reports, or deep-link one canonical.  
8. **Reuse:** Single ExpiryPanel.  
9. **UX:** CONSOLIDATE into inventory expiry; report = export view.  
10. **Tech:** One route.  
11. **Perf:** Parallel 3 calls — combine server-side.  
12. **A11y:** Badge text includes days.  
13. **Decision:** CONSOLIDATE (→ inventory expiry)  
14. **Priority:** High  
15. **Backend:** inventory APIs `built_unverified`

### `/reports/cash-movement`

1. **Purpose:** Cash in/out within register sessions.  
2. **User:** Manager; daily.  
3. **Strengths:** KpiCard; real API; empty state text.  
4. **Weaknesses:** Filter by register **ID** string; raw input; no explicit error UI; gray skeletons.  
5. **Duplicates:** End-of-day cash drawer; register-closures detail.  
6. **Complexity:** Low.  
7. **Ponytail:** Operational list — good if filters are human.  
8. **Reuse:** Register picker from terminal/ops.  
9. **UX:** Embed as tab under register-closures.  
10. **Tech:** Error from useQuery; DS Input.  
11. **Perf:** OK.  
12. **A11y:** Label filter.  
13. **Decision:** CONSOLIDATE (under register-closures / EOD)  
14. **Priority:** Medium  
15. **Backend:** `built_unverified`

### `/reports/register-closures`

1. **Purpose:** Session history + payment breakdown + cash movements.  
2. **User:** Manager; daily.  
3. **Strengths:** Master-detail; real list + detail APIs; useful ops surface.  
4. **Weaknesses:** Raw session buttons; gray hover; overlaps EOD/cash-movement.  
5. **Complexity:** Med.  
6. **Ponytail:** Master-detail is right pattern.  
7. **Reuse:** Absorb cash-movement filter here.  
8. **UX:** Keep as cash control center.  
9. **Tech:** DS list row; keyboard selection.  
10. **Perf:** Detail fetch on select — good.  
11. **A11y:** Selected state `aria-current`; listbox pattern.  
12. **Decision:** KEEP  
13. **Priority:** High  
14. **Backend:** `built_unverified`

### `/reports/time-cards`

1. **Purpose:** Clock-in/out history and hour totals.  
2. **User:** Manager/HR; weekly payroll.  
3. **Strengths:** Summary + entries; real `/reports/time-cards`.  
4. **Weaknesses:** Raw selects; overlaps Team clock + Workforce.  
5. **Duplicates:** `/team` clock actions; `/workforce` scheduling.  
6. **Complexity:** Med.  
7. **Ponytail:** Should sit under Team/Workforce, not a 13th report chip.  
8. **Reuse:** Employee filter from team API.  
9. **UX:** CONSOLIDATE into Team → Time.  
10. **Tech:** Shared duration formatter with team page.  
11. **Perf:** OK.  
12. **A11y:** Select labels.  
13. **Decision:** CONSOLIDATE (→ team/workforce)  
14. **Priority:** Medium  
15. **Backend:** `built_unverified` (growth+ noted)

### `/reporting` and each child (`ar-aging`, `cash-movement`, `closing`, `expiry`, `inventory`, `p-l`, `purchases`, `register-closures`, `sales`, `sales-by-rep`, `sales-by-vendor`, `time-cards`)

1. **Purpose:** Legacy URL compatibility only.  
2. **User:** Bookmarks/old links.  
3. **Strengths:** Thin `export { default } from "../../reports/…"`.  
4. **Weaknesses:** Dual IA; SEO/analytics split; cognitive load.  
5. **Duplicates:** Exact duplicates of `/reports/*`.  
6. **Complexity:** Low (wrappers).  
7. **Ponytail:** Remove from product surface.  
8. **Reuse:** N/A — delete after redirects.  
9. **UX:** 308 to `/reports/*` (`closing` → `end-of-day`).  
10. **Tech:** `next.config` redirects; remove folders.  
11. **Perf:** N/A.  
12. **A11y:** N/A.  
13. **Decision:** CONSOLIDATE  
14. **Priority:** Critical  
15. **Backend:** same as `/reports` targets

---

# B. Customers / Other

### `/customers`

1. **Purpose:** Customer list with loyalty/spend segments.  
2. **User:** Cashiers/managers; daily.  
3. **Strengths:** Real customers API; table/modal components; segment heuristics.  
4. **Weaknesses:** **N+1** `summary` per customer; raw Import/Add buttons (not `Button`); Import is non-functional; hex hover `#4849d0`.  
5. **Duplicates:** `/ecommerce/customers` re-exports this page.  
6. **Complexity:** Med.  
7. **Ponytail:** Header actions should use DS; import belongs in imports-exports.  
8. **Reuse:** CustomerTable already extracted.  
9. **UX:** Server-side list with embedded summary fields; wire Import or remove button.  
10. **Tech:** Backend list endpoint should return summary columns.  
11. **Perf:** Critical — N+1 on every load.  
12. **A11y:** Buttons need accessible names (ok); ensure table.  
13. **Decision:** REFACTOR  
14. **Priority:** Critical (perf + DS)  
15. **Backend:** customers module `built_unverified`

### `/customers/[id]`

1. **Purpose:** Profile, financials, loyalty, merge duplicates.  
2. **User:** Manager; per-customer as needed.  
3. **Strengths:** Parallel loads; merge via search; financials + loyalty APIs; Button/Card.  
4. **Weaknesses:** Large page; slate-heavy; raw inputs in places.  
5. **Duplicates:** AR aging totals; loyalty setup.  
6. **Complexity:** High.  
7. **Ponytail:** Tabbed profile > long scroll.  
8. **Reuse:** Financials strip on AR report.  
9. **UX:** Tabs: Overview / Orders / Financials / Loyalty.  
10. **Tech:** Split `_components`; DS Input.  
11. **Perf:** AbortControllers already — good.  
12. **A11y:** Merge flow needs confirm dialog primitive.  
13. **Decision:** REFACTOR  
14. **Priority:** High  
15. **Backend:** `built_unverified`

### `/dashboard`

1. **Purpose:** Retail home — KPIs, charts, recommendations, setup checklist, progress tasks.  
2. **User:** Owner/manager; daily open.  
3. **Strengths:** Real reports + recommendations + progress task create; outlet scope; realtime hook; modular `_components`; retail-first checklist.  
4. **Weaknesses:** Overlaps `/reports` overview; many parallel fetches; VerticalWidgets may surface incomplete verticals.  
5. **Duplicates:** Reports summary/top/trend/hourly/category.  
6. **Complexity:** High.  
7. **Ponytail:** Acceptable as dashboard; keep one job: “what needs attention today”.  
8. **Reuse:** Shared report query layer with `/reports`.  
9. **UX:** Prioritize recommendations + checklist for new tenants; collapse charts.  
10. **Tech:** Query batching / single dashboard aggregate endpoint.  
11. **Perf:** High fan-out — candidate for BFF aggregate.  
12. **A11y:** Chart alts; recommendation actions named.  
13. **Decision:** KEEP (perf REFACTOR)  
14. **Priority:** Critical (retail proof)  
15. **Backend:** reports + progress `built_unverified`

### `/insights`

1. **Purpose:** Scheduled reports + reorder forecasting tabs.  
2. **User:** Owner/manager; weekly.  
3. **Strengths:** Thin shell; role gate; tabs delegate to components with real `/insights/*` APIs.  
4. **Weaknesses:** Raw tab buttons; slate; name collides with “Reports”.  
5. **Duplicates:** Reports CSV/email mental model; inventory reorder page.  
6. **Complexity:** Low (page) / Med (tabs).  
7. **Ponytail:** Rename to “Scheduled & Forecast” under Reporting.  
8. **Reuse:** Tab chrome shared with documents/notifications.  
9. **UX:** CONSOLIDATE scheduled delivery into reports; forecasting into inventory reorder.  
10. **Tech:** DS tabs.  
11. **Perf:** OK.  
12. **A11y:** tablist.  
13. **Decision:** CONSOLIDATE  
14. **Priority:** Medium  
15. **Backend:** insights module `built_unverified`

### `/tax-compliance`

1. **Purpose:** Tax rates + MSA reporting + exemptions (tobacco/vapor vertical).  
2. **User:** Compliance manager; monthly / as needed.  
3. **Strengths:** Tax rates CRUD via `/settings/tax-rates`; industry-aware copy.  
4. **Weaknesses:** **MSA tab is hardcoded `MSA_SAMPLE`** (not money-integer cents); duplicates Setup → Tax; raw inputs; slate.  
5. **Duplicates:** `/settings` TaxSection; `/setup/taxes` alias.  
6. **Complexity:** Med.  
7. **Ponytail:** Sample data presented as operational — honesty gap.  
8. **Reuse:** Tax rates only inside Settings; MSA as vertical module.  
9. **UX:** Split: Settings for rates; hide MSA until real API.  
10. **Tech:** Remove sample or label Demo; integer cents.  
11. **Perf:** OK.  
12. **A11y:** Form labels present.  
13. **Decision:** CONSOLIDATE (rates→settings) + hide MSA until real  
14. **Priority:** High  
15. **Backend:** tax-rates `partial`; MSA `mocked`

### `/notifications`

1. **Purpose:** Inbox, channel prefs, alert rules, digest.  
2. **User:** All staff; daily.  
3. **Strengths:** Broad real API surface; mark read; rules CRUD.  
4. **Weaknesses:** 653-LOC monolith; local Badge/Toggle; emoji channel icons; slate/blue severity chips.  
5. **Duplicates:** Dashboard notification peek.  
6. **Complexity:** High.  
7. **Ponytail:** Split into focused views; drop emoji.  
8. **Reuse:** DS Badge/Toggle; severity tokens.  
9. **UX:** Inbox first; prefs secondary.  
10. **Tech:** Split tabs to `_components` (partially done pattern elsewhere).  
11. **Perf:** Lazy-load non-inbox tabs.  
12. **A11y:** Toggle needs `role="switch"` + `aria-checked` (current Toggle incomplete).  
13. **Decision:** REFACTOR  
14. **Priority:** Medium  
15. **Backend:** notifications module `built_unverified`

### `/onboarding`

1. **Purpose:** First-run business type selection.  
2. **User:** New owner; once.  
3. **Strengths:** Capabilities-driven types; **READY_TYPES = retail only**; Preview labels; writes business-profile.  
4. **Weaknesses:** Standalone dark marketing layout (not EnterpriseShell); emoji icons; logo letter **“F”**; hex gradient background.  
5. **Duplicates:** `/setup/business-profile`, `/settings/modes`.  
6. **Complexity:** Med.  
7. **Ponytail:** Brand mark should be Ascend, not “F”; reduce emoji grid noise.  
8. **Reuse:** Same type cards as settings/modes.  
9. **UX:** 3 steps OK; don’t oversell verticals.  
10. **Tech:** Shared BusinessTypePicker.  
11. **Perf:** OK.  
12. **A11y:** Selected card `aria-pressed`; progress announced.  
13. **Decision:** REFACTOR  
14. **Priority:** High  
15. **Backend:** business-profile `built_unverified`

### `/ecommerce` (+ children)

| Child | Code fact |
|---|---|
| `/ecommerce` | Real orders UI; tries `/ecommerce/orders` then falls back `/sales/orders?type=ecommerce`; settings toggle |
| `/ecommerce/orders` | **re-export** parent |
| `/ecommerce/delivery` | **re-export** parent |
| `/ecommerce/shipping` | **re-export** parent |
| `/ecommerce/customers` | **re-export** `/customers` |
| `/ecommerce/promotions` | **re-export** `/catalog/promotions` (**partial/mock** per AGENTS) |

1. **Purpose:** Online order ops + storefront toggles.  
2. **User:** Ecommerce manager; daily if module on.  
3. **Strengths:** Fallback API path; Badge/TableSkeleton; module-gated in nav.  
4. **Weaknesses:** Children are fake IA (same page); promotions mock; slate.  
5. **Duplicates:** Customers, catalog promotions, shipping/delivery elsewhere.  
6. **Complexity:** Med.  
7. **Ponytail:** One Online Orders page; don’t invent empty subnav.  
8. **Reuse:** Orders table from `/orders`.  
9. **UX:** CONSOLIDATE children into tabs or delete routes.  
10. **Tech:** Redirects; remove wrappers.  
11. **Perf:** OK.  
12. **A11y:** Status filters as tabs.  
13. **Decision:** CONSOLIDATE  
14. **Priority:** High  
15. **Backend:** ecommerce `partial`; promotions `mocked`

### `/imports-exports`

1. **Purpose:** Catalog CSV import/export + batch history.  
2. **User:** Manager; occasional / onboarding.  
3. **Strengths:** Real import/export APIs; preview validation; role check; Button/Badge.  
4. **Weaknesses:** History endpoints soft-fail to []; slate empty text.  
5. **Duplicates:** Customers “Import” dead button.  
6. **Complexity:** Med.  
7. **Ponytail:** Solid operational tool.  
8. **Reuse:** ImportWizard for customers/vendors later.  
9. **UX:** KEEP; extend entity types carefully.  
10. **Tech:** Surface history API failures honestly.  
11. **Perf:** Preview slice 50 — good.  
12. **A11y:** File input labeling.  
13. **Decision:** KEEP  
14. **Priority:** Medium  
15. **Backend:** catalog import `built_unverified`; sync batches `partial`

### `/integrations`

1. **Purpose:** Sync health, providers, webhooks.  
2. **User:** Admin/IT; occasional.  
3. **Strengths:** Parallel load; push sync; graceful optional endpoints; TableSkeleton.  
4. **Weaknesses:** Dense multi-panel; raw provider select.  
5. **Duplicates:** API keys in settings.  
6. **Complexity:** Med–High.  
7. **Ponytail:** Health first, catalog of providers second.  
8. **Reuse:** Status chips DS.  
9. **UX:** KEEP with clearer hierarchy.  
10. **Tech:** DS Select.  
11. **Perf:** 6-way Promise.all — OK with skeleton.  
12. **A11y:** Error `role="alert"`.  
13. **Decision:** REFACTOR  
14. **Priority:** Medium  
15. **Backend:** sync/webhooks `built_unverified` / `partial`

### `/documents`

1. **Purpose:** Document center (specs, agreements, templates).  
2. **User:** Admin; occasional.  
3. **Strengths:** Tab shell; components call `/api/v1/documents*`.  
4. **Weaknesses:** Nav `partial: true`; **no backend module**; MSW-only — production mock gap.  
5. **Duplicates:** PO documents under purchasing mocks.  
6. **Complexity:** Low (shell).  
7. **Ponytail:** Hide unless flag.  
8. **Reuse:** N/A until real module.  
9. **UX:** Keep hidden (`SHOW_PARTIAL` / feature gate).  
10. **Tech:** Do not ship without backend.  
11. **Perf:** N/A.  
12. **A11y:** Tablist.  
13. **Decision:** CONSOLIDATE / hide (or REWRITE with backend)  
14. **Priority:** Low (retail) / Critical if shown in prod  
15. **Backend:** **`mocked`** / `missing` module

### `/audit-log`

1. **Purpose:** Immutable action history.  
2. **User:** Owner/compliance; as needed.  
3. **Strengths:** Real `/audit-log`; filters; pagination; expand rows; Button/Badge/TableSkeleton.  
4. **Weaknesses:** Raw input/select; `gray-*`/`blue-*` focus rings (not tokens).  
5. **Duplicates:** Inline “recent changes” on settings/modes.  
6. **Complexity:** Med.  
7. **Ponytail:** Filter bar should use DS.  
8. **Reuse:** Embedded audit widgets call same API.  
9. **UX:** KEEP.  
10. **Tech:** Input/Select primitives.  
11. **Perf:** limit/offset — good.  
12. **A11y:** Labels present; expand buttons named.  
13. **Decision:** REFACTOR (DS only)  
14. **Priority:** Medium  
15. **Backend:** `built_unverified`

### `/workflows`

1. **Purpose:** POS workflows, approval chains, run history, templates.  
2. **User:** Owner; occasional config.  
3. **Strengths:** Real workflows APIs; modal form component; CRUD.  
4. **Weaknesses:** 474-LOC page; local Badge/Skeleton; purple/indigo category chips; slate.  
5. **Duplicates:** Permission requests / approvals elsewhere.  
6. **Complexity:** High.  
7. **Ponytail:** Config density OK; tokenize severity.  
8. **Reuse:** Approval chain UI ↔ permission-requests.  
9. **UX:** KEEP; split tabs to files.  
10. **Tech:** DS components.  
11. **Perf:** Lazy tabs.  
12. **A11y:** Switch controls for enable toggles.  
13. **Decision:** REFACTOR  
14. **Priority:** Medium  
15. **Backend:** workflows `built_unverified`

### `/workforce`

1. **Purpose:** Weekly shift schedule + time-off.  
2. **User:** Manager; weekly.  
3. **Strengths:** Real workforce APIs; ScheduleGrid/ShiftModal extracted; Button.  
4. **Weaknesses:** Not in main nav tree (active key maps under inventory — odd); overlaps team clock + time-cards report.  
5. **Duplicates:** Team, time-cards report.  
6. **Complexity:** Med.  
7. **Ponytail:** Put under Team IA.  
8. **Reuse:** Employee list from `/team`.  
9. **UX:** CONSOLIDATE Team + Workforce + Time cards.  
10. **Tech:** Nav placement fix.  
11. **Perf:** OK.  
12. **A11y:** Grid keyboard support needed.  
13. **Decision:** CONSOLIDATE  
14. **Priority:** Medium  
15. **Backend:** workforce `built_unverified`

### `/appointments`

1. **Purpose:** Day calendar for service appointments.  
2. **User:** Front desk; daily if services vertical.  
3. **Strengths:** Real appointments API; Modal/Button; hour grid.  
4. **Weaknesses:** Raw status colors (`blue-*`/`gray-*`); no customer/employee pickers wired in form; module preview.  
5. **Duplicates:** None critical.  
6. **Complexity:** Med.  
7. **Ponytail:** Fine as vertical feature; hide for pure retail.  
8. **Reuse:** Customer picker from customers module.  
9. **UX:** KEEP as module-gated preview.  
10. **Tech:** Tokens; wire customer_id.  
11. **Perf:** OK.  
12. **A11y:** Appointment buttons need names with time+service.  
13. **Decision:** KEEP (gated)  
14. **Priority:** Low (retail)  
15. **Backend:** appointments `partial`

### `/team`

1. **Purpose:** Employees, roles, quick clock in/out.  
2. **User:** Manager; daily.  
3. **Strengths:** Real `/team` API; modals extracted; filters; clock actions.  
4. **Weaknesses:** Local badges; slate/emerald; raw search; `/setup/users` alias.  
5. **Duplicates:** Workforce employees; custom-roles; permissions.  
6. **Complexity:** Med.  
7. **Ponytail:** Team hub should own time + roles links.  
8. **Reuse:** RoleBadge shared with custom-roles.  
9. **UX:** Hub for Time cards + Workforce.  
10. **Tech:** DS Input/Badge.  
11. **Perf:** OK.  
12. **A11y:** Clock buttons announce state.  
13. **Decision:** KEEP (hub)  
14. **Priority:** High  
15. **Backend:** team `built_unverified`

### `/team/[id]`

1. **Purpose:** Employee detail, permissions, permission requests (~1221 LOC).  
2. **User:** Owner/manager; occasional.  
3. **Strengths:** Deep real APIs (`/team/:id`, permissions, permission-requests).  
4. **Weaknesses:** Very large; overlaps `/settings/permissions` and `/team/custom-roles`.  
5. **Duplicates:** Permissions admin.  
6. **Complexity:** High.  
7. **Ponytail:** Split profile vs access.  
8. **Reuse:** Permission matrix from settings/permissions.  
9. **UX:** REFACTOR into tabs/components; link to org permissions.  
10. **Tech:** Deduplicate permission UI.  
11. **Perf:** Split loads.  
12. **A11y:** Matrix checkboxes labeled.  
13. **Decision:** REFACTOR / CONSOLIDATE permissions UI  
14. **Priority:** High  
15. **Backend:** `built_unverified`

### `/team/custom-roles`

1. **Purpose:** CRUD custom roles + permission sets.  
2. **User:** Owner; rare.  
3. **Strengths:** Real `/custom-roles` APIs; owner gate.  
4. **Weaknesses:** Hardcoded `ALL_PERMISSIONS` list may drift from `@/lib/features` used by settings/permissions; duplicate of settings custom-roles APIs (`/settings/custom-roles`).  
5. **Duplicates:** `/settings/permissions` custom roles.  
6. **Complexity:** Med.  
7. **Ponytail:** One Roles screen only.  
8. **Reuse:** FEATURE_GROUPS from `lib/features`.  
9. **UX:** CONSOLIDATE into Settings → Permissions.  
10. **Tech:** Single API + single UI.  
11. **Perf:** OK.  
12. **A11y:** Grouped checkboxes.  
13. **Decision:** CONSOLIDATE  
14. **Priority:** High  
15. **Backend:** custom_roles + settings custom-roles — **duplicate surfaces** (`partial` consistency risk)

---

# C. Setup / Settings

### `/settings`

1. **Purpose:** Store profile, shipping, terms, payment modes, tax, flags, security, COA, deposits, loyalty tiers, receipts, API keys, currencies.  
2. **User:** Owner/manager; setup + occasional.  
3. **Strengths:** Section router; pathname sync to `/setup/*` aliases; role `canManage`; real section components.  
4. **Weaknesses:** Raw SectionButton (slate); nav says Settings while title says Setup; dual URL scheme.  
5. **Duplicates:** Entire `/setup` tree; tax-compliance rates; devices→receipts mapping is non-obvious.  
6. **Complexity:** High.  
7. **Ponytail:** One name (“Setup”), one URL prefix.  
8. **Reuse:** Section components already good extraction.  
9. **UX:** CONSOLIDATE aliases; clarify Devices vs Receipts.  
10. **Tech:** DS nav buttons; drop `/setup` re-exports or reverse.  
11. **Perf:** Section-level code split.  
12. **A11y:** `aria-current` already on section buttons — good.  
13. **Decision:** CONSOLIDATE (canonical hub)  
14. **Priority:** Critical  
15. **Backend:** settings sections mostly `built_unverified` / `partial` per section

### `/settings/permissions`

1. **Purpose:** Feature matrix, custom roles, permission request queue.  
2. **User:** Owner; occasional.  
3. **Strengths:** Rich real APIs; FEATURE_GROUPS; approve/reject/revoke.  
4. **Weaknesses:** Large page; overlaps team custom-roles + team/[id] access.  
5. **Duplicates:** `/team/custom-roles`.  
6. **Complexity:** High.  
7. **Ponytail:** This should be the **only** roles & permissions admin.  
8. **Reuse:** Absorb team/custom-roles.  
9. **UX:** KEEP as canonical.  
10. **Tech:** CONSOLIDATE APIs (`/settings/custom-roles` vs `/custom-roles`).  
11. **Perf:** Lazy request queue.  
12. **A11y:** Matrix + request dialogs.  
13. **Decision:** KEEP (make canonical)  
14. **Priority:** High  
15. **Backend:** `built_unverified`

### `/settings/modes`

1. **Purpose:** Capabilities-driven business type + module toggles + impact preview + audit trail.  
2. **User:** Owner; rare.  
3. **Strengths:** **Correct architecture** (capabilities contract); impact API; audit snippet.  
4. **Weaknesses:** Overlaps `/setup/business-profile` + `/setup/modules` + onboarding; slate/`#111`.  
5. **Duplicates:** setup business-profile/modules.  
6. **Complexity:** High.  
7. **Ponytail:** Keep this; delete duplicate setup pages.  
8. **Reuse:** Onboarding type picker.  
9. **UX:** Canonical “Business profile & modules”.  
10. **Tech:** Delete or redirect setup duplicates.  
11. **Perf:** OK.  
12. **A11y:** Impact dialog focus trap.  
13. **Decision:** KEEP  
14. **Priority:** Critical  
15. **Backend:** capabilities + business-profile `built_unverified`

### `/settings/kiosk`

1. **Purpose:** Kiosk mode toggles (PIN, idle timeout, tender allowlist).  
2. **User:** Owner; rare.  
3. **Strengths:** Clear settings UX; switch a11y started.  
4. **Weaknesses:** **Save is fake** (`setTimeout` 700ms, no API); hardcoded PIN default `1234`; slate/`#111`; raw controls.  
5. **Duplicates:** None.  
6. **Complexity:** Low.  
7. **Ponytail:** Must not look persisted if it isn’t.  
8. **Reuse:** ToggleRow → DS.  
9. **UX:** Hide until backend exists, or wire API.  
10. **Tech:** Persist endpoint or mark Demo.  
11. **Perf:** N/A.  
12. **A11y:** Switches mostly OK; inputs need labels.  
13. **Decision:** REWRITE or hide  
14. **Priority:** High (honesty)  
15. **Backend:** **`missing` / mocked UI**

### `/settings/b2b`

1. **Purpose:** Wholesale portal config (tiers, terms, approval).  
2. **User:** Owner (B2B); occasional.  
3. **Strengths:** Calls `PATCH /api/v1/settings/b2b`; structured groups.  
4. **Weaknesses:** Default groups hardcoded; **`PORTAL_URL = https://finder-pos.app/b2b/portal`** (forbidden old brand); slate/`#111`; errors swallowed.  
5. **Duplicates:** Payment terms in settings; customer groups.  
6. **Complexity:** Med.  
7. **Ponytail:** Brand violation is a hard fail.  
8. **Reuse:** Terms from Settings TermsSection.  
9. **UX:** Fix brand; load server state on mount.  
10. **Tech:** GET before PATCH; toast errors.  
11. **Perf:** OK.  
12. **A11y:** Switches OK.  
13. **Decision:** REFACTOR  
14. **Priority:** High  
15. **Backend:** `partial` / `built_unverified` (verify GET exists)

### `/setup` and alias children

| Route | Implementation | Decision |
|---|---|---|
| `/setup` | re-export settings | CONSOLIDATE |
| `/setup/shipping` | re-export settings | CONSOLIDATE |
| `/setup/payment-terms` | re-export settings | CONSOLIDATE |
| `/setup/payment-modes` | re-export settings | CONSOLIDATE |
| `/setup/payment-types` | re-export settings | CONSOLIDATE |
| `/setup/taxes` | re-export settings | CONSOLIDATE |
| `/setup/security` | re-export settings | CONSOLIDATE |
| `/setup/devices` | re-export settings (receipts section) | CONSOLIDATE |
| `/setup/users` | re-export team | CONSOLIDATE |
| `/setup/outlets` | re-export operations | CONSOLIDATE |
| `/setup/inventory-locations` | re-export inventory/locations | CONSOLIDATE |
| `/setup/loyalty` | re-export loyalty | CONSOLIDATE |

**Shared fields for aliases:** Purpose=legacy deep links; Complexity=Low; Backend=underlying page; Priority=Critical to clean IA.

### `/setup/business-profile`

1. **Purpose:** Pick business type + modules (duplicate of modes).  
2. **User:** Owner.  
3. **Strengths:** Real GET/POST business-profile; Badge/Button.  
4. **Weaknesses:** Duplicates `/settings/modes` with older hardcoded bundle UI; reload on save.  
5. **Duplicates:** settings/modes, onboarding, setup/modules.  
6. **Complexity:** Med.  
7. **Decision:** CONSOLIDATE → `/settings/modes`  
8. **Priority:** Critical  
9. **Backend:** same as modes

### `/setup/modules`

1. **Purpose:** Module flag toggles.  
2. **Duplicates:** settings/modes module toggles.  
3. **Decision:** CONSOLIDATE → `/settings/modes`  
4. **Priority:** Critical  
5. **Backend:** business-profile `built_unverified`

---

# D. Vertical previews

### Golf — `/golf`, `/golf/bookings`, `/golf/members`, `/golf/pro-shop`

1. **Purpose:** Tee sheet, bookings, members, pro shop inventory.  
2. **User:** Golf ops; N/A for retail MVP.  
3. **Strengths:** Full CRUD UI patterns; loading/error states.  
4. **Weaknesses:** **No backend module** — MSW only (`mocked`); raw inputs/buttons; heavy slate; registry route `/golf/tee-sheet` ≠ page `/golf`.  
5. **Duplicates:** Pro shop vs catalog/POS.  
6. **Complexity:** High (UI), missing (backend).  
7. **Ponytail:** Looks production-ready but isn’t — dangerous.  
8. **Reuse:** When built, share bookings patterns with appointments.  
9. **UX:** Hide; Preview badge if shown.  
10. **Tech:** Do not call mock APIs in prod builds.  
11. **Perf:** N/A.  
12. **A11y:** Forms need DS labels.  
13. **Decision:** HIDE / keep as preview shell (not retail nav)  
14. **Priority:** Critical (prod honesty)  
15. **Backend:** **`mocked` / `missing`**

### Restaurant — `/restaurant/dashboard`, `floor-plan`, `kitchen`, `tabs`

1. **Purpose:** F&B ops dashboard, tables, KDS, bar tabs.  
2. **User:** Restaurant managers; N/A retail MVP.  
3. **Strengths:** Backend `restaurant` module exists; dashboard useQuery; floor-plan session APIs; tabs CRUD.  
4. **Weaknesses:** Kitchen uses raw `fetch` for PATCH; no `/restaurant` index page; slate on dashboard; not retail nav.  
5. **Duplicates:** Orders open status ≈ kitchen.  
6. **Complexity:** Med each.  
7. **Ponytail:** Preview pack OK if gated.  
8. **Reuse:** Orders pipeline for KDS.  
9. **UX:** Keep gated; add pack landing or hide children.  
10. **Tech:** Use api client consistently in kitchen.  
11. **Perf:** KDS needs polling — not evident.  
12. **A11y:** Floor plan table buttons named.  
13. **Decision:** KEEP as preview shells (module-gated)  
14. **Priority:** Low (retail)  
15. **Backend:** `partial`

### Single-page verticals

| Page | API prefix | Complexity | Backend | Decision | Priority |
|---|---|---|---|---|---|
| `/healthcare` | `/healthcare/patients`, prescriptions | Med | module `partial` | KEEP gated / preview | Low |
| `/hospitality` | `/hospitality/rooms` | Med | module `partial` | KEEP gated / preview | Low |
| `/education` | `/education/students`, fees | Med | module `partial` | KEEP gated / preview | Low |
| `/entertainment` | `/entertainment/events`, tickets | Med | module `partial` | KEEP gated / preview | Low |
| `/manufacturing` | `/manufacturing/orders` | Med | module `partial` | KEEP gated / preview | Low |
| `/automotive` | `/automotive/vehicles`, work-orders | Med | module `partial` | KEEP gated / preview | Low |
| `/rental` | `/rental/assets`, contracts | Med | module `partial` | KEEP gated / preview | Low |

**Shared weaknesses:** Raw controls; slate/blue status chips; list+modal CRUD clones; not in default nav; incomplete retail proof.  
**Shared recommendation:** One `VerticalResourcePage` template; hide unless `moduleFlag` + `SHOW_PARTIAL`/capabilities; do not expand before retail proof complete (AGENTS product direction).

---


## Unified consolidation backlog

| Wave | Priority | Action | Decision |
|---|---|---|---|
| 0 | Critical | `partial`/hide Error Center + Pipeline fake tabs | HIDE |
| 0 | Critical | `/sales` mock history → `/orders` or hide | CONSOLIDATE |
| 0 | Critical | Fix `finder-pos.app` + “F” brand marks | REFACTOR |
| 0 | High | Kiosk fake save → hide or wire | REWRITE/HIDE |
| 1 | Critical | 308 `/reporting/*` → `/reports/*` | CONSOLIDATE |
| 1 | Critical | Setup duplicates → `/settings/modes`; checklist links | CONSOLIDATE |
| 1 | Critical | Purchasing hub: Cost entry, Reorder, EDI, Pipeline nest | CONSOLIDATE |
| 1 | High | `/sell`→`/terminal`; finance aliases; ecommerce alias honesty | CONSOLIDATE |
| 1 | High | Dissolve Operations; Delivery+Shipping merge; relocate Delivery | CONSOLIDATE |
| 2 | Critical | Finance hub simplify; Accounting drop duplicate pay grids | CONSOLIDATE |
| 2 | Critical | Discounts canonical; Promotions/Pricing quarantine | CONSOLIDATE |
| 2 | High | custom-roles ↔ permissions (NEEDS-SRI) | CONSOLIDATE |
| 2 | High | Expiry report → expiry-pool; time-cards → team; by-rep/vendor → sales | CONSOLIDATE |
| 3 | High | DS pass on keepers (terminal kit, orders, receive, bills, EOD, dashboard) | REFACTOR |
| 3 | Critical | Customers list N+1 summaries | REFACTOR |
| 4 | — | No Promotions/Pricing/Warehouse/Golf/WMS/matrix builds before retail proof | defer |

---

## Coverage checklist

| Bucket | Pages | Audited |
|---|---|---|
| Auth/public | 13 | Yes (§0) |
| Sell | 10 | Yes (§0) |
| Finance | 8 | Yes (§0) |
| Catalog/commercial | 9 (+ matrix missing) | Yes (§1) |
| Inventory/fulfillment | 22 | Yes (§1) |
| Reports + reporting aliases | 26 | Yes (§A) |
| Customers/dashboard/misc | 20 | Yes (§B) |
| Settings/setup | 20 | Yes (§C) |
| Verticals | 15 | Yes (§D) |
| **Total** | **142** | **Yes** |

Alias-only routes are audited as group rows with CONSOLIDATE decisions (not skipped).

---

## Verification notes (code-honest)

- Every `/reporting/*/page.tsx`: single-line re-export of `/reports/*` (`closing` → `end-of-day`).  
- `/sell`, `/finance/bills|payment-made|settings`, ecommerce children: re-exports.  
- Most `/setup/*`: re-exports except **real duplicates** `business-profile` + `modules`.  
- Redirects confirmed: `price-book` → pricing overrides; `expiry` → expiry-pool; `transfers` → `/inventory?tab=transfers`.  
- `/sales` calls `/api/v1/sales/history` with **no** backend route under `src/`.  
- Nav `partial: true` today: Pricing, Promotions, Warehouse, Documents — **not** Error Center / Pipeline fake tabs / Sales.  
- `src/modules/index.ts`: restaurant + 7 verticals registered; **no golf, no documents, no warehouse**.  
- Brand leaks: `finder-pos.app` in `settings/kiosk` + `settings/b2b`; kiosk save is `setTimeout` only; tax MSA uses `MSA_SAMPLE`.  
- `/catalog/matrix` **absent** on this master tip (earlier salvage/feature work not present).  
- Design-system debt is near-universal; exceptions closer to spec: discounts, gift-cards, purchase/cost-entry, delivery, parts of receive-stock/expiry-pool/counts/orders.

---

## What this audit is / is not

- **Is:** Page-by-page Ponytail decisions to reduce UI complexity while preserving retail workflows.  
- **Is not:** A visual redesign brief, a commitment to rewrite pages, or permission to deepen vertical packs before retail proof.  
- **Next code slices** should start at Wave 0–1 only, under `WORK/LOCK.md`, one consolidation cluster at a time.

---

*End of Ponytail Enterprise UI Audit — 2026-08-02T23:05:00Z*
