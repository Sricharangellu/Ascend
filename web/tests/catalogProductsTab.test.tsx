import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductsTab } from "@/app/(protected)/catalog/_components/ProductsTab";
import * as client from "@/api-client/client";
import type { CatalogProduct, Category, ProductFacets } from "@/api-client/types";

/**
 * The product list must resolve search, filters, sorting and counts on the
 * server. It used to do all four in the browser over the loaded page, so every
 * one of them silently disagreed with the catalog past row 50 — and `?q=` was
 * sent to a backend that ignored it entirely.
 *
 * These tests assert on the *requests the component makes*, because that is
 * where the defect lived: the rendering was never wrong, the questions it asked
 * were.
 */

const push = vi.fn();
const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => searchParams,
}));

const CATEGORIES: Category[] = [
  { id: "cat_1", name: "beverages" } as Category,
  { id: "cat_2", name: "snacks" } as Category,
];

function product(over: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: "prod_1", sku: "BEV-1", name: "Coca-Cola 12 Pack", price_cents: 799,
    category: "beverages", tax_class: "standard", status: "active",
    barcode: "049000028904", age_restricted: 0, brand: "Coca-Cola",
    created_at: Date.now(), updated_at: Date.now(),
    ...over,
  } as CatalogProduct;
}

const FACETS: ProductFacets = {
  total: 1,
  status: [{ value: "active", count: 812 }, { value: "draft", count: 44 }, { value: "archived", count: 7 }],
  productType: [{ value: "standalone", count: 700 }, { value: "master", count: 60 }, { value: "variant", count: 103 }],
  category: [{ value: "beverages", count: 420 }, { value: "snacks", count: 180 }],
  brand: [{ value: "Coca-Cola", count: 96 }],
  supplier: [{ value: "ABC Distribution", count: 250 }],
  taxClass: [{ value: "standard", count: 800 }],
  ageRestricted: 31,
  ecommerce: 12,
  priceRange: { min: 99, max: 4999 },
};

/** Every catalog list URL the component requested, in order. */
let listCalls: string[] = [];
let facetCalls: string[] = [];
let apiPost: ReturnType<typeof vi.fn>;

/**
 * What `apiGet` returns for the product list. Tests reassign this rather than
 * re-spying, which keeps the spy's own signature out of the test's types.
 */
let listResponse: () => unknown;

