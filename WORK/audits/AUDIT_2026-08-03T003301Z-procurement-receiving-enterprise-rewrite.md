# Ascend — Procurement & Receiving Enterprise Rewrite (Phase 8 Foundation)

**Date:** 2026-08-03T003301Z  
**Trigger:** Sri master prompt — highest-priority enterprise rewrite of Purchasing /
Receiving / Invoice Matching / Scan / Fulfillment, aligned with the procurement
roadmap (MOQ, lead times, receiving, ledger, lots/expiry, reorder intelligence).  
**Branch:** `cursor/procurement-receiving-enterprise-0c43`  
**Prior art (not rewritten):**  
`AUDIT_2026-07-28T184729Z-erp-procurement-demand-planning-gap.md`,  
`AUDIT_2026-07-28T194619Z-phase6-procurement-intelligence-completion.md`.

## Verdict

This prompt **authorizes** the previously NEEDS-SRI receiving-session workflow.
We did **not** big-bang rewrite Purchasing/Inventory/Accounting. We added an
enterprise receiving shell that commits through the existing, verified
`PurchasingService.receive()` path, hardened three-way match + auto-bill
correctness, and shipped a real receiving dashboard + FE wiring.

Status labels use the repo contract (`built_verified` / `partial` / `missing` /
`mocked` / `planned`).

---

## 1. Current architecture (code-verified, pre-change)

| Area | Status | Notes |
|---|---|---|
| PO lifecycle + approval tiers | `built_verified` | ordered → partially_received → received × approval_status |
| Atomic `receive()` + inventory ledger | `built_verified` | events → stock + movements + optional lots |
| Partial receive | `built_verified` | qty capped to remaining |
| Landed cost | `built_verified` | freight allocation before receive |
| Vendor bills 3-way match (`po_bills`) | `partial` | computed + UI; approve was silent override |
| AP auto-bill (`billing.bills`) | `built_verified` (buggy) | drafted full PO total on **first** receive event |
| Lot/expiry | `built_verified` BE | FE ReceiveTab dropped expiry/lot on submit |
| Pipeline Receiving tab | `mocked` | MSW only; NEEDS-SRI named this gap |
| Receiving sessions / dock / QC hold | `missing` | named NEEDS-SRI |
| ASN / blind receive / put-away tasks | `missing` / `mocked` | |
| Receiving dashboard | `missing` | |
| Phase 6 MOQ / safety stock / ETA | `built_verified` | already shipped 2026-07-28 |

---

## 2. Gap analysis vs master prompt

| Prompt capability | Before | After this PR | Remaining |
|---|---|---|---|
| Dock arrival | missing | `POST .../dock` | ASN/shipment entity |
| Begin receiving session | missing | `POST /receiving/sessions` | — |
| Scan product / barcode | partial FE | `POST .../scan` + intelligence | GS1 / case / pallet decode |
| Validate UOM / vendor / cost / lot / expiry | partial | cost band + expiry + lot + over-qty | UOM conversion at scan |
| Quality hold | missing | `hold` / `held_qty` on session lines | Disposition workflow UI |
| Put away | missing | locationId on scan/line | Directed put-away tasks |
| Inventory ledger / accounting | built | unchanged — session close → `receive()` | — |
| Three-way match hard gate | silent approve | override reason required | Tolerance % config table |
| Invoice before/after/partial | partial | unchanged dual bill models | Unify AP + po_bills posting |
| Price intelligence at receive | LinesTab only | scan returns intelligence payload | Full vendor scorecard |
| Receiving dashboard | mocked | real `/receiving/dashboard` + hub page | Warehouse utilization |
| Mobile / offline | missing | planned | Tablet app + sync |
| AI suggestions | — | `ai_suggestions.status=interface_ready` | No ML models (by design) |
| Blind receive / ASN | missing | mode enum reserved | Product decisions |

---

## 3. Current vs future architecture

```text
BEFORE                          AFTER (this PR)                    FUTURE
PO → receive() → done           PO → Session(dock) → Scan →        + ASN / blind
                                Validate → Hold? → Close →         + Put-away tasks
                                receive() → Ledger/Accounting      + Tolerance engine
                                                                   + Mobile offline
```

**Compatibility rule:** `POST /api/v1/purchasing/orders/:id/receive` remains the
inventory/accounting commit boundary. Sessions never bypass it.

---

