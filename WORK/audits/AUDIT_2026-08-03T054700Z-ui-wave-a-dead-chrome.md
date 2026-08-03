# Audit — Wave A dead-chrome leftovers (#133 port)

UTC: 2026-08-03T054700Z  
Agent: Cursor Cloud `bc-c564feef`  
Branch: `cursor/ui-wave-a-dead-chrome-604f`  
Parent: `AUDIT_2026-07-30T222326Z-product-experience-review.md` Wave A (Critical)

## Context

PR #133 (critical product-experience fixes) never merged to `develop`. Several of its
contracts were re-fixed later (AR aging via #141; Finance hub via Ponytail). These
dead-chrome / Quick Sell href leftovers were still live on `develop` tip `0a437bd`.

## What shipped

1. **Catalog Quick Sell** — `/register?product=` → `/terminal?product=` (handler on #163)
2. **Shell** — remove Help → `/help` 404 link; remove Register Switch noop
3. **Customers** — remove Import CTA (no API); remove fake row checkboxes; edit pencil → `/customers/:id`

## Companion PRs (other leftovers)

| Leftover | PR |
|---|---|
| Terminal `?product=` deep-link handler | #163 |
| Dashboard outlet filter → report scope | #166 |

## Status

| Slice | Label |
|---|---|
| Quick Sell href | `built_verified` (code) — end-to-end needs #163 |
| Dead chrome removals | `built_verified` |
| Customer edit link | `built_verified` |

## Honest notes

- Does not re-port AR aging / inventory valuation contracts (already correct on develop)
- Does not rework Finance hub (Ponytail Wave 2)
- Close superseded #133 after this + #163 + #166 land
