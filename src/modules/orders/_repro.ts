import { computeOrderTax } from "./tax.js";
const r = computeOrderTax(
  [
    { lineGross: 20, taxable: true },
    { lineGross: 20, taxable: true },
    { lineGross: 20, taxable: true },
    { lineGross: 20, taxable: true },
    { lineGross: 20, taxable: true },
  ],
  "CA",
  3,
);
console.log("subtotal", r.subtotalCents, "discount", r.discountCents);
console.log("lineCents", r.lines.map(l => l.lineCents));
console.log("sum lineCents", r.lines.reduce((s,l)=>s+l.lineCents,0));
const bad = r.lines.find(l => l.lineCents > 20);
console.log("ANY line_cents > gross(20)?", bad ? "YES -> " + bad.lineCents : "no");
