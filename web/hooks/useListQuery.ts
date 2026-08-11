"use client";

/**
 * useListQuery — one state model for a list page.
 *
 * WHY THIS EXISTS
 * Search, search column, filters, sort and pagination are not five independent
 * pieces of state; they are one query, and the bugs come from treating them
 * separately. The recurring failures across Ascend's list pages were all the
 * same shape:
 *
 *   - Changing a filter without resetting the page, so the user lands on page 4
 *     of a 2-page result and sees an empty table.
 *   - Resetting the page in a `useEffect` on the filter value, which fetches
 *     once for the stale page and again once the reset lands — two round trips
 *     and a flash of the wrong rows.
 *   - A "Clear filters" button that clears the four filters its author
 *     remembered and leaves the other three set.
 *
 * So the page declares its filters once, and this hook guarantees the rules:
 * every change that alters the result set returns to page 1 in the SAME render,
 * `reset()` clears everything by construction rather than by an enumeration
 * someone has to maintain, and the search term is debounced separately from the
 * text in the box so typing stays responsive.
 *
 * URL SYNC
 * Opt in with `urlKey`. State is written back with `history.replaceState`
 * rather than a router push: filters are not navigation, and pushing would put
 * a history entry behind every keystroke. Initial values are read from
 * `useSearchParams()` so a deep link renders the same on server and client.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

/** Filter values a list page can hold. Anything richer belongs in its own state. */
export type FilterValue = string | boolean | undefined;

export type FilterMap = Record<string, FilterValue>;

export interface UseListQueryOptions<F extends FilterMap> {
  /** Filter names and their inactive values. Defines what `reset()` restores. */
  defaultFilters: F;
  /** Which column search is scoped to before the user picks. Usually "all". */
  defaultSearchField?: string;
  defaultSort?: string | null;
  defaultDir?: "asc" | "desc";
  pageSize?: number;
  /** Milliseconds between the last keystroke and the search taking effect. */
  debounceMs?: number;
  /**
   * Prefix for URL parameters, e.g. "products" → `?products_q=`. Omit to keep
   * the state local to the component (no URL involvement at all).
   */
  urlKey?: string;
}

export interface ListQuery<F extends FilterMap> {
  /** What is in the search box right now. Bind this to the input. */
  search: string;
  setSearch: (value: string) => void;
  /** What the data source should actually query. Bind this to your fetch. */
  debouncedSearch: string;

  searchField: string;
  setSearchField: (value: string) => void;

  filters: F;
  setFilter: <K extends keyof F>(key: K, value: F[K]) => void;
  /** How many filters differ from their defaults. Drives `Filter · N`. */
  activeFilterCount: number;

  sort: string | null;
  dir: "asc" | "desc";
  /** Same column toggles direction; a new column starts ascending. */
  toggleSort: (column: string) => void;

  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  /** `page * pageSize` — what a limit/offset endpoint wants. */
  offset: number;

  /** True when anything is non-default, so Reset can be disabled when it isn't. */
  isDirty: boolean;
  reset: () => void;
}

/** Compare two filter maps by value — filters are flat scalars by construction. */
function countActive<F extends FilterMap>(filters: F, defaults: F): number {
  return (Object.keys(defaults) as (keyof F)[]).filter((k) => filters[k] !== defaults[k]).length;
}

