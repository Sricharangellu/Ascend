"use client";

/**
 * ListControls — the one search / filter / reset bar for Ascend list pages.
 *
 * WHY THIS EXISTS
 * Every list page grew its own toolbar. The audit of `app/(protected)` found 24
 * pages with a search box and no two behaving the same: some debounce and some
 * do not, some search the server and some filter the page React happens to be
 * holding, "Clear filters" exists on a handful and resets a different subset on
 * each, and none of them let the user say WHICH column they are searching —
 * which is the single most common request from an operator holding a scanner
 * and a supplier invoice.
 *
 * So this component owns the whole bar:
 *
 *   [ 🔍 Search products, SKU, UPC…  ×] [ All columns ▾ ] [ Filter · 3 ] [ Reset ]
 *
 * THE COLUMN SELECTOR IS NOT DECORATION
 * `searchFields` maps to a real query parameter that the server implements
 * (`GET /api/v1/catalog?searchField=sku`), and the server 400s on a field it
 * does not know. A page must not offer a column its data source cannot scope
 * to — see `ListSearchField.value` below.
 *
 * ACCESSIBILITY
 * - The search input has a real (visually hidden) label and a live result count.
 * - The column selector is a native <select>: keyboard, screen-reader and
 *   mobile behaviour for free, which a div-based menu has to re-earn.
 * - The filter popover is a labelled dialog: Escape closes it, focus returns to
 *   the trigger, and a click outside dismisses it.
 * - Every control is ≥44px on its touch axis and shows a visible focus ring.
 * - Reset is disabled — not hidden — when there is nothing to reset, so its
 *   position is stable and screen readers still announce why it is unavailable.
 */

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { clsx } from "clsx";

/** One option in the "search which column?" selector. */
export interface ListSearchField {
  /**
   * The value sent to the data source. For a server-backed list this MUST be a
   * value the endpoint accepts — an option the backend does not implement is
   * the "fake control" this component exists to eliminate.
   */
  value: string;
  label: string;
}

export interface ListControlsProps {
  // ── Search ───────────────────────────────────────────────────────────────
  /** Raw (un-debounced) search text. Debouncing belongs to `useListQuery`. */
  search: string;
  onSearchChange: (value: string) => void;
  /**
   * Tell the user what is searchable, not just "Search". Operators type a UPC
   * into a box labelled "Search products" and assume it will not work.
   */
  searchPlaceholder?: string;
  /** Accessible name for the input. Defaults to the placeholder. */
  searchLabel?: string;

  // ── Column scoping ───────────────────────────────────────────────────────
  /** Omit entirely to render no column selector (a list with one searchable field). */
  searchFields?: ListSearchField[];
  searchField?: string;
  onSearchFieldChange?: (value: string) => void;

  // ── Filters ──────────────────────────────────────────────────────────────
  /**
   * Filter controls for THIS page, rendered inside the popover. Pass only
   * filters that apply to the current dataset — a shared bar does not mean a
   * shared filter list.
   */
  filters?: React.ReactNode;
  /** Drives the `Filter · N` badge. Search text is counted separately. */
  activeFilterCount?: number;

  // ── Reset ────────────────────────────────────────────────────────────────
  /** Clears search, column scope, every filter, and returns to page 1. */
  onReset?: () => void;
  /** Whether anything is currently active. Reset is disabled when false. */
  canReset?: boolean;

  // ── Context ──────────────────────────────────────────────────────────────
  /** Result count, announced politely when it changes. */
  resultCount?: number;
  /** Total before filtering, for "12 of 480". */
  totalCount?: number;
  loading?: boolean;
  /** Extra controls on the right — Columns, Export, view switches. */
  trailing?: React.ReactNode;
  className?: string;
}

/**
 * Shared styling for a control inside a filter popover.
 *
 * Exported as a class string rather than wrapped in a component because the
 * controls themselves differ (select, text, number, date) and every wrapper
 * that tried to abstract that ended up with a `kind` prop enumerating them.
 * The label/spacing is `FilterField`; this is only the box.
 */