## 4. What shipped (this PR)

### Backend
- Tables: `receiving_sessions`, `receiving_session_lines`, `receiving_scan_events`
- `ReceivingSessionService` — begin / dock / scan / updateLine / close / cancel
- Scan validations: unknown barcode, over-qty, expired, near-expiry, cost
  yellow/red bands requiring `costOverrideReason`
- Quality hold: held qty does not enter inventory on close
- `ReceivingDashboardService` — executive KPIs + AI interface stub
- Pipeline: real `GET /inventory/pipeline/receiving`, `POST .../update`,
  `GET /pipeline/summary`
- Billing: `billFromPO` only when PO `status = 'received'`
- 3-way match: approve with variance requires `varianceOverrideReason`

### Frontend
- ReceiveTab: expiry + lot now submitted (bugfix)
- Receive Stock: includes `partially_received`; session begin→patch→close path
- BillsSection: prompts for variance override reason
- New Receiving Hub page `/purchasing/receiving` + nav entry

### Tests
- `receiving-sessions.test.ts` — 8/8 pass
- Purchasing + billing regression — 46/46 pass
- api-server `tsc --noEmit` clean for changed modules

---

## 5–12. Deliverable map (prompt checklist)

| # | Deliverable | Location / status |
|---|---|---|
| 1 | Complete audit | this document |
| 2 | Gap analysis | §2 |
| 3 | Current vs future | §3 |
| 4 | UX redesign proposal | Receiving Hub + session desk; full warehouse/mobile modes `planned` |
| 5 | DB improvements | new session tables + indexes + partial unique open-PO |
| 6 | API improvements | session/dashboard/pipeline endpoints; pagination already on PO lists |
| 7 | Component redesign | Receiving Hub; ReceiveTab/Receive Stock hardened |
| 8–11 | Workflows | receiving foundation `built_verified`; invoice hardened `partial`; fulfillment put-away `planned` |
| 12 | Implementation roadmap | §13 |
| 13 | Risk assessment | §14 |
| 14–15 | Compatibility / migration | additive schema; legacy receive preserved |
| 16–17 | Tests | new + regression above |
| 18 | Performance benchmarks | not run at 100k-SKU scale this PR — indexes added for session paths |
| 19 | Docs / ADR | this audit; recommend ADR-007 on merge |
| 20 | Production code | this PR |

---

## 13. Implementation roadmap (phased — no big-bang)

**Phase 8a (this PR) — Receiving session foundation** ✅  
**Phase 8b — Invoice unification**  
Wire `po_bills.post` → AP/`bill.created`; tolerance % config; credit/debit memos in match.  
**Phase 8c — Scan depth**  
GS1/case/pallet; camera path; pack-size qty expansion; UOM validation at scan.  
**Phase 8d — Put-away + QC disposition**  
Directed bin suggestions; hold → accept/reject/return-to-vendor.  
**Phase 8e — Mobile receiving**  
Tablet-optimized dark dock mode; offline queue + sync.  
**Phase 8f — ASN / blind receive**  
Inbound shipment entity; unexpected SKU policy (Sri decision).  
**Later — AI procurement**  
Plug forecasting/anomaly services into `ai_suggestions` interfaces only after
Phase 7 demand foundation is complete.

---

## 14. Risk assessment

| Risk | Mitigation |
|---|---|
| Double-receive if FE falls back after session close | FE only falls back when **begin** fails |
| Dual bill models (billing vs po_bills) | Documented; 8b unifies posting |
| Partial unique index on open sessions | One open session per PO — intentional |
| Cost override UX uses `window.prompt` | Functional gate; replace with Modal in 8b |
| Replit layout vs classic `src/`/`web/` | Changes land in `artifacts/*` matching this branch's develop tree |

---

## 15. Backward compatibility

- Legacy receive endpoint unchanged in contract.
- Additive columns on `po_bills` (override reason/at/by).
- Auto-bill behavior **intentionally tightened** (partial receive no longer
  drafts AP) — correctness fix; full-receive path covered by new test.

---

## 16. Evidence

```text
node --import tsx --test src/modules/purchasing/receiving-sessions.test.ts  → 8/8
node --import tsx --test purchasing.test.ts billing.test.ts               → 46/46
tsc -p tsconfig.json --noEmit                                             → clean (changed modules)
```

**No ML models introduced.** AI surface is interface-only (`interface_ready`).
