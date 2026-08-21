# Ascend — Ponytail Page Audit (Cluster Scope)

| Field | Value |
|---|---|
| Date (UTC) | 2026-08-03T04:28:38Z |
| Protocol | ASCEND Enterprise UI Audit — Ponytail Page-by-Page (13 fields) |
| Scope | **101** `page.tsx` routes in AUTH/PUBLIC, HOME, FINANCE, REPORTS/REPORTING, CUSTOMERS, TEAM/WORKFORCE, SETTINGS/SETUP, VERTICALS, OTHER under `web/app` |
| Method | Code-read of every page + `EnterpriseShell` NAV_TREE + AGENTS mock prefixes + `src/modules` presence. No product code changes. |
| Branch | `cursor/ponytail-page-audit-4fe7` (workspace) |
| Preference | Prefer **CONSOLIDATE** over **REWRITE**. Prefer honesty gates over new surfaces. |
| Related | Prior full-tree audit on `cursor/ponytail-enterprise-ui-audit-72bc` (`AUDIT_2026-08-02T230500Z-ponytail-enterprise-ui.md`); this doc re-verifies the requested clusters on current tree. |

---

## Executive verdict

Complexity is driven by **parallel IA** (`/reporting/*` aliases, `/setup/*` re-exports, ecommerce child shims, Finance→`/finance/bills` hijack), **honesty gaps** (kiosk fake save + `finder-pos.app`, B2B `finder-pos.app`, tax MSA_SAMPLE, golf MSW-only, onboarding **"F"** mark), and **DS drift** (slate/raw controls). Vertical packs with real backend modules still **do not appear in NAV_TREE** (orphaned deep links). Golf has **no backend module**.

Retail proof path to protect: Signup → Setup → Catalog → Receive/Cost → Terminal → Expenses → Dashboard/Reports → Recommendations/Tasks.

### Consolidation targets (this scope)

| Area | Today | Ponytail end-state |
|---|---|---|
| Report URLs | `/reports/*` + `/reporting/*` (26) | `/reports/*` only (+ 308) |
| Setup | `/settings` + `/setup/*` + dup profile/modules | `/settings` (+ `/settings/modes`) |
| Finance | Hub + Accounting + Bills + Invoicing + `/finance/bills` | Hub summaries → Bills / Invoicing / Accounting |
| Ecommerce children | 5 re-exports | Delete or real tabs; fix delivery/shipping lies |
| Golf | 4 MSW pages | Hide / park |
| Verticals (non-golf) | Orphaned module pages | Module-gated preview shells only |
| Brand | finder-pos.app, "F" logo | Ascend-only |

---

## Master decision matrix (101 pages)

| Route | Decision | Priority | Backend note |
|---|---|---|---|

### AUTH / PUBLIC

| Route | Decision | Priority | Backend note |
|---|---|---|---|
| `/` | REDESIGN | Medium | see detail |
| `/login` | REFACTOR | High | see detail |
| `/login/mfa` | CONSOLIDATE | High | mocked page |
| `/login/forgot-password` | KEEP | Medium | see detail |
| `/login/reset-password` | KEEP | Medium | see detail |
| `/login/device-verification` | CONSOLIDATE | Low | missing |
| `/login/security-alert` | CONSOLIDATE | Low | missing |
| `/signup` | REFACTOR | High | see detail |
| `/store` | REFACTOR | Medium | see detail |
| `/store/login` | REFACTOR | Low | see detail |
| `/store/[id]` | REFACTOR | Medium | see detail |
| `/store/account` | REFACTOR | Low | see detail |
| `/onboarding` | REFACTOR | High | see detail |

### HOME

| Route | Decision | Priority | Backend note |
|---|---|---|---|
| `/dashboard` | KEEP | Critical | see detail |
| `/ai-assistant` | KEEP | High | see detail |
| `/insights` | CONSOLIDATE | Medium | see detail |
| `/notifications` | REFACTOR | Medium | see detail |
| `/audit-log` | REFACTOR | Medium | see detail |
| `/tax-compliance` | CONSOLIDATE | High | partial/mocked MSA |

### FINANCE

| Route | Decision | Priority | Backend note |
|---|---|---|---|
| `/finance` | CONSOLIDATE | Critical | see detail |
| `/finance/bills` | CONSOLIDATE | Critical | alias |
| `/accounting` | CONSOLIDATE | High | see detail |
| `/bills` | KEEP | High | see detail |
| `/invoicing` | REFACTOR | High | see detail |

### REPORTS (canonical `/reports/*`)

| Route | Decision | Priority | Backend note |
|---|---|---|---|
| `/reports` | REFACTOR | High | see detail |
| `/reports/sales` | REFACTOR | High | see detail |
| `/reports/end-of-day` | KEEP | High | see detail |
| `/reports/p-l` | REFACTOR | High | see detail |
| `/reports/purchases` | REFACTOR | Medium | see detail |
| `/reports/sales-by-rep` | CONSOLIDATE | Medium | see detail |
| `/reports/sales-by-vendor` | CONSOLIDATE | Medium | see detail |
| `/reports/inventory` | REFACTOR | Medium | see detail |
| `/reports/ar-aging` | KEEP | Medium | see detail |
| `/reports/expiry` | CONSOLIDATE | High | see detail |
| `/reports/cash-movement` | CONSOLIDATE | Medium | see detail |
| `/reports/register-closures` | KEEP | High | see detail |
| `/reports/time-cards` | CONSOLIDATE | Medium | see detail |

### REPORTING (aliases of `/reports/*`)

| Route | Decision | Priority | Backend note |
|---|---|---|---|
| `/reporting` | CONSOLIDATE | Critical | alias |
| `/reporting/ar-aging` | CONSOLIDATE | Critical | alias |
| `/reporting/cash-movement` | CONSOLIDATE | Critical | alias |
| `/reporting/closing` | CONSOLIDATE | Critical | alias |
| `/reporting/expiry` | CONSOLIDATE | Critical | alias |
| `/reporting/inventory` | CONSOLIDATE | Critical | alias |
| `/reporting/p-l` | CONSOLIDATE | Critical | alias |
| `/reporting/purchases` | CONSOLIDATE | Critical | alias |
| `/reporting/register-closures` | CONSOLIDATE | Critical | alias |
| `/reporting/sales` | CONSOLIDATE | Critical | alias |
| `/reporting/sales-by-rep` | CONSOLIDATE | Critical | alias |
| `/reporting/sales-by-vendor` | CONSOLIDATE | Critical | alias |
| `/reporting/time-cards` | CONSOLIDATE | Critical | alias |

### CUSTOMERS

| Route | Decision | Priority | Backend note |
|---|---|---|---|
| `/customers` | REFACTOR | Critical | see detail |
| `/customers/[id]` | REFACTOR | High | see detail |
| `/appointments` | KEEP | Low | see detail |

### TEAM / WORKFORCE

| Route | Decision | Priority | Backend note |
|---|---|---|---|
| `/team` | KEEP | High | see detail |
| `/team/[id]` | REFACTOR | High | see detail |
| `/team/custom-roles` | CONSOLIDATE | High | see detail |
| `/workforce` | CONSOLIDATE | Medium | see detail |
| `/workflows` | REFACTOR | Medium | see detail |

### SETTINGS / SETUP

| Route | Decision | Priority | Backend note |
|---|---|---|---|
| `/settings` | CONSOLIDATE | Critical | see detail |
| `/settings/permissions` | KEEP | High | see detail |
| `/settings/modes` | KEEP | Critical | see detail |
| `/settings/kiosk` | REWRITE | High | missing |
| `/settings/b2b` | REFACTOR | High | see detail |
| `/setup` | CONSOLIDATE | Critical | alias |
| `/setup/business-profile` | CONSOLIDATE | Critical | see detail |
| `/setup/modules` | CONSOLIDATE | Critical | see detail |
| `/setup/users` | CONSOLIDATE | Critical | alias |
| `/setup/taxes` | CONSOLIDATE | Critical | alias |
| `/setup/shipping` | CONSOLIDATE | Critical | alias |
| `/setup/security` | CONSOLIDATE | Critical | alias |
| `/setup/payment-types` | CONSOLIDATE | Critical | alias |
| `/setup/payment-terms` | CONSOLIDATE | Critical | alias |
| `/setup/payment-modes` | CONSOLIDATE | Critical | alias |
| `/setup/inventory-locations` | CONSOLIDATE | Critical | alias |
| `/setup/devices` | CONSOLIDATE | Critical | alias |
| `/setup/outlets` | CONSOLIDATE | Critical | alias |
| `/setup/loyalty` | CONSOLIDATE | Critical | alias |

### VERTICALS

| Route | Decision | Priority | Backend note |
|---|---|---|---|
| `/golf` | CONSOLIDATE | Critical | mocked |
| `/golf/bookings` | CONSOLIDATE | Critical | mocked |
| `/golf/members` | CONSOLIDATE | Critical | mocked |
| `/golf/pro-shop` | CONSOLIDATE | Critical | mocked |
| `/restaurant/dashboard` | KEEP | Low | see detail |
| `/restaurant/floor-plan` | KEEP | Low | see detail |
| `/restaurant/kitchen` | KEEP | Low | see detail |
| `/restaurant/tabs` | KEEP | Low | see detail |
| `/healthcare` | KEEP | Low | see detail |
| `/automotive` | KEEP | Low | see detail |
| `/hospitality` | KEEP | Low | see detail |
| `/manufacturing` | KEEP | Low | see detail |
| `/rental` | KEEP | Low | see detail |
| `/entertainment` | KEEP | Low | see detail |
| `/education` | KEEP | Low | see detail |

### OTHER

| Route | Decision | Priority | Backend note |
|---|---|---|---|
| `/ecommerce` | CONSOLIDATE | High | see detail |
| `/ecommerce/customers` | CONSOLIDATE | High | alias |
| `/ecommerce/orders` | CONSOLIDATE | High | alias |
| `/ecommerce/delivery` | CONSOLIDATE | High | alias |
| `/ecommerce/shipping` | CONSOLIDATE | High | alias |
| `/ecommerce/promotions` | CONSOLIDATE | High | alias |
| `/documents` | CONSOLIDATE | Critical | mocked |
| `/imports-exports` | KEEP | Medium | see detail |
| `/integrations` | REFACTOR | Medium | see detail |

---

## Cross-cutting Ponytail findings

1. **`/reporting/*` is 100% alias debt** — every child is `export { default } from "../../reports/…"` (`closing` → `end-of-day`).
2. **`/setup/*` mostly re-exports `/settings`** (or team/operations/locations); `business-profile` + `modules` are full duplicate pages of `/settings/modes`.
3. **Finance AP tab** navigates to `/finance/bills` which re-exports `/bills` (chrome swap); aging uses `/reporting/ar-aging` alias.
4. **Brand violations still live:** `finder-pos.app` on kiosk + B2B; onboarding logo **"F"**.
5. **Customers N+1** `/summary` per row remains.
6. **Verticals:** none in `NAV_TREE`; golf is mock-only; other packs have `src/modules/*` but are orphaned.
7. **DS:** nearly every operational page still uses `slate-*` + raw `<button>/<input>` — fix via shared shells, not 101 redesigns.
8. **ai-assistant** is a bright spot (DS primitives + real API) — keep, don’t let it invent facts.