export const filterControlClass = clsx(
  "focus-ring min-h-touch w-full rounded-control border border-line bg-surface-1 px-2",
  "text-sm text-content-primary placeholder:text-content-muted",
);

/** One labelled row in a filter popover. Keeps every page's filters aligned. */
export function FilterField({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  /** Omit when wrapping a fieldset or a group with its own labelling. */
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-xs font-medium text-content-secondary">
          {label}
        </label>
      ) : (
        <span className="text-xs font-medium text-content-secondary">{label}</span>
      )}
      {children}
      {hint && <p className="text-2xs text-content-muted">{hint}</p>}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" strokeLinecap="round" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M2 3.5A.5.5 0 0 1 2.5 3h11a.5.5 0 0 1 .38.82L9.5 9.06V13a.5.5 0 0 1-.74.44l-2-1.1A.5.5 0 0 1 6.5 12V9.06L2.12 3.82A.5.5 0 0 1 2 3.5Z" />
    </svg>
  );
}

export function ListControls({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  searchLabel,
  searchFields,
  searchField,
  onSearchFieldChange,
  filters,
  activeFilterCount = 0,
  onReset,
  canReset = false,
  resultCount,
  totalCount,
  loading = false,
  trailing,
  className,
}: ListControlsProps) {
  const id = useId();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const closeFilters = useCallback(
    (returnFocus = true) => {
      setFiltersOpen(false);
      if (returnFocus) filterTriggerRef.current?.focus();
    },
    [],
  );

  // Escape closes the popover from anywhere inside it; a click outside dismisses
  // without stealing focus back, which would yank the caret out of whatever the
  // user clicked on next.
  useEffect(() => {
    if (!filtersOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeFilters();
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (filterTriggerRef.current?.contains(target)) return;
      closeFilters(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [filtersOpen, closeFilters]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Escape clears rather than closing anything — in a list page the search box
    // IS the thing you want to back out of, and browsers only do this natively
    // for type="search" in some engines.
    if (e.key === "Escape" && search !== "") {
      e.preventDefault();
      e.stopPropagation();
      onSearchChange("");
    }
  };

  const showCount = typeof resultCount === "number" && !loading;
  const scopeLabel = searchFields?.find((f) => f.value === searchField)?.label;

  return (
    <div className={clsx("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {/* ── Search + column scope ──────────────────────────────────────── */}
        <div
          className={clsx(
            "flex min-w-[240px] flex-1 items-stretch rounded-container border border-line",
            "bg-surface-1 focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-100",
            "sm:max-w-xl",
          )}
        >
          <div className="relative flex flex-1 items-center">
            <label htmlFor={`${id}-search`} className="sr-only">
              {searchLabel ?? searchPlaceholder}
            </label>
            <span
              className="pointer-events-none absolute left-3 text-content-muted"
              aria-hidden="true"
            >
              <SearchIcon />
            </span>
            <input
              ref={searchInputRef}
              id={`${id}-search`}
              // `type="search"` and not "text": iOS shows a Search key, and
              // assistive tech announces the role.
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={searchPlaceholder}
              autoComplete="off"
              // The count lives in its own live region below; pointing at it
              // here means a screen reader reads "142 results" after typing
              // stops, instead of leaving the user to hunt for the number.
              aria-describedby={showCount ? `${id}-count` : undefined}
              className={clsx(
                "min-h-touch w-full rounded-l-container bg-transparent py-2 pl-9 pr-8",
                "text-sm text-content-primary placeholder:text-content-muted",
                // The wrapper owns the focus ring; a second one here would
                // double-draw on the same 1px border.
                "focus:outline-none",
                // Chrome/Safari draw their own clear affordance; ours is
                // keyboard-reachable and consistently placed, so hide theirs.
                "[&::-webkit-search-cancel-button]:appearance-none",
              )}
            />
            {search !== "" && (
              <button
                type="button"
                onClick={() => {
                  onSearchChange("");
                  searchInputRef.current?.focus();
                }}
                className={clsx(
                  "focus-ring absolute right-1 flex h-8 w-8 items-center justify-center",
                  "rounded-control text-content-muted hover:text-content-primary",
                )}
              >
                <span className="sr-only">Clear search</span>
                <span aria-hidden="true" className="text-base leading-none">
                  ×
                </span>
              </button>
            )}
          </div>

          {searchFields && searchFields.length > 0 && (
            <div className="relative flex items-center border-l border-line">
              <label htmlFor={`${id}-field`} className="sr-only">
                Search in which column
              </label>
              <select
                id={`${id}-field`}
                value={searchField}
                onChange={(e) => onSearchFieldChange?.(e.target.value)}
                className={clsx(
                  "focus-ring min-h-touch cursor-pointer appearance-none rounded-r-container",
                  "bg-transparent py-2 pl-3 pr-7 text-sm font-medium text-content-secondary",
                  "hover:text-content-primary",
                )}
              >
                {searchFields.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-2.5 text-2xs text-content-muted"
              >
                ▾
              </span>
            </div>
          )}
        </div>

        {/* ── Filter popover ─────────────────────────────────────────────── */}
        {filters && (
          <div className="relative">
            <button
              ref={filterTriggerRef}
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              aria-expanded={filtersOpen}
              aria-haspopup="dialog"
              aria-controls={filtersOpen ? `${id}-filters` : undefined}
              className={clsx(
                "focus-ring flex min-h-touch items-center gap-2 rounded-control border px-3",
                "text-sm font-medium transition-colors",
                activeFilterCount > 0
                  ? "border-accent-300 bg-accent-50 text-accent-700"
                  : "border-line bg-surface-1 text-content-secondary hover:text-content-primary",
              )}
            >
              <FilterIcon />
              Filter
              {activeFilterCount > 0 && (
                <>
                  <span aria-hidden="true" className="text-content-muted">
                    ·
                  </span>
                  <span className="tnum" aria-hidden="true">
                    {activeFilterCount}
                  </span>
                  {/* The badge reads as a bare number otherwise. */}
                  <span className="sr-only">
                    ({activeFilterCount} active {activeFilterCount === 1 ? "filter" : "filters"})
                  </span>
                </>
              )}
            </button>

            {filtersOpen && (
              <div
                ref={popoverRef}
                id={`${id}-filters`}
                role="dialog"
                aria-label="Filters"
                aria-modal="false"
                className={clsx(
                  "absolute right-0 z-30 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-container",
                  "border border-line bg-surface-1 p-4 shadow-popover",
                )}
              >
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-content-primary">Filters</h2>
                  <button
                    type="button"
                    onClick={() => closeFilters()}
                    className="focus-ring rounded-control p-1 text-content-muted hover:text-content-primary"
                  >
                    <span className="sr-only">Close filters</span>
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
                <div className="flex flex-col gap-3">{filters}</div>
                {onReset && (
                  <div className="mt-4 flex justify-end border-t border-line-subtle pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        onReset();
                        closeFilters();
                      }}
                      disabled={!canReset}
                      className={clsx(
                        "focus-ring min-h-touch rounded-control px-3 text-sm font-medium",
                        "text-content-secondary hover:text-content-primary",
                        "disabled:cursor-not-allowed disabled:opacity-40",
                      )}
                    >
                      Reset all
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Reset ──────────────────────────────────────────────────────── */}
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            disabled={!canReset}
            className={clsx(
              "focus-ring min-h-touch rounded-control border border-line bg-surface-1 px-3",
              "text-sm font-medium text-content-secondary",
              "hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            Reset
          </button>
        )}

        {trailing && <div className="ml-auto flex items-center gap-2">{trailing}</div>}
      </div>

      {/* ── Result count ─────────────────────────────────────────────────── */}
      <p
        id={`${id}-count`}
        aria-live="polite"
        className="min-h-[1.25rem] text-xs text-content-secondary tnum"
      >
        {loading
          ? "Loading…"
          : showCount
            ? [
                typeof totalCount === "number" && totalCount !== resultCount
                  ? `${resultCount} of ${totalCount} results`
                  : `${resultCount} ${resultCount === 1 ? "result" : "results"}`,
                search && scopeLabel && searchField !== "all" ? `in ${scopeLabel}` : null,
              ]
                .filter(Boolean)
                .join(" ")
            : ""}
      </p>
    </div>
  );
}
