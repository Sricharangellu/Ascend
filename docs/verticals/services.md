# Services & Repairs (Appointments)

## Who this is for

Hair salons, barbershops, spas, nail studios, tattoo studios, auto repair shops, electronics repair shops, and any business that books time-based appointments or service jobs.

## Activated modules

| Module | What it does |
|---|---|
| Appointments | Day-view calendar; book, confirm, complete appointments |
| Service Orders | Repair tickets with status lifecycle and cost tracking |
| Memberships | Recurring membership plans (monthly/annual) |
| Commission | Sales rep commission tracking per service |

## Appointments

Location: `/appointments`

### Day view

The calendar shows 07:00–20:00 in hourly slots. Each appointment card shows:
- Service name
- Customer name
- Duration
- Status color (blue = scheduled, indigo = confirmed, amber = in progress, green = completed, red = cancelled)

### Booking an appointment

1. Click any empty time slot (or **New appointment**)
2. Enter: customer, service type, employee, start time, end time, notes
3. Status defaults to **Scheduled**
4. Confirm with the customer → change to **Confirmed**

### Appointment lifecycle

`Scheduled → Confirmed → In Progress → Completed`

or `→ Cancelled` or `→ No Show`

Completing an appointment can auto-create an order for the service (if the service has a linked product in the catalog).

### Staff view

Filter the calendar by employee to see each staff member's day. Useful for reception: assign the right person when booking.

## Service orders (repairs)

Location: `/service-orders`

Use service orders for repair jobs where the item is left with you (phone screen replacement, car repair, appliance fix).

### Creating a service order

1. **Service Orders → New**
2. Enter: customer (optional), title (e.g. "iPhone 14 screen replacement"), description, assigned technician, estimate
3. Status starts at **Open**

### Lifecycle

`Open → In Progress → Awaiting Parts → Completed → Picked Up`

Add notes and update the actual cost as work progresses.

### Linking to checkout

When the repair is complete:
1. Change status to **Completed**
2. Click **Checkout** → creates a POS order for the actual cost
3. Customer pays; service order closes

## Memberships

Location: **Settings → Memberships**

- Create membership plans: name, price, billing interval (monthly/annual), included services
- Assign to customers in Customers → [customer] → Memberships
- At checkout, membership benefits (free services, discounts) apply automatically

## Commission

Commission is tracked per-sale per-employee:
- Set commission % per sales rep in Sales → Reps
- Reports → Team → Sales by rep shows earned commission per period
