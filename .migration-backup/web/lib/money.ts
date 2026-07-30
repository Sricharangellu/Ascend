/**
 * Money formatting helpers.
 *
 * RULE: all monetary values are stored and transported as integer cents.
 * Never perform float arithmetic on cents.  Format only at the display layer.
 */

/** Supported currency codes. Extend as needed. */
export type CurrencyCode = "USD" | "GBP" | "EUR" | "CAD" | "AUD";

const formatters: Partial<Record<CurrencyCode, Intl.NumberFormat>> = {};

function getFormatter(currency: CurrencyCode): Intl.NumberFormat {
  if (!formatters[currency]) {
    formatters[currency] = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return formatters[currency]!;
}

/**
 * Format integer cents to a localised currency string.
 *
 * @example
 *   formatMoney(1099)           // "$10.99"
 *   formatMoney(1099, "GBP")    // "£10.99"
 *   formatMoney(-50)            // "-$0.50"
 */
export function formatMoney(
  cents: number,
  currency: CurrencyCode = "USD"
): string {
  // Integer division — never use floating point division here.
  const dollars = Math.trunc(cents / 100);
  const remainingCents = Math.abs(cents % 100);
  const value = dollars + (cents < 0 ? -remainingCents : remainingCents) / 100;
  return getFormatter(currency).format(value);
}

/**
 * Format cents as a plain decimal string without the currency symbol.
 *
 * @example
 *   formatCentsPlain(1099)  // "10.99"
 */
export function formatCentsPlain(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.trunc(abs / 100);
  const remainder = abs % 100;
  const str = `${dollars}.${String(remainder).padStart(2, "0")}`;
  return negative ? `-${str}` : str;
}

/**
 * Parse a display string (e.g. "10.99" or "$10.99") into integer cents.
 * Returns NaN if the string is not a valid money value.
 *
 * @example
 *   parseToCents("10.99")   // 1099
 *   parseToCents("$5.00")   // 500
 *   parseToCents("abc")     // NaN
 */
export function parseToCents(value: string): number {
  const cleaned = value.replace(/[^0-9.\-]/g, "");
  if (!cleaned || cleaned === "-") return NaN;

  const parsed = parseFloat(cleaned);
  if (isNaN(parsed)) return NaN;

  // Use string manipulation to avoid floating-point rounding
  const parts = cleaned.split(".");
  const wholePart = parseInt(parts[0] ?? "0", 10);
  const fracStr = (parts[1] ?? "").padEnd(2, "0").slice(0, 2);
  const fracPart = parseInt(fracStr, 10);

  const result = Math.abs(wholePart) * 100 + fracPart;
  return (parsed < 0 ? -1 : 1) * result;
}

/**
 * Add two cent values (integer addition — no float risk).
 */
export function addCents(a: number, b: number): number {
  return a + b;
}

/**
 * Multiply cents by a quantity (integer multiplication).
 */
export function multiplyCents(cents: number, quantity: number): number {
  return cents * quantity;
}

/**
 * Apply a percentage discount to cents, rounding down (floor).
 * Use integer arithmetic: (cents * pct) / 100, Math.floor.
 */
export function applyPercentDiscount(cents: number, pct: number): number {
  return Math.floor((cents * pct) / 100);
}

/**
 * Calculate change due.
 * @param tendered  Amount the customer handed over (cents)
 * @param total     Order total (cents)
 * @returns change in cents (≥ 0); throws if tendered < total
 */
export function calcChange(tendered: number, total: number): number {
  if (tendered < total) {
    throw new RangeError(
      `Tendered amount (${tendered}¢) is less than total (${total}¢)`
    );
  }
  return tendered - total;
}
