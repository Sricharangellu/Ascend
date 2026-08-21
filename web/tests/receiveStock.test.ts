import { describe, it, expect } from "vitest";
import {
  applyScanToEntries,
  buildReceiveLines,
  computeTotal,
  findScannedLine,
  type POLine,
  type ReceiveEntry,
  type ResolvedScan,
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

// ── applyScanToEntries ──────────────────────────────────────────────────────
// The receiving desk's scan path. These guard the two rules that decide whether
// a delivery is counted correctly: pack size comes from the scanned barcode,
// and a scan counts rather than merely highlighting.

function poLine(over: Partial<POLine> = {}): POLine {
  return {
    id: "l1",
    product_id: "p1",
    product_name: "Cola 330ml",
    product_sku: "COLA-330",
    quantity: 24,
    unit_cost_cents: 100,
    received_qty: 0,
    remaining_qty: 24,
    expiry_date: null,
    lot_code: null,
    ...over,
  };
}

function scan(over: Partial<ResolvedScan> = {}): ResolvedScan {
  return { id: "p1", sku: "COLA-330", name: "Cola 330ml", ...over };
}

const CASE_12 = { unit: "case", displayName: "Case", packSize: 12 };

describe("applyScanToEntries", () => {
  it("counts a case scan as pack_size base units, not one", () => {
    const lines = [poLine()];
    const before = [entry({ lineId: "l1", totalQty: 24 })];
    const { entries, outcome } = applyScanToEntries(scan({ packaging: CASE_12 }), lines, before);

    expect(outcome.kind).toBe("applied");
    expect(entries[0]!.totalQty).toBe(12);
    expect(entries[0]!.unitsPerCase).toBe("12");
    expect(entries[0]!.cases).toBe("1");
  });

  it("takes the line over on the first scan instead of adding to the pre-fill", () => {
    // Lines arrive pre-filled with the whole outstanding quantity. If the first
    // scan added to it, one scanned case of a 24-unit line would read as 36.
    const lines = [poLine()];
    const before = [entry({ lineId: "l1", totalQty: 24, cases: "2", unitsPerCase: "12" })];
    const { entries } = applyScanToEntries(scan({ packaging: CASE_12 }), lines, before);
    expect(entries[0]!.totalQty).toBe(12);
    expect(entries[0]!.scannedUnits).toBe(1);
  });

  it("accumulates across repeated scans of the same case", () => {
    const lines = [poLine()];
    let state = [entry({ lineId: "l1", totalQty: 24 })];
    state = applyScanToEntries(scan({ packaging: CASE_12 }), lines, state).entries;
    state = applyScanToEntries(scan({ packaging: CASE_12 }), lines, state).entries;
    expect(state[0]!.totalQty).toBe(24);
    expect(state[0]!.cases).toBe("2");
  });

  it("counts an each scan as one unit", () => {
    const lines = [poLine({ remaining_qty: 5 })];
    const before = [entry({ lineId: "l1", totalQty: 5 })];
    const { entries } = applyScanToEntries(scan(), lines, before);
    expect(entries[0]!.totalQty).toBe(1);
    expect(entries[0]!.unitsPerCase).toBe("1");
  });

  it("caps at the remaining quantity rather than over-receiving", () => {
    // Half a case outstanding: scanning a full case must not book 12 against a
    // line expecting 6, which the backend would reject at close anyway.
    const lines = [poLine({ remaining_qty: 6 })];
    const before = [entry({ lineId: "l1", totalQty: 6 })];
    const { entries, outcome } = applyScanToEntries(scan({ packaging: CASE_12 }), lines, before);
    expect(entries[0]!.totalQty).toBe(6);
    expect(outcome.kind === "applied" && outcome.capped).toBe(true);
  });

  it("refuses further scans once the line is fully counted", () => {
    const lines = [poLine({ remaining_qty: 12 })];
    let state = [entry({ lineId: "l1", totalQty: 12 })];
    state = applyScanToEntries(scan({ packaging: CASE_12 }), lines, state).entries;
    const second = applyScanToEntries(scan({ packaging: CASE_12 }), lines, state);
    expect(second.outcome.kind).toBe("line_complete");
    expect(second.entries[0]!.totalQty).toBe(12);
  });

  it("matches lines on product id, never on the barcode string", () => {
    // The regression this replaces: a case UPC resolved to the right product
    // but did not equal the ONE barcode denormalised onto the PO line, so the
    // desk reported it as not on the PO.
    const lines = [poLine({ product_id: "p1", product_barcode: "EACH-UPC" })];
    const before = [entry({ lineId: "l1", totalQty: 24 })];
    const { outcome } = applyScanToEntries(
      scan({ id: "p1", packaging: CASE_12 }),
      lines,
      before,
    );
    expect(outcome.kind).toBe("applied");
  });

  it("reports a product that is genuinely not on the PO", () => {
    const lines = [poLine({ product_id: "p1" })];
    const before = [entry({ lineId: "l1", totalQty: 24 })];
    const { entries, outcome } = applyScanToEntries(
      scan({ id: "p-other", name: "Lemonade", sku: "LEM-1" }),
      lines,
      before,
    );
    expect(outcome).toMatchObject({ kind: "not_on_po", productName: "Lemonade", sku: "LEM-1" });
    expect(entries[0]!.totalQty).toBe(24); // untouched
  });

  it("highlights only the scanned line", () => {
    const lines = [poLine({ id: "l1", product_id: "p1" }), poLine({ id: "l2", product_id: "p2" })];
    const before = [
      entry({ lineId: "l1", totalQty: 24, highlighted: true }),
      entry({ lineId: "l2", totalQty: 24 }),
    ];
    const { entries } = applyScanToEntries(scan({ id: "p2" }), lines, before);
    expect(entries.find((e) => e.lineId === "l1")!.highlighted).toBe(false);
    expect(entries.find((e) => e.lineId === "l2")!.highlighted).toBe(true);
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
