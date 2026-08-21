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
  window.history.replaceState({}, "", "/catalog");
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

/**
 * Open the shared filter popover.
 *
 * The nine filters used to sit inline in a bespoke bar (with a "More filters"
 * disclosure hiding four of them). They live in `ListControls`' popover now, so
 * every filter is one click away instead of two-for-some-and-one-for-others.
 */
async function openFilters(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /^filter/i }));
  await screen.findByRole("dialog", { name: /filters/i });
}

describe("ProductsTab — server-side query", () => {
  it("sends the search term to the API instead of filtering locally", async () => {
    const user = userEvent.setup();
    render(<ProductsTab categories={CATEGORIES} />);
    await waitFor(() => expect(listCalls.length).toBeGreaterThan(0));

    await user.type(screen.getByLabelText("Search products"), "coke");
    await waitFor(() => expect(lastListQuery().get("q")).toBe("coke"), { timeout: 3000 });
  });

  it("sends brand, price, tax class, supplier and product type as query params", async () => {
    const user = userEvent.setup();
    render(<ProductsTab categories={CATEGORIES} />);
    await waitFor(() => expect(listCalls.length).toBeGreaterThan(0));
    await openFilters(user);

    await user.selectOptions(screen.getByLabelText("Product type"), "master");
    await waitFor(() => expect(lastListQuery().get("productType")).toBe("master"));

    await user.type(screen.getByLabelText("Brand"), "Coca");
    await waitFor(() => expect(lastListQuery().get("brand")).toBe("Coca"));

    await user.selectOptions(screen.getByLabelText("Tax class"), "exempt");
    await waitFor(() => expect(lastListQuery().get("taxClass")).toBe("exempt"));

    await user.type(screen.getByLabelText("Minimum price in dollars"), "5");
    await waitFor(() => expect(lastListQuery().get("minPrice")).toBe("5"));

    await user.type(screen.getByLabelText("Supplier"), "ABC");
    await waitFor(() => expect(lastListQuery().get("supplier")).toBe("ABC"));
  });

  it("sends the chosen search column, and only alongside a term", async () => {
    const user = userEvent.setup();
    render(<ProductsTab categories={CATEGORIES} />);
    await waitFor(() => expect(listCalls.length).toBeGreaterThan(0));

    // Scoping with an empty box must not narrow anything — there is nothing to
    // narrow, and sending it would make the request differ from the old one for
    // no reason.
    await user.selectOptions(screen.getByLabelText(/search in which column/i), "sku");
    await waitFor(() => expect(lastListQuery().get("searchField")).toBeNull());

    await user.type(screen.getByLabelText("Search products"), "BEV");
    await waitFor(() => {
      const q = lastListQuery();
      expect(q.get("q")).toBe("BEV");
      // The parameter the server implements. If this is ever dropped, the
      // column selector becomes decoration again.
      expect(q.get("searchField")).toBe("sku");
    }, { timeout: 3000 });
  });

  it("keeps the facet request scoped to the same search column as the list", async () => {
    const user = userEvent.setup();
    render(<ProductsTab categories={CATEGORIES} />);
    await waitFor(() => expect(facetCalls.length).toBeGreaterThan(0));

    await user.selectOptions(screen.getByLabelText(/search in which column/i), "brand");
    await user.type(screen.getByLabelText("Search products"), "Coca");

    await waitFor(() => {
      const facetQuery = new URLSearchParams(facetCalls[facetCalls.length - 1].split("?")[1] ?? "");
      // Counts drawn from a wider set than the rows beneath them is the bug
      // this asserts against.
      expect(facetQuery.get("searchField")).toBe("brand");
      expect(facetQuery.get("q")).toBe("Coca");
    }, { timeout: 3000 });
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

    await user.type(screen.getByLabelText("Search products"), "049000028904");
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

    await openFilters(userEvent.setup());
    const select = screen.getByLabelText("Category") as HTMLSelectElement;
    const labels = [...select.options].map((o) => o.textContent);
    expect(labels).toContain("beverages (420)");
    expect(labels).toContain("snacks (180)");
  });

  it("keeps the facet request scoped to the same filters as the list", async () => {
    const user = userEvent.setup();
    render(<ProductsTab categories={CATEGORIES} />);
    await waitFor(() => expect(facetCalls.length).toBeGreaterThan(0));

    await openFilters(user);
    await user.selectOptions(screen.getByLabelText("Status"), "draft");
    await waitFor(() => {
      const facetQuery = new URLSearchParams(facetCalls[facetCalls.length - 1].split("?")[1] ?? "");
      expect(facetQuery.get("status")).toBe("draft");
    });
  });
});

