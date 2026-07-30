# B2B / Wholesale

## Who this is for

Distributors, wholesalers, manufacturers selling to trade accounts, and any business with corporate customers on net payment terms.

## Activated modules

| Module | What it does |
|---|---|
| Sales Orders | Quote → approve → fulfill → invoice workflow |
| Purchasing | Supplier management, purchase orders, receiving |
| AP / AR | Bills payable, invoices receivable, aging reports |
| Quotes | Generate and send professional quotations |
| Customer-specific Pricing | Per-customer or tier-based price overrides |

## Sales order workflow

`Quote → Sales Order → Pick → Ship → Invoice → Paid`

### Create a quotation

1. **Sales → Quotations → New**
2. Select customer, add line items with quantities and unit prices
3. Set validity date
4. Click **Send** to email the PDF to the customer

### Convert to order

When the customer accepts:
1. Open the quotation → **Convert to Sales Order**
2. Assign a picker (warehouse staff responsible for fulfillment)
3. Status: `draft → approved → picking → shipped → invoiced`

### Invoicing

When the order ships:
1. Open the sales order → **Invoice**
2. Invoice is created with status `open` and sent to the customer
3. Net terms apply (e.g. Net 30)
4. Payment is recorded when received

## Customer-specific pricing

See [Customers guide](../core-workflows/customers.md#custom-pricing-b2b) for setup.

At order entry, custom prices apply automatically when the customer is selected.

## Tier pricing

Set volume-based price breaks per product:

**Catalog → [product] → Pricing → Tier prices**:
- Minimum quantity threshold
- Price for that quantity tier

At order entry, the correct tier price applies based on line quantity.

## Purchase orders

**Purchasing → Orders → New PO**:
1. Select supplier
2. Add lines (product, quantity, unit cost)
3. Send to supplier (PDF export)
4. When goods arrive, **Receive** the PO → inventory updates

Received POs create an AP bill automatically.

## AR aging

**Reports → Accounting → AR Aging**:
- Buckets: Current, 1–30 days, 31–60 days, 61–90 days, 90+ days
- Dunning: run AR dunning from this screen to auto-send reminder emails

## AP aging

**Reports → Accounting → AP Aging**:
- Same bucket structure for outstanding bills
- Pay a bill from the bill detail screen: **Pay bill** → enter amount and method

## Early payment discounts

Bills can have an early payment discount:
- Set `discount_pct` and `discount_date` when creating the bill
- If paid before `discount_date`, the discount is applied automatically

## Credit limits & holds

Credit limits are not yet enforced automatically. Track outstanding AR manually via the AR aging report and place accounts on hold manually by flagging the customer record.
