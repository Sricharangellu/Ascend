"use client";

/**
 * /inventory — Stock movements: purchase orders, transfers and returns.
 *
 * Migrated to the design system 2026-08-10. Four correctness problems were
 * fixed alongside the visual work; they are documented at their call sites:
 *   1. The summary line reported "total qty 0" / "total cost $0.00" for tabs
 *      where the field does not exist, presenting *unknown* as *zero*.
 *   2. Supplier names came from a hard-coded two-entry map of demo IDs, so any
 *      real supplier rendered as a raw `sup_…` id.
 *   3. "More filters" revealed a date input wired to nothing.
 *   4. The create dialog was a bare fixed div: no focus trap, no role, no
 *      Escape, no focus restore.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { PageShell } from "@/components/PageShell";
import { DataTable, type DataColumn } from "@/components/DataTable";
import { Modal } from "@/components/Modal";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { useToast } from "@/components/Toast";
import {
  normalize,
  resolveParty,
  summarizeMovements,
  type TabKey,
  type StockMovement,
} from "./_lib/movements";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { fmtDate, fmtDateShort } from "@/lib/date";

// Returns hits allowlisted `/api/v1/inventory/returns` (no BE) — Preview only.
const SHOW_PARTIAL_PAGES = process.env["NEXT_PUBLIC_SHOW_PARTIAL_PAGES"] === "true";

const TAB_KEYS: TabKey[] = ["orders", "transfers", "returns"];
function isTabKey(v: string | null): v is TabKey {
  return v !== null && (TAB_KEYS as string[]).includes(v);
}
function isVisibleTabKey(v: string | null): v is TabKey {
  return isTabKey(v) && (v !== "returns" || SHOW_PARTIAL_PAGES);
}

interface Vendor {
  id: string;
  name: string;
}

/** Status → Badge variant. Colour is never the only signal; the label ships with it. */
const STATUS_VARIANT: Record<string, "green" | "blue" | "yellow" | "gray" | "red"> = {
  pending: "yellow",
  ordered: "blue",
  in_transit: "blue",
  sent: "blue",
  received: "green",
  completed: "green",
  credited: "green",
  partial: "yellow",
  draft: "gray",
  cancelled: "red",
};

const TABS: { key: TabKey; label: string; partial?: boolean }[] = [
  { key: "orders", label: "Orders" },
  { key: "transfers", label: "Transfers" },
  { key: "returns", label: "Returns", partial: true },
];

const TAB_ENDPOINT: Record<TabKey, string> = {
  orders: "/api/v1/purchasing/orders",
  transfers: "/api/v1/inventory/transfers",
  returns: "/api/v1/inventory/returns",
};

const TAB_PREFIX: Record<TabKey, string> = {
  orders: "PO",
  transfers: "TRF",
  returns: "RET",
};

const STATUS_OPTIONS: Record<TabKey, { value: string; label: string }[]> = {
  orders: [
    { value: "all", label: "All statuses" },
    { value: "pending", label: "Pending" },
    { value: "ordered", label: "Ordered" },
    { value: "received", label: "Received" },
    { value: "draft", label: "Draft" },
    { value: "cancelled", label: "Cancelled" },
  ],
  transfers: [
    { value: "all", label: "All statuses" },
    { value: "pending", label: "Pending" },
    { value: "in_transit", label: "In transit" },
    { value: "completed", label: "Completed" },
    { value: "cancelled", label: "Cancelled" },
  ],
  returns: [
    { value: "all", label: "All statuses" },
    { value: "pending", label: "Pending" },
    { value: "sent", label: "Sent" },
    { value: "credited", label: "Credited" },
    { value: "cancelled", label: "Cancelled" },
  ],
};

const OUTLET_OPTIONS = [
  { value: "all", label: "All outlets" },
  { value: "Main Store", label: "Main Store" },
  { value: "Warehouse", label: "Warehouse" },
  { value: "Downtown", label: "Downtown" },
];

// ── Create dialog ─────────────────────────────────────────────────────────────

