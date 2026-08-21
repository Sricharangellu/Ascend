"use client";

/**
 * Purchase-order list — the operational surface of the module.
 *
 * It exists to answer, without leaving the page: what needs my attention, what
 * has been ordered, what has arrived, what is late, and what is still waiting
 * for an invoice. Everything it filters or pages on is a server-side query;
 * nothing here narrows a single fetched page and presents it as the whole list.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import { DataTable, type DataColumn } from "@/components/DataTable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { fmtDateShort } from "@/lib/date";
import { hasRole } from "@/lib/auth";
import { startReceivingSession, receivingSessionHref } from "@/lib/receiving";
import type {
  PurchaseOrderListRow,
  PurchaseOrdersResponse,
  Supplier,
  SuppliersResponse,
} from "@/api-client/types";
import {
  APPROVAL_BADGE,
  APPROVAL_LABEL,
  INVOICE_BADGE,
  INVOICE_LABEL,
  ORDER_VIEWS,
  RECEIVE_BADGE,
  attentionReason,
  buildOrdersQuery,
  explainReceiveError,
  receiveAllSummary,
  receivedPct,
  type OrderView,
} from "../_lib/orders";
import { NewOrderPanel } from "./NewOrderPanel";

const PAGE_LIMIT = 25;

type PendingAction =
  | { kind: "receive"; row: PurchaseOrderListRow }
  | { kind: "approve"; row: PurchaseOrderListRow }
  | { kind: "reject"; row: PurchaseOrderListRow };

export function OrdersTab({
  initialSupplierId = "",
  initialProductId = "",
}: { initialSupplierId?: string; initialProductId?: string } = {}) {
  const [rows, setRows] = useState<PurchaseOrderListRow[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  // Load failures and action failures are separate on purpose: a load failure
  // belongs in the table (where the retry is, and where the rows would have
  // been), an action failure belongs beside the action. Routing both to both
  // places announced the same problem twice to a screen reader.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The whole query is ONE state object, deliberately. Its identity is what the
  // fetch effect keys off, so a caller that needs a reload without changing any
  // field (a PO was just created while already on the All view) simply writes a
  // fresh object — no separate "refresh" counter that the fetch never reads.
  //
  // `cursorStack` lives here too: the endpoint returns a forward cursor and no
  // total, so Previous is served by the cursors already used rather than by an
  // offset the API cannot honour.
  const [query, setQuery] = useState<{
    view: OrderView;
    searchTerm: string;
    supplierId: string;
    cursorStack: Array<string | null>;
  }>({ view: "all", searchTerm: "", supplierId: initialSupplierId, cursorStack: [null] });
  const [search, setSearch] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const { view, supplierId } = query;

  const [pending, setPending] = useState<PendingAction | null>(null);
  const canManage = hasRole("manager");
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const qs = buildOrdersQuery({
        view: query.view,
        search: query.searchTerm,
        supplierId: query.supplierId,
        cursor: query.cursorStack[query.cursorStack.length - 1] ?? null,
        limit: PAGE_LIMIT,
      });
      const res = await apiGet<PurchaseOrdersResponse>(`/api/v1/purchasing/orders${qs}`);
      setRows(res.items ?? []);
      setNextCursor(res.nextCursor ?? null);
    } catch (err) {
      setRows([]);
      setNextCursor(null);
      setLoadError(
        err instanceof ApiResponseError ? err.message : "Could not load purchase orders.",
      );
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  // Suppliers are only needed for the filter's labels; a failure here must not
  // blank the orders list, so it is reported separately and never throws.
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await apiGet<SuppliersResponse>("/api/v1/purchasing/suppliers");
        if (live) setSuppliers(res.items ?? []);
      } catch {
        if (live) setSuppliers([]);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  /** Any filter change restarts paging — keeping a cursor from the previous
   *  query would page through a list the user is no longer looking at. */
  const changeQuery = useCallback(
    (patch: Partial<{ view: OrderView; searchTerm: string; supplierId: string }>) =>
      setQuery((q) => ({ ...q, ...patch, cursorStack: [null] })),
    [],
  );

  /**
   * Open the scan workspace for this PO — the normal way to receive a delivery,
   * and the one that can count, price, and record lots and expiry dates.
   *
   * Kept from PR #230 when this list was rewritten. Starting the session from
   * the row is what removes the list → detail → tab → modal walk before the
   * first box gets counted; the backend returns the existing open session
   * rather than erroring, so two people at the same pallet land in one count.
   */
  const openReceiving = async (row: PurchaseOrderListRow) => {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const session = await startReceivingSession(row.id);
      router.push(receivingSessionHref(session.id));
    } catch (err) {
      // Deliberately routed through the same translator as "Receive all": the
      // approval gate rejects both with 409 approval_pending, and "Forbidden"
      // is not an instruction anyone can act on.
      setActionError(
        err instanceof ApiResponseError
          ? explainReceiveError(err.code, err.message)
          : "Could not open receiving for this order.",
      );
      setBusy(false);
    }
  };

  const runAction = async (action: PendingAction) => {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    const { kind, row } = action;
    const label = row.po_number != null ? `PO #${row.po_number}` : "Purchase order";
    try {
      if (kind === "receive") {
        await apiPost(`/api/v1/purchasing/orders/${row.id}/receive`, {});
        setNotice(`${label} received in full.`);
      } else if (kind === "approve") {
        await apiPost(`/api/v1/purchasing/orders/${row.id}/approve`, {});
        setNotice(`${label} approved — it can now be received.`);
      } else {
        await apiPost(`/api/v1/purchasing/orders/${row.id}/reject`, {});
        setNotice(`${label} rejected.`);
      }
      await load();
    } catch (err) {
      setActionError(
        err instanceof ApiResponseError
          ? explainReceiveError(err.code, err.message)
          : `Could not ${kind} ${label.toLowerCase()}.`,
      );
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  // Errors and confirmations move focus so a keyboard or screen-reader user is
  // told the outcome instead of discovering it by chance further down the page.
  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  const supplierOptions = useMemo(
    () => [
      { value: "", label: "All suppliers" },
      ...suppliers.map((s) => ({ value: s.id, label: s.name })),
    ],
    [suppliers],
  );

  const columns: DataColumn<PurchaseOrderListRow>[] = [
    {
      key: "po",
      header: "PO",
      sticky: true,
      minWidth: "7rem",
      render: (row) => (
        <Link
          href={`/purchasing/${row.id}`}
          className="focus-ring rounded font-mono text-sm font-semibold text-accent-700 underline-offset-2 hover:underline"
        >
          {row.po_number != null ? `#${row.po_number}` : row.id.slice(0, 12)}
        </Link>
      ),
    },
    {
      key: "supplier",
      header: "Supplier",
      minWidth: "10rem",
      render: (row) => row.supplier_name ?? row.supplier_id,
    },
    {
      key: "attention",
      header: "Attention",
      minWidth: "12rem",
      render: (row) => {
        const reason = attentionReason(row);
        if (!reason) return <span className="text-content-tertiary">—</span>;
        const variant =
          row.approval_status === "pending"
            ? "yellow"
            : row.approval_status === "rejected"
              ? "red"
              : row.is_overdue
                ? "orange"
                : "blue";
        return (
          <Badge variant={variant} size="sm">
            {reason}
          </Badge>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge variant={RECEIVE_BADGE[row.status] ?? "gray"} size="sm">
          {row.status.replace(/_/g, " ")}
        </Badge>
      ),
    },
    {
      key: "approval",
      header: "Approval",
      defaultHidden: true,
      render: (row) => (
        <Badge variant={APPROVAL_BADGE[row.approval_status] ?? "gray"} size="sm">
          {APPROVAL_LABEL[row.approval_status] ?? row.approval_status}
        </Badge>
      ),
    },
    {
      key: "created",
      header: "Created",
      sortValue: (row) => row.created_at,
      render: (row) => fmtDateShort(row.created_at),
    },
    {
      key: "expected",
      header: "Expected",
      sortValue: (row) => row.expected_date,
      render: (row) =>
        row.expected_date == null ? (
          // An unset ETA is unknown, not on time — saying "—" is the honest
          // rendering, and it is also what makes the Overdue view trustworthy.
          <span className="text-content-tertiary" title="No expected date recorded">
            —
          </span>
        ) : (
          <span className={row.is_overdue ? "font-semibold text-danger-700" : undefined}>
            {fmtDateShort(row.expected_date)}
          </span>
        ),
    },
    {
      key: "received",
      header: "Received",
      numeric: true,
      minWidth: "8rem",
      sortValue: (row) => receivedPct(row),
      render: (row) => {
        const pct = receivedPct(row);
        return (
          <span title={`${row.received_qty} of ${row.ordered_qty} units received`}>
            {row.received_qty}/{row.ordered_qty}
            {pct != null && (
              <span className="ml-1 text-content-tertiary">({pct}%)</span>
            )}
          </span>
        );
      },
    },
    {
      key: "remaining",
      header: "Remaining",
      numeric: true,
      defaultHidden: true,
      sortValue: (row) => row.remaining_qty,
      render: (row) => row.remaining_qty,
    },
    {
      key: "invoice",
      header: "Invoice",
      render: (row) => (
        <Badge variant={INVOICE_BADGE[row.invoice_status]} size="sm">
          {INVOICE_LABEL[row.invoice_status]}
        </Badge>
      ),
    },
    {
      key: "total",
      header: "Total",
      numeric: true,
      sortValue: (row) => row.total_cost_cents,
      render: (row) => formatMoney(row.total_cost_cents),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      hideable: false,
      minWidth: "11rem",
      render: (row) => {
        if (!canManage) return null;
        if (row.approval_status === "pending") {
          return (
            <span className="flex justify-end gap-1">
              <Button size="sm" variant="primary" disabled={busy} onClick={() => setPending({ kind: "approve", row })}>
                Approve
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPending({ kind: "reject", row })}>
                Reject
              </Button>
            </span>
          );
        }
        if (row.remaining_qty > 0 && row.approval_status === "approved" && row.status !== "cancelled") {
          return (
            <span className="flex justify-end gap-1">
              <Button size="sm" variant="primary" disabled={busy} onClick={() => void openReceiving(row)}>
                Scan &amp; Receive
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                title="Post every open line at its full remaining quantity"
                onClick={() => setPending({ kind: "receive", row })}
              >
                {/* Named for what it does. The API treats an empty body as
                    "receive every remaining line in full" — the old label just
                    said "Receive", next to two other entry points that let you
                    receive a partial quantity. */}
                Receive all
              </Button>
            </span>
          );
        }
        return null;
      },
    },
  ];

  const confirmCopy = (): { title: string; message: string; label: string; destructive: boolean } => {
    if (!pending) return { title: "", message: "", label: "", destructive: false };
    const { kind, row } = pending;
    const po = row.po_number != null ? `PO #${row.po_number}` : "this purchase order";
    if (kind === "receive") {
      return {
        title: `Receive all of ${po}?`,
        message: receiveAllSummary(row),
        label: "Receive all remaining",
        destructive: false,
      };
    }
    if (kind === "approve") {
      return {
        title: `Approve ${po}?`,
        message: `Approving releases ${po} (${formatMoney(row.total_cost_cents)}) for receiving. The approval is recorded against your account.`,
        label: "Approve",
        destructive: false,
      };
    }
    return {
      title: `Reject ${po}?`,
      message: `${po} will be permanently rejected and can never be received. A rejected purchase order cannot be re-approved — a new one has to be raised.`,
      label: "Reject",
      destructive: true,
    };
  };

  const copy = confirmCopy();

  return (
    <div className="flex flex-col gap-4 p-4">
      {actionError && (
        <p role="alert" className="rounded-control bg-danger-50 px-4 py-2 text-sm text-danger-700">
          {actionError}
        </p>
      )}
      {notice && (
        <p
          ref={noticeRef}
          tabIndex={-1}
          role="status"
          className="focus-ring rounded-control bg-success-50 px-4 py-2 text-sm text-success-700"
        >
          {notice}
        </p>
      )}

      {/* Saved views — each is a server query, so the counts and the pager stay
          truthful when the tenant has more orders than one page. */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Purchase order views">
        {ORDER_VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            title={v.hint}
            aria-pressed={view === v.id}
            onClick={() => changeQuery({ view: v.id })}
            className={
              view === v.id
                ? "focus-ring min-h-touch rounded-control border border-accent-600 bg-accent-600 px-3 text-sm font-semibold text-white"
                : "focus-ring min-h-touch rounded-control border border-line bg-surface-1 px-3 text-sm font-medium text-content-primary hover:bg-surface-2"
            }
          >
            {v.label}
          </button>
        ))}
      </div>

      <DataTable<PurchaseOrderListRow>
        caption="Purchase orders"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={loading}
        error={loadError}
        onRetry={() => void load()}
        storageKey="purchasing.orders.columns"
        stickyHeader
        emptyTitle={view === "all" ? "No purchase orders yet" : "Nothing in this view"}
        emptyDescription={
          view === "all"
            ? "Create your first purchase order to start tracking what you have on order."
            : "Try another view, or clear the search and supplier filters."
        }
        serverCursor={{
          hasNext: nextCursor != null,
          hasPrev: query.cursorStack.length > 1,
          page: query.cursorStack.length,
          onNext: () => setQuery((q) => ({ ...q, cursorStack: [...q.cursorStack, nextCursor] })),
          onPrev: () =>
            setQuery((q) =>
              q.cursorStack.length > 1 ? { ...q, cursorStack: q.cursorStack.slice(0, -1) } : q,
            ),
        }}
        toolbar={
          <div className="flex flex-wrap items-end gap-2">
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                changeQuery({ searchTerm: search });
              }}
            >
              <Input
                label="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="PO number or note"
                fullWidth={false}
                className="w-48"
              />
              <Button type="submit" size="sm" variant="secondary">
                Search
              </Button>
            </form>
            <Select
              label="Supplier"
              value={supplierId}
              options={supplierOptions}
              onChange={(e) => changeQuery({ supplierId: e.target.value })}
              className="w-44"
            />
          </div>
        }
      />

      {canManage && (
        <NewOrderPanel
          suppliers={suppliers}
          initialSupplierId={initialSupplierId}
          initialProductId={initialProductId}
          // A fresh object, so the effect refetches even when every field is
          // already what it is being set to.
          onCreated={() => changeQuery({ view: "all" })}
        />
      )}

      <ConfirmDialog
        open={pending != null}
        title={copy.title}
        message={copy.message}
        confirmLabel={copy.label}
        destructive={copy.destructive}
        onConfirm={() => pending && void runAction(pending)}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
