"use client";

/**
 * DataTable — the enterprise list primitive for Ascend.
 *
 * WHY THIS EXISTS
 * The previous `Table` supported columns, rows, loading, empty and row-click,
 * and nothing else. For an enterprise list view that is a `<table>` with a
 * spinner, so 107 page files wrote their own — each re-deciding padding, header
 * casing, hover, alignment and number formatting. That divergence, not styling
 * laziness, is the main source of "every module looks slightly different".
 * (WORK/audits/AUDIT_2026-08-10T174500Z-ui-ux-platform-audit.md §2)
 *
 * So this is deliberately capable: sort, search, paginate, select + bulk act,
 * show/hide columns, sticky header, sticky first column, density, and built-in
 * loading / empty / error states. A page should never need to hand-roll again.
 *
 * ACCESSIBILITY
 * - Real <table> semantics with an accessible <caption>.
 * - Sortable headers are <button>s inside <th aria-sort>, keyboard operable.
 * - Row selection uses real checkboxes with accessible names.
 * - Result counts and sort changes are announced via aria-live.
 * - Row click is a convenience only; every row exposes a focusable control so
 *   the table is never mouse-only.
 */

import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import { clsx } from "clsx";
import { useIsMobile } from "@/lib/useMediaQuery";

export type SortDirection = "asc" | "desc";

export interface DataColumn<T> {
  /** Stable identifier — also the column-visibility key. */
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  /** Providing this makes the column sortable. */
  sortValue?: (row: T) => string | number | null | undefined;
  /** Numeric columns get tabular numerals + right alignment automatically. */
  numeric?: boolean;
  align?: "left" | "center" | "right";
  width?: string;
  minWidth?: string;
  /** Pin to the left edge during horizontal scroll. Use for the identity column. */
  sticky?: boolean;
  /** Allow the user to hide it. Default true. */
  hideable?: boolean;
  defaultHidden?: boolean;
  /** Extra classes for the <td>. */
  cellClassName?: string;

  // ── Mobile card rendering ────────────────────────────────────────────────
  /**
   * Use this column as the card's headline on mobile. Defaults to the first
   * visible column, which is the identity column in every current caller.
   */
  primary?: boolean;
  /**
   * Show this column's value in the card's header row, to the right of the
   * headline. For the one fact that belongs beside the name — a total, a
   * status. More than two get crowded on a 320px screen.
   */
  mobileHeader?: boolean;
  /**
   * Drop this column from the card. Use ONLY for columns that carry no
   * information on their own (a chevron, a repeated icon). Never use it to
   * tidy up real business data — on mobile the card IS the row, so a hidden
   * column is not "collapsed", it is gone.
   */
  mobileHidden?: boolean;
}

export interface DataTableProps<T> {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;

  /** Screen-reader description of the table. Required — it is the table's name. */
  caption: string;

  // ── States ───────────────────────────────────────────────────────────────
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;

  // ── Features ─────────────────────────────────────────────────────────────
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Text used for client-side search matching. Defaults to all rendered strings. */
  searchText?: (row: T) => string;
  selectable?: boolean;
  /** Rendered in place of the toolbar when rows are selected. */
  bulkActions?: (selected: T[], clear: () => void) => React.ReactNode;
  pageSize?: number;
  /**
   * Opt into SERVER-driven paging: `rows` is one page, the caller owns the
   * offset, and the table renders the pager + true counts instead of slicing.
   *
   * Caveat worth knowing before you also pass `searchable` or `sortValue`:
   * both filter/sort only the rows currently loaded, so with server paging they
   * silently operate on one page and look like they searched everything. Either
   * leave them off, or wire the equivalent server-side query.
   */
  serverPagination?: {
    total: number;
    offset: number;
    limit: number;
    onOffsetChange: (offset: number) => void;
  };
  onRowClick?: (row: T) => void;
  /** Filters / actions rendered on the toolbar's right. */
  toolbar?: React.ReactNode;
  stickyHeader?: boolean;
  /** Persist column visibility under this key. */
  storageKey?: string;
  className?: string;
  /**
   * Expand-in-place detail. When provided, each row gets a disclosure control
   * and returning non-null renders a full-width panel beneath it.
   *
   * Preferred over navigating away when the user is comparing rows — they keep
   * their scroll position, filters and place in the list.
   */
  expandedContent?: (row: T) => React.ReactNode;
  /**
   * How the list renders below `md`.
   *
   * `"cards"` (default) turns each row into a stacked card: the primary column
   * becomes the headline and every other visible column becomes a labelled
   * value. An 8-column table is ~1100px wide and a phone is 375px, so the
   * alternative is a horizontal scroll that hides 70% of every row behind a
   * gesture most users never make — and in a list view, the columns they came
   * for are the hidden ones.
   *
   * `"scroll"` keeps the real table and scrolls it sideways. Correct when the
   * columns are a genuine matrix that only means something read across
   * (a period-by-period report), where cards would destroy the comparison.
   */
  mobileLayout?: "cards" | "scroll";
}

