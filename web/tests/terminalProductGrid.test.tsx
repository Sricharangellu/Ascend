/**
 * @vitest-environment jsdom
 *
 * ProductGrid — the register's catalog browser.
 *
 * Both tests here correspond to a defect that was live at the till:
 *
 *   1. The initial load sent `?pageSize=200`. The catalog endpoint reads
 *      `limit`, so the parameter was dropped and the register browsed the
 *      default 50 products. Nothing surfaced the truncation.
 *   2. Search filtered `allProducts` in the browser — i.e. only that same first
 *      page — so scanning a barcode for anything past it returned "no results"
 *      with the product in stock.
 *
 * Neither is visible in a screenshot and neither fails a type check, which is
 * why they survived. They are asserted on the *requests the component makes*.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductGrid } from "@/components/terminal/ProductGrid";
import * as client from "@/api-client/client";

let calls: string[] = [];

function item(over: Record<string, unknown> = {}) {
  return {
    id: "prod_1", sku: "BEV-1", name: "Coca-Cola 12 Pack", price_cents: 799,
    category: "beverages", barcode: "049000028904", status: "active",
    ...over,
  };
}

beforeEach(() => {
  calls = [];
  vi.spyOn(client, "apiGet").mockImplementation(((path: string) => {
    calls.push(path);
    // The deep product exists in the catalog but is NOT in the browse page —
    // exactly the situation the old local-only filter got wrong.
    if (path.includes("q=")) {
      return Promise.resolve({
        items: [item({ id: "prod_deep", sku: "DEEP-1", name: "Deep Catalog Widget" })],
        total: 1, limit: 100, offset: 0,
      });
    }
    return Promise.resolve({ items: [item()], total: 1, limit: 200, offset: 0 });
  }) as typeof client.apiGet);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The querystring of the most recent catalog request. */
function lastQuery(): URLSearchParams {
  return new URLSearchParams(calls[calls.length - 1]!.split("?")[1] ?? "");
}

describe("ProductGrid — catalog request contract", () => {
  it("asks for a page size the backend actually reads", async () => {
    render(<ProductGrid onAddProduct={vi.fn()} />);
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));

    const q = new URLSearchParams(calls[0]!.split("?")[1] ?? "");
    // `pageSize` is not a parameter this endpoint has ever implemented; sending
    // it silently yielded the default 50.
    expect(q.get("pageSize")).toBeNull();
    expect(q.get("limit")).toBe("200");
  });
});

describe("ProductGrid — search covers the whole catalog", () => {
  it("queries the server so a product past the browse page is still findable", async () => {
    const user = userEvent.setup();
    render(<ProductGrid onAddProduct={vi.fn()} />);
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));

    await user.type(screen.getByLabelText("Search products"), "Deep");

    await waitFor(() => expect(lastQuery().get("q")).toBe("Deep"), { timeout: 3000 });
    // The row that only the server knows about must reach the grid. Under the
    // old implementation this assertion fails: the local filter had nothing
    // named "Deep" to match.
    expect(await screen.findByText("Deep Catalog Widget")).toBeInTheDocument();
  });

  it("scopes the server search by the selected category", async () => {
    const user = userEvent.setup();
    render(<ProductGrid onAddProduct={vi.fn()} />);
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));

    await user.click(await screen.findByRole("tab", { name: "beverages" }));
    await user.type(screen.getByLabelText("Search products"), "cola");

    await waitFor(() => {
      const q = lastQuery();
      // Both, or the category tab silently stops applying once you type.
      expect(q.get("q")).toBe("cola");
      expect(q.get("category")).toBe("beverages");
    }, { timeout: 3000 });
  });

  it("does not fire a search request for an empty box", async () => {
    render(<ProductGrid onAddProduct={vi.fn()} />);
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls.filter((c) => c.includes("q="))).toHaveLength(0);
  });
});
