# Automotive

## Who this is for

Auto repair shops, tire shops, oil change centers, body shops, and dealership service departments.

## Activated modules

| Module | What it does |
|---|---|
| Vehicle History | Customer vehicle records (VIN, make, model, year, mileage) |
| Work Orders | Repair job lifecycle from open to completed |
| Parts Catalog | Parts inventory with vehicle compatibility |
| Inspection | Pre/post-service vehicle inspection checklists |

## Vehicles

Location: `/automotive`

Each customer can have multiple vehicles. A vehicle record holds:
- VIN (17-character, validated)
- License plate
- Make, model, year, color
- Current mileage (updated each visit)

Vehicles are linked to a customer profile. Search by VIN, plate, or customer name.

## Work orders

Work orders track the full repair lifecycle for one vehicle visit.

### Creating a work order

1. **Automotive → New work order**
2. Select or create the vehicle
3. Enter: description of work, labour estimate (in dollars)
4. Add parts (deducted from parts inventory on completion)
5. Status starts at **Open**

### Lifecycle

`Open → In Progress → Completed → Invoiced`

- **Open** — job created, vehicle dropped off
- **In Progress** — technician is actively working (records `started_at`)
- **Completed** — work done, vehicle ready for pickup (records `completed_at`)
- **Invoiced** — payment collected; order created in the POS

### Labour & parts

- **Labour** — enter hours × rate or flat amount; stored in `labour_cents`
- **Parts** — add parts from the catalog; stored in `parts_cents`
- **Total** = labour + parts (calculated automatically)

### Advancing status

Each status advance is a PATCH to the work order. The PATCH endpoint moves to the next status in sequence only — you cannot skip steps.

## Parts inventory

Parts are regular catalog products with a `category = parts` tag. Use inventory receiving (Purchasing → Receive) to stock parts. Parts deduct from inventory when a work order is completed.

## Dashboard widget

The Automotive widget on the dashboard shows:
- Active work orders (status = in_progress)
- Vehicle make/model and total estimate per order
- Link to the full automotive page

## Reporting

| Report | What to track |
|---|---|
| Work orders by status | Pipeline of open/in-progress jobs |
| Labour revenue | Billable hours per period |
| Parts margin | Cost vs. billable for parts |
| Technician productivity | Jobs completed per tech |
