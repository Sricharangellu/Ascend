# Audit — Ponytail Wave 0 honesty

| Field | Value |
|---|---|
| Date (UTC) | 2026-08-02T23:29:20Z |
| Parent | `AUDIT_2026-08-02T230500Z-ponytail-enterprise-ui.md` Wave 0 |
| Status | `built_unverified` (gates pending in this note; update after CI) |
| Scope | Frontend honesty only — no backend module changes |

## What changed

1. **Nav — Sales removed.** Legacy `/sales` (MSW-only `/api/v1/sales/history`) removed from Sell nav; page is now a redirect to `/orders`.
2. **Nav — Error Center `partial: true`.** Hidden unless `NEXT_PUBLIC_SHOW_PARTIAL_PAGES=true`.
3. **Nav — Kiosk `partial: true`.** Same gate; page no longer fakes a successful save.
4. **Nav — Purchase → Cost Entry.** Label honesty only (same `/purchase` route).
5. **Pipeline tabs.** Overview / Receiving / Issues gated behind SHOW_PARTIAL; default real tabs = Pending, Reorder Alerts, History; banner points to Receive Stock.
6. **Brand.** `finder-pos.app` removed from kiosk, B2B portal, ecommerce storefront URL display; signup/onboarding mark `F` → `A`.

## Files

- `web/components/EnterpriseShell.tsx`
- `web/app/(protected)/sales/page.tsx`
- `web/app/(protected)/inventory/pipeline/page.tsx`
- `web/app/(protected)/settings/kiosk/page.tsx`
- `web/app/(protected)/settings/b2b/page.tsx`
- `web/app/(protected)/ecommerce/page.tsx`
- `web/app/signup/page.tsx`
- `web/app/(protected)/onboarding/page.tsx`
- `web/tests/navPartialGate.test.ts`

## Remaining (Wave 1+)

- 308 `/reporting/*` → `/reports/*`
- Purchasing hub nest (reorder/EDI/pipeline/cost-entry)
- Finance alias cleanup
- Dissolve Operations / merge Shipping into Delivery
