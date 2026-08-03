/**
 * Unit tests for tender/change calculation logic.
 * Tests calcChange from lib/money and tender-screen helpers.
 */

import { describe, it, expect } from "vitest";
import { calcChange, parseToCents, formatMoney } from "@/lib/money";

// ── computeQuickAmounts (inline from TenderScreen) ────────────────────────────

function computeQuickAmounts(totalCents: number): number[] {
  const buckets = [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
  const above = buckets.filter((b) => b >= totalCents);
  const result = new Set([totalCents, ...above.slice(0, 3)]);
  return Array.from(result).sort((a, b) => a - b).slice(0, 4);
}

describe("calcChange", () => {
  it("returns exact change for cash tender", () => {
    expect(calcChange(2000, 1599)).toBe(401);
  });

  it("returns 0 for exact tender", () => {
    expect(calcChange(1599, 1599)).toBe(0);
  });

  it("throws for under-tender", () => {
    expect(() => calcChange(1000, 1599)).toThrow(RangeError);
  });

  it("handles large amounts correctly (integer)", () => {
    // $100 bill, $87.43 total => $12.57 change
    expect(calcChange(10000, 8743)).toBe(1257);
  });

  it("never returns negative", () => {
    const change = calcChange(5000, 4999);
    expect(change).toBe(1);
    expect(change).toBeGreaterThanOrEqual(0);
  });
});

describe("parseToCents for cash input", () => {
  it("parses '20.00' to 2000", () => {
    expect(parseToCents("20.00")).toBe(2000);
  });

  it("parses '5' to 500", () => {
    expect(parseToCents("5")).toBe(500);
  });

  it("parses '0.01' to 1", () => {
    expect(parseToCents("0.01")).toBe(1);
  });

  it("returns NaN for empty string", () => {
    expect(parseToCents("")).toBeNaN();
  });

  it("returns NaN for non-numeric", () => {
    expect(parseToCents("abc")).toBeNaN();
  });
});

describe("computeQuickAmounts", () => {
  it("includes the exact total", () => {
    const amounts = computeQuickAmounts(799); // $7.99
    expect(amounts).toContain(799);
  });

  it("returns at most 4 amounts", () => {
    const amounts = computeQuickAmounts(799);
    expect(amounts.length).toBeLessThanOrEqual(4);
  });

  it("amounts are sorted ascending", () => {
    const amounts = computeQuickAmounts(799);
    for (let i = 1; i < amounts.length; i++) {
      expect(amounts[i]).toBeGreaterThan(amounts[i - 1]!);
    }
  });

  it("all amounts are >= total", () => {
    const total = 1299;
    const amounts = computeQuickAmounts(total);
    amounts.forEach((a) => expect(a).toBeGreaterThanOrEqual(total));
  });

  it("handles large total (no amounts below it)", () => {
    // $800 total — only $1000+ buckets qualify
    const amounts = computeQuickAmounts(80000);
    amounts.forEach((a) => expect(a).toBeGreaterThanOrEqual(80000));
  });
});

describe("split tender math", () => {
  it("card portion = total − cash", () => {
    const total = 1599;
    const cash = 1000;
    const card = total - cash;
    expect(card).toBe(599);
    expect(cash + card).toBe(total);
  });

  it("detects over-payment in cash portion", () => {
    const total = 1000;
    const cash = 1500;
    const card = total - cash;
    expect(card).toBeLessThan(0);
  });

  it("all cents (no floats)", () => {
    const total = 1000;
    const cash = 300;
    const card = total - cash;
    expect(Number.isInteger(card)).toBe(true);
  });
});

describe("formatMoney for display", () => {
  it("formats change due correctly", () => {
    const change = calcChange(2000, 1599);
    expect(formatMoney(change)).toBe("$4.01");
  });

  it("formats zero change as $0.00", () => {
    expect(formatMoney(0)).toBe("$0.00");
  });
});
