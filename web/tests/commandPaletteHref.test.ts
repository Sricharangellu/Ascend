/**
 * @vitest-environment node
 *
 * Command palette must deep-link to entity detail pages when they exist —
 * landing on list hubs (C2 in the product-experience audit) feels broken.
 */

import { describe, it, expect } from "vitest";
import { hrefForHit } from "@/components/CommandPalette";
import type { SearchHit } from "@/api-client/types";

function hit(type: SearchHit["type"], id = "abc-123"): SearchHit {
  return { type, id, label: "Example" };
}

describe("hrefForHit — entity detail URLs", () => {
  it("opens product, customer, vendor, PO, and order detail pages", () => {
    expect(hrefForHit(hit("product"))).toBe("/catalog/abc-123");
    expect(hrefForHit(hit("customer"))).toBe("/customers/abc-123");
    expect(hrefForHit(hit("vendor"))).toBe("/vendors/abc-123");
    expect(hrefForHit(hit("purchase_order"))).toBe("/purchasing/abc-123");
    expect(hrefForHit(hit("order"))).toBe("/orders/abc-123");
  });

  it("falls back to owning hubs when no detail route exists", () => {
    expect(hrefForHit(hit("invoice"))).toBe("/finance");
    // /sales was deleted in Ponytail Wave 3 — link the real hub, not a redirect.
    expect(hrefForHit(hit("sales_order"))).toBe("/orders");
    expect(hrefForHit(hit("quotation"))).toBe("/quotes");
  });
});
