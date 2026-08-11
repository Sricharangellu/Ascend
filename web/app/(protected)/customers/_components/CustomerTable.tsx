"use client";

/**
 * CustomerTable — the customers list.
 *
 * Migrated to the design system 2026-08-10. Three buttons were removed rather
 * than restyled, because none of them did anything:
 *   - "Search" had no handler, and the filter is already live as you type — so
 *     it implied results were stale until clicked, which was never true.
 *   - "More filters" had no handler and no additional filters behind it.
 *   - "Export" had no handler.
 * A control that looks actionable and does nothing is worse than an absent one:
 * the user blames themselves. Export is a real need — it belongs on DataTable
 * once there is an endpoint behind it, not as a decorative icon here.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { DataTable, type DataColumn } from "@/components/DataTable";
import { Badge } from "@/components/Badge";
import { ListControls, FilterField, filterControlClass, type ListSearchField } from "@/components/ListControls";
import { formatMoney } from "@/lib/money";
import { CustomerDetailPanel } from "./CustomerDetailPanel";
import type { CustomerView } from "./CustomerDetailPanel";

/**
 * Identity colours for avatars. These are deliberately NOT semantic tokens —
 * they carry no meaning, they only need to be distinguishable from each other.
 * Every value is ≥4.5:1 against white text (the previous set included #EAB308,
 * which is 1.9:1 with white on it and was effectively unreadable).
 */
const AVATAR_COLORS = [
  "#B54708", // orange
  "#175CD3", // blue
  "#6941C6", // purple
  "#067647", // green
  "#C11574", // pink
  "#0E7090", // cyan
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function avatarColor(name: string): string {
  return AVATAR_COLORS[hash(name) % AVATAR_COLORS.length]!;
}

function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0] ?? "").slice(0, 2).toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

function customerCode(id: string, name: string): string {
  const slug = (name.split(" ")[0] ?? "Customer").replace(/[^a-zA-Z]/g, "");
  return `${slug}-${String(hash(id) % 10000).padStart(4, "0")}`;
}

type SegmentFilter = "All" | "Loyal" | "Regular" | "New" | "At risk";

const SEGMENT_OPTIONS = [
  { value: "All", label: "All groups" },
  { value: "Loyal", label: "Loyal" },
  { value: "Regular", label: "Regular" },
  { value: "New", label: "New" },
  { value: "At risk", label: "At risk" },
];

/** Segment → Badge variant. Colour is never the only signal — the label ships with it. */
const SEGMENT_VARIANT: Record<CustomerView["segment"], "green" | "blue" | "yellow" | "gray"> = {
  Loyal: "green",
  New: "blue",
  "At risk": "yellow",
  Regular: "gray",
};

interface Props {
  customers: CustomerView[];
  loading: boolean;
  error: string | null;
}

/**
 * Columns a customer search can be scoped to.
 *
 * This list filters an already-loaded set in the browser, so unlike the catalog
 * these values map to fields compared here rather than to a query parameter.
 * That is honest as long as the whole set is loaded — the moment this list is
 * paginated server-side, these must become real query parameters or the scope
 * will silently mean "within this page".
 */
const SEARCH_FIELDS: ListSearchField[] = [
  { value: "all", label: "All columns" },
  { value: "name", label: "Name" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "code", label: "Customer code" },
];

