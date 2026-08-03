# Checkout & payments

## Overview

The register (POS terminal) lives at `/pos`. It handles single-tender and split-tender sales, customer attachment, discounts, and offline queuing.

## Basic sale

1. **Add items** — scan barcode, type SKU, or tap a product tile
2. **Apply discount** (optional) — tap the line item → enter % or $ amount; or apply a promo code
3. **Select customer** (optional) — search by name or phone; links the sale to their loyalty account
4. **Tender**:
   - **Cash** — enter amount tendered; change is calculated automatically
   - **Card** — tap/insert on the Stripe Terminal reader
   - **Store credit** — deducted from the customer's balance
   - **Split tender** — combine any two methods (e.g. $20 cash + remainder on card)
5. **Complete** — receipt prints; inventory decrements; loyalty points award

## Split tender

Tap **Split** in the tender screen:
- Enter the cash amount (or store credit amount)
- The remaining balance defaults to card
- Each tender leg is captured separately; both appear on the receipt

## Applying a discount

**Line-level discount** — tap any cart line → pencil icon → enter % or flat amount

**Order-level discount** — tap **Discount** at the bottom of the cart → enter % or flat amount

**Promo code** — tap **Promo** → enter the code; system validates and applies automatically

Managers and above can apply discounts. Cashiers require a manager override PIN for discounts above the configured threshold.

## Custom item (open amount)

Tap **Custom item** → enter description and price → add to cart. Useful for services or one-off items not in the catalog.

## Parking / hold

Tap **Park sale** to hold the current cart. It saves against the current session. Retrieve it by tapping **Parked** at the top of the register. Useful for "I forgot my wallet" situations.

## Receipts

- **Print** — automatic if a printer is configured; prompted otherwise
- **Email** — enter customer email; sent via Resend
- **No receipt** — tap Skip

Receipt template (header, footer, logo, return policy) is configured in **Settings → Outlets → Receipt Template**.

## Offline checkout

When the network is unavailable:
1. An **Offline** banner appears at the top of the register
2. Card payments are unavailable (show a "cash only" prompt)
3. Cash sales proceed normally and are queued locally
4. When connectivity returns, the queue syncs automatically — you'll see a "Syncing X transactions" notification

## Keyboard shortcuts (desktop)

| Shortcut | Action |
|---|---|
| `/` | Focus search / barcode input |
| `Esc` | Clear current line edit |
| `Enter` | Confirm quantity edit |
| `F2` | Open tender screen |
| `F4` | Park sale |