### Implementation waves (this scope)

**Wave 0 — Honesty (Critical):** Fix/remove `finder-pos.app` + "F"; hide/Demo kiosk fake save; Demo/hide MSA_SAMPLE; mark golf partial/hidden; stop Finance linking to `/reporting/*`.

**Wave 1 — Alias consolidation (Critical):** 308 `/reporting/*` → `/reports/*`; collapse `/setup/*` to `/settings`; redirect business-profile/modules → modes; ecommerce child honesty; delete `/finance/bills` alias.

**Wave 2 — Hub simplification (High):** Finance summaries-only; Team absorbs workforce + time-cards; permissions absorbs custom-roles; insights → reports/purchasing.

**Wave 3 — DS refactor on keepers (High/Medium):** dashboard, bills, reports EOD/register-closures, customers (after N+1), login/signup, ai-assistant already good.

**Wave 4 — Do not do yet:** Golf/Documents backends; expanding vertical packs before retail proof.

---

# AUTH / PUBLIC

### `/`

_130 LOC; not in NAV_

1. **Business Purpose:** Marketing/landing for prospects; CTAs to signup and login.
2. **Strengths:** Clear Ascend product naming; simple structure; retail vertical callout in eyebrow.
3. **Weaknesses:** Hard-coded `slate-*`/`indigo-*` marketing palette (violates DS tokens); card-grid feature section in first scroll; raw Link CTAs not `Button`; looks like generic SaaS, not operational Ascend.
4. **Duplicates:** Value props overlap signup business-type pitch and onboarding welcome.
5. **Complexity:** Low (~130 LOC)
6. **Ponytail Findings:** First viewport = brand + one headline + one short sentence + one CTA group; drop feature-card grid from hero; tokenize or isolate marketing theme deliberately.
7. **Reuse Opportunities:** Share AuthShell brand mark; use `Button` for CTAs.
8. **UX Recs:** REDESIGN for brand-first composition; do not oversell unfinished verticals.
9. **Tech Recs:** Server component OK; map colors to brand tokens or a dedicated marketing theme in `tailwind.config.ts`.
10. **Performance:** Static — fine.
11. **A11y:** Nav links OK; ensure contrast on indigo-on-slate; focus styles on CTAs.
12. **Decision:** REDESIGN
13. **Priority:** Medium

### `/login`

_430 LOC; not in NAV_

1. **Business Purpose:** Enterprise email/password sign-in; MFA challenge inline; redirect to terminal.
2. **Strengths:** Uses AuthShell + Button; Suspense skeleton; client validation; MFA pending-token flow via `useAuth`; SSO shown as disabled "coming soon" (honest); demo prefill gated.
3. **Weaknesses:** Heavy `slate-*` in card chrome (~98 hits); raw password/email inputs (not `Input` primitive); unused SSO provider chrome adds clutter; ~430 LOC.
4. **Duplicates:** MFA also exists as standalone `/login/mfa` (mocked, not linked from live flow).
5. **Complexity:** Medium–High
6. **Ponytail Findings:** Keep as canonical auth entry; collapse dead SSO or keep one "SSO coming soon" line; DS inputs.
7. **Reuse Opportunities:** AuthShell already shared with forgot/reset/signup.
8. **UX Recs:** One MFA path (inline here wins); remove unused SSO logos until wired.
9. **Tech Recs:** Replace raw inputs with `Input`; keep `completeMfaLogin` as the real MFA path.
10. **Performance:** OK; Suspense fallback present.
11. **A11y:** Labels/errors present; caps-lock hint; ensure MFA digit inputs have accessible names.
12. **Decision:** REFACTOR
13. **Priority:** High

### `/login/mfa`

_308 LOC; not in NAV_

1. **Business Purpose:** Standalone MFA verification UI built ahead of backend.
2. **Strengths:** AuthShell; digit UX with keyboard nav; method switcher; Button.
3. **Weaknesses:** File header admits: backend does not issue MFA challenge; mock codes `123456` / `ABCD-1234` always succeed; not linked from live login (login embeds MFA inline); MOCK_DEVICE fake trust UI.
4. **Duplicates:** Inline MFA on `/login` via `completeMfaLogin`.
5. **Complexity:** Medium (~308 LOC)
6. **Ponytail Findings:** Do not ship a second MFA theater. Merge useful UX into `/login` and park/delete this route until device-trust needs a dedicated page.
7. **Reuse Opportunities:** Digit-input pattern → shared MfaCodeInput.
8. **UX Recs:** Hide from product surface; if kept for demos, label Preview.
9. **Tech Recs:** CONSOLIDATE into login challenge component; remove mock success.
10. **Performance:** N/A
11. **A11y:** OTP inputs need `autocomplete="one-time-code"` (check present) and announced errors.
12. **Decision:** CONSOLIDATE
13. **Priority:** High

### `/login/forgot-password`

_134 LOC; not in NAV_

1. **Business Purpose:** Request password-reset email.
2. **Strengths:** Calls real `/api/identity/forgot-password`; AuthShell; success state.
3. **Weaknesses:** slate styling; raw input; not fully on DS primitives.
4. **Duplicates:** None material.
5. **Complexity:** Low
6. **Ponytail Findings:** Keep; light DS pass.
7. **Reuse Opportunities:** AuthShell.
8. **UX Recs:** Keep copy calm and operational.
9. **Tech Recs:** `Input` + token colors.
10. **Performance:** OK
11. **A11y:** Labeled field; error/success announced.
12. **Decision:** KEEP
13. **Priority:** Medium

### `/login/reset-password`

_259 LOC; not in NAV_

1. **Business Purpose:** Set new password from reset token.
2. **Strengths:** Real `/api/identity/reset-password`; token from query; validation.
3. **Weaknesses:** slate; raw inputs; missing Skeleton while validating token edge cases.
4. **Duplicates:** None.
5. **Complexity:** Low–Med
6. **Ponytail Findings:** Keep.
7. **Reuse Opportunities:** AuthShell + shared password rules with signup.
8. **UX Recs:** Show token-invalid empty/error clearly.
9. **Tech Recs:** DS Input; Skeleton on token check.
10. **Performance:** OK
11. **A11y:** Password requirements text associated with inputs.
12. **Decision:** KEEP
13. **Priority:** Medium

### `/login/device-verification`

_96 LOC; not in NAV_

1. **Business Purpose:** New-device trust challenge (intended).
2. **Strengths:** AuthShell shell present.
3. **Weaknesses:** No real device-trust API wiring evident; preview/static feel; not in primary auth path.
4. **Duplicates:** Overlaps MFA/security-alert trust narrative.
5. **Complexity:** Low (~96 LOC)
6. **Ponytail Findings:** Park until device-trust API exists; do not expand.
7. **Reuse Opportunities:** Auth challenge layout.
8. **UX Recs:** Hide from docs/nav until real.
9. **Tech Recs:** CONSOLIDATE with security-alert into one "Trust & alerts" story when backend lands.
10. **Performance:** N/A
11. **A11y:** If interactive, needs named actions.
12. **Decision:** CONSOLIDATE
13. **Priority:** Low

### `/login/security-alert`

_83 LOC; not in NAV_

1. **Business Purpose:** Notify user of suspicious login / security event.
2. **Strengths:** Thin informational page.
3. **Weaknesses:** No backend event feed; static; orphaned from live auth.
4. **Duplicates:** device-verification.
5. **Complexity:** Low (~83 LOC)
6. **Ponytail Findings:** Park with device-verification.
7. **Reuse Opportunities:** AuthShell.
8. **UX Recs:** Hide until real security events.
9. **Tech Recs:** Delete or gate behind feature flag.
10. **Performance:** N/A
11. **A11y:** Static content OK if real later.
12. **Decision:** CONSOLIDATE
13. **Priority:** Low

### `/signup`

_357 LOC; not in NAV_

1. **Business Purpose:** Two-step tenant creation: account credentials then business type.
2. **Strengths:** AuthShell + Button; real signup + business-profile write; retail-first types exist; Preview labeling pattern available in sibling onboarding.
3. **Weaknesses:** Emoji business-type grid; oversells unfinished verticals (golf/healthcare/etc.); slate; raw inputs; broad type list before retail proof is done.
4. **Duplicates:** Onboarding type picker; settings/modes; setup/business-profile.
5. **Complexity:** Medium (~357 LOC)
6. **Ponytail Findings:** Retail-first type list; Preview badges for non-ready packs; DS inputs; no emoji as primary UI.
7. **Reuse Opportunities:** Shared BusinessTypePicker with onboarding + settings/modes.
8. **UX Recs:** Step 2 should not imply every vertical is production-ready.
9. **Tech Recs:** Align READY_TYPES with onboarding; `Input` primitive.
10. **Performance:** OK
11. **A11y:** Type cards need `aria-pressed` / radiogroup.
12. **Decision:** REFACTOR
13. **Priority:** High

### `/store`

_234 LOC; not in NAV_

1. **Business Purpose:** Public/B2B storefront catalog browse.
2. **Strengths:** Hits real `/api/v1/catalog`; listing UI.
3. **Weaknesses:** limit=200 unbounded feel; slate/`#111`; store chrome separate from enterprise DS; error/empty states thin.
4. **Duplicates:** Catalog product browsing inside app.
5. **Complexity:** Med
6. **Ponytail Findings:** Tokenize; paginate; honest empty/error.
7. **Reuse Opportunities:** Product card from catalog where possible.
8. **UX Recs:** Keep as ecommerce surface; don’t pretend full cart if incomplete.
9. **Tech Recs:** Cursor/limit pagination; DS tokens.
10. **Performance:** 200-item fetch — paginate.
11. **A11y:** Product links named; filters labeled.
12. **Decision:** REFACTOR
13. **Priority:** Medium

### `/store/login`

_185 LOC; not in NAV_

1. **Business Purpose:** Customer portal login/register for storefront.
2. **Strengths:** Uses StoreAuthContext; previewMode awareness; validation.
3. **Weaknesses:** Raw inputs; slate/`#111`; portal auth maturity unclear vs enterprise identity.
4. **Duplicates:** Enterprise `/login`.
5. **Complexity:** Low–Med
6. **Ponytail Findings:** Gate as Preview until ecommerce auth is production-grade.
7. **Reuse Opportunities:** Form field styles → Input.
8. **UX Recs:** Clear Preview badge when mock/preview.
9. **Tech Recs:** Confirm real backend auth path; else mark partial.
10. **Performance:** OK
11. **A11y:** Form labels present.
12. **Decision:** REFACTOR
13. **Priority:** Low

### `/store/[id]`

_277 LOC; not in NAV_

