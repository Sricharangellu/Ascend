import { describe, it, expect } from "vitest";
import {
  buildReceiveLines,
  computeTotal,
  findScannedLine,
  type POLine,
  type ReceiveEntry,
} from "@/app/(protected)/inventory/receive-stock/_components/receiveStockTypes";

function entry(over: Partial<ReceiveEntry>): ReceiveEntry {
  return { lineId: "l1", cases: "1", unitsPerCase: "1", totalQty: 1, expiryDate: "", locationId: "", ...over };
}

describe("buildReceiveLines", () => {
  it("carries desk-entered expiry (as epoch ms) and location through to the payload", () => {
    const lines = buildReceiveLines([
      entry({ lineId: "l1", totalQty: 12, expiryDate: "2027-06-30", locationId: "loc_a" }),
    ]);
    expect(lines).toEqual([
      { lineId: "l1", qty: 12, expiryDate: new Date("2027-06-30").getTime(), locationId: "loc_a" },
    ]);
  });

  it("omits expiry and location when the operator left them blank (no null noise)", () => {
    const lines = buildReceiveLines([entry({ lineId: "l2", totalQty: 5, expiryDate: "", locationId: "" })]);
    expect(lines).toEqual([{ lineId: "l2", qty: 5 }]);
    expect(lines[0]).not.toHaveProperty("expiryDate");
    expect(lines[0]).not.toHaveProperty("locationId");
  });

  it("drops lines with zero quantity", () => {
    const lines = buildReceiveLines([
      entry({ lineId: "l1", totalQty: 0, locationId: "loc_x" }),
      entry({ lineId: "l2", totalQty: 3 }),
    ]);
    expect(lines.map((l) => l.lineId)).toEqual(["l2"]);
  });

  it("ignores an unparseable expiry date rather than sending NaN", () => {
    const lines = buildReceiveLines([entry({ lineId: "l1", totalQty: 4, expiryDate: "not-a-date" })]);
    expect(lines[0]).not.toHaveProperty("expiryDate");
  });
});

describe("computeTotal", () => {
  it("multiplies cases by units-per-case", () => {
    expect(computeTotal("3", "12")).toBe(36);
  });
  it("returns 0 for non-positive or invalid input", () => {
    expect(computeTotal("0", "12")).toBe(0);
    expect(computeTotal("x", "12")).toBe(0);
  });
});

describe("findScannedLine", () => {
  const lines: POLine[] = [
    {
      id: "line_coffee", product_id: "prod_coffee", product_name: "Colombian Roast",
      product_sku: "COF-1", product_barcode: "0111111111111",
      quantity: 24, unit_cost_cents: 800, received_qty: 0, remaining_qty: 24,
      expiry_date: null, lot_code: null,
    },
    {
      id: "line_mug", product_id: "prod_mug", product_name: "Ceramic Mug",
      product_sku: "MUG-1", product_barcode: "0222222222222",
      quantity: 6, unit_cost_cents: 400, received_qty: 0, remaining_qty: 6,
      expiry_date: null, lot_code: null,
    },
  ];

  it("matches the each-barcode denormalised onto the line", () => {
    expect(findScannedLine(lines, "0222222222222")?.id).toBe("line_mug");
  });

  it("matches the SKU", () => {
    expect(findScannedLine(lines, "COF-1")?.id).toBe("line_coffee");
  });

  it("matches a case barcode via the canonical resolver's product id", () => {
    // The receiving desk's normal scan: a case UPC that lives in
    // product_barcodes and appears on no PO line. Exact matching alone reported
    // "not found on this PO" for a product that is plainly on the PO.
    expect(findScannedLine(lines, "CASE-UPC-9988", "prod_coffee")?.id).toBe("line_coffee");
  });

  it("prefers the line's own barcode over a resolved id when both match", () => {
    expect(findScannedLine(lines, "0111111111111", "prod_mug")?.id).toBe("line_coffee");
  });

  it("returns undefined for a code that resolves to a product not on this PO", () => {
    expect(findScannedLine(lines, "7777777777777", "prod_not_ordered")).toBeUndefined();
  });

  it("returns undefined for blank input or an empty PO", () => {
    expect(findScannedLine(lines, "   ")).toBeUndefined();
    expect(findScannedLine([], "COF-1")).toBeUndefined();
    expect(findScannedLine(undefined, "COF-1")).toBeUndefined();
  });
});
