# Manufacturing

## Who this is for

Light manufacturers, fabricators, craft producers, food producers, and assembly operations that need to track raw materials, bill of materials (BOM), and production runs.

## Activated modules

| Module | What it does |
|---|---|
| Production Orders | Track a production run from draft to completion |
| Bill of Materials | Define which raw materials make a finished product |
| Raw Materials | Inventory for input materials |
| Quality Control | Pass/fail inspection before goods are released |

## Production orders

Location: `/manufacturing`

A production order represents a batch run of a finished product.

### Creating a production order

1. **Manufacturing → New production order**
2. Select the finished product (must exist in catalog)
3. Enter quantity to produce
4. Define the BOM (bill of materials) — one row per raw material:
   - Select the raw material (from inventory)
   - Enter the quantity needed per finished unit
5. Status starts at **Draft**

### BOM lines

Each BOM line records:
- Raw material product
- `qty_required` — how much is needed
- `qty_consumed` — how much was actually used (updated during production)

### Production lifecycle

`Draft → In Progress → Completed`

1. **Draft** — planned; no materials consumed yet
2. **In Progress** — production has started; consume BOM lines as materials are used
3. **Completed** — finished goods are added to inventory; raw material consumption is finalized

### Consuming BOM lines

During production, as materials are used:
1. Open the production order → **BOM** tab
2. Click **Consume** on each line
3. Enter the actual quantity consumed
4. This deducts from raw material inventory in real time

### On completion

When the production order moves to **Completed**:
- Finished goods quantity is added to the product's inventory
- All remaining BOM lines are considered fully consumed
- A production cost is recorded (sum of consumed materials at their cost price)

## Raw materials inventory

Raw materials are catalog products tagged as `category = raw_material`. They use the same inventory system as finished goods — receive via Purchasing, adjust via Inventory → Adjustments.

## Dashboard widget

The Manufacturing widget on the dashboard shows:
- Production orders currently **In Progress**
- Product name and quantity for each active run

## Reporting

| Report | What to track |
|---|---|
| Production by product | Units produced per period |
| Material consumption | Which inputs are used fastest |
| Production cost | Cost per unit for each production run |
