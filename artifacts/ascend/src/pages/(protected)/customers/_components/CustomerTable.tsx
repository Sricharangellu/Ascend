
import { Fragment, useMemo, useState } from "react";
import { TableSkeleton } from "@/components/TableSkeleton";
import { Button } from "@/components/Button";
import { formatMoney } from "@/lib/money";
import { CustomerDetailPanel } from "./CustomerDetailPanel";
import type { CustomerView } from "./CustomerDetailPanel";

// ── Helpers ───────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ["#F97316", "#EAB308", "#8B5CF6", "#10B981", "#EC4899", "#3B82F6"];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]!;
}

function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0] ?? "").slice(0, 2).toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

function customerCode(id: string, name: string): string {
  const slug = (name.split(" ")[0] ?? "Customer").replace(/[^a-zA-Z]/g, "");
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return `${slug}-${String(Math.abs(h) % 10000).padStart(4, "0")}`;
}

// ── Segment badge ─────────────────────────────────────────────────────────────

function SegmentBadge({ segment }: { segment: CustomerView["segment"] }) {
  const cls =
    segment === "Loyal"   ? "border-success-400 text-success-600 bg-success-50" :
    segment === "New"     ? "border-info-400 text-info-600 bg-info-50" :
    segment === "At risk" ? "border-warning-400 text-warning-600 bg-warning-50" :
    "border-[var(--color-border)] text-[var(--color-text-muted)] bg-[var(--color-surface-subtle)]";
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${cls}`}>
      {segment}
    </span>
  );
}

// ── CustomerTable ─────────────────────────────────────────────────────────────

type SegmentFilter = "All" | "Loyal" | "Regular" | "New" | "At risk";

interface Props {
  customers: CustomerView[];
  loading: boolean;
  error: string | null;
}

export function CustomerTable({ customers, loading, error }: Props) {
  const [query, setQuery]           = useState("");
  const [groupFilter, setGroupFilter] = useState<SegmentFilter>("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((c) => {
      const code = customerCode(c.id, c.name).toLowerCase();
      const matchQ = !q ||
        c.name.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q) ||
        code.includes(q);
      const matchGroup = groupFilter === "All" || c.segment === groupFilter;
      return matchQ && matchGroup;
    });
  }, [customers, query, groupFilter]);

  const ctrlCls = "h-8 rounded-lg border px-3 text-[13px] outline-none transition-all focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500";
  const ctrlStyle = { borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" };

  return (
    <>
      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <div
        className="rounded-xl border p-4"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1 flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--color-text-secondary)" }}>
              Search
            </label>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, phone, or code…"
              className={ctrlCls}
              style={ctrlStyle}
            />
          </div>
          <div className="w-44 flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--color-text-secondary)" }}>
              Customer group
            </label>
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value as SegmentFilter)}
              className={ctrlCls}
              style={ctrlStyle}
            >
              <option value="All">All groups</option>
              <option value="Loyal">Loyal</option>
              <option value="Regular">Regular</option>
              <option value="New">New</option>
              <option value="At risk">At risk</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setQuery(""); setGroupFilter("All"); }}
              className="text-[13px] font-medium text-brand-600 hover:underline"
            >
              Clear
            </button>
            <Button variant="primary" size="sm">Search</Button>
          </div>
        </div>
      </div>

      {/* ── Table card ──────────────────────────────────────────────────── */}
      <div
        className="overflow-hidden rounded-xl border shadow-[var(--shadow-sm)]"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
      >
        {/* Sub-header */}
        <div
          className="flex items-center justify-between border-b px-4 py-2.5"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}
        >
          <span className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
            {visible.length} customer{visible.length !== 1 ? "s" : ""}
          </span>
          <button
            type="button"
            className="flex items-center gap-1.5 text-[13px] font-medium transition-colors hover:text-brand-600"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
        </div>

        {loading ? (
          <TableSkeleton headers={["Customer", "Loyalty", "Account", ""]} rows={8} />
        ) : error ? (
          <div className="p-6 text-[13px]" role="alert" style={{ color: "var(--color-danger-text)" }}>{error}</div>
        ) : visible.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>No customers found.</p>
            <p className="mt-1 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>Try clearing the filters or add a new customer.</p>
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
              <tr>
                <th className="w-10 px-4 py-2.5">
                  <input type="checkbox" className="rounded" aria-label="Select all" />
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em]"
                  style={{ color: "var(--color-text-secondary)" }}>Customer</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em]"
                  style={{ color: "var(--color-text-secondary)" }}>Loyalty</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em]"
                  style={{ color: "var(--color-text-secondary)" }}>Account</th>
                <th className="w-10 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <Fragment key={c.id}>
                  <tr
                    className="cursor-pointer border-b last:border-0 transition-colors duration-75"
                    style={{ borderColor: "var(--color-table-border)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-table-row-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
                    onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="rounded" aria-label={`Select ${c.name}`} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white"
                          style={{ backgroundColor: avatarColor(c.name) }}
                        >
                          {avatarInitials(c.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{c.name}</span>
                            <SegmentBadge segment={c.segment} />
                          </div>
                          <div className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                            {customerCode(c.id, c.name)}{c.phone ? ` · ${c.phone}` : ""}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold tabular-nums" style={{ color: "var(--color-text-primary)" }}>{c.loyaltyPoints.toLocaleString()}</span>
                      <span className="ml-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>pts</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold tabular-nums" style={{ color: "var(--color-text-primary)" }}>{formatMoney(c.spendCents)}</span>
                      <span className="ml-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>lifetime</span>
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        aria-label={`Edit ${c.name}`}
                        className="transition-colors hover:text-brand-600"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    </td>
                  </tr>

                  {expandedId === c.id && (
                    <tr>
                      <td colSpan={5} className="p-0">
                        <CustomerDetailPanel customer={c} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
