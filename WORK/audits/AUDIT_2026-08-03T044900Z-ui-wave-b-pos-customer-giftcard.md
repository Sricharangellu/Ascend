# Audit — Wave B POS customer attach + gift-card tender

UTC: 2026-08-03T044900Z  
Agent: Cursor Cloud `bc-c564feef` (Ascend UI ponytail audit)  
Branch: `cursor/ui-wave-b-pos-customer-giftcard-604f`  
Parent: `AUDIT_2026-07-30T222326Z-product-experience-review.md` Wave B item 6

## What shipped

1. **Customer attach (FE)** — Terminal search modal (`CustomerAttachModal`) via `GET /api/v1/customers/search`; selected `customerId` synced on order create/update; status strip + action bar entry; clears on new sale. Unlocks existing store-credit tender tab.
2. **Gift-card tender (BE+FE)** — `PaymentMethod` + capture schema include `gift_card` + `giftCardCode`. Capture redeems the card **inside the payment transaction** (full order amount v1), then publishes `gift_card.redeemed` after commit. TenderScreen adds Gift card tab (lookup + pay).
3. **Trust cleanup** — Fake Return mode toggle removed from action bar / status strip; ShortcutsOverlay no longer advertises unimplemented F1–F4 / Ctrl+P / Ctrl+Z.

## Status labels

| Slice | Label | Evidence |
|---|---|---|
| Customer attach | `built_unverified` | FE typecheck/lint pending; uses existing customers search API |
| Gift-card payment method | `built_verified` (backend) | New payments tests for capture / insufficient / missing code |
| Gift-card tender UI | `built_unverified` | Wired to real capture; no Playwright yet |
| Return stub removal | `built_verified` | Code removal only |

## Honest limits

- Gift card is **full tender only** (same as store credit). Partial GC + cash/card needs split redesign.
- Accounting still posts `payment.captured` as Dr Cash / Cr Revenue — gift-card liability posting is a follow-on (existing `gift_card_liability` map entry unused here).
- Does not implement Hold / drawer kick / reprint / in-cart line returns.
- Overlaps intentionally with open #140 (stub cleanup); this PR supersedes the Return/shortcuts slice of #140. Coordinate #139/#140 close or rebase after merge.
- PR #160 (Ponytail Waves 0–3) does not touch terminal tender files; shared risk is only if both edit `EnterpriseShell` (this PR does not).

## Gates

See PR checklist — backend payments focused tests + web typecheck/lint/build.
