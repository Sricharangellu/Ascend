/**
 * @vitest-environment jsdom
 *
 * useListQuery — the rules that make search / filter / sort / pagination behave
 * as ONE query rather than five pieces of state.
 *
 * Each test here corresponds to a bug that actually shipped on an Ascend list
 * page: a filter change leaving the user stranded on a page that no longer
 * exists, a "Clear filters" that missed a filter its author forgot, a debounce
 * that reset the page twice and fetched twice.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useListQuery } from "@/hooks/useListQuery";

// The hook reads initial state through useSearchParams. Drive it from the real
// location so the URL-sync assertions below exercise the same source.
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const DEFAULTS = { status: "", category: "", ageRestricted: false };

beforeEach(() => {
  window.history.replaceState({}, "", "/catalog");
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function renderQuery(options: Partial<Parameters<typeof useListQuery>[0]> = {}) {
  return renderHook(() =>
    useListQuery({ defaultFilters: DEFAULTS, ...options }),
  );
}

describe("useListQuery — pagination stays honest", () => {
  it("returns to page 1 when a filter changes", () => {
    const { result } = renderQuery();
    act(() => result.current.setPage(3));
    expect(result.current.page).toBe(3);

    act(() => result.current.setFilter("status", "active"));
    // Staying on page 3 of a now-shorter result set shows an empty table.
    expect(result.current.page).toBe(0);
  });

  it("returns to page 1 when the search column changes", () => {
    const { result } = renderQuery();
    act(() => result.current.setPage(2));
    act(() => result.current.setSearchField("sku"));
    expect(result.current.page).toBe(0);
  });

  it("returns to page 1 when the sort changes", () => {
    const { result } = renderQuery();
    act(() => result.current.setPage(4));
    act(() => result.current.toggleSort("price"));
    expect(result.current.page).toBe(0);
  });

  it("returns to page 1 when the page size changes", () => {
    const { result } = renderQuery({ pageSize: 25 });
    act(() => result.current.setPage(4));
    act(() => result.current.setPageSize(100));
    expect(result.current.page).toBe(0);
    expect(result.current.offset).toBe(0);
  });

  it("exposes offset as page × pageSize for limit/offset endpoints", () => {
    const { result } = renderQuery({ pageSize: 50 });
    act(() => result.current.setPage(3));
    expect(result.current.offset).toBe(150);
  });
});

describe("useListQuery — debounce", () => {
  it("keeps the box responsive while deferring the query", () => {
    const { result } = renderQuery({ debounceMs: 300 });
    act(() => result.current.setSearch("cok"));
    // The input updates immediately; the thing you fetch with does not.
    expect(result.current.search).toBe("cok");
    expect(result.current.debouncedSearch).toBe("");

    act(() => vi.advanceTimersByTime(300));
    expect(result.current.debouncedSearch).toBe("cok");
  });

  it("resets the page exactly once, when the debounced value lands", () => {
    const { result } = renderQuery({ debounceMs: 300 });
    act(() => result.current.setPage(5));

    act(() => result.current.setSearch("c"));
    act(() => result.current.setSearch("co"));
    // Still on page 5: nothing has been fetched yet, so nothing has moved.
    expect(result.current.page).toBe(5);

    act(() => vi.advanceTimersByTime(300));
    expect(result.current.debouncedSearch).toBe("co");
    expect(result.current.page).toBe(0);
  });
});

describe("useListQuery — reset", () => {
  it("clears every filter, including ones added after it was written", () => {
    // The point of restoring from defaultFilters wholesale: this test does not
    // enumerate the filters, so a new one is covered without touching reset().
    const { result } = renderQuery();
    act(() => {
      result.current.setFilter("status", "active");
      result.current.setFilter("category", "beverages");
      result.current.setFilter("ageRestricted", true);
      result.current.setSearch("coke");
      result.current.setSearchField("sku");
      result.current.toggleSort("price");
      result.current.setPage(4);
    });
    act(() => vi.advanceTimersByTime(300));

    act(() => result.current.reset());

    expect(result.current.filters).toEqual(DEFAULTS);
    expect(result.current.search).toBe("");
    expect(result.current.debouncedSearch).toBe("");
    expect(result.current.searchField).toBe("all");
    expect(result.current.sort).toBeNull();
    expect(result.current.page).toBe(0);
    expect(result.current.isDirty).toBe(false);
  });

  it("reports isDirty so Reset can be disabled when it would do nothing", () => {
    const { result } = renderQuery();
    expect(result.current.isDirty).toBe(false);
    act(() => result.current.setFilter("status", "active"));
    expect(result.current.isDirty).toBe(true);
  });

  it("counts only filters that differ from their defaults", () => {
    const { result } = renderQuery();
    expect(result.current.activeFilterCount).toBe(0);
    act(() => result.current.setFilter("status", "active"));
    expect(result.current.activeFilterCount).toBe(1);
    // Setting a filter back to its default must decrement, not accumulate.
    act(() => result.current.setFilter("status", ""));
    expect(result.current.activeFilterCount).toBe(0);
  });
});

describe("useListQuery — sorting", () => {
  it("toggles direction on the same column and restarts ascending on a new one", () => {
    const { result } = renderQuery();
    act(() => result.current.toggleSort("name"));
    expect(result.current.sort).toBe("name");
    expect(result.current.dir).toBe("asc");

    act(() => result.current.toggleSort("name"));
    expect(result.current.dir).toBe("desc");

    act(() => result.current.toggleSort("price"));
    expect(result.current.sort).toBe("price");
    expect(result.current.dir).toBe("asc");
  });
});

describe("useListQuery — URL state", () => {
  it("does not touch the URL without a urlKey", () => {
    const { result } = renderQuery();
    act(() => result.current.setFilter("status", "active"));
    expect(window.location.search).toBe("");
  });

  it("writes active state to the URL and omits defaults", () => {
    const { result } = renderQuery({ urlKey: "products", debounceMs: 300 });
    act(() => result.current.setFilter("status", "active"));
    act(() => result.current.setSearch("coke"));
    act(() => vi.advanceTimersByTime(300));

    const params = new URLSearchParams(window.location.search);
    expect(params.get("products_q")).toBe("coke");
    expect(params.get("products_status")).toBe("active");
    // Defaults stay out of the URL — otherwise every link carries noise that
    // means "unchanged".
    expect(params.get("products_category")).toBeNull();
    expect(params.get("products_field")).toBeNull();
  });

  it("restores state from a deep link, including booleans", () => {
    window.history.replaceState(
      {},
      "",
      "/catalog?products_q=pepsi&products_field=sku&products_ageRestricted=true&products_page=2",
    );
    const { result } = renderQuery({ urlKey: "products" });

    expect(result.current.search).toBe("pepsi");
    // Must be immediately usable as the query value — waiting for a debounce
    // here would fetch the unfiltered list first.
    expect(result.current.debouncedSearch).toBe("pepsi");
    expect(result.current.searchField).toBe("sku");
    expect(result.current.filters.ageRestricted).toBe(true);
    expect(result.current.page).toBe(2);
  });

  it("clears the URL when state is reset", () => {
    window.history.replaceState({}, "", "/catalog?products_q=pepsi&products_status=active");
    const { result } = renderQuery({ urlKey: "products" });
    act(() => result.current.reset());
    expect(window.location.search).toBe("");
  });
});
