import { Money, type Cents } from "../../shared/money.js";
import type { StateCode } from "../../shared/types.js";

/**
 * Tax Engine (orders module owns it). State sales-tax rates as percentages.
 * CONTRACTS.md: CA 8.25 · NY 8.875 · TX 6.25 · FL 6.00.
 * A line is taxable unless its product is tax_class='exempt' (groceries).
 */
export const STATE_TAX_RATES: Record<StateCode, number> = {
  CA: 8.25,
  NY: 8.875,
  TX: 6.25,
  FL: 6.0,
};

export function rateFor(stateCode: StateCode): number {
  return STATE_TAX_RATES[stateCode];
}

/** A single line's tax-relevant inputs. */
export interface TaxableLine {
  /** (unit * qty) before any order-level discount. */
  lineGross: Cents;
  taxable: boolean;
}

/** Per-line tax result: the discounted line amount and the tax on it. */
export interface LineTax {
  /** line amount after its proportional share of the order discount. */
  lineCents: Cents;
  /** tax charged on this line (0 for exempt lines). */
  taxCents: Cents;
}

export interface OrderTax {
  /** sum of all lines' gross (unit*qty) before discount. */
  subtotalCents: Cents;
  /** discount actually applied (clamped to subtotal). */
  discountCents: Cents;
  /** total tax across all taxable lines. */
  taxCents: Cents;
  /** subtotal - discount + tax. */
  totalCents: Cents;
  /** per-line breakdown, aligned 1:1 with the input lines. */
  lines: LineTax[];
}

/**
 * Discount policy (kept simple, documented per CONTRACTS.md): the order-level
 * `discountCents` is subtracted from the whole subtotal (taxable + nontaxable),
 * clamped to >= 0, and spread across lines proportionally to each line's gross
 * (largest-remainder rounding, each line's share bounded to [0, lineGross]).
 * Tax is then applied to the discounted amount of each taxable line, so
 * line.tax_cents is populated and orders.tax_cents = sum of taxable line tax.
 * The discount thereby reduces the taxable base.
 */
export function computeOrderTax(
  lines: TaxableLine[],
  stateCode: StateCode,
  discountCents: Cents = 0,
): OrderTax {
  const rate = rateFor(stateCode);
  const subtotalCents = lines.reduce((sum, l) => Money.add(sum, l.lineGross), 0);

  // Clamp discount into [0, subtotal].
  const discount = Math.max(0, Math.min(discountCents, subtotalCents));

  // Allocate the discount across lines with the largest-remainder method:
  // floor each line's proportional share, then hand the leftover cents to the
  // lines with the biggest fractional parts. Every line's share is bounded to
  // [0, lineGross], so an order discount can never make a line cost MORE than
  // its own gross (a naive "last line absorbs the remainder" approach could
  // assign a negative discount and inflate that line). The shares still sum
  // exactly to `discount` because total capacity (subtotal) >= discount.
  const lineDiscounts: Cents[] = new Array(lines.length).fill(0);
  if (subtotalCents > 0 && discount > 0) {
    const fractions: Array<{ idx: number; frac: number }> = [];
    let allocated = 0;
    lines.forEach((line, i) => {
      const exact = (discount * line.lineGross) / subtotalCents;
      const base = Math.min(Math.floor(exact), line.lineGross);
      lineDiscounts[i] = base;
      allocated += base;
      fractions.push({ idx: i, frac: exact - Math.floor(exact) });
    });
    // Distribute the remaining cents, largest fractional part first, skipping
    // any line already discounted down to 0 (i.e. at its gross capacity).
    fractions.sort((a, b) => b.frac - a.frac || a.idx - b.idx);
    let remaining = discount - allocated;
    while (remaining > 0) {
      let progressed = false;
      for (const f of fractions) {
        if (remaining === 0) break;
        if (lineDiscounts[f.idx] < lines[f.idx].lineGross) {
          lineDiscounts[f.idx] += 1;
          remaining -= 1;
          progressed = true;
        }
      }
      if (!progressed) break; // unreachable while discount <= subtotal
    }
  }

  const out: LineTax[] = [];
  let taxCents = 0;

  lines.forEach((line, i) => {
    const lineDiscount = lineDiscounts[i];
    const lineCents = Money.sub(line.lineGross, lineDiscount); // in [0, lineGross]
    const lineTax = line.taxable ? Money.percent(lineCents, rate) : 0;
    taxCents = Money.add(taxCents, lineTax);

    out.push({ lineCents, taxCents: lineTax });
  });

  const totalCents = Money.add(Money.sub(subtotalCents, discount), taxCents);

  return {
    subtotalCents,
    discountCents: discount,
    taxCents,
    totalCents,
    lines: out,
  };
}
