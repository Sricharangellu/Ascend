# Golf

## Who this is for

Golf courses, driving ranges, mini-golf facilities, and golf academies.

## Activated modules

| Module | What it does |
|---|---|
| Tee Sheet | Book and manage tee times by date and hole |
| Bookings | Member and guest tee time reservations |
| Memberships | Annual / seasonal membership plans |
| Pro Shop | Retail POS for equipment, apparel, and accessories |

## Tee sheet

Location: `/golf` (coming soon — see roadmap)

The tee sheet shows available tee times for each day in a grid format:
- Rows: tee time slots (e.g. 06:00–18:00 in 10-minute increments)
- Columns: starter holes (Hole 1, Hole 10, etc.)
- Status: Available (white), Booked (green), Blocked (gray)

### Booking a tee time

1. Click an available slot
2. Enter: player name(s), number of players, cart preference (walking / 1 cart / 2 carts)
3. Confirm — the slot is blocked for the booked party
4. Collect green fee payment at the time of booking or at check-in

### Check-in

When the party arrives:
1. Find the booking on today's tee sheet
2. Click **Check in** → status moves to **On course**
3. Carts assigned, player confirmation signed

## Memberships

Golf memberships are managed the same way as service memberships:
- Plans: Junior, Individual, Family, Corporate
- Billing: Annual or monthly
- Benefits: Reduced or zero green fees, cart discounts, priority booking window

Assign to customers in Customers → [customer] → Memberships.

## Pro shop

The pro shop uses the standard retail POS module:
- Catalog products: clubs, balls, apparel, accessories, lessons
- Members often get a discount — set this up as a loyalty tier discount or customer-specific pricing

## Reporting

| Report | What to track |
|---|---|
| Tee sheet utilization | % of available slots booked by day |
| Green fee revenue | Revenue by period and membership vs. public |
| Pro shop sales | Retail revenue breakdown |
| Member count | Active memberships by plan type |

> **Note:** The tee sheet UI page is scheduled for Phase 9. The module registry and backend foundations are in place.
