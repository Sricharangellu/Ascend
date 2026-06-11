/**
 * Money is represented as an integer number of minor units (cents).
 * Never use floats for currency. All arithmetic stays in integer cents.
 */
export type Cents = number;

export const Money = {
  /** Build cents from a decimal dollar amount, e.g. 19.99 -> 1999 */
  fromDollars(dollars: number): Cents {
    return Math.round(dollars * 100);
  },
  /** Format cents as a dollar string, e.g. 1999 -> "19.99" */
  toDollars(cents: Cents): string {
    const sign = cents < 0 ? "-" : "";
    const abs = Math.abs(cents);
    return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  },
  add(a: Cents, b: Cents): Cents {
    return a + b;
  },
  sub(a: Cents, b: Cents): Cents {
    return a - b;
  },
  mul(amount: Cents, qty: number): Cents {
    return Math.round(amount * qty);
  },
  /** Apply a percentage rate (e.g. 8.25) to a cents amount, rounded to nearest cent. */
  percent(amount: Cents, rate: number): Cents {
    return Math.round((amount * rate) / 100);
  },
};