1. **Business Purpose:** Storefront product detail.
2. **Strengths:** Loads `/api/v1/catalog/:id`.
3. **Weaknesses:** Add-to-cart / purchase affordances may outpace cart API; slate; raw controls.
4. **Duplicates:** In-app catalog detail.
5. **Complexity:** Med
6. **Ponytail Findings:** Hide cart actions until cart API is real.
7. **Reuse Opportunities:** Money formatting helpers.
8. **UX Recs:** Detail-first; no fake checkout.
9. **Tech Recs:** Gate cart CTA on capability.
10. **Performance:** OK
11. **A11y:** Qty controls labeled.
12. **Decision:** REFACTOR
13. **Priority:** Medium

### `/store/account`

_137 LOC; not in NAV_

1. **Business Purpose:** Logged-in customer portal account/orders.
2. **Strengths:** Calls ecommerce portal endpoints.
3. **Weaknesses:** slate; error surfacing weak; badge tokens inconsistent.
4. **Duplicates:** Customers module (ops side).
5. **Complexity:** Low–Med
6. **Ponytail Findings:** Keep thin; DS badges; surface errors.
7. **Reuse Opportunities:** Order status chips.
8. **UX Recs:** Simple account home.
9. **Tech Recs:** Error/empty states.
10. **Performance:** OK
11. **A11y:** Status text not color-only.
12. **Decision:** REFACTOR
13. **Priority:** Low

### `/onboarding`

_231 LOC; not in NAV_

1. **Business Purpose:** First-run business type selection for new tenants.
2. **Strengths:** Capabilities-driven types; READY_TYPES = retail only with Preview labels; writes business-profile; honest about incomplete packs.
3. **Weaknesses:** Logo letter **"F"** (brand violation); emoji-heavy; standalone marketing layout (not EnterpriseShell); hex gradient; raw buttons.
4. **Duplicates:** /settings/modes, /setup/business-profile, /setup/modules, signup step 2.
5. **Complexity:** Med (~231 LOC)
6. **Ponytail Findings:** Replace "F" with Ascend mark; share type picker; reduce emoji noise.
7. **Reuse Opportunities:** BusinessTypePicker shared across signup/modes/onboarding.
8. **UX Recs:** Keep retail-first honesty; don’t oversell verticals.
9. **Tech Recs:** Button primitive; brand asset.
10. **Performance:** OK
11. **A11y:** Selected card aria-pressed; progress announced.
12. **Decision:** REFACTOR
13. **Priority:** High

# HOME

### `/dashboard`

_315 LOC; in NAV_

1. **Business Purpose:** Retail operating home: KPIs, charts, recommendations, setup checklist, progress tasks.
2. **Strengths:** Real reports/progress/recommendations APIs; modular `_components`; RetailSetupChecklist; realtime hook; outlet scope; SIGNAL_TO_VERIFICATION maps recs→provable tasks.
3. **Weaknesses:** Overlaps `/reports` overview KPIs; high fetch fan-out; VerticalWidgets can surface incomplete packs; some slate/raw tab controls.
4. **Duplicates:** Reports summary/top/trend/hourly/category; insights forecasting adjacency.
5. **Complexity:** High (~315 + components)
6. **Ponytail Findings:** Keep as the retail proof home — one job: what needs attention today. Collapse chart density for new tenants.
7. **Reuse Opportunities:** Shared report query layer with `/reports`; KpiCard.
8. **UX Recs:** Prioritize checklist + recommendations; charts secondary.
9. **Tech Recs:** Optional BFF aggregate endpoint to cut fan-out.
10. **Performance:** High parallel fetches — main perf risk on home.
11. **A11y:** Chart text alternatives; recommendation actions named.
12. **Decision:** KEEP
13. **Priority:** Critical

### `/ai-assistant`

_397 LOC; in NAV_

1. **Business Purpose:** Rule/data-backed Q&A + recommendation approval (reorder etc.) per ADR-005.
2. **Strengths:** Strong DS usage (Button/Input/Card/Badge/EmptyState/Skeleton); real `/api/v1/ai-assistant/*`; confidence badges; suggested questions; poll with timeout; approval levels.
3. **Weaknesses:** Must not become source of truth (AGENTS rule) — UI should keep emphasizing dataUsed/reason; poll loop cost if many pending.
4. **Duplicates:** Dashboard recommendations; insights forecasting/reorder.
5. **Complexity:** Med–High (~397 LOC)
6. **Ponytail Findings:** Keep as assistive layer under Reporting; never invent facts; show evidence (`dataUsed`) prominently.
7. **Reuse Opportunities:** Recommendation cards ↔ dashboard recommendations.
8. **UX Recs:** KEEP; lead with suggested ops questions; require approval for side effects.
9. **Tech Recs:** Already good primitives; consider shared RecCard.
10. **Performance:** 1.5s poll × 30s — acceptable; stop on unmount (verify).
11. **A11y:** EmptyState + labeled composer; live region for new answers.
12. **Decision:** KEEP
13. **Priority:** High

### `/insights`

_58 LOC; in NAV_

1. **Business Purpose:** Scheduled report delivery + inventory forecasting tabs.
2. **Strengths:** Thin shell; role gate; tabs delegate to components with real insights APIs.
3. **Weaknesses:** Raw tab buttons; slate; name collides with Reports; forecasting overlaps inventory reorder / demand planning.
4. **Duplicates:** Reports email mental model; inventory reorder; ai-assistant reorder.
5. **Complexity:** Low (page) / Med (tabs)
6. **Ponytail Findings:** Rename under Reporting ("Scheduled & Forecast") or fold tabs into reports/purchasing.
7. **Reuse Opportunities:** Tab chrome shared pattern.
8. **UX Recs:** CONSOLIDATE scheduled delivery into reports; forecasting into purchasing/reorder.
9. **Tech Recs:** DS tabs; `aria-selected`.
10. **Performance:** OK
11. **A11y:** tablist/tab pattern missing (buttons only).
12. **Decision:** CONSOLIDATE
13. **Priority:** Medium

### `/notifications`

_654 LOC; in NAV_

1. **Business Purpose:** Inbox, channel preferences, alert rules, digest.
2. **Strengths:** Broad real notifications API (read/rules/prefs); mark-read; TableSkeleton path.
3. **Weaknesses:** 654-LOC monolith; local Badge/Toggle; emoji channel icons; heavy slate (~73); raw controls (~19).
4. **Duplicates:** Dashboard notification peek.
5. **Complexity:** High
6. **Ponytail Findings:** Split tabs into `_components`; drop emoji; DS Toggle/Badge.
7. **Reuse Opportunities:** Severity tokens; DS Badge.
8. **UX Recs:** Inbox first; prefs secondary.
9. **Tech Recs:** Lazy-load non-inbox tabs; extract Toggle with role=switch.
10. **Performance:** Lazy tabs recommended.
11. **A11y:** Custom Toggle needs `role="switch"` + `aria-checked`.
12. **Decision:** REFACTOR
13. **Priority:** Medium

### `/audit-log`

_210 LOC; in NAV_

1. **Business Purpose:** Immutable tenant action history for compliance/ops.
2. **Strengths:** Real `/api/v1/audit-log`; filters; pagination; expand rows; Button/Badge/TableSkeleton.
3. **Weaknesses:** Raw input/select; gray/blue focus rings not erp tokens; EmptyState missing (empty table text only).
4. **Duplicates:** Inline recent-changes snippets on settings/modes.
5. **Complexity:** Med (~210 LOC)
6. **Ponytail Findings:** Filter bar → DS Input/Select; keep as Setup compliance tool.
7. **Reuse Opportunities:** Embedded audit widgets should call same API.
8. **UX Recs:** KEEP with DS pass.
9. **Tech Recs:** Input/Select primitives; EmptyState.
10. **Performance:** limit/offset — good.
11. **A11y:** Labels present; expand buttons named.
12. **Decision:** REFACTOR
13. **Priority:** Medium

### `/tax-compliance`

_261 LOC; in NAV_

1. **Business Purpose:** Tax rates + MSA reporting + exemptions (specialty retail).
2. **Strengths:** Tax rates CRUD via `/api/v1/settings/tax-rates`; industry-aware framing.
3. **Weaknesses:** MSA tab uses hardcoded `MSA_SAMPLE` (mocked, not integer-cents clean); duplicates Settings Tax section; raw inputs; heavy slate.
4. **Duplicates:** /settings tax section; /setup/taxes alias.
5. **Complexity:** Med (~261 LOC)
6. **Ponytail Findings:** Honesty gap: sample MSA presented as operational. Rates → Settings; hide MSA until real API.
7. **Reuse Opportunities:** TaxSection from settings.
8. **UX Recs:** Split rates vs compliance reports; Demo badge on sample.
9. **Tech Recs:** Remove MSA_SAMPLE or label Demo; money in cents.
10. **Performance:** OK
11. **A11y:** Form labels present.
12. **Decision:** CONSOLIDATE
13. **Priority:** High

# FINANCE

### `/finance`

_426 LOC; in NAV_

