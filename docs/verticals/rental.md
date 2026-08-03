# Rental

## Who this is for

Equipment rental companies, tool rental shops, party supply rentals, vehicle rental, AV/production gear rental, and furniture rental.

## Activated modules

| Module | What it does |
|---|---|
| Rental Contracts | Create and manage rental agreements |
| Deposits | Collect and release security deposits |
| Asset Tracking | Track each physical unit (serial number, condition) |
| Damage Assessment | Record damage on return; bill the customer |

## Assets

Location: `/rental` → **Assets** tab

An asset is a specific physical unit available for rent. Each asset record holds:
- Asset name / description
- Category
- Daily rate (in dollars)
- Status: **Available**, **Rented**, **Maintenance**, **Retired**
- Serial number or identifier

Assets are different from catalog products — an asset is a numbered unit, not a quantity.

### Adding an asset

1. **Rental → New asset**
2. Enter name, category, daily rate, serial number
3. Status defaults to **Available**

## Rental contracts

### Creating a contract

1. **Rental → New contract**
2. Select the asset — if status is not **Available**, a conflict error is shown (409)
3. Enter: customer, start date, end date
4. Estimated total is calculated automatically: `⌈(end − start) / 1 day⌉ × daily rate`
5. Collect a deposit (optional but recommended)
6. Confirm — asset status flips to **Rented** automatically

### Active contracts

The **Active Contracts** tab shows all currently rented assets:
- Asset name, customer, end date
- Estimated total
- Overdue contracts are highlighted in red (end date has passed)

### Returning an asset

1. Open the contract → **Return**
2. Record the condition (good / damaged)
3. If damaged, enter a damage charge (billed to the customer's account or card on file)
4. Asset status flips back to **Available**
5. Release the deposit (minus any damage charges)

### Overdue rentals

The Rental dashboard widget flags contracts whose `ends_at` timestamp is in the past. Contact the customer and extend or return the contract.

## Deposits

Deposits are tracked separately from the rental total:
- Collected at contract creation
- Released in full on clean return
- Forfeited (partially or fully) if damage is recorded

## Daily rate calculation

Total = `max(1, ceil((endsAt − startsAt) / 86_400_000)) × daily_rate_cents`

Minimum 1 day regardless of same-day rental.