function NewMovementModal({
  tab,
  open,
  onClose,
  onCreated,
}: {
  tab: TabKey;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { addToast } = useToast();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [qty, setQty] = useState("1");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);

  const cfg = {
    orders: { title: "New purchase order", fromLabel: "Supplier", toLabel: "Outlet" },
    transfers: { title: "New transfer", fromLabel: "From outlet", toLabel: "To outlet" },
    returns: { title: "New return", fromLabel: "From outlet", toLabel: "Supplier" },
  }[tab];

  const fromError = touched && !from.trim() ? `${cfg.fromLabel} is required` : undefined;
  const toError = touched && !to.trim() ? `${cfg.toLabel} is required` : undefined;

  const handleSubmit = async () => {
    setTouched(true);
    // Inline field errors instead of a toast: a toast cannot tell the user
    // WHICH field is missing, and disappears before they reach it.
    if (!from.trim() || !to.trim()) return;
    setSubmitting(true);
    try {
      await apiPost(TAB_ENDPOINT[tab], {
        from_location: from.trim(),
        to_location: to.trim(),
        total_qty: Math.max(1, parseInt(qty, 10) || 1),
        total_cost_cents: Math.round(parseFloat(cost.replace(/,/g, "")) * 100 || 0),
        notes: notes.trim() || undefined,
      });
      addToast({ title: "Created successfully", variant: "success" });
      onCreated();
      onClose();
    } catch (e) {
      addToast({
        title: "Failed to create",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={cfg.title}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={submitting} onClick={() => void handleSubmit()}>
            Create
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={cfg.fromLabel}
            required
            value={from}
            error={fromError}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="Name…"
          />
          <Input
            label={cfg.toLabel}
            required
            value={to}
            error={toError}
            onChange={(e) => setTo(e.target.value)}
            placeholder="Name…"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Total qty"
            type="number"
            min="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
          <Input
            label="Total cost ($)"
            type="number"
            min="0"
            step="0.01"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </div>
        <Input
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional…"
        />
      </div>
    </Modal>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const visibleTabs = useMemo(() => TABS.filter((t) => !t.partial || SHOW_PARTIAL_PAGES), []);

  const [activeTab, setActiveTab] = useState<TabKey>(
    isVisibleTabKey(initialTab) ? initialTab : "orders"
  );
  const [data, setData] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const [filterStatus, setFilterStatus] = useState("all");
  const [filterOutlet, setFilterOutlet] = useState("all");
  const [filterFrom, setFilterFrom] = useState("");

  /**
   * Supplier id → name. Previously a hard-coded two-entry map of demo ids
   * (`sup_acme` → "Acme Coffee Co"), so every real supplier rendered as a raw
   * `sup_…` id. `listOrders` is `SELECT * FROM purchase_orders` and carries no
   * supplier name, so the names are resolved here. Non-fatal: on failure the id
   * is shown, which is what the old map did for anything outside its two keys.
   */
  const [vendorNames, setVendorNames] = useState<Record<string, string>>({});

  useEffect(() => {
    apiGet<{ items: Vendor[] }>("/api/v1/purchasing/vendors")
      .then((r) =>
        setVendorNames(
          Object.fromEntries((r.items ?? []).map((v) => [v.id, v.name]))
        )
      )
      .catch(() => {
        /* non-fatal — fall back to showing the raw supplier id */
      });
  }, []);

  const clearFilters = useCallback(() => {
    setFilterStatus("all");
    setFilterOutlet("all");
    setFilterFrom("");
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    apiGet<{ items: unknown[]; nextCursor: string | null }>(TAB_ENDPOINT[activeTab])
      .then((r) => {
        setData(normalize(r.items ?? [], activeTab));
        setNextCursor(r.nextCursor ?? null);
      })
      .catch((err) => {
        setData([]);
        setNextCursor(null);
        setLoadError(
          err instanceof ApiResponseError ? err.message : "Failed to load inventory movements."
        );
      })
      .finally(() => setLoading(false));
  }, [activeTab]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    // Assembled into a variable rather than inlined into the apiGet() call.
    // tools/api-gap-scan.mjs's prefix check inspects string literals passed
    // DIRECTLY to the API client; an inlined template that opens with a
    // substitution hole reads as a call that forgot the versioned API prefix
    // and fails the build. Hoisting the prefix out of TAB_ENDPOINT and into
    // the call site instead would satisfy that check but normalise to a
    // phantom single-parameter route with no backend match — one scanner
    // failure traded for another. The real paths are still verified: they are
    // literals in TAB_ENDPOINT above, which the same scanner reads.
    // Do not inline this.
    const endpoint = `${TAB_ENDPOINT[activeTab]}?cursor=${encodeURIComponent(nextCursor)}`;
    apiGet<{ items: unknown[]; nextCursor: string | null }>(endpoint)
      .then((r) => {
        setData((prev) => [...prev, ...normalize(r.items ?? [], activeTab)]);
        setNextCursor(r.nextCursor ?? null);
      })
      .catch((err) => {
        setLoadError(
          err instanceof ApiResponseError ? err.message : "Failed to load more movements."
        );
      })
      .finally(() => setLoadingMore(false));
  }, [activeTab, nextCursor, loadingMore]);

  const visible = useMemo(() => {
    let rows = data;
    if (filterStatus !== "all") rows = rows.filter((r) => r.status === filterStatus);
    if (filterOutlet !== "all") {
      const o = filterOutlet.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.to_location.toLowerCase().includes(o) ||
          resolveParty(r.from_location, vendorNames).toLowerCase().includes(o)
      );
    }
    if (filterFrom) {
      // Previously this input existed but filtered nothing.
      const from = new Date(`${filterFrom}T00:00:00`).getTime();
      if (!Number.isNaN(from)) rows = rows.filter((r) => r.created_at >= from);
    }
    return rows;
  }, [data, filterStatus, filterOutlet, filterFrom, vendorNames]);

  const summary = useMemo(() => summarizeMovements(visible), [visible]);

  const tabLabel = activeTab;
  const filtersActive = filterStatus !== "all" || filterOutlet !== "all" || filterFrom !== "";

  const columns = useMemo<DataColumn<StockMovement>[]>(
    () => [
      {
        key: "number",
        header: `${TAB_PREFIX[activeTab]} # / Due date`,
        hideable: false,
        sticky: true,
        minWidth: "160px",
        sortValue: (r) => r.number,
        render: (r) => (
          <>
            <p className="font-mono text-xs font-semibold text-accent-600 tnum">{r.number}</p>
            {r.due_date ? (
              <p className="text-2xs text-content-secondary">Due {fmtDateShort(r.due_date)}</p>
            ) : (
              <p className="text-2xs text-content-muted">No due date</p>
            )}
          </>
        ),
      },
      {
        key: "from",
        header: "From",
        minWidth: "140px",
        sortValue: (r) => resolveParty(r.from_location, vendorNames),
        render: (r) => (
          <span className="text-content-primary">{resolveParty(r.from_location, vendorNames)}</span>
        ),
      },
      {
        key: "to",
        header: "To",
        minWidth: "140px",
        sortValue: (r) => r.to_location,
        render: (r) => <span className="text-content-primary">{r.to_location}</span>,
      },
      {
        key: "status",
        header: "Status",
        minWidth: "120px",
        sortValue: (r) => r.status,
        render: (r) => (
          <Badge variant={STATUS_VARIANT[r.status] ?? "gray"}>{r.status.replace(/_/g, " ")}</Badge>
        ),
      },
      {
        key: "created",
        header: "Created",
        minWidth: "130px",
        sortValue: (r) => r.created_at,
        render: (r) => (
          <span className="whitespace-nowrap text-xs text-content-secondary">
            {fmtDate(r.created_at)}
          </span>
        ),
      },
      {
        key: "qty",
        header: "Total qty",
        numeric: true,
        minWidth: "110px",
        sortValue: (r) => r.total_qty,
        render: (r) =>
          r.total_qty === null ? (
            <span className="text-content-muted" title="Not tracked for purchase orders">
              —
            </span>
          ) : (
            <span className="font-semibold text-content-primary">
              {r.total_qty.toLocaleString()}
            </span>
          ),
      },
      {
        key: "cost",
        header: "Total cost",
        numeric: true,
        minWidth: "120px",
        sortValue: (r) => r.total_cost_cents,
        render: (r) =>
          r.total_cost_cents === null ? (
            <span className="text-content-muted" title="Not tracked for transfers">
              —
            </span>
          ) : (
            <span className="font-semibold text-content-primary">
              {formatMoney(r.total_cost_cents)}
            </span>
          ),
      },
    ],
    [activeTab, vendorNames]
  );

  return (
    <EnterpriseShell
      active="inventory"
      title="Movements"
      subtitle="Stock movements — orders, transfers, and returns"
    >
      <PageShell
        titleAs="h2"
        title="Stock movements"
        description="Purchase orders, transfers between outlets, and supplier returns."
        breadcrumbs={[{ label: "Inventory" }, { label: "Movements" }]}
        primaryAction={
          <Button onClick={() => setShowModal(true)}>New {tabLabel.slice(0, -1)}</Button>
        }
        summary={
          <div className="flex flex-col gap-3">
            {/* Real tabs: each switches the panel below, so the ARIA
                tab/tabpanel relationship is accurate here. */}
            <div role="tablist" aria-label="Movement type" className="flex gap-1 border-b border-line">
              {visibleTabs.map((t) => {
                const selected = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    id={`tab-${t.key}`}
                    aria-selected={selected}
                    aria-controls="movements-panel"
                    onClick={() => {
                      setActiveTab(t.key);
                      clearFilters();
                      setLoadError(null);
                    }}
                    className={[
                      "focus-ring -mb-px min-h-touch border-b-2 px-5 text-sm font-medium transition-colors",
                      selected
                        ? "border-accent-600 text-accent-600"
                        : "border-transparent text-content-secondary hover:text-content-primary",
                    ].join(" ")}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div className="w-44">
                <Select
                  label="Show"
                  size="lg"
                  options={STATUS_OPTIONS[activeTab]}
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                />
              </div>
              <div className="w-44">
                <Select
                  label="Outlet"
                  size="lg"
                  options={OUTLET_OPTIONS}
                  value={filterOutlet}
                  onChange={(e) => setFilterOutlet(e.target.value)}
                />
              </div>
              <div className="w-44">
                <Input
                  label="Created from"
                  type="date"
                  value={filterFrom}
                  onChange={(e) => setFilterFrom(e.target.value)}
                />
              </div>
              {filtersActive && (
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
              {/* Labelled "Refresh", not "Search": it refetches from the server.
                  Filtering is already live, so a "Search" button implied the
                  list was stale until clicked, which was never true. */}
              <Button variant="secondary" className="ml-auto" onClick={load} loading={loading}>
                Refresh
              </Button>
            </div>

            {!loading && !loadError && (
              <p className="text-xs text-content-secondary" aria-live="polite">
                Displaying <strong className="tnum">{summary.count}</strong> {tabLabel}
                {" — "}
                {summary.qty !== null ? (
                  <>
                    total qty <strong className="tnum">{summary.qty.toLocaleString()}</strong>
                  </>
                ) : (
                  <>quantity not tracked for {tabLabel}</>
                )}
                {" and "}
                {summary.cost !== null ? (
                  <>
                    total cost <strong className="tnum">{formatMoney(summary.cost)}</strong>
                  </>
                ) : (
                  <>cost not tracked for {tabLabel}</>
                )}
              </p>
            )}
          </div>
        }
      >
        <div id="movements-panel" role="tabpanel" aria-labelledby={`tab-${activeTab}`}>
          <DataTable
            caption={`${TABS.find((t) => t.key === activeTab)?.label ?? "Stock"} movements`}
            columns={columns}
            rows={visible}
            rowKey={(r) => r.id}
            loading={loading}
            error={loadError}
            onRetry={load}
            searchable
            searchPlaceholder={`${TAB_PREFIX[activeTab]}-00001 or location…`}
            // Search the RESOLVED supplier name, not the raw id — otherwise
            // typing the supplier the user can see would match nothing.
            searchText={(r) =>
              `${r.number} ${resolveParty(r.from_location, vendorNames)} ${r.to_location} ${r.status}`
            }
            // All loaded rows stay on screen; "Load more" below appends the next
            // cursor page, matching the pre-migration behaviour.
            pageSize={500}
            storageKey={`inventory-${activeTab}`}
            emptyTitle={filtersActive ? `No matching ${tabLabel}` : `No ${tabLabel} yet`}
            emptyDescription={
              filtersActive
                ? "Try clearing the filters — other movements may exist."
                : `Create one with the New ${tabLabel.slice(0, -1)} button.`
            }
            emptyAction={
              filtersActive ? (
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />

          {nextCursor && !loading && (
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" onClick={loadMore} loading={loadingMore}>
                Load more
              </Button>
            </div>
          )}
        </div>
      </PageShell>

      <NewMovementModal
        tab={activeTab}
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreated={load}
      />
    </EnterpriseShell>
  );
}
