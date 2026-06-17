import type { AccountMode } from "./useAccountMode";

interface PricedProduct {
  price_cents: number;
  wholesale_price_cents?: number | null;
  enterprise_price_cents?: number | null;
}

/**
 * Returns the correct price (in cents) for a product based on the current
 * account mode. Falls back to retail price_cents when a mode-specific price
 * is not set for this product.
 */
export function useProductPrice(product: PricedProduct, mode: AccountMode): number {
  if (mode === "ENTERPRISE" && product.enterprise_price_cents) {
    return product.enterprise_price_cents;
  }
  if (mode === "WHOLESALE" && product.wholesale_price_cents) {
    return product.wholesale_price_cents;
  }
  return product.price_cents;
}
