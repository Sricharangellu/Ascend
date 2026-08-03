---
name: Phase 12 CSS variable token sweep
description: What is done, what was intentionally left hardcoded, and where to look if tokens show up again.
---

## Status: Complete (all phases 12a–12k committed to `develop`)

## What was swept
Every `.tsx` file under `artifacts/ascend/src/` had hardcoded `bg-white`, `bg-slate-*`, `border-slate-*`, `text-slate-*`, `divide-slate-*`, and `animate-pulse bg-*` replaced with CSS variables.

## CSS variable map used
- bg-white / bg-slate-50 → `var(--color-surface)` / `var(--color-surface-subtle)`
- border-slate-* → `var(--color-border)`
- text-slate-900/950 → `var(--color-text-primary)`
- text-slate-600/700 → `var(--color-text-secondary)`
- text-slate-400/500 → `var(--color-text-muted)`
- divide-slate-* → `var(--color-table-border)`
- hover:bg-slate-50/100 → `hover:bg-[var(--color-surface-subtle)]`
- animate-pulse bg-slate-* → `animate-skeleton` (single class)
- bg-slate-50 table headers → `var(--color-table-header)`

## Intentionally hardcoded (do NOT convert these)
- `LabelsTab.tsx` — barcode/print preview, must stay black
- `EcommerceTab.tsx` — toggle switch hardcoded
- `VariantSetupWizard.tsx` — hardcoded
- `ReorderSuggestionsTab.tsx`, `SupplierPriceComparisonTab.tsx`, `SortTh.tsx` — intentional
- `CustomerDetailPanel.tsx` `bg-white/5` panels — dark overlay intentional
- `bg-white shadow` on toggle switch thumbs in settings/b2b, kiosk, modes, permissions, ReceiptsSection, SettingsSections, setup/*, workflows/*, operations/*, ecommerce/*, notifications/* — toggle knob must always be white
- `bg-white/10`, `bg-white/20` in dark panels (QuoteDarkPanel, SaleDetailPanel, restaurant/kitchen, restaurant/tabs, display, onboarding) — intentional dark-panel opacity
- `NotificationBell.tsx` `hover:bg-slate-800` — intentional dark sidebar hover
- `pages/page.tsx` dark marketing landing page (`bg-slate-950`) — intentional brand design
- `QueueTab.tsx` `bg-slate-900` code terminal + `text-slate-500/400` line numbers — intentional terminal dark

**Why:** These all serve specific visual roles that must not adapt to the CSS var system.

## How to apply going forward
Any new page/component should use CSS variables from the start. Run:
`grep -r "bg-white\|bg-slate-\|border-slate-\|text-slate-" src/ --include="*.tsx"` periodically to catch regressions — compare against the intentional list above before flagging.
