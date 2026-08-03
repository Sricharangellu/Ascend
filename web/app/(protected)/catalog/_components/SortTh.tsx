"use client";

import { clsx } from "clsx";

export function SortTh({
  col, label, cur, dir, onSort, right = false,
}: {
  col: string; label: string; cur: string; dir: "asc" | "desc";
  onSort: (c: string) => void; right?: boolean;
}) {
  const active = cur === col;
  return (
    <th
      onClick={() => onSort(col)}
      className={clsx(
        "cursor-pointer select-none px-4 py-3 hover:text-slate-800",
        right && "text-right",
      )}
    >
      <span className={clsx("inline-flex items-center gap-0.5", right && "w-full justify-end")}>
        {label}
        <span className={clsx("text-[10px]", active ? "text-brand-600" : "text-slate-300")}>
          {active ? (dir === "asc" ? "▲" : "▼") : "⇅"}
        </span>
      </span>
    </th>
  );
}
