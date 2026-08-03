/**
 * Unit tests for money formatting utilities.
 * These run in Node (no DOM needed).
 */

import { describe, it, expect } from "vitest";
import {
  formatMoney,
  formatCentsPlain,
  parseToCents,
  calcChange,
  applyPercentDiscount,
  multiplyCents,
} from "@/lib/money";

describe("formatMoney", () => {
  it("formats positive cents", () => {
    expect(formatMoney(1099)).toBe("$10.99");
    expect(formatMoney(100)).toBe("$1.00");
    expect(formatMoney(0)).toBe("$0.00");
  });

  it("formats negative cents", () => {
    expect(formatMoney(-50)).toBe("-$0.50");
  });

  it("formats large values", () => {
    expect(formatMoney(1000000)).toBe("$10,000.00");
  });

  it("formats GBP", () => {
    expect(formatMoney(1099, "GBP")).toContain("10.99");
  });
});

describe("formatCentsPlain", () => {
  it("formats without currency symbol", () => {
    expect(formatCentsPlain(1099)).toBe("10.99");
    expect(formatCentsPlain(100)).toBe("1.00");
    expect(formatCentsPlain(5)).toBe("0.05");
  });

  it("handles negative values", () => {
    expect(formatCentsPlain(-1099)).toBe("-10.99");
  });
});

describe("parseToCents", () => {
  it("parses plain decimal strings", () => {
    expect(parseToCents("10.99")).toBe(1099);
    expect(parseToCents("5.00")).toBe(500);
    expect(parseToCents("0.05")).toBe(5);
  });

  it("strips currency symbols", () => {
    expect(parseToCents("$10.99")).toBe(1099);
    expect(parseToCents("£5.00")).toBe(500);
  });

  it("handles missing fractional part", () => {
    expect(parseToCents("10")).toBe(1000);
  });

  it("returns NaN for invalid input", () => {
    expect(parseToCents("abc")).toBeNaN();
    expect(parseToCents("")).toBeNaN();
  });
});

describe("calcChange", () => {
  it("calculates change correctly", () => {
    expect(calcChange(2000, 1599)).toBe(401);
    expect(calcChange(1000, 1000)).toBe(0);
  });

  it("throws when tendered < total", () => {
    expect(() => calcChange(500, 1000)).toThrow(RangeError);
  });
});

describe("applyPercentDiscount", () => {
  it("applies a percentage discount using floor", () => {
    expect(applyPercentDiscount(1000, 10)).toBe(100);
    expect(applyPercentDiscount(1099, 10)).toBe(109); // floor(1099 * 0.1)
  });
});

describe("multiplyCents", () => {
  it("multiplies without float errors", () => {
    expect(multiplyCents(199, 3)).toBe(597);
    expect(multiplyCents(1, 100)).toBe(100);
  });
});
