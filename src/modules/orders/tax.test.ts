import { test } from "node:test";
import assert from "node:assert/strict";
import { computeOrderTax, rateFor, STATE_TAX_RATES } from "./tax.js";

test("rate table matches CONTRACTS.md for all four states", () => {
  assert.equal(STATE_TAX_RATES.CA, 8.25);
  assert.equal(STATE_TAX_RATES.NY, 8.875);
  assert.equal(STATE_TAX_RATES.TX, 6.25);
  assert.equal(STATE_TAX_RATES.FL, 6.0);
  assert.equal(rateFor("CA"), 8.25);
});

// A single $30.00 taxable line in each state.
test("CA 8.25% on $30.00 taxable -> 248 cents", () => {
  const r = computeOrderTax([{ lineGross: 3000, taxable: true }], "CA");
  assert.equal(r.subtotalCents, 3000);
  assert.equal(r.taxCents, 248); // round(3000 * 8.25 / 100) = round(247.5) = 248
  assert.equal(r.totalCents, 3248);
  assert.equal(r.lines[0].taxCents, 248);
});

test("NY 8.875% on $30.00 taxable -> 266 cents", () => {
  const r = computeOrderTax([{ lineGross: 3000, taxable: true }], "NY");
  assert.equal(r.taxCents, 266); // round(3000 * 8.875 / 100) = round(266.25) = 266
  assert.equal(r.totalCents, 3266);
});

test("TX 6.25% on $30.00 taxable -> 188 cents", () => {
  const r = computeOrderTax([{ lineGross: 3000, taxable: true }], "TX");
  assert.equal(r.taxCents, 188); // round(3000 * 6.25 / 100) = round(187.5) = 188
  assert.equal(r.totalCents, 3188);
});

test("FL 6.00% on $30.00 taxable -> 180 cents", () => {
  const r = computeOrderTax([{ lineGross: 3000, taxable: true }], "FL");
  assert.equal(r.taxCents, 180); // 3000 * 6 / 100 = 180
  assert.equal(r.totalCents, 3180);
});

test("exempt line is never taxed", () => {
  const r = computeOrderTax([{ lineGross: 3000, taxable: false }], "CA");
  assert.equal(r.taxCents, 0);
  assert.equal(r.totalCents, 3000);
  assert.equal(r.lines[0].taxCents, 0);
});

test("mixed taxable + exempt: tax only on taxable line", () => {
  const r = computeOrderTax(
    [
      { lineGross: 3000, taxable: true }, // CA 8.25% -> 248
      { lineGross: 1000, taxable: false }, // exempt -> 0
    ],
    "CA",
  );
  assert.equal(r.subtotalCents, 4000);
  assert.equal(r.taxCents, 248);
  assert.equal(r.lines[0].taxCents, 248);
  assert.equal(r.lines[1].taxCents, 0);
  assert.equal(r.totalCents, 4248);
});

test("discount reduces the taxable base", () => {
  // $30 taxable, $5 discount -> tax on $25.00.
  const r = computeOrderTax([{ lineGross: 3000, taxable: true }], "CA", 500);
  assert.equal(r.discountCents, 500);
  assert.equal(r.lines[0].lineCents, 2500);
  assert.equal(r.taxCents, 206); // round(2500 * 8.25 / 100) = round(206.25) = 206
  assert.equal(r.totalCents, 2706); // 3000 - 500 + 206
});

test("multi-line discount never inflates a line above its gross (largest-remainder)", () => {
  // Regression: the old "last line absorbs the remainder" logic could assign a
  // NEGATIVE discount to the final line, making its line_cents exceed its gross.
  // discount=600 over grosses [3800,4100,1300,4900,500] used to leave the last
  // ($5.00) line with a -1c discount -> line_cents 501 > gross 500. Every line
  // must now stay within [0, gross] while the discount still reconciles exactly.
  const grosses = [3800, 4100, 1300, 4900, 500];
  const r = computeOrderTax(
    grosses.map((g) => ({ lineGross: g, taxable: true })),
    "CA",
    600,
  );

  let discountSum = 0;
  r.lines.forEach((line, i) => {
    assert.ok(line.lineCents >= 0, `line ${i} line_cents negative`);
    assert.ok(
      line.lineCents <= grosses[i],
      `line ${i} line_cents ${line.lineCents} exceeds gross ${grosses[i]}`,
    );
    discountSum += grosses[i] - line.lineCents;
  });

  // Allocated discount reconciles exactly, and lines sum to subtotal - discount.
  assert.equal(discountSum, r.discountCents);
  const lineSum = r.lines.reduce((a, l) => a + l.lineCents, 0);
  assert.equal(lineSum, r.subtotalCents - r.discountCents);
  // orders.tax_cents is exactly the sum of the per-line tax on the bounded base.
  assert.equal(
    r.taxCents,
    r.lines.reduce((a, l) => a + l.taxCents, 0),
  );
});

test("discount is clamped to subtotal and spread proportionally", () => {
  const r = computeOrderTax(
    [
      { lineGross: 2000, taxable: true },
      { lineGross: 2000, taxable: false },
    ],
    "CA",
    5000, // larger than subtotal 4000 -> clamps to 4000
  );
  assert.equal(r.discountCents, 4000);
  // Discount fully consumes both lines.
  assert.equal(r.lines[0].lineCents, 0);
  assert.equal(r.lines[1].lineCents, 0);
  assert.equal(r.taxCents, 0);
  assert.equal(r.totalCents, 0);
});