export function useListQuery<F extends FilterMap>({
  defaultFilters,
  defaultSearchField = "all",
  defaultSort = null,
  defaultDir = "asc",
  pageSize: initialPageSize = 50,
  debounceMs = 300,
  urlKey,
}: UseListQueryOptions<F>): ListQuery<F> {
  const searchParams = useSearchParams();

  // Read once, at mount. Re-reading on every params change would fight the user:
  // this hook is the writer of those params, so it would echo its own writes
  // back over whatever was typed since.
  const initial = useRef<{
    search: string;
    searchField: string;
    filters: F;
    sort: string | null;
    dir: "asc" | "desc";
    page: number;
  } | null>(null);

  if (initial.current === null) {
    const param = (name: string) => (urlKey ? searchParams?.get(`${urlKey}_${name}`) : null);
    const filters = { ...defaultFilters };
    if (urlKey) {
      for (const key of Object.keys(defaultFilters) as (keyof F)[]) {
        const raw = param(String(key));
        if (raw === null) continue;
        // Booleans are the only non-string filter shape, and the default tells
        // us which is which — a URL cannot carry the distinction itself.
        filters[key] = (
          typeof defaultFilters[key] === "boolean" ? raw === "true" : raw
        ) as F[keyof F];
      }
    }
    const rawPage = Number(param("page"));
    initial.current = {
      search: param("q") ?? "",
      searchField: param("field") ?? defaultSearchField,
      filters,
      sort: param("sort") ?? defaultSort,
      dir: param("dir") === "desc" ? "desc" : param("dir") === "asc" ? "asc" : defaultDir,
      page: Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 0,
    };
  }

  const [search, setSearchRaw] = useState(initial.current.search);
  const [debouncedSearch, setDebouncedSearch] = useState(initial.current.search);
  const [searchField, setSearchFieldRaw] = useState(initial.current.searchField);
  const [filters, setFilters] = useState<F>(initial.current.filters);
  const [sort, setSort] = useState<string | null>(initial.current.sort);
  const [dir, setDir] = useState<"asc" | "desc">(initial.current.dir);
  const [page, setPage] = useState(initial.current.page);
  const [pageSize, setPageSizeRaw] = useState(initialPageSize);

  // ── Debounce ──────────────────────────────────────────────────────────────
  // The page reset rides along with the debounced value, not with the keystroke:
  // resetting on every keystroke is invisible (the fetch has not happened yet)
  // and resetting after the fetch would fetch twice.
  useEffect(() => {
    if (search === debouncedSearch) return;
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, debounceMs);
    return () => clearTimeout(t);
  }, [search, debouncedSearch, debounceMs]);

  // ── Setters that keep pagination honest ───────────────────────────────────
  // Each resets the page in the same render that changes the query, so the
  // request that goes out already carries offset 0.
  const setSearch = useCallback((value: string) => setSearchRaw(value), []);

  const setSearchField = useCallback((value: string) => {
    setSearchFieldRaw(value);
    setPage(0);
  }, []);

  const setFilter = useCallback(<K extends keyof F>(key: K, value: F[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(0);
  }, []);

  const setPageSize = useCallback((size: number) => {
    setPageSizeRaw(size);
    setPage(0);
  }, []);

  const toggleSort = useCallback((column: string) => {
    // Re-sorting reorders the whole result set, so the old page 3 means nothing
    // in the new order.
    setPage(0);
    setSort((currentSort) => {
      if (currentSort === column) {
        setDir((d) => (d === "asc" ? "desc" : "asc"));
        return currentSort;
      }
      setDir("asc");
      return column;
    });
  }, []);

  // ── Reset ─────────────────────────────────────────────────────────────────
  // Restores from `defaultFilters` wholesale rather than clearing named fields,
  // so a filter added later is covered without anyone remembering to update it.
  const reset = useCallback(() => {
    setSearchRaw("");
    setDebouncedSearch("");
    setSearchFieldRaw(defaultSearchField);
    setFilters({ ...defaultFilters });
    setSort(defaultSort);
    setDir(defaultDir);
    setPage(0);
  }, [defaultFilters, defaultSearchField, defaultSort, defaultDir]);

  const activeFilterCount = useMemo(
    () => countActive(filters, defaultFilters),
    [filters, defaultFilters],
  );

  const isDirty =
    search !== "" ||
    debouncedSearch !== "" ||
    searchField !== defaultSearchField ||
    activeFilterCount > 0 ||
    sort !== defaultSort ||
    dir !== defaultDir;

  // ── URL sync ──────────────────────────────────────────────────────────────
  // replaceState, not router.replace: this is view state, not navigation. A
  // push per keystroke would make Back walk through every character typed, and
  // a router replace re-renders the route tree on each one.
  useEffect(() => {
    if (!urlKey || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const set = (name: string, value: string | null) => {
      const key = `${urlKey}_${name}`;
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    };
    set("q", debouncedSearch);
    set("field", searchField === defaultSearchField ? null : searchField);
    for (const key of Object.keys(defaultFilters) as (keyof F)[]) {
      const value = filters[key];
      set(
        String(key),
        value === defaultFilters[key] || value === undefined ? null : String(value),
      );
    }
    set("sort", sort === defaultSort ? null : sort);
    set("dir", dir === defaultDir ? null : dir);
    set("page", page > 0 ? String(page) : null);

    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, [
    urlKey, debouncedSearch, searchField, filters, sort, dir, page,
    defaultFilters, defaultSearchField, defaultSort, defaultDir,
  ]);

  return {
    search, setSearch, debouncedSearch,
    searchField, setSearchField,
    filters, setFilter, activeFilterCount,
    sort, dir, toggleSort,
    page, setPage, pageSize, setPageSize,
    offset: page * pageSize,
    isDirty, reset,
  };
}
