# Hospitality (Hotels & Lodging)

## Who this is for

Hotels, motels, B&Bs, vacation rentals, hostels, and resorts.

## Activated modules

| Module | What it does |
|---|---|
| Room Billing | Room grid, guest check-in/out, folio (charge sheet) |
| Guest Accounts | Multi-room and group folios |
| Housekeeping | Room status tracking (cleaning, maintenance) |
| Events | Conference and meeting room bookings |

## Room grid

Location: `/hospitality`

Rooms are displayed as a color-coded grid:
- **Green** — Available
- **Red** — Occupied
- **Amber** — Checkout (guest departing today)
- **Blue** — Cleaning
- **Gray** — Maintenance / out of order

Tap a room to view its folio or change status.

## Guest check-in

1. Tap an available room → **Check in**
2. Enter guest name, arrival date, departure date
3. Status flips to **Occupied**
4. Post charges to the folio throughout the stay

## Folio (room charges)

Every room has a folio — a running list of charges:
- Room rate (posted nightly, automatically)
- F&B charges (posted from the restaurant module if enabled)
- Spa, parking, minibar, and other incidental charges
- Taxes applied automatically at the configured rate

To post a manual charge:
1. Open the room → **Post charge**
2. Select category, enter amount and description
3. Charge appears on the folio immediately

## Check-out & settlement

1. Open the room → **Check out**
2. Review the folio — add any last charges
3. Click **Settle** — all pending charges are collected in one payment
4. Choose tender (card, cash, direct bill)
5. Room status moves to **Checkout → Cleaning**

## Housekeeping

After a guest checks out:
- Room status is **Checkout** until housekeeping clears it
- Housekeeping staff (or front desk) taps the room → **Mark cleaned**
- Status moves to **Available**
- Mark **Maintenance** for rooms that need repair before next booking

## Direct bill (corporate accounts)

For corporate guests who pay on account:
1. Guest checks in normally
2. At checkout, choose **Direct bill** → links to the company's account in Customers
3. Invoice is generated and sent to the company (net terms)
4. Track in Accounting → Invoices → AR Aging

## Revenue metrics

The hospitality dashboard widget shows:
- Occupancy % (today)
- Rooms available / occupied / cleaning
- Estimated revenue today (sum of occupied room rates)