describe("ProductsTab — unified query state (useListQuery migration)", () => {
  it("returns to page 1 when a filter changes, and does it in one request", async () => {
    const user = userEvent.setup();
    listResponse = () => ({ items: [product()], total: 863, limit: 50, offset: 100 });
    render(<ProductsTab categories={CATEGORIES} />);
    await waitFor(() => expect(listCalls.length).toBeGreaterThan(0));

    await user.click(screen.getByRole("button", { name: /next page|next/i }));
    await waitFor(() => expect(lastListQuery().get("offset")).toBe("50"));

    const before = listCalls.length;
    await openFilters(user);
    await user.selectOptions(screen.getByLabelText("Status"), "active");

    await waitFor(() => {
      const q = lastListQuery();
      expect(q.get("status")).toBe("active");
      // Page 3 of the old result set is meaningless in the new one.
      expect(q.get("offset")).toBe("0");
    });

    // The old code reset the page in an effect, which fetched once for the
    // stale offset and again once the reset landed. One filter change must
    // produce exactly one list request.
    const listRequestsForThisChange = listCalls
      .slice(before)
      .filter((c) => c.includes("status=active"));
    expect(listRequestsForThisChange).toHaveLength(1);
    // Specifically: no request went out carrying the old offset with the new filter.
    expect(listCalls.slice(before).some((c) => c.includes("offset=50") && c.includes("status=active")))
      .toBe(false);
  });

  it("restores a deep-linked query from the URL on first render", async () => {
    // A filtered catalog view is a shareable URL. Everything here must be in
    // the FIRST request — fetching the unfiltered list first and correcting it
    // afterwards would flash the wrong rows.
    searchParams = new URLSearchParams(
      "products_q=pepsi&products_field=sku&products_status=draft&products_ageRestricted=true",
    );
    render(<ProductsTab categories={CATEGORIES} />);
    await waitFor(() => expect(listCalls.length).toBeGreaterThan(0));

    const first = new URLSearchParams(listCalls[0].split("?")[1] ?? "");
    expect(first.get("q")).toBe("pepsi");
    expect(first.get("searchField")).toBe("sku");
    expect(first.get("status")).toBe("draft");
    expect(first.get("ageRestricted")).toBe("true");
  });

  it("writes active filters to the URL without a history entry per keystroke", async () => {
    const user = userEvent.setup();
    const historyLength = window.history.length;
    render(<ProductsTab categories={CATEGORIES} />);
    await waitFor(() => expect(listCalls.length).toBeGreaterThan(0));

    await openFilters(user);
    await user.selectOptions(screen.getByLabelText("Status"), "draft");

    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("products_status")).toBe("draft"),
    );
    // replaceState, not push: Back must not walk through every filter change.
    expect(window.history.length).toBe(historyLength);
  });

  it("Reset clears the query, the URL and the sort together", async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams("products_q=pepsi&products_status=draft");
    render(<ProductsTab categories={CATEGORIES} />);
    await waitFor(() => expect(listCalls.length).toBeGreaterThan(0));

    // Sort by something explicit so we can prove Reset clears it too — the old
    // hand-written clearFilters left the list reordered.
    await user.click(screen.getByRole("button", { name: /Sort by Retail price/ }));
    await waitFor(() => expect(lastListQuery().get("sort")).toBe("price_cents"));

    await user.click(screen.getByRole("button", { name: /^reset$/i }));

    await waitFor(() => {
      const q = lastListQuery();
      expect(q.get("q")).toBeNull();
      expect(q.get("status")).toBeNull();
      // Back to the contextual default rather than the column the user picked.
      expect(q.get("sort")).toBe("name");
      expect(q.get("offset")).toBe("0");
    });
    expect(window.location.search).toBe("");
  });
});

describe("ProductsTab — active filter chips", () => {
  it("removes one filter without clearing the others", async () => {
    const user = userEvent.setup();
    render(<ProductsTab categories={CATEGORIES} />);
    await waitFor(() => expect(listCalls.length).toBeGreaterThan(0));

    await openFilters(user);
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

describe("ProductsTab — DataTable migration", () => {
  it("keeps sorting server-side after the table moved to DataTable", async () => {
    const user = userEvent.setup();
    render(<ProductsTab categories={CATEGORIES} />);
    await waitFor(() => expect(listCalls.length).toBeGreaterThan(0));

    // DataTable's default sorting reorders the LOADED page. This list must not
    // use it: one page of a 5,000-row catalog reordered locally looks exactly
    // like the catalog being reordered, which is the defect this page already
    // had once. A header click has to reach the server.
    await user.click(screen.getByRole("button", { name: /Sort by Brand/ }));
    await waitFor(() => {
      const q = lastListQuery();
      expect(q.get("sort")).toBe("brand");
      expect(q.get("dir")).toBe("asc");
    });
  });

  it("marks the contextual default column as sorted, not just explicit choices", async () => {
    render(<ProductsTab categories={CATEGORIES} />);
    await waitFor(() => expect(listCalls.length).toBeGreaterThan(0));

    // With no click, the server is ordering by name. The header must say so —
    // showing every column as unsorted would misdescribe the list.
    const nameHeader = screen.getAllByRole("columnheader")
      .find((h) => h.textContent?.includes("Name"));
    expect(nameHeader).toHaveAttribute("aria-sort", "ascending");
  });

  it("still drives the bulk bar from the table's selection", async () => {
    const user = userEvent.setup();
    listResponse = () => ({
      items: [product({ id: "prod_1" }), product({ id: "prod_2", sku: "BEV-2", name: "Sprite" })],
      total: 2, limit: 50, offset: 0,
    });
    render(<ProductsTab categories={CATEGORIES} />);
    await waitFor(() => expect(screen.getByLabelText("Select all rows on this page")).toBeInTheDocument());

    // The bulk bar lives OUTSIDE the table, so selection has to be controlled —
    // an internally-managed selection would leave the bar empty.
    await user.click(screen.getByLabelText("Select all rows on this page"));
    expect(await screen.findByText("2 products selected")).toBeInTheDocument();
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
    // DataTable's own label. More precise than the old "Select all products":
    // it selects the loaded page, which is what it has always actually done.
    const selectAll = "Select all rows on this page";
    await waitFor(() => expect(screen.getByLabelText(selectAll)).toBeInTheDocument());
    await user.click(screen.getByLabelText(selectAll));

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
