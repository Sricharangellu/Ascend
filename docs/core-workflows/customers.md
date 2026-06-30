# Customers & loyalty

## Customer profiles

Customer records live at **Customers**. Each profile holds:
- Name, email, phone
- Billing and shipping addresses
- Purchase history
- Loyalty points balance
- Store credit balance
- Custom price overrides (B2B)
- Outstanding invoices

## Creating a customer

**Customers → New customer** or at the POS by tapping **Add customer** before completing a sale. Minimum required: name or email.

## Attaching a customer at checkout

In the register, tap **Customer** (top of the cart panel) → search by name, phone, or email → select. The customer is linked to the order and:
- Loyalty points are awarded on completion
- Their store credit balance is available as a tender method
- Custom pricing (if set) is applied automatically

## Loyalty program

### Tiers

Loyalty tiers are configured in **Settings → Loyalty**. Each tier has:
- A name (Bronze, Silver, Gold, Platinum)
- A points threshold (e.g. 0 / 500 / 2000 / 5000 lifetime points)
- A points-per-dollar earn rate (e.g. 1× / 1.5× / 2× / 3×)
- Optional rewards (free item, birthday discount)

Customers auto-upgrade when they cross a tier threshold.

### Earning points

Points are awarded when an order completes. The earn rate depends on the customer's current tier. Refunds reverse points.

### Redeeming points

At checkout, if a customer has redeemable points:
1. Tap **Redeem points** in the tender screen
2. Enter the number of points to redeem (or "Use all")
3. Points convert to a dollar discount at the configured redemption rate (default: 100 points = $1)

### Manual adjustment

**Customers → [customer] → Loyalty → Adjust points** — enter a positive or negative amount and a reason. Manager role required.

## Store credit

Store credit is issued:
- During a refund (choose "Store credit" as the refund method)
- Manually via **Customers → [customer] → Store Credit → Issue credit**

Store credit has no expiry by default. It is applied as a tender method at checkout.

## Custom pricing (B2B)

For wholesale or key-account customers, set product-level price overrides:

1. **Customers → [customer] → Product Prices**
2. Click **Add price override**
3. Select product and enter the customer-specific price

At checkout, when this customer is selected, their custom price automatically replaces the standard price on matching products.

## Invoicing

For B2B customers on net terms:

1. Complete a sale and choose **Issue invoice** instead of tendering immediately
2. The invoice appears in **Accounting → Invoices** with status `open`
3. Send the PDF to the customer via the **Send** button
4. When payment is received, record it via **Pay** on the invoice

See [B2B guide](../verticals/b2b.md) for the full invoicing flow.
