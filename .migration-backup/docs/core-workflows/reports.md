# Reports & analytics

## Available reports

| Report | Location | Description |
|---|---|---|
| Sales summary | Reports → Sales | Revenue, transactions, AOV by day/week/month |
| Sales by product | Reports → Sales → By product | Top 20 products by revenue and units sold |
| Sales by category | Reports → Sales → By category | Revenue and margin grouped by category |
| Inventory valuation | Reports → Inventory | On-hand value and potential margin per SKU |
| Low stock | Reports → Inventory → Low stock | Products at or below reorder point |
| Payments breakdown | Reports → Payments | Revenue split by tender type |
| Profit & loss | Reports → Accounting → P&L | Income, COGS, gross margin by period |
| AR aging | Reports → Accounting → AR | Outstanding invoices by age bucket (0–30, 31–60, 61–90, 90+) |
| AP aging | Reports → Accounting → AP | Outstanding bills by age bucket |
| Time cards | Reports → Team → Time cards | Hours worked per employee per period |
| Loyalty summary | Reports → Customers → Loyalty | Points issued, redeemed, and outstanding by tier |
| Compliance (MSA) | Reports → Compliance | Tobacco/cigarette MSA units for reporting |
| Audit log | Settings → Audit log | Every system change with actor, timestamp, and before/after |

## Date range & granularity

Every report has a date picker with presets (Today, 7d, 30d, 90d, Custom). The **granularity** toggle (Day / Week / Month) controls chart grouping. Your last-used granularity is remembered across reports.

Reports URLs encode the active filters as base64 JSON (`?definition=...`) so you can bookmark and share specific views.

## Exporting

Every report has an **Export CSV** button. Large exports are generated server-side and emailed when ready (>10k rows).

## Dashboard widgets

The dashboard at `/dashboard` shows:
- Today's revenue, transactions, and AOV (live)
- Revenue trend (7-day sparkline)
- Hourly sales bar chart
- Vertical-specific widgets (tables, room occupancy, active rentals, etc.)

The Day / Week / Month toggle on the dashboard writes to global context — it carries over when you navigate to the full Reports section.

## Scheduling reports

Scheduled reports are not yet available (on the roadmap). For now, bookmark the URL with your preferred filter and export manually.