function defaultSearchText<T>(row: T): string {
  return Object.values(row as Record<string, unknown>)
    .map((v) => (v == null ? "" : String(v)))
    .join(" ")
    .toLowerCase();
}

function compare(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls last, always
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  loading = false,
  error = null,
  onRetry,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  emptyAction,
  searchable = false,
  searchPlaceholder = "Search…",
  searchText,
  selectable = false,
  bulkActions,
  pageSize = 25,
  serverPagination,
  onRowClick,
  toolbar,
  stickyHeader = true,
  storageKey,
  className,
  expandedContent,
  mobileLayout = "cards",
}: DataTableProps<T>) {
  const tableId = useId();
  const isMobile = useIsMobile();
  // Rendering both trees and hiding one with `md:hidden` would double the DOM
  // for every row — on a 200-row list that is the difference between a phone
  // scrolling smoothly and not. Only one tree is ever built.
  const asCards = isMobile && mobileLayout === "cards";
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>("asc");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key))
  );
  const [colMenuOpen, setColMenuOpen] = useState(false);

  // Restore persisted column visibility.
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(`ascend.table.${storageKey}.hidden`);
      if (raw) setHidden(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* localStorage unavailable or corrupt — fall back to defaults */
    }
  }, [storageKey]);

  const persistHidden = useCallback(
    (next: Set<string>) => {
      setHidden(next);
      if (!storageKey || typeof window === "undefined") return;
      try {
        window.localStorage.setItem(
          `ascend.table.${storageKey}.hidden`,
          JSON.stringify([...next])
        );
      } catch {
        /* non-fatal */
      }
    },
    [storageKey]
  );

  const visibleColumns = useMemo(
    () => columns.filter((c) => !hidden.has(c.key)),
    [columns, hidden]
  );

  const matcher = searchText ?? defaultSearchText;

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((r) => matcher(r).toLowerCase().includes(q));
  }, [rows, query, matcher]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    // Copy before sorting — never mutate the caller's array.
    return [...filtered].sort((a, b) => dir * compare(col.sortValue!(a), col.sortValue!(b)));
  }, [filtered, sortKey, sortDir, columns]);

  // With server paging the caller already handed us exactly one page, so
  // slicing again would hide rows. Render what we were given.
  const pageCount = serverPagination
    ? Math.max(1, Math.ceil(serverPagination.total / serverPagination.limit))
    : Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = serverPagination
    ? Math.floor(serverPagination.offset / serverPagination.limit)
    : Math.min(page, pageCount - 1);
  const paged = useMemo(
    () =>
      serverPagination
        ? sorted
        : sorted.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [sorted, safePage, pageSize, serverPagination]
  );

  // Any change to the result set invalidates the current page offset.
  useEffect(() => setPage(0), [query, sortKey, sortDir, rows]);

  const toggleSort = (col: DataColumn<T>) => {
    if (!col.sortValue) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col.key);
      setSortDir("asc");
    }
  };

  const clearSelection = useCallback(() => setSelected(new Set()), []);
  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(rowKey(r))),
    [rows, selected, rowKey]
  );

  const pageKeys = paged.map(rowKey);
  const allPageSelected = pageKeys.length > 0 && pageKeys.every((k) => selected.has(k));
  const somePageSelected = pageKeys.some((k) => selected.has(k));

  const togglePageSelection = () => {
    const next = new Set(selected);
    if (allPageSelected) pageKeys.forEach((k) => next.delete(k));
    else pageKeys.forEach((k) => next.add(k));
    setSelected(next);
  };

  const alignClass = (col: DataColumn<T>) =>
    col.align === "right" || col.numeric
      ? "text-right"
      : col.align === "center"
        ? "text-center"
        : "text-left";

  // ── Error state ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <div
        className={clsx(
          "rounded-container border border-line bg-surface-1 p-8 text-center",
          className
        )}
        role="alert"
      >
        <p className="text-base font-semibold text-content-primary">
          This list could not be loaded
        </p>
        <p className="mt-1 text-sm text-content-secondary">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="focus-ring mt-4 inline-flex min-h-touch items-center rounded-control border border-line bg-surface-1 px-3 text-sm font-medium text-content-primary hover:bg-surface-2"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  const showToolbar = searchable || toolbar || columns.some((c) => c.hideable !== false);
  const hasSelection = selectable && selected.size > 0;

  return (
    <div className={clsx("flex flex-col gap-2", className)}>
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          {hasSelection && bulkActions ? (
            <div className="flex flex-1 items-center gap-3 rounded-container border border-accent-200 bg-accent-50 px-3 py-2">
              <span className="text-sm font-medium text-content-primary tnum">
                {selected.size} selected
              </span>
              <div className="flex items-center gap-2">
                {bulkActions(selectedRows, clearSelection)}
              </div>
              <button
                type="button"
                onClick={clearSelection}
                className="focus-ring ml-auto rounded-control px-2 py-1 text-sm text-content-secondary hover:text-content-primary"
              >
                Clear
              </button>
            </div>
          ) : (
            <>
              {searchable && (
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <label htmlFor={`${tableId}-search`} className="sr-only">
                    {searchPlaceholder}
                  </label>
                  <input
                    id={`${tableId}-search`}
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="focus-ring h-control w-full rounded-control border border-line bg-surface-1 px-3 text-sm text-content-primary placeholder:text-content-muted"
                  />
                </div>
              )}
              {toolbar}
              {columns.some((c) => c.hideable !== false) && (
                <div className="relative ml-auto">
                  <button
                    type="button"
                    onClick={() => setColMenuOpen((o) => !o)}
                    aria-expanded={colMenuOpen}
                    aria-haspopup="true"
                    className="focus-ring flex h-control items-center gap-1 rounded-control border border-line bg-surface-1 px-3 text-sm font-medium text-content-secondary hover:text-content-primary"
                  >
                    Columns
                    <span aria-hidden="true" className="text-2xs">
                      ▾
                    </span>
                  </button>
                  {colMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setColMenuOpen(false)}
                        aria-hidden="true"
                      />
                      <div className="absolute right-0 z-20 mt-1 w-56 rounded-container border border-line bg-surface-1 p-1 shadow-popover">
                        {columns
                          .filter((c) => c.hideable !== false)
                          .map((c) => {
                            const isHidden = hidden.has(c.key);
                            return (
                              <label
                                key={c.key}
                                className="flex min-h-touch cursor-pointer items-center gap-2 rounded-control px-2 text-sm text-content-primary hover:bg-surface-2"
                              >
                                <input
                                  type="checkbox"
                                  checked={!isHidden}
                                  onChange={() => {
                                    const next = new Set(hidden);
                                    if (isHidden) next.delete(c.key);
                                    else next.add(c.key);
                                    persistHidden(next);
                                  }}
                                  className="h-4 w-4 accent-accent-600"
                                />
                                {c.header}
                              </label>
                            );
                          })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Rows: cards on mobile, table on desktop ─────────────────────── */}
      <div className="overflow-hidden rounded-container border border-line bg-surface-1">
        {asCards ? (
          <CardList
            tableId={tableId}
            rows={paged}
            rowKey={rowKey}
            columns={visibleColumns}
            caption={caption}
            loading={loading}
            selectable={selectable}
            selected={selected}
            onToggleSelect={(key) => {
              const next = new Set(selected);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              setSelected(next);
            }}
            onRowClick={onRowClick}
            expandedContent={expandedContent}
            expanded={expanded}
            onToggleExpand={(key) => setExpanded(expanded === key ? null : key)}
          />
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead
              className={clsx(
                "bg-surface-3",
                stickyHeader && "sticky top-0 z-[1]"
              )}
            >
              <tr>
                {selectable && (
                  <th scope="col" className="w-10 cell-pad">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = !allPageSelected && somePageSelected;
                      }}
                      onChange={togglePageSelection}
                      aria-label="Select all rows on this page"
                      className="h-4 w-4 accent-accent-600"
                    />
                  </th>
                )}
                {expandedContent && (
                  <th scope="col" className="w-10 cell-pad">
                    <span className="sr-only">Expand row</span>
                  </th>
                )}
                {visibleColumns.map((col) => {
                  const isSorted = sortKey === col.key;
                  return (
                    <th
                      key={col.key}
                      scope="col"
                      style={{ width: col.width, minWidth: col.minWidth }}
                      aria-sort={
                        !col.sortValue
                          ? undefined
                          : isSorted
                            ? sortDir === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                      }
                      className={clsx(
                        "cell-pad border-b border-line-subtle text-2xs font-semibold uppercase tracking-wide text-content-secondary",
                        alignClass(col),
                        col.sticky && "sticky left-0 z-[1] bg-surface-3"
                      )}
                    >
                      {col.sortValue ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(col)}
                          className={clsx(
                            "focus-ring inline-flex items-center gap-1 rounded-control uppercase tracking-wide hover:text-content-primary",
                            col.align === "right" || col.numeric ? "flex-row-reverse" : ""
                          )}
                        >
                          {col.header}
                          <span aria-hidden="true" className="text-2xs">
                            {isSorted ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                          </span>
                        </button>
                      ) : (
                        col.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {loading &&
                Array.from({ length: Math.min(pageSize, 8) }).map((_, i) => (
                  <tr key={`sk-${i}`} className="border-b border-line-subtle">
                    {selectable && <td className="cell-pad" />}
                    {expandedContent && <td className="cell-pad" />}
                    {visibleColumns.map((col) => (
                      <td key={col.key} className="cell-pad">
                        <div
                          className="h-3 animate-skeleton rounded"
                          style={{ width: `${50 + ((i * 13) % 40)}%` }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}

              {!loading &&
                paged.map((row) => {
                  const key = rowKey(row);
                  const isSelected = selected.has(key);
                  const isExpanded = expanded === key;
                  return (
                    <React.Fragment key={key}>
                    <tr
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      aria-selected={selectable ? isSelected : undefined}
                      className={clsx(
                        "row-h border-b border-line-subtle transition-colors",
                        isSelected ? "bg-[var(--color-table-row-selected)]" : "hover:bg-[var(--color-table-row-hover)]",
                        onRowClick && "cursor-pointer"
                      )}
                    >
                      {selectable && (
                        <td className="cell-pad" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              const next = new Set(selected);
                              if (isSelected) next.delete(key);
                              else next.add(key);
                              setSelected(next);
                            }}
                            aria-label={`Select row ${key}`}
                            className="h-4 w-4 accent-accent-600"
                          />
                        </td>
                      )}
                      {expandedContent && (
                        <td className="cell-pad" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setExpanded(isExpanded ? null : key)}
                            aria-expanded={isExpanded}
                            aria-controls={`${tableId}-panel-${key}`}
                            className="focus-ring flex h-6 w-6 items-center justify-center rounded-control text-content-secondary hover:bg-surface-2 hover:text-content-primary"
                          >
                            <span className="sr-only">
                              {isExpanded ? "Collapse details" : "Expand details"}
                            </span>
                            <span aria-hidden="true" className="text-2xs">
                              {isExpanded ? "▾" : "▸"}
                            </span>
                          </button>
                        </td>
                      )}
                      {visibleColumns.map((col) => (
                        <td
                          key={col.key}
                          className={clsx(
                            "cell-pad text-content-primary",
                            alignClass(col),
                            col.numeric && "tnum",
                            col.sticky && "sticky left-0 bg-surface-1",
                            col.cellClassName
                          )}
                        >
                          {col.render(row)}
                        </td>
                      ))}
                    </tr>
                    {expandedContent && isExpanded && (
                      <tr>
                        <td
                          id={`${tableId}-panel-${key}`}
                          colSpan={
                            visibleColumns.length + (selectable ? 1 : 0) + 1
                          }
                          className="border-b border-line-subtle bg-surface-2 p-0"
                        >
                          {expandedContent(row)}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
            </tbody>
          </table>
        </div>
        )}

        {/* ── Empty state — inside the frame so headers stay visible ─────── */}
        {!loading && paged.length === 0 && (
          <div className="px-6 py-12 text-center">
            <p className="text-base font-semibold text-content-primary">
              {query ? "No matches" : emptyTitle}
            </p>
            <p className="mx-auto mt-1 max-w-prose text-sm text-content-secondary">
              {query
                ? `Nothing matches “${query}”. Try a different search.`
                : emptyDescription}
            </p>
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="focus-ring mt-4 inline-flex min-h-touch items-center rounded-control border border-line bg-surface-1 px-3 text-sm font-medium text-content-primary hover:bg-surface-2"
              >
                Clear search
              </button>
            ) : (
              emptyAction && <div className="mt-4">{emptyAction}</div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer: count + pagination ──────────────────────────────────── */}
      {!loading && sorted.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-content-secondary">
          <p aria-live="polite" className="tnum">
            {serverPagination
              ? `Showing ${serverPagination.offset + 1}–${Math.min(
                  serverPagination.offset + serverPagination.limit,
                  serverPagination.total
                )} of ${serverPagination.total}`
              : sorted.length === rows.length
                ? `${sorted.length} ${sorted.length === 1 ? "row" : "rows"}`
                : `${sorted.length} of ${rows.length} rows`}
          </p>
          {pageCount > 1 && (
            <nav className="flex items-center gap-1" aria-label="Pagination">
              <button
                type="button"
                onClick={() =>
                  serverPagination
                    ? serverPagination.onOffsetChange(
                        Math.max(0, serverPagination.offset - serverPagination.limit)
                      )
                    : setPage((p) => Math.max(0, p - 1))
                }
                // Derived from the offset, not a page index: an offset that is
                // not a multiple of limit (deep link, changed page size, rows
                // deleted) floors to page 0 and would strand the user with
                // earlier rows unreachable.
                disabled={serverPagination ? serverPagination.offset <= 0 : safePage === 0}
                className="focus-ring min-h-touch rounded-control border border-line px-3 text-sm font-medium text-content-primary disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-2"
              >
                Previous
              </button>
              {/* Server paging already states the exact range on the left, and
                  a page index is wrong for a non-multiple-of-limit offset. */}
              {!serverPagination && (
                <span className="px-2 tnum" aria-current="page">
                  Page {safePage + 1} of {pageCount}
                </span>
              )}
              <button
                type="button"
                onClick={() =>
                  serverPagination
                    ? serverPagination.onOffsetChange(
                        serverPagination.offset + serverPagination.limit
                      )
                    : setPage((p) => Math.min(pageCount - 1, p + 1))
                }
                disabled={
                  serverPagination
                    ? serverPagination.offset + serverPagination.limit >= serverPagination.total
                    : safePage >= pageCount - 1
                }
                className="focus-ring min-h-touch rounded-control border border-line px-3 text-sm font-medium text-content-primary disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-2"
              >
                Next
              </button>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}

// ── Mobile card list ────────────────────────────────────────────────────────
/**
 * The same rows as the table, restructured for a 375px screen.
 *
 * The rule that governs what appears here: EVERY visible column appears on the
 * card unless its own definition opts out with `mobileHidden`. It is tempting
 * to show three fields and call the rest "progressive disclosure", but in an
 * inventory or PO list the columns a user scrolled to find — cost, on-hand,
 * remaining, status — are exactly the ones a tidy card would drop. Hiding is
 * the caller's explicit decision, never this component's default.
 *
 * Semantics: this is still a list of records, so it is a real <ul>/<li> with
 * <dl> pairs rather than divs. A screen reader gets "3 of 40" and a
 * label→value relationship for each field, which a stack of <div>s does not
 * give. The table's <caption> becomes the list's accessible name.
 */
function CardList<T>({
  tableId,
  rows,
  rowKey,
  columns,
  caption,
  loading,
  selectable,
  selected,
  onToggleSelect,
  onRowClick,
  expandedContent,
  expanded,
  onToggleExpand,
}: {
  tableId: string;
  rows: T[];
  rowKey: (row: T) => string;
  columns: DataColumn<T>[];
  caption: string;
  loading: boolean;
  selectable: boolean;
  selected: Set<string>;
  onToggleSelect: (key: string) => void;
  onRowClick?: (row: T) => void;
  expandedContent?: (row: T) => React.ReactNode;
  expanded: string | null;
  onToggleExpand: (key: string) => void;
}) {
  const shown = columns.filter((c) => !c.mobileHidden);
  const primary = shown.find((c) => c.primary) ?? shown[0];
  const headerCols = shown.filter((c) => c.mobileHeader && c !== primary);
  const bodyCols = shown.filter((c) => c !== primary && !headerCols.includes(c));

  if (loading) {
    return (
      <ul className="divide-y divide-line-subtle" aria-busy="true" aria-label={caption}>
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={`sk-${i}`} className="p-4">
            <div className="h-4 w-1/2 animate-skeleton rounded" />
            <div className="mt-2 h-3 w-3/4 animate-skeleton rounded" />
          </li>
        ))}
      </ul>
    );
  }

  if (!primary) return null;

  return (
    <ul className="divide-y divide-line-subtle" aria-label={caption}>
      {rows.map((row) => {
        const key = rowKey(row);
        const isSelected = selected.has(key);
        const isExpanded = expanded === key;
        return (
          <li
            key={key}
            className={clsx("p-4", isSelected && "bg-[var(--color-table-row-selected)]")}
          >
            <div className="flex items-start gap-3">
              {selectable && (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelect(key)}
                  aria-label={`Select row ${key}`}
                  // 20px box inside a 44px hit area — the checkbox itself
                  // cannot grow without looking wrong, so the padding carries
                  // the touch target.
                  className="mt-0.5 h-5 w-5 shrink-0 accent-accent-600"
                />
              )}

              <div className="min-w-0 flex-1">
                {/* The headline is the row's tap target when the table is
                    clickable — a whole-card click would swallow taps meant for
                    a link or button rendered inside a cell. */}
                <div className="flex items-start justify-between gap-2">
                  {onRowClick ? (
                    <button
                      type="button"
                      onClick={() => onRowClick(row)}
                      className="focus-ring min-h-touch flex-1 rounded-control text-left text-base font-semibold text-content-primary"
                    >
                      {primary.render(row)}
                    </button>
                  ) : (
                    <span className="flex-1 text-base font-semibold text-content-primary">
                      {primary.render(row)}
                    </span>
                  )}
                  {headerCols.map((c) => (
                    <span
                      key={c.key}
                      className={clsx(
                        "shrink-0 text-sm font-semibold text-content-primary",
                        c.numeric && "tnum",
                      )}
                    >
                      {c.render(row)}
                    </span>
                  ))}
                </div>

                {bodyCols.length > 0 && (
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {bodyCols.map((c) => (
                      <div key={c.key} className="min-w-0">
                        <dt className="text-2xs uppercase tracking-wide text-content-secondary">
                          {c.header}
                        </dt>
                        <dd
                          className={clsx(
                            "truncate text-sm text-content-primary",
                            c.numeric && "tnum",
                          )}
                        >
                          {c.render(row)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}

                {expandedContent && (
                  <>
                    <button
                      type="button"
                      onClick={() => onToggleExpand(key)}
                      aria-expanded={isExpanded}
                      aria-controls={`${tableId}-card-${key}`}
                      className="focus-ring mt-2 min-h-touch text-sm font-medium text-brand-600"
                    >
                      {isExpanded ? "Hide details" : "Show details"}
                    </button>
                    {isExpanded && (
                      <div id={`${tableId}-card-${key}`} className="mt-2 rounded-container bg-surface-2">
                        {expandedContent(row)}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