1. **Business Purpose:** AR/AP/expenses/aging hub with inline pay controls.
2. **Strengths:** Real billing invoices/bills/expenses APIs; ExpensesPanel extracted; role-aware pay.
3. **Weaknesses:** AP tab `router.replace("/finance/bills")` hijacks URL to alias that re-exports `/bills` while still rendering Finance shell tabs — dual chrome risk; aging jumps to `/reporting/ar-aging` (alias); heavy slate; SummaryCard uses non-token colors; PayControl raw input; duplicates Accounting/Bills pay grids.
4. **Duplicates:** /bills, /accounting, /reports/ar-aging, /finance/bills alias.
5. **Complexity:** High (~426 LOC)
6. **Ponytail Findings:** Hub should be summaries + deep links only; stop routing AP to a re-export that loads a different page; aging → `/reports/ar-aging`.
7. **Reuse Opportunities:** PayControl shared with accounting; KpiCard instead of SummaryCard.
8. **UX Recs:** Finance overview → open Bills / Invoicing / Accounting as destinations.
9. **Tech Recs:** Fix tab routing; DS money Input; token colors.
10. **Performance:** Loads lists per tab — fetch active tab only.
11. **A11y:** Pay amount labeled; tabs need tablist pattern.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/finance/bills`

_2 LOC; re-export → `../../bills/page`; not in NAV_

1. **Business Purpose:** Alias intended for AP deep link; currently re-exports `/bills` page.
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Finance hub also navigates here for AP tab — users leave Finance chrome for Bills chrome unexpectedly; parallel URL.
4. **Duplicates:** Exact surface of `/bills`.
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Delete alias; Finance AP tab should either embed summary or link to `/bills` without pretending to be a Finance child route.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/bills`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/accounting`

_361 LOC; in NAV_

1. **Business Purpose:** Chart of accounts, deposits, journal/aging adjacent finance ops.
2. **Strengths:** Real accounting APIs (seed/accounts); Card/Button; cents helpers.
3. **Weaknesses:** Overlaps Finance AR/AP pay grids and Settings COA/deposits sections; slate; thin loading/empty.
4. **Duplicates:** /finance pay grids; settings COA/deposits; reports AR aging.
5. **Complexity:** Med–High (~361 LOC)
6. **Ponytail Findings:** Keep COA/deposits/journal; drop duplicate AR/AP payment tables if Finance/Bills own them.
7. **Reuse Opportunities:** COA section already in settings — pick one home.
8. **UX Recs:** Accounting = ledger; Finance = cash position; Bills/Invoicing = documents.
9. **Tech Recs:** Skeleton/EmptyState; DS.
10. **Performance:** OK if lists paginated (journal keyset exists backend).
11. **A11y:** Seed/destructive actions need ConfirmDialog.
12. **Decision:** CONSOLIDATE
13. **Priority:** High

### `/bills`

_88 LOC; in NAV_

1. **Business Purpose:** Canonical supplier AP bill list (auto-drafted from PO receive).
2. **Strengths:** Thin container; BillsView extracted; real `/api/v1/billing/bills` with cursor pagination; supplier filter.
3. **Weaknesses:** Load-more uses raw `<button>`; slate; no Skeleton/EmptyState primitives in container.
4. **Duplicates:** /finance/bills alias; Finance AP tab.
5. **Complexity:** Low (page) / Med (view)
6. **Ponytail Findings:** This is the AP list of record — keep.
7. **Reuse Opportunities:** BillsView; cursor pattern for other finance lists.
8. **UX Recs:** KEEP; wire EmptyState.
9. **Tech Recs:** Button for load-more; Skeleton.
10. **Performance:** Cursor pagination — good.
11. **A11y:** Load more needs accessible name (has text).
12. **Decision:** KEEP
13. **Priority:** High

### `/invoicing`

_511 LOC; in NAV_

1. **Business Purpose:** Customer invoices (AR documents) create/list/manage.
2. **Strengths:** Real `/api/v1/customer-invoices`; substantial workflow.
3. **Weaknesses:** 511 LOC monolith; heavy slate (~87); many raw controls (~18); clarify vs billing invoices used on Finance AR.
4. **Duplicates:** Finance AR invoice list/pay; possible billing vs customer-invoices dual model.
5. **Complexity:** High
6. **Ponytail Findings:** DS refactor; clarify document type vs POS receipts; share pay action with Finance.
7. **Reuse Opportunities:** Line-item editor patterns from quotes/orders.
8. **UX Recs:** REFACTOR density; loading/empty/error completeness.
9. **Tech Recs:** Split `_components`; Input/Select/Modal.
10. **Performance:** Ensure list pagination.
11. **A11y:** Form labels; dialog focus trap.
12. **Decision:** REFACTOR
13. **Priority:** High

# REPORTS (canonical `/reports/*`)

### `/reports`

_247 LOC; in NAV_

1. **Business Purpose:** Reports hub: KPI summary + deep links to operational report pages.
2. **Strengths:** ReportsDashboard/SubNav shared; real summary/top APIs; role gate; Skeleton.
3. **Weaknesses:** Overlaps dashboard KPIs; slate in places; custom range UX dense.
4. **Duplicates:** Dashboard metrics; `/reporting` alias tree.
5. **Complexity:** Med
6. **Ponytail Findings:** Slim hub; one KPI source of truth with dashboard.
7. **Reuse Opportunities:** ReportPageShell / ReportsSubNav already.
8. **UX Recs:** Keep as Reporting home.
9. **Tech Recs:** Share query hooks with dashboard.
10. **Performance:** Parallel KPI fetches — OK with skeleton.
11. **A11y:** Subnav current page indicated.
12. **Decision:** REFACTOR
13. **Priority:** High

### `/reports/sales`

_463 LOC; not in NAV_

1. **Business Purpose:** Sales analysis by product/category/etc.
2. **Strengths:** Real report endpoints; Skeleton; SubNav.
3. **Weaknesses:** 463 LOC; may fetch inactive tabs; slate; complex filters.
4. **Duplicates:** sales-by-rep, sales-by-vendor as separate pages.
5. **Complexity:** High
6. **Ponytail Findings:** Fetch active tab only; consider Group-by instead of sibling routes.
7. **Reuse Opportunities:** Report filters hook (`useReportFilters`).
8. **UX Recs:** Consolidate group-by into this page.
9. **Tech Recs:** Lazy tab data.
10. **Performance:** Tab fan-out risk.
11. **A11y:** Tabs as tablist.
12. **Decision:** REFACTOR
13. **Priority:** High

### `/reports/end-of-day`

_414 LOC; not in NAV_

1. **Business Purpose:** Retail Z-report / closing summary.
2. **Strengths:** Core retail control report; real API; date picker.
3. **Weaknesses:** Heavy slate; DS drift; also aliased as `/reporting/closing`.
4. **Duplicates:** register-closures / cash-movement adjacency.
5. **Complexity:** High (~414 LOC)
6. **Ponytail Findings:** Keep as canonical closing report; polish layout.
7. **Reuse Opportunities:** Cash figures with register-closures.
8. **UX Recs:** KEEP; print-friendly layout.
9. **Tech Recs:** Tokenize; Button.
10. **Performance:** Single-date fetch — fine.
11. **A11y:** Date input labeled.
12. **Decision:** KEEP
13. **Priority:** High

### `/reports/p-l`

_354 LOC; not in NAV_

1. **Business Purpose:** Profit & loss statement.
2. **Strengths:** Real P&L API; Skeleton; range control.
3. **Weaknesses:** Statement layout could be clearer; slate.
4. **Duplicates:** Dashboard profit KPI.
5. **Complexity:** Med–High
6. **Ponytail Findings:** Statement-first typography; less card chrome.
7. **Reuse Opportunities:** Money formatting.
8. **UX Recs:** REFACTOR visual hierarchy.
9. **Tech Recs:** DS tokens.
10. **Performance:** OK
11. **A11y:** Table headers / row labels.
12. **Decision:** REFACTOR
13. **Priority:** High

### `/reports/purchases`

_134 LOC; not in NAV_

1. **Business Purpose:** Purchases report by period/vendor.
2. **Strengths:** Real purchases report API.
3. **Weaknesses:** Vendor picker UX thin; slate.
4. **Duplicates:** Purchasing hub analytics.
5. **Complexity:** Low–Med
6. **Ponytail Findings:** Keep; improve vendor filter.
7. **Reuse Opportunities:** Supplier picker from purchasing.
8. **UX Recs:** REFACTOR filters.
9. **Tech Recs:** Select primitive.
10. **Performance:** OK
11. **A11y:** Filter labels.
12. **Decision:** REFACTOR
13. **Priority:** Medium

### `/reports/sales-by-rep`

_221 LOC; not in NAV_

1. **Business Purpose:** Sales grouped by sales rep.
2. **Strengths:** Real API; Skeleton.
3. **Weaknesses:** Near-duplicate of sales report with different group dimension.
4. **Duplicates:** /reports/sales; sales-by-vendor.
5. **Complexity:** Med
6. **Ponytail Findings:** Fold into `/reports/sales` Group-by=rep.
7. **Reuse Opportunities:** Shared report table.
8. **UX Recs:** CONSOLIDATE.
9. **Tech Recs:** Redirect after merge.
10. **Performance:** OK
11. **A11y:** Table.
12. **Decision:** CONSOLIDATE
13. **Priority:** Medium

### `/reports/sales-by-vendor`

_223 LOC; not in NAV_

1. **Business Purpose:** Sales grouped by vendor.
2. **Strengths:** Real API; Skeleton.
3. **Weaknesses:** Sibling duplicate of sales-by-rep pattern.
4. **Duplicates:** /reports/sales; sales-by-rep.
5. **Complexity:** Med
6. **Ponytail Findings:** Fold into sales Group-by=vendor.
7. **Reuse Opportunities:** Shared report table.
8. **UX Recs:** CONSOLIDATE.
9. **Tech Recs:** Redirect after merge.
10. **Performance:** OK
11. **A11y:** Table.
12. **Decision:** CONSOLIDATE
13. **Priority:** Medium

### `/reports/inventory`

_237 LOC; not in NAV_

1. **Business Purpose:** Inventory valuation report.
2. **Strengths:** Real valuation API; Skeleton.
3. **Weaknesses:** May be unbounded/large; overlaps inventory screens.
4. **Duplicates:** Inventory overview valuation widgets.
5. **Complexity:** Med
6. **Ponytail Findings:** Paginate valuation; keep as report.
7. **Reuse Opportunities:** Inventory money helpers.
8. **UX Recs:** REFACTOR pagination.
9. **Tech Recs:** Keyset/limit.
10. **Performance:** Watch large catalogs.
11. **A11y:** Table.
12. **Decision:** REFACTOR
13. **Priority:** Medium

### `/reports/ar-aging`

_215 LOC; not in NAV_

1. **Business Purpose:** Accounts receivable aging buckets.
2. **Strengths:** Real AR aging API; Skeleton; Finance links here (via reporting alias today).
3. **Weaknesses:** Customer drill-down could be stronger; slate.
4. **Duplicates:** Finance aging tab.
5. **Complexity:** Med
6. **Ponytail Findings:** Keep; Finance should deep-link to `/reports/ar-aging` not `/reporting/...`.
7. **Reuse Opportunities:** Customer name links to `/customers/[id]`.
8. **UX Recs:** KEEP with drill-down.
9. **Tech Recs:** Fix inbound links from Finance.
10. **Performance:** OK
11. **A11y:** Aging table headers.
12. **Decision:** KEEP
13. **Priority:** Medium

### `/reports/expiry`

_226 LOC; not in NAV_

1. **Business Purpose:** Expiring inventory report.
2. **Strengths:** Uses inventory expiring API.
3. **Weaknesses:** Overlaps Inventory Expiry Pool operational page.
4. **Duplicates:** /inventory/expiry-pool.
5. **Complexity:** Med
6. **Ponytail Findings:** Operational expiry lives in Inventory; this can be a thin report or redirect.
7. **Reuse Opportunities:** Expiry pool columns.
8. **UX Recs:** CONSOLIDATE into expiry-pool + optional export.
9. **Tech Recs:** Redirect or shared component.
10. **Performance:** OK
11. **A11y:** Table.
12. **Decision:** CONSOLIDATE
13. **Priority:** High

### `/reports/cash-movement`

_108 LOC; not in NAV_

1. **Business Purpose:** Cash drawer movement report.
2. **Strengths:** Real cash-movement API.
3. **Weaknesses:** Overlaps register-closures / EOD.
4. **Duplicates:** register-closures; end-of-day.
5. **Complexity:** Low–Med
6. **Ponytail Findings:** Nest under register-closures or EOD.
7. **Reuse Opportunities:** Cash tables.
8. **UX Recs:** CONSOLIDATE.
9. **Tech Recs:** Tab under register-closures.
10. **Performance:** OK
11. **A11y:** Table.
12. **Decision:** CONSOLIDATE
13. **Priority:** Medium

### `/reports/register-closures`

_193 LOC; not in NAV_

1. **Business Purpose:** Register close history / cash control.
2. **Strengths:** Real API; critical retail control.
3. **Weaknesses:** DS polish needed.
4. **Duplicates:** cash-movement; EOD.
5. **Complexity:** Med
6. **Ponytail Findings:** Keep as cash control center; absorb cash-movement.
7. **Reuse Opportunities:** EOD figures.
8. **UX Recs:** KEEP.
9. **Tech Recs:** DS table.
10. **Performance:** limit param — good.
11. **A11y:** Table.
12. **Decision:** KEEP
13. **Priority:** High

### `/reports/time-cards`

_175 LOC; not in NAV_

1. **Business Purpose:** Labor time-card report.
2. **Strengths:** Real time-cards report API.
3. **Weaknesses:** Belongs with Team/Workforce IA more than Reporting.
4. **Duplicates:** Team clock; workforce schedule.
5. **Complexity:** Low–Med
6. **Ponytail Findings:** Move under Team hub.
7. **Reuse Opportunities:** Employee filters from team.
8. **UX Recs:** CONSOLIDATE into Team.
9. **Tech Recs:** Nav move + redirect.
10. **Performance:** OK
11. **A11y:** Filters labeled.
12. **Decision:** CONSOLIDATE
13. **Priority:** Medium

# REPORTING (aliases of `/reports/*`)

### `/reporting`

_2 LOC; re-export → `../reports/page`; not in NAV_

1. **Business Purpose:** Legacy `/reporting/*` alias re-exporting `/reports`.
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Creates parallel IA; bookmarks/analytics split; users can land on non-canonical chrome/title paths.
4. **Duplicates:** Exact duplicate of `/reports` (parallel report IA).
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Entire `/reporting` tree should 308 to `/reports/*` (`closing`→`end-of-day`) then be deleted.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/reports`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/reporting/ar-aging`

_2 LOC; re-export → `../../reports/ar-aging/page`; not in NAV_

1. **Business Purpose:** Legacy `/reporting/*` alias re-exporting `/reports/ar-aging`.
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Creates parallel IA; bookmarks/analytics split; users can land on non-canonical chrome/title paths.
4. **Duplicates:** Exact duplicate of `/reports/ar-aging` (parallel report IA).
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Entire `/reporting` tree should 308 to `/reports/*` (`closing`→`end-of-day`) then be deleted.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/reports/ar-aging`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/reporting/cash-movement`

_2 LOC; re-export → `../../reports/cash-movement/page`; not in NAV_

1. **Business Purpose:** Legacy `/reporting/*` alias re-exporting `/reports/cash-movement`.
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Creates parallel IA; bookmarks/analytics split; users can land on non-canonical chrome/title paths.
4. **Duplicates:** Exact duplicate of `/reports/cash-movement` (parallel report IA).
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Entire `/reporting` tree should 308 to `/reports/*` (`closing`→`end-of-day`) then be deleted.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/reports/cash-movement`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/reporting/closing`

_2 LOC; re-export → `../../reports/end-of-day/page`; not in NAV_

1. **Business Purpose:** Legacy `/reporting/*` alias re-exporting `/reports/end-of-day`.
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Creates parallel IA; bookmarks/analytics split; users can land on non-canonical chrome/title paths.
4. **Duplicates:** Exact duplicate of `/reports/end-of-day` (parallel report IA).
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Entire `/reporting` tree should 308 to `/reports/*` (`closing`→`end-of-day`) then be deleted.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/reports/end-of-day`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/reporting/expiry`

_2 LOC; re-export → `../../reports/expiry/page`; not in NAV_

1. **Business Purpose:** Legacy `/reporting/*` alias re-exporting `/reports/expiry`.
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Creates parallel IA; bookmarks/analytics split; users can land on non-canonical chrome/title paths.
4. **Duplicates:** Exact duplicate of `/reports/expiry` (parallel report IA).
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Entire `/reporting` tree should 308 to `/reports/*` (`closing`→`end-of-day`) then be deleted.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/reports/expiry`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/reporting/inventory`

_2 LOC; re-export → `../../reports/inventory/page`; not in NAV_

1. **Business Purpose:** Legacy `/reporting/*` alias re-exporting `/reports/inventory`.
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Creates parallel IA; bookmarks/analytics split; users can land on non-canonical chrome/title paths.
4. **Duplicates:** Exact duplicate of `/reports/inventory` (parallel report IA).
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Entire `/reporting` tree should 308 to `/reports/*` (`closing`→`end-of-day`) then be deleted.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/reports/inventory`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/reporting/p-l`

_2 LOC; re-export → `../../reports/p-l/page`; not in NAV_

1. **Business Purpose:** Legacy `/reporting/*` alias re-exporting `/reports/p-l`.
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Creates parallel IA; bookmarks/analytics split; users can land on non-canonical chrome/title paths.
4. **Duplicates:** Exact duplicate of `/reports/p-l` (parallel report IA).
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Entire `/reporting` tree should 308 to `/reports/*` (`closing`→`end-of-day`) then be deleted.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/reports/p-l`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/reporting/purchases`

_2 LOC; re-export → `../../reports/purchases/page`; not in NAV_

1. **Business Purpose:** Legacy `/reporting/*` alias re-exporting `/reports/purchases`.
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Creates parallel IA; bookmarks/analytics split; users can land on non-canonical chrome/title paths.
4. **Duplicates:** Exact duplicate of `/reports/purchases` (parallel report IA).
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Entire `/reporting` tree should 308 to `/reports/*` (`closing`→`end-of-day`) then be deleted.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/reports/purchases`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/reporting/register-closures`

_2 LOC; re-export → `../../reports/register-closures/page`; not in NAV_

1. **Business Purpose:** Legacy `/reporting/*` alias re-exporting `/reports/register-closures`.
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Creates parallel IA; bookmarks/analytics split; users can land on non-canonical chrome/title paths.
4. **Duplicates:** Exact duplicate of `/reports/register-closures` (parallel report IA).
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Entire `/reporting` tree should 308 to `/reports/*` (`closing`→`end-of-day`) then be deleted.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/reports/register-closures`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/reporting/sales`

_2 LOC; re-export → `../../reports/sales/page`; not in NAV_

1. **Business Purpose:** Legacy `/reporting/*` alias re-exporting `/reports/sales`.
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Creates parallel IA; bookmarks/analytics split; users can land on non-canonical chrome/title paths.
4. **Duplicates:** Exact duplicate of `/reports/sales` (parallel report IA).
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Entire `/reporting` tree should 308 to `/reports/*` (`closing`→`end-of-day`) then be deleted.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/reports/sales`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/reporting/sales-by-rep`

_2 LOC; re-export → `../../reports/sales-by-rep/page`; not in NAV_

1. **Business Purpose:** Legacy `/reporting/*` alias re-exporting `/reports/sales-by-rep`.
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Creates parallel IA; bookmarks/analytics split; users can land on non-canonical chrome/title paths.
4. **Duplicates:** Exact duplicate of `/reports/sales-by-rep` (parallel report IA).
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Entire `/reporting` tree should 308 to `/reports/*` (`closing`→`end-of-day`) then be deleted.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/reports/sales-by-rep`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/reporting/sales-by-vendor`

_2 LOC; re-export → `../../reports/sales-by-vendor/page`; not in NAV_

1. **Business Purpose:** Legacy `/reporting/*` alias re-exporting `/reports/sales-by-vendor`.
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Creates parallel IA; bookmarks/analytics split; users can land on non-canonical chrome/title paths.
4. **Duplicates:** Exact duplicate of `/reports/sales-by-vendor` (parallel report IA).
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Entire `/reporting` tree should 308 to `/reports/*` (`closing`→`end-of-day`) then be deleted.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/reports/sales-by-vendor`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/reporting/time-cards`

_2 LOC; re-export → `../../reports/time-cards/page`; not in NAV_

1. **Business Purpose:** Legacy `/reporting/*` alias re-exporting `/reports/time-cards`.
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Creates parallel IA; bookmarks/analytics split; users can land on non-canonical chrome/title paths.
4. **Duplicates:** Exact duplicate of `/reports/time-cards` (parallel report IA).
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Entire `/reporting` tree should 308 to `/reports/*` (`closing`→`end-of-day`) then be deleted.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/reports/time-cards`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

# CUSTOMERS

### `/customers`

_104 LOC; in NAV_

1. **Business Purpose:** Customer list with loyalty/spend segments for retail CRM.
2. **Strengths:** Real customers API; CustomerTable/modals extracted; segment heuristics; useQuery.
3. **Weaknesses:** **N+1**: after list fetch, per-customer `/summary` calls (code-verified); Import button non-functional; raw header buttons; hex hover remnants risk.
4. **Duplicates:** /ecommerce/customers re-export.
5. **Complexity:** Med
6. **Ponytail Findings:** Fix N+1 before polish; Import → imports-exports or remove.
7. **Reuse Opportunities:** CustomerTable.
8. **UX Recs:** DS Button header actions.
9. **Tech Recs:** Backend list should embed summary columns; Promise.all still N+1 network.
10. **Performance:** Critical — N+1 on every load.
11. **A11y:** Table + action names.
12. **Decision:** REFACTOR
13. **Priority:** Critical

### `/customers/[id]`

_445 LOC; not in NAV_

1. **Business Purpose:** Customer 360: profile, financials, loyalty, merge.
2. **Strengths:** Parallel loads; merge flow; financials + loyalty APIs; Button/Card; Skeleton.
3. **Weaknesses:** 445 LOC + many local comps; slate-heavy; raw inputs; long scroll.
4. **Duplicates:** AR aging totals; loyalty setup.
5. **Complexity:** High
6. **Ponytail Findings:** Tabbed profile > long scroll.
7. **Reuse Opportunities:** Financials strip on AR report.
8. **UX Recs:** Tabs: Overview / Orders / Financials / Loyalty.
9. **Tech Recs:** Split remaining monolith; DS Input; ConfirmDialog for merge.
10. **Performance:** AbortControllers — good.
11. **A11y:** Merge needs confirm dialog primitive.
12. **Decision:** REFACTOR
13. **Priority:** High

### `/appointments`

_210 LOC; in NAV_

1. **Business Purpose:** Day calendar for service appointments.
2. **Strengths:** In Customers nav; real appointments API; Modal/Button; hour grid.
3. **Weaknesses:** Raw status colors; customer/employee pickers incomplete; module preview depth.
4. **Duplicates:** None critical for retail.
5. **Complexity:** Med (~210 LOC)
6. **Ponytail Findings:** Fine as services vertical; keep feature-gated; hide for pure retail.
7. **Reuse Opportunities:** Customer picker.
8. **UX Recs:** KEEP gated.
9. **Tech Recs:** Tokens; wire customer_id.
10. **Performance:** OK
11. **A11y:** Appointment buttons need time+service names.
12. **Decision:** KEEP
13. **Priority:** Low

# TEAM / WORKFORCE

### `/team`

_310 LOC; in NAV_

1. **Business Purpose:** Employees, roles, quick clock in/out hub.
2. **Strengths:** Real `/team` API; modals extracted; filters; clock actions; in Setup nav.
3. **Weaknesses:** Local badges; slate; raw search; `/setup/users` alias.
4. **Duplicates:** Workforce employees; custom-roles; permissions; time-cards report.
5. **Complexity:** Med
6. **Ponytail Findings:** Team should own Time cards + Workforce links as hub.
7. **Reuse Opportunities:** RoleBadge.
8. **UX Recs:** KEEP as hub.
9. **Tech Recs:** DS Input/Badge.
10. **Performance:** OK
11. **A11y:** Clock buttons announce state.
12. **Decision:** KEEP
13. **Priority:** High

### `/team/[id]`

_1222 LOC; not in NAV_

1. **Business Purpose:** Employee detail, permissions, permission requests.
2. **Strengths:** Deep real APIs (team, permissions, permission-requests).
3. **Weaknesses:** **1222 LOC** mega-page; heaviest slate/raw in cluster; overlaps settings/permissions + custom-roles.
4. **Duplicates:** Permissions admin surfaces.
5. **Complexity:** Very High
6. **Ponytail Findings:** Split profile vs access; reuse permission matrix.
7. **Reuse Opportunities:** settings/permissions matrix.
8. **UX Recs:** REFACTOR into tabs/components.
9. **Tech Recs:** Deduplicate permission UI urgently.
10. **Performance:** Split loads.
11. **A11y:** Matrix checkboxes labeled.
12. **Decision:** REFACTOR
13. **Priority:** High

### `/team/custom-roles`

_479 LOC; not in NAV_

1. **Business Purpose:** CRUD custom roles + permission sets.
2. **Strengths:** Real `/custom-roles` APIs; owner gate.
3. **Weaknesses:** Hardcoded permission lists may drift from `lib/features` used by settings/permissions; duplicate Roles admin.
4. **Duplicates:** /settings/permissions custom roles.
5. **Complexity:** Med–High (~479 LOC)
6. **Ponytail Findings:** One Roles screen only — Settings → Permissions wins.
7. **Reuse Opportunities:** FEATURE_GROUPS from lib/features.
8. **UX Recs:** CONSOLIDATE into settings/permissions.
9. **Tech Recs:** Single API + single UI.
10. **Performance:** OK
11. **A11y:** Grouped checkboxes.
12. **Decision:** CONSOLIDATE
13. **Priority:** High

### `/workforce`

_158 LOC; in NAV_

1. **Business Purpose:** Weekly shift schedule + time-off.
2. **Strengths:** Real workforce APIs; ScheduleGrid/ShiftModal extracted; Button; now in Inventory nav (reachable).
3. **Weaknesses:** Odd IA placement under Inventory; overlaps team clock + time-cards report; slate.
4. **Duplicates:** Team, time-cards report.
5. **Complexity:** Med
6. **Ponytail Findings:** Put under Team IA.
7. **Reuse Opportunities:** Employee list from /team.
8. **UX Recs:** CONSOLIDATE Team + Workforce + Time cards.
9. **Tech Recs:** Nav placement fix.
10. **Performance:** OK
11. **A11y:** Grid keyboard support needed.
12. **Decision:** CONSOLIDATE
13. **Priority:** Medium

### `/workflows`

_475 LOC; in NAV_

1. **Business Purpose:** POS workflows, approval chains, run history, templates.
2. **Strengths:** Real workflows APIs; CRUD; Skeleton path; approval-chains built (triggers still sparse — honesty).
3. **Weaknesses:** 475 LOC; local Badge/Skeleton; purple/indigo chips; slate; approval triggers may not gate POS actions yet (NEEDS-SRI historically).
4. **Duplicates:** Permission requests / approvals.
5. **Complexity:** High
6. **Ponytail Findings:** Config OK; tokenize; be honest about unused triggers.
7. **Reuse Opportunities:** Approval chain UI ↔ permission-requests.
8. **UX Recs:** REFACTOR split tabs.
9. **Tech Recs:** DS components; lazy tabs.
10. **Performance:** Lazy tabs.
11. **A11y:** Enable toggles as switches.
12. **Decision:** REFACTOR
13. **Priority:** Medium

# SETTINGS / SETUP

### `/settings`

_124 LOC; in NAV_

1. **Business Purpose:** Canonical setup hub: store, shipping, terms, payment modes, tax, flags, security, COA, deposits, loyalty, receipts, API keys, currencies.
2. **Strengths:** Section router; pathname sync with `/setup/*` aliases; role canManage; sections extracted to `_components`.
3. **Weaknesses:** Raw SectionButton (slate); nav label Settings vs title Setup; dual URL scheme kept alive by sectionPath writing `/setup/...`.
4. **Duplicates:** Entire /setup tree; tax-compliance rates.
5. **Complexity:** High (hub + sections)
6. **Ponytail Findings:** One name, one URL prefix (`/settings`). Stop generating `/setup` paths from the hub.
7. **Reuse Opportunities:** Section components already good.
8. **UX Recs:** CONSOLIDATE aliases; clarify Devices→Receipts mapping.
9. **Tech Recs:** DS nav buttons; sectionPath → /settings/...
10. **Performance:** Section code-split.
11. **A11y:** aria-current already on section buttons — good.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/settings/permissions`

_872 LOC; in NAV_

1. **Business Purpose:** Feature matrix, custom roles, permission request queue — canonical RBAC admin.
2. **Strengths:** Rich real APIs; FEATURE_GROUPS; approve/reject/revoke.
3. **Weaknesses:** 872 LOC large page; overlaps team/custom-roles + team/[id].
4. **Duplicates:** /team/custom-roles.
5. **Complexity:** High
6. **Ponytail Findings:** Make this the only roles & permissions admin.
7. **Reuse Opportunities:** Absorb team/custom-roles.
8. **UX Recs:** KEEP as canonical.
9. **Tech Recs:** Unify `/settings/custom-roles` vs `/custom-roles` APIs.
10. **Performance:** Lazy request queue.
11. **A11y:** Matrix + dialogs.
12. **Decision:** KEEP
13. **Priority:** High

### `/settings/modes`

_398 LOC; in NAV_

1. **Business Purpose:** Capabilities-driven business type + module toggles + impact preview + audit.
2. **Strengths:** Correct architecture (capabilities contract); impact API; audit snippet.
3. **Weaknesses:** Overlaps setup/business-profile + setup/modules + onboarding; slate/`#111`.
4. **Duplicates:** setup business-profile/modules; onboarding.
5. **Complexity:** High (~398 LOC)
6. **Ponytail Findings:** Keep this; redirect/delete duplicate setup pages.
7. **Reuse Opportunities:** Onboarding type picker.
8. **UX Recs:** Canonical Business profile & modules.
9. **Tech Recs:** Redirect setup duplicates here.
10. **Performance:** OK
11. **A11y:** Impact dialog focus trap.
12. **Decision:** KEEP
13. **Priority:** Critical

### `/settings/kiosk`

_287 LOC; in NAV_

1. **Business Purpose:** Kiosk mode toggles (PIN, idle timeout, tender allowlist).
2. **Strengths:** Clear settings UX; switch a11y started.
3. **Weaknesses:** **Save is fake** (`setTimeout` 700ms, no API); hardcoded PIN `1234`; **`KIOSK_URL = https://finder-pos.app/kiosk`** brand violation; slate/`#111`.
4. **Duplicates:** None.
5. **Complexity:** Low–Med
6. **Ponytail Findings:** Must not look persisted if it isn't; brand string is a hard fail.
7. **Reuse Opportunities:** ToggleRow → DS.
8. **UX Recs:** Hide until backend exists, or wire API + fix brand.
9. **Tech Recs:** Persist endpoint or Demo badge; remove finder-pos.app.
10. **Performance:** N/A
11. **A11y:** Switches mostly OK.
12. **Decision:** REWRITE
13. **Priority:** High

### `/settings/b2b`

_329 LOC; in NAV_

1. **Business Purpose:** Wholesale portal config (tiers, terms, approval).
2. **Strengths:** Calls PATCH `/api/v1/settings/b2b`; structured groups.
3. **Weaknesses:** Default groups hardcoded; **`PORTAL_URL = https://finder-pos.app/b2b/portal`** brand violation; slate/`#111`; errors swallowed.
4. **Duplicates:** Payment terms in settings; customer groups.
5. **Complexity:** Med
6. **Ponytail Findings:** Brand violation hard fail; load server state on mount.
7. **Reuse Opportunities:** Terms from Settings TermsSection.
8. **UX Recs:** Fix brand; toast errors.
9. **Tech Recs:** GET before PATCH.
10. **Performance:** OK
11. **A11y:** Switches OK.
12. **Decision:** REFACTOR
13. **Priority:** High

### `/setup`

_2 LOC; re-export → `../settings/page`; not in NAV_

1. **Business Purpose:** Setup checklist / legacy deep link re-exporting `/settings` (section mapped via settings pathname sync where applicable).
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Parallel Setup vs Settings IA.
4. **Duplicates:** Exact surface of `/settings`.
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Replace with permanent redirect (308) to `/settings`, then delete the route folder.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/settings`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/setup/business-profile`

_359 LOC; not in NAV_

1. **Business Purpose:** Pick business type + modules (duplicate of settings/modes).
2. **Strengths:** Real GET/POST business-profile; Badge/Button.
3. **Weaknesses:** Duplicates `/settings/modes` with older hardcoded bundle UI; not in nav.
4. **Duplicates:** settings/modes, onboarding, setup/modules.
5. **Complexity:** Med (~359 LOC)
6. **Ponytail Findings:** Redirect to `/settings/modes`.
7. **Reuse Opportunities:** modes page.
8. **UX Recs:** CONSOLIDATE.
9. **Tech Recs:** 308 redirect; delete page.
10. **Performance:** N/A
11. **A11y:** N/A after redirect.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/setup/modules`

_355 LOC; not in NAV_

1. **Business Purpose:** Module flag toggles (duplicate of settings/modes modules).
2. **Strengths:** Real business-profile writes.
3. **Weaknesses:** Duplicate of modes; not in nav.
4. **Duplicates:** settings/modes.
5. **Complexity:** Med (~355 LOC)
6. **Ponytail Findings:** Redirect to `/settings/modes`.
7. **Reuse Opportunities:** modes.
8. **UX Recs:** CONSOLIDATE.
9. **Tech Recs:** 308 redirect.
10. **Performance:** N/A
11. **A11y:** N/A
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/setup/users`

_2 LOC; re-export → `../../team/page`; not in NAV_

1. **Business Purpose:** Setup checklist / legacy deep link re-exporting `/team` (section mapped via settings pathname sync where applicable).
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Parallel Setup vs Settings IA.
4. **Duplicates:** Exact surface of `/team`.
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Replace with permanent redirect (308) to `/team`, then delete the route folder.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/team`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/setup/taxes`

_2 LOC; re-export → `../../settings/page`; not in NAV_

1. **Business Purpose:** Setup checklist / legacy deep link re-exporting `/settings` (section mapped via settings pathname sync where applicable).
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Parallel Setup vs Settings IA.
4. **Duplicates:** Exact surface of `/settings`.
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Replace with permanent redirect (308) to `/settings`, then delete the route folder.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/settings`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/setup/shipping`

_2 LOC; re-export → `../../settings/page`; not in NAV_

1. **Business Purpose:** Setup checklist / legacy deep link re-exporting `/settings` (section mapped via settings pathname sync where applicable).
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Parallel Setup vs Settings IA.
4. **Duplicates:** Exact surface of `/settings`.
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Replace with permanent redirect (308) to `/settings`, then delete the route folder.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/settings`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/setup/security`

_2 LOC; re-export → `../../settings/page`; not in NAV_

1. **Business Purpose:** Setup checklist / legacy deep link re-exporting `/settings` (section mapped via settings pathname sync where applicable).
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Parallel Setup vs Settings IA.
4. **Duplicates:** Exact surface of `/settings`.
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Replace with permanent redirect (308) to `/settings`, then delete the route folder.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/settings`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/setup/payment-types`

_2 LOC; re-export → `../../settings/page`; not in NAV_

1. **Business Purpose:** Setup checklist / legacy deep link re-exporting `/settings` (section mapped via settings pathname sync where applicable).
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Parallel Setup vs Settings IA.
4. **Duplicates:** Exact surface of `/settings`.
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Replace with permanent redirect (308) to `/settings`, then delete the route folder.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/settings`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/setup/payment-terms`

_2 LOC; re-export → `../../settings/page`; not in NAV_

1. **Business Purpose:** Setup checklist / legacy deep link re-exporting `/settings` (section mapped via settings pathname sync where applicable).
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Parallel Setup vs Settings IA.
4. **Duplicates:** Exact surface of `/settings`.
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Replace with permanent redirect (308) to `/settings`, then delete the route folder.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/settings`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/setup/payment-modes`

_2 LOC; re-export → `../../settings/page`; not in NAV_

1. **Business Purpose:** Setup checklist / legacy deep link re-exporting `/settings` (section mapped via settings pathname sync where applicable).
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Parallel Setup vs Settings IA.
4. **Duplicates:** Exact surface of `/settings`.
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Replace with permanent redirect (308) to `/settings`, then delete the route folder.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/settings`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/setup/inventory-locations`

_2 LOC; re-export → `../../inventory/locations/page`; not in NAV_

1. **Business Purpose:** Setup checklist / legacy deep link re-exporting `/inventory/locations` (section mapped via settings pathname sync where applicable).
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Parallel Setup vs Settings IA.
4. **Duplicates:** Exact surface of `/inventory/locations`.
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Replace with permanent redirect (308) to `/inventory/locations`, then delete the route folder.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/inventory/locations`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/setup/devices`

_2 LOC; re-export → `../../settings/page`; not in NAV_

1. **Business Purpose:** Setup checklist / legacy deep link re-exporting `/settings` (section mapped via settings pathname sync where applicable).
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Parallel Setup vs Settings IA.
4. **Duplicates:** Exact surface of `/settings`.
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Replace with permanent redirect (308) to `/settings`, then delete the route folder.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/settings`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/setup/outlets`

_2 LOC; re-export → `../../operations/page`; not in NAV_

1. **Business Purpose:** Setup checklist / legacy deep link re-exporting `/operations` (section mapped via settings pathname sync where applicable).
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Parallel Setup vs Settings IA.
4. **Duplicates:** Exact surface of `/operations`.
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Replace with permanent redirect (308) to `/operations`, then delete the route folder.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/operations`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/setup/loyalty`

_2 LOC; re-export → `../../settings/page`; not in NAV_

1. **Business Purpose:** Setup checklist / legacy deep link re-exporting `/settings` (section mapped via settings pathname sync where applicable).
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Re-exports `/settings` (loyalty section via path), not `/loyalty` — easy to misread.
4. **Duplicates:** Exact surface of `/settings`.
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Replace with permanent redirect (308) to `/settings`, then delete the route folder.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/settings`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

# VERTICALS

### `/golf`

_337 LOC; not in NAV_

1. **Business Purpose:** Golf tee sheet / course ops preview.
2. **Strengths:** Full UI for tee slots; loading/error patterns.
3. **Weaknesses:** **No `src/modules/golf`** — MSW-only (`mocked` per AGENTS `/api/v1/golf`); orphaned from nav; heavy slate/raw (~18).
4. **Duplicates:** Pro shop vs catalog/POS.
5. **Complexity:** High UI / missing backend
6. **Ponytail Findings:** Hide; do not expand; Preview only under SHOW_PARTIAL.
7. **Reuse Opportunities:** N/A until backend module.
8. **UX Recs:** HIDE/park.
9. **Tech Recs:** Mark partial; stop maintaining as if real.
10. **Performance:** N/A (mock).
11. **A11y:** Raw controls weak.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/golf/bookings`

_350 LOC; not in NAV_

1. **Business Purpose:** Golf bookings management UI.
2. **Strengths:** CRUD UI completeness.
3. **Weaknesses:** MSW-only golf API; nav orphan; slate/raw heavy.
4. **Duplicates:** Appointments (services) conceptual overlap.
5. **Complexity:** Med–High
6. **Ponytail Findings:** Park with /golf.
7. **Reuse Opportunities:** N/A
8. **UX Recs:** HIDE.
9. **Tech Recs:** partial gate.
10. **Performance:** N/A
11. **A11y:** Weak.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/golf/members`

_347 LOC; not in NAV_

1. **Business Purpose:** Golf membership list/detail UI.
2. **Strengths:** Membership CRUD UI.
3. **Weaknesses:** MSW-only; nav orphan.
4. **Duplicates:** Customers/loyalty.
5. **Complexity:** Med–High
6. **Ponytail Findings:** Park with /golf.
7. **Reuse Opportunities:** Customers patterns if ever real.
8. **UX Recs:** HIDE.
9. **Tech Recs:** partial.
10. **Performance:** N/A
11. **A11y:** Weak.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/golf/pro-shop`

_217 LOC; not in NAV_

1. **Business Purpose:** Golf pro shop inventory/sales UI.
2. **Strengths:** Shop listing UI.
3. **Weaknesses:** MSW-only; duplicates catalog/terminal.
4. **Duplicates:** Catalog + POS.
5. **Complexity:** Med
6. **Ponytail Findings:** Should be catalog/POS with golf module flag — not a parallel shop.
7. **Reuse Opportunities:** Catalog/terminal.
8. **UX Recs:** CONSOLIDATE into retail surfaces when golf exists.
9. **Tech Recs:** Delete or redirect to catalog.
10. **Performance:** N/A
11. **A11y:** Weak.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/restaurant/dashboard`

_346 LOC; not in NAV_

1. **Business Purpose:** F&B KPI overlay: covers, ticket, turns, peak hour.
2. **Strengths:** KpiCard + BarChart; useQuery; money helpers; real restaurant module exists.
3. **Weaknesses:** Nav orphan (not in NAV_TREE); slate; overlaps main dashboard.
4. **Duplicates:** Overlaps core catalog/POS/orders concepts for the vertical.
5. **Complexity:** Med
6. **Ponytail Findings:** Module-gated only; don’t duplicate retail dashboard chrome.
7. **Reuse Opportunities:** Shared vertical list/detail template across packs.
8. **UX Recs:** Hide unless module enabled; Preview labeling.
9. **Tech Recs:** DS tokens; EmptyState/Skeleton; feature/module gate.
10. **Performance:** OK if lists bounded.
11. **A11y:** Tables/forms need labels; status not color-only.
12. **Decision:** KEEP
13. **Priority:** Low

### `/restaurant/floor-plan`

_251 LOC; not in NAV_

1. **Business Purpose:** Table status / floor plan for dine-in.
2. **Strengths:** Table status mutations; Button/Card.
3. **Weaknesses:** Nav orphan; raw controls.
4. **Duplicates:** Overlaps core catalog/POS/orders concepts for the vertical.
5. **Complexity:** Med
6. **Ponytail Findings:** Keep as module-gated preview shell; do not expand before retail proof; consider one VerticalResourcePage template.
7. **Reuse Opportunities:** Shared vertical list/detail template across packs.
8. **UX Recs:** Hide unless module enabled; Preview labeling.
9. **Tech Recs:** DS tokens; EmptyState/Skeleton; feature/module gate.
10. **Performance:** OK if lists bounded.
11. **A11y:** Tables/forms need labels; status not color-only.
12. **Decision:** KEEP
13. **Priority:** Low

### `/restaurant/kitchen`

_147 LOC; not in NAV_

1. **Business Purpose:** Kitchen display from open orders.
2. **Strengths:** Reuses orders API (good); lean page (~147 LOC).
3. **Weaknesses:** Nav orphan; KDS UX incomplete vs dedicated kitchen systems.
4. **Duplicates:** Overlaps core catalog/POS/orders concepts for the vertical.
5. **Complexity:** Med
6. **Ponytail Findings:** Good reuse of orders — keep thin.
7. **Reuse Opportunities:** Shared vertical list/detail template across packs.
8. **UX Recs:** Hide unless module enabled; Preview labeling.
9. **Tech Recs:** DS tokens; EmptyState/Skeleton; feature/module gate.
10. **Performance:** OK if lists bounded.
11. **A11y:** Tables/forms need labels; status not color-only.
12. **Decision:** KEEP
13. **Priority:** Low

### `/restaurant/tabs`

_180 LOC; not in NAV_

1. **Business Purpose:** Bar/table tabs management.
2. **Strengths:** Dedicated tabs API.
3. **Weaknesses:** Nav orphan.
4. **Duplicates:** Overlaps core catalog/POS/orders concepts for the vertical.
5. **Complexity:** Med
6. **Ponytail Findings:** Keep as module-gated preview shell; do not expand before retail proof; consider one VerticalResourcePage template.
7. **Reuse Opportunities:** Shared vertical list/detail template across packs.
8. **UX Recs:** Hide unless module enabled; Preview labeling.
9. **Tech Recs:** DS tokens; EmptyState/Skeleton; feature/module gate.
10. **Performance:** OK if lists bounded.
11. **A11y:** Tables/forms need labels; status not color-only.
12. **Decision:** KEEP
13. **Priority:** Low

### `/healthcare`

_250 LOC; not in NAV_

1. **Business Purpose:** Patients list + prescription viewer.
2. **Strengths:** Backend module exists; Modal/Badge/Button.
3. **Weaknesses:** Nav orphan; compliance depth not retail-MVP.
4. **Duplicates:** Overlaps core catalog/POS/orders concepts for the vertical.
5. **Complexity:** Med
6. **Ponytail Findings:** Keep as module-gated preview shell; do not expand before retail proof; consider one VerticalResourcePage template.
7. **Reuse Opportunities:** Shared vertical list/detail template across packs.
8. **UX Recs:** Hide unless module enabled; Preview labeling.
9. **Tech Recs:** DS tokens; EmptyState/Skeleton; feature/module gate.
10. **Performance:** OK if lists bounded.
11. **A11y:** Tables/forms need labels; status not color-only.
12. **Decision:** KEEP
13. **Priority:** Low

### `/automotive`

_333 LOC; not in NAV_

1. **Business Purpose:** Vehicles list + work order sidebar.
2. **Strengths:** Backend module exists.
3. **Weaknesses:** Nav orphan; slate/raw; preview depth.
4. **Duplicates:** Overlaps core catalog/POS/orders concepts for the vertical.
5. **Complexity:** Med
6. **Ponytail Findings:** Keep as module-gated preview shell; do not expand before retail proof; consider one VerticalResourcePage template.
7. **Reuse Opportunities:** Shared vertical list/detail template across packs.
8. **UX Recs:** Hide unless module enabled; Preview labeling.
9. **Tech Recs:** DS tokens; EmptyState/Skeleton; feature/module gate.
10. **Performance:** OK if lists bounded.
11. **A11y:** Tables/forms need labels; status not color-only.
12. **Decision:** KEEP
13. **Priority:** Low

### `/hospitality`

_328 LOC; not in NAV_

1. **Business Purpose:** Rooms/guests hospitality ops.
2. **Strengths:** Backend module exists.
3. **Weaknesses:** Nav orphan.
4. **Duplicates:** Overlaps core catalog/POS/orders concepts for the vertical.
5. **Complexity:** Med
6. **Ponytail Findings:** Keep as module-gated preview shell; do not expand before retail proof; consider one VerticalResourcePage template.
7. **Reuse Opportunities:** Shared vertical list/detail template across packs.
8. **UX Recs:** Hide unless module enabled; Preview labeling.
9. **Tech Recs:** DS tokens; EmptyState/Skeleton; feature/module gate.
10. **Performance:** OK if lists bounded.
11. **A11y:** Tables/forms need labels; status not color-only.
12. **Decision:** KEEP
13. **Priority:** Low

### `/manufacturing`

_298 LOC; not in NAV_

1. **Business Purpose:** Manufacturing orders.
2. **Strengths:** Backend module exists.
3. **Weaknesses:** Nav orphan; raw controls.
4. **Duplicates:** Overlaps core catalog/POS/orders concepts for the vertical.
5. **Complexity:** Med
6. **Ponytail Findings:** Keep as module-gated preview shell; do not expand before retail proof; consider one VerticalResourcePage template.
7. **Reuse Opportunities:** Shared vertical list/detail template across packs.
8. **UX Recs:** Hide unless module enabled; Preview labeling.
9. **Tech Recs:** DS tokens; EmptyState/Skeleton; feature/module gate.
10. **Performance:** OK if lists bounded.
11. **A11y:** Tables/forms need labels; status not color-only.
12. **Decision:** KEEP
13. **Priority:** Low

### `/rental`

_283 LOC; not in NAV_

1. **Business Purpose:** Rental assets / contracts.
2. **Strengths:** Backend module exists.
3. **Weaknesses:** Nav orphan.
4. **Duplicates:** Overlaps core catalog/POS/orders concepts for the vertical.
5. **Complexity:** Med
6. **Ponytail Findings:** Keep as module-gated preview shell; do not expand before retail proof; consider one VerticalResourcePage template.
7. **Reuse Opportunities:** Shared vertical list/detail template across packs.
8. **UX Recs:** Hide unless module enabled; Preview labeling.
9. **Tech Recs:** DS tokens; EmptyState/Skeleton; feature/module gate.
10. **Performance:** OK if lists bounded.
11. **A11y:** Tables/forms need labels; status not color-only.
12. **Decision:** KEEP
13. **Priority:** Low

### `/entertainment`

_285 LOC; not in NAV_

1. **Business Purpose:** Events / venues entertainment pack.
2. **Strengths:** Backend module exists.
3. **Weaknesses:** Nav orphan.
4. **Duplicates:** Overlaps core catalog/POS/orders concepts for the vertical.
5. **Complexity:** Med
6. **Ponytail Findings:** Keep as module-gated preview shell; do not expand before retail proof; consider one VerticalResourcePage template.
7. **Reuse Opportunities:** Shared vertical list/detail template across packs.
8. **UX Recs:** Hide unless module enabled; Preview labeling.
9. **Tech Recs:** DS tokens; EmptyState/Skeleton; feature/module gate.
10. **Performance:** OK if lists bounded.
11. **A11y:** Tables/forms need labels; status not color-only.
12. **Decision:** KEEP
13. **Priority:** Low

### `/education`

_444 LOC; not in NAV_

1. **Business Purpose:** Students / courses education pack.
2. **Strengths:** Backend module exists; larger page (~444).
3. **Weaknesses:** Nav orphan; slate/raw.
4. **Duplicates:** Overlaps core catalog/POS/orders concepts for the vertical.
5. **Complexity:** Med
6. **Ponytail Findings:** Keep as module-gated preview shell; do not expand before retail proof; consider one VerticalResourcePage template.
7. **Reuse Opportunities:** Shared vertical list/detail template across packs.
8. **UX Recs:** Hide unless module enabled; Preview labeling.
9. **Tech Recs:** DS tokens; EmptyState/Skeleton; feature/module gate.
10. **Performance:** OK if lists bounded.
11. **A11y:** Tables/forms need labels; status not color-only.
12. **Decision:** KEEP
13. **Priority:** Low

# OTHER

### `/ecommerce`

_435 LOC; in NAV_

1. **Business Purpose:** Online order ops + storefront publish toggles.
2. **Strengths:** Module-gated in nav; tries ecommerce orders then falls back; Badge/TableSkeleton; settings toggle.
3. **Weaknesses:** Children are re-export fake IA; promotions child → mock catalog promotions; slate (~50).
4. **Duplicates:** customers, catalog promotions, shipping/delivery.
5. **Complexity:** Med–High (~435 LOC)
6. **Ponytail Findings:** One Online Orders page; delete misleading child routes or make real tabs.
7. **Reuse Opportunities:** Orders table from /orders.
8. **UX Recs:** CONSOLIDATE children.
9. **Tech Recs:** Redirects; remove wrappers.
10. **Performance:** OK
11. **A11y:** Status filters as tabs.
12. **Decision:** CONSOLIDATE
13. **Priority:** High

### `/ecommerce/customers`

_2 LOC; re-export → `../../customers/page`; not in NAV_

1. **Business Purpose:** Alias re-exporting customers list under Online IA.
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Creates parallel IA; bookmarks/analytics split; users can land on non-canonical chrome/title paths.
4. **Duplicates:** Exact surface of `/customers`.
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Replace with permanent redirect (308) to `/customers`, then delete the route folder.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/customers`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** High

### `/ecommerce/orders`

_2 LOC; re-export → `../page`; not in NAV_

1. **Business Purpose:** Alias re-exporting parent ecommerce page (fake child route).
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** URL says Orders but renders full ecommerce page.
4. **Duplicates:** Exact surface of `/ecommerce`.
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Replace with permanent redirect (308) to `/ecommerce`, then delete the route folder.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/ecommerce`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** High

### `/ecommerce/delivery`

_2 LOC; re-export → `../page`; not in NAV_

1. **Business Purpose:** Misleading alias — re-exports ecommerce parent, not Delivery module.
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Name lies relative to `/delivery`.
4. **Duplicates:** Exact surface of `/ecommerce`.
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Replace with permanent redirect (308) to `/ecommerce`, then delete the route folder.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/ecommerce`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** High

### `/ecommerce/shipping`

_2 LOC; re-export → `../page`; not in NAV_

1. **Business Purpose:** Misleading alias — re-exports ecommerce parent, not Shipping module.
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Name lies relative to `/shipping`.
4. **Duplicates:** Exact surface of `/ecommerce`.
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Replace with permanent redirect (308) to `/ecommerce`, then delete the route folder.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/ecommerce`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** High

### `/ecommerce/promotions`

_2 LOC; re-export → `../../catalog/promotions/page`; not in NAV_

1. **Business Purpose:** Alias to catalog promotions (partial/mock per AGENTS).
2. **Strengths:** Thin one-line re-export; no duplicated business logic.
3. **Weaknesses:** Surfaces mock promotions under Online without partial nav gate on this path.
4. **Duplicates:** Exact surface of `/catalog/promotions`.
5. **Complexity:** Low (wrapper)
6. **Ponytail Findings:** Replace with permanent redirect (308) to `/catalog/promotions`, then delete the route folder.
7. **Reuse Opportunities:** N/A — delete after redirects.
8. **UX Recs:** Never advertise this URL in nav; deep links should resolve to `/catalog/promotions`.
9. **Tech Recs:** Add `next.config` redirect; remove `export { default } from …` shim.
10. **Performance:** Negligible (extra module hop only).
11. **A11y:** Inherits target page; redirect is preferable so focus/URL stay honest.
12. **Decision:** CONSOLIDATE
13. **Priority:** High

### `/documents`

_64 LOC; in NAV_

1. **Business Purpose:** Document center (specs, agreements, templates).
2. **Strengths:** Tab shell; components structured; nav `partial: true`.
3. **Weaknesses:** **No backend documents module** — MSW `/api/v1/documents*`; production mock gap if shown.
4. **Duplicates:** PO documents under purchasing.
5. **Complexity:** Low (shell)
6. **Ponytail Findings:** Keep hidden unless SHOW_PARTIAL; do not advertise.
7. **Reuse Opportunities:** N/A until real module.
8. **UX Recs:** Stay hidden.
9. **Tech Recs:** Do not ship without backend.
10. **Performance:** N/A
11. **A11y:** Tablist.
12. **Decision:** CONSOLIDATE
13. **Priority:** Critical

### `/imports-exports`

_333 LOC; in NAV_

1. **Business Purpose:** Catalog CSV import/export + batch history.
2. **Strengths:** Real import/export APIs; preview validation; role check; Button/Badge; in Setup nav.
3. **Weaknesses:** History endpoints soft-fail to []; slate empty text.
4. **Duplicates:** Customers dead Import button.
5. **Complexity:** Med (~333 LOC)
6. **Ponytail Findings:** Solid operational tool — keep.
7. **Reuse Opportunities:** ImportWizard for customers/vendors later.
8. **UX Recs:** KEEP; extend entity types carefully.
9. **Tech Recs:** Surface history failures honestly.
10. **Performance:** Preview slice 50 — good.
11. **A11y:** File input labeling.
12. **Decision:** KEEP
13. **Priority:** Medium

### `/integrations`

_316 LOC; in NAV_

1. **Business Purpose:** Sync health, providers, webhooks.
2. **Strengths:** Parallel load; push sync; graceful optional endpoints; TableSkeleton; in Setup nav.
3. **Weaknesses:** Dense multi-panel; raw provider select; slate.
4. **Duplicates:** API keys in settings.
5. **Complexity:** Med–High
6. **Ponytail Findings:** Health first, providers second.
7. **Reuse Opportunities:** Status chips DS.
8. **UX Recs:** KEEP with clearer hierarchy.
9. **Tech Recs:** DS Select.
10. **Performance:** 6-way Promise.all — OK with skeleton.
11. **A11y:** Error role=alert.
12. **Decision:** REFACTOR
13. **Priority:** Medium

---

## Coverage checklist

- Expected routes in cluster roots: **101**
- Pages documented: **101**
- Missing: _none_
- Extra: _none_

## Status labels used (honest)

- `built_verified` / `built_unverified` / `partial` / `mocked` / `planned` / `missing` per AGENTS.md
- Golf + Documents + login/mfa standalone + kiosk save + MSA tab called out as mocked/missing where code-verified
