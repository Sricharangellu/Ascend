"use client";

import { clsx } from "clsx";

/**
 * A sortable column header.
 *
 * The sort control is a real `<button>` inside the `<th>` rather than a click
 * handler on the cell: a bare `onClick` on a `<th>` cannot be reached by
 * keyboard or announced as actionable, which made the product table sortable by
 * mouse only. `aria-sort` on the header tells a screen reader which column is
 * ordering the table and in which direction.
 *
 * Generic over the column key so callers keep their own union type (e.g.
 * `ProductSort`) instead of widening to `string`.
 */
export function SortTh<T extends string>({
  col, label, cur, dir, onSort, right = false,
}: {
  col: T; label: string; cur: T; dir: "asc" | "desc";
  onSort: (c: T) => void; right?: boolean;
}) {
  const active = cur === col;
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={clsx("px-0 py-0", right && "text-right")}
    >
      <button
        type="button"
        onClick={() => onSort(col)}
        aria-label={`Sort by ${label}${active ? (dir === "asc" ? ", currently ascending" : ", currently descending") : ""}`}
        className={clsx(
          "flex min-h-11 w-full select-none items-center gap-0.5 px-4 py-3 text-left font-semibold uppercase tracking-wider hover:text-slate-800",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600",
          right && "justify-end text-right",
        )}
      >
        {label}
        <span aria-hidden="true" className={clsx("text-[10px]", active ? "text-brand-600" : "text-slate-300")}>
          {active ? (dir === "asc" ? "▲" : "▼") : "⇅"}
        </span>
      </button>
    </th>
  );
}