beforeEach(() => {
  listCalls = [];
  facetCalls = [];
  searchParams = new URLSearchParams();
  listResponse = () => ({ items: [product()], total: 863, limit: 50, offset: 0 });

  const get = (path: string): Promise<unknown> => {
    if (path.includes("/catalog/facets")) {
      facetCalls.push(path);
      return Promise.resolve(FACETS);
    }
    listCalls.push(path);
    return Promise.resolve(listResponse());
  };
  vi.spyOn(client, "apiGet").mockImplementation(get as typeof client.apiGet);
  apiPost = vi.spyOn(client, "apiPost").mockResolvedValue({ updated: 2 }) as ReturnType<typeof vi.fn>;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The querystring of the most recent product-list request. */
function lastListQuery(): URLSearchParams {
  return new URLSearchParams(listCalls[listCalls.length - 1].split("?")[1] ?? "");
}

describe("ProductsTab — server-side query", () => {
  it("sends the search term to the API instead of filtering locally", async () => {
    const user = userEvent.setup();
    render(<ProductsTab categories={CATEGORIES} />);
    await waitFor(() => expect(listCalls.length).toBeGreaterThan(0));

    await user.type(screen.getByLabelText("Name or SKU"), "coke");
    await waitFor(() => expect(lastListQuery().get("q")).toBe("coke"), { timeout: 3000 });
  });

  it("sends brand, price, tax class, supplier and product type as query params", async () => {
    const user = userEvent.setup();
    render(<ProductsTab categories={CATEGORIES} />);
    await waitFor(() => expect(listCalls.length).toBeGreaterThan(0));

    await user.selectOptions(screen.getByLabelText("Product type"), "master");
    await waitFor(() => expect(lastListQuery().get("productType")).toBe("master"));

    await user.type(screen.getByLabelText("Brand"), "Coca");
    await waitFor(() => expect(lastListQuery().get("brand")).toBe("Coca"));

    await user.click(screen.getByRole("button", { name: "More filters" }));
    await user.selectOptions(screen.getByLabelText("Tax class"), "exempt");
    await waitFor(() => expect(lastListQuery().get("taxClass")).toBe("exempt"));

    await user.type(screen.getByLabelText("Minimum price in dollars"), "5");
    await waitFor(() => expect(lastListQuery().get("minPrice")).toBe("5"));

    await user.type(screen.getByLabelText("Supplier"), "ABC");
    await waitFor(() => expect(lastListQuery().get("supplier")).toBe("ABC"));
  });

  it("sends sort and direction to the API, and toggles direction on re-click", async () => {
    const user = userEvent.setup();
    render(<ProductsTab categories={CATEGORIES} />);
    await waitFor(() => expect(listCalls.length).toBeGreaterThan(0));

    await user.click(screen.getByRole("button", { name: /Sort by Retail price/ }));
    await waitFor(() => {
      const q = lastListQuery();
      expect(q.get("sort")).toBe("price_cents");
      expect(q.get("dir")).toBe("asc");
    });

    await user.click(screen.getByRole("button", { name: /Sort by Retail price/ }));
    await waitFor(() => expect(lastListQuery().get("dir")).toBe("desc"));
  });

  it("switches to relevance ordering when a search starts", async () => {
    const user = userEvent.setup();
    render(<ProductsTab categories={CATEGORIES} />);
    await waitFor(() => expect(lastListQuery().get("sort")).toBe("name"));

    await user.type(screen.getByLabelText("Name or SKU"), "049000028904");
    await waitFor(() => expect(lastListQuery().get("sort")).toBe("relevance"), { timeout: 3000 });
  });

  it("shows catalog-wide counts from the facets endpoint, not the loaded page", async () => {
    render(<ProductsTab categories={CATEGORIES} />);
    await waitFor(() => expect(facetCalls.length).toBeGreaterThan(0));

    // One product is on screen; the tiles must still report the whole catalog.
    expect(screen.getByRole("group", { name: "Active: 812 products" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Draft: 44 products" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Restricted: 31 products" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Variants: 103 products" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Masters: 60 products" })).toBeInTheDocument();
  });

  it("offers only categories the catalog actually contains, with counts", async () => {
    render(<ProductsTab categories={CATEGORIES} />);
    await waitFor(() => expect(facetCalls.length).toBeGreaterThan(0));

    const select = screen.getByLabelText("Category") as HTMLSelectElement;
    const labels = [...select.options].map((o) => o.textContent);
    expect(labels).toContain("beverages (420)");
    expect(labels).toContain("snacks (180)");
  });

  it("keeps the facet request scoped to the same filters as the list", async () => {
    const user = userEvent.setup();
    render(<ProductsTab categories={CATEGORIES} />);
    await waitFor(() => expect(facetCalls.length).toBeGreaterThan(0));

    await user.selectOptions(screen.getByLabelText("Status"), "draft");
    await waitFor(() => {
      const facetQuery = new URLSearchParams(facetCalls[facetCalls.length - 1].split("?")[1] ?? "");
      expect(facetQuery.get("status")).toBe("draft");
    });
  });
});

describe("ProductsTab — active filter chips", () => {
  it("removes one filter without clearing the others", async () => {
    const user = userEvent.setup();
    render(<ProductsTab categories={CATEGORIES} />);
    await waitFor(() => expect(listCalls.length).toBeGreaterThan(0));

    await user.selectOptions(screen.getByLabelText("Status"), "active");
    await user.selectOptions(screen.getByLabelText("Product type"), "variant");
    await waitFor(() => {
      const q = lastListQuery();
      expect(q.get("status")).toBe("active");
      expect(q.get("productType")).toBe("variant");
    });

    await user.click(screen.getByRole("button", { name: "Remove filter Status: active" }));
    await waitFor(() => {
      const q = lastListQuery();
      expect(q.get("status")).toBeNull();
      expect(q.get("productType")).toBe("variant");
    });
  });
});

describe("ProductsTab — bulk actions", () => {
  it("updates the whole selection in one request, not one PATCH per product", async () => {
    const user = userEvent.setup();
    const apiPatch = vi.spyOn(client, "apiPatch");
    listResponse = () => ({
      items: [product({ id: "prod_1" }), product({ id: "prod_2", sku: "BEV-2", name: "Sprite" })],
      total: 2, limit: 50, offset: 0,
    });

    render(<ProductsTab categories={CATEGORIES} />);
    await waitFor(() => expect(screen.getByLabelText("Select all products")).toBeInTheDocument());
    await user.click(screen.getByLabelText("Select all products"));

    const bulkBar = await screen.findByText("2 products selected");
    const scope = within(bulkBar.parentElement!.parentElement!);
    await user.selectOptions(scope.getAllByRole("combobox")[0], "status");
    await user.selectOptions(scope.getAllByRole("combobox")[1], "archived");
    await user.click(scope.getByRole("button", { name: "Apply to selected" }));

    await waitFor(() => expect(apiPost).toHaveBeenCalledWith(
      "/api/v1/catalog/bulk-update",
      { ids: ["prod_1", "prod_2"], update: { status: "archived" } },
    ));
    // The old implementation fanned out one PATCH per selected product.
    expect(apiPatch).not.toHaveBeenCalled();
  });
});