export function CustomerTable({ customers, loading, error }: Props) {
  const [query, setQuery] = useState("");
  const [searchField, setSearchField] = useState("all");
  const [groupFilter, setGroupFilter] = useState<SegmentFilter>("All");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((c) => {
      const fields: Record<string, string> = {
        name: c.name,
        email: c.email ?? "",
        phone: c.phone ?? "",
        code: customerCode(c.id, c.name),
      };
      const haystack =
        searchField === "all" ? Object.values(fields) : [fields[searchField] ?? ""];
      const matchQ = !q || haystack.some((v) => v.toLowerCase().includes(q));
      return matchQ && (groupFilter === "All" || c.segment === groupFilter);
    });
  }, [customers, query, searchField, groupFilter]);

  const filtersActive = query.trim() !== "" || groupFilter !== "All" || searchField !== "all";

  const reset = () => {
    setQuery("");
    setSearchField("all");
    setGroupFilter("All");
  };

  const columns = useMemo<DataColumn<CustomerView>[]>(
    () => [
      {
        key: "customer",
        header: "Customer",
        hideable: false,
        minWidth: "260px",
        sortValue: (c) => c.name,
        render: (c) => (
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-2xs font-bold text-white"
              style={{ backgroundColor: avatarColor(c.name) }}
            >
              {avatarInitials(c.name)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-content-primary">{c.name}</span>
                <Badge variant={SEGMENT_VARIANT[c.segment]}>{c.segment}</Badge>
              </div>
              <div className="mt-0.5 text-xs text-content-secondary tnum">
                {customerCode(c.id, c.name)}
                {c.phone ? ` · ${c.phone}` : ""}
              </div>
            </div>
          </div>
        ),
      },
      {
        key: "loyalty",
        header: "Loyalty",
        numeric: true,
        minWidth: "110px",
        sortValue: (c) => c.loyaltyPoints,
        render: (c) => (
          <>
            <span className="font-medium text-content-primary">
              {c.loyaltyPoints.toLocaleString()}
            </span>
            <span className="ml-1 text-xs text-content-secondary">pts</span>
          </>
        ),
      },
      {
        key: "spend",
        header: "Lifetime spend",
        numeric: true,
        minWidth: "140px",
        sortValue: (c) => c.spendCents,
        render: (c) => (
          <span className="font-medium text-content-primary">{formatMoney(c.spendCents)}</span>
        ),
      },
      {
        key: "open",
        header: "",
        hideable: false,
        align: "right",
        width: "56px",
        render: (c) => (
          <Link
            href={`/customers/${encodeURIComponent(c.id)}`}
            aria-label={`Open ${c.name}`}
            onClick={(e) => e.stopPropagation()}
            className="focus-ring inline-flex min-h-touch min-w-touch items-center justify-center rounded-control text-content-secondary hover:text-accent-600"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
          </Link>
        ),
      },
    ],
    []
  );

  return (
    <div className="flex flex-col gap-4">
      {/* The shared list bar. Live — there is no submit step, so no submit button. */}
      <div className="rounded-container border border-line bg-surface-1 p-4">
        <ListControls
          search={query}
          onSearchChange={setQuery}
          searchPlaceholder="Search customers by name, email, phone, code…"
          searchLabel="Search customers"
          searchFields={SEARCH_FIELDS}
          searchField={searchField}
          onSearchFieldChange={setSearchField}
          activeFilterCount={groupFilter !== "All" ? 1 : 0}
          onReset={reset}
          canReset={filtersActive}
          resultCount={visible.length}
          totalCount={customers.length}
          loading={loading}
          filters={
            <FilterField label="Customer group" htmlFor="customer-group">
              <select
                id="customer-group"
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value as SegmentFilter)}
                className={filterControlClass}
              >
                {SEGMENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </FilterField>
          }
        />
      </div>

      <DataTable
        caption="Customers"
        columns={columns}
        rows={visible}
        rowKey={(c) => c.id}
        loading={loading}
        error={error}
        storageKey="customers"
        emptyTitle={filtersActive ? "No matching customers" : "No customers yet"}
        emptyDescription={
          filtersActive
            ? "Try clearing the filters — other customers may exist."
            : "Customers are created at checkout, or with Add customer above."
        }
        // Expand in place rather than navigating: the point of this view is
        // comparing customers, and a round trip loses scroll position and filters.
        expandedContent={(c) => <CustomerDetailPanel customer={c} />}
      />
    </div>
  );
}
