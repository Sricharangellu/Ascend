/**
 * Purchase-order list logic, kept out of the component so it can be tested
 * directly — these are the rules that decide what a purchasing user is told
 * about a PO, and they are worth asserting without a DOM.
 */

import type { BadgeVariant } from "@/components/Badge";
import type { POApprovalStatus, PurchaseOrderListRow } from "@/api-client/types";

/** The saved views on the toolbar. Each maps to a server-side query — none of
 *  them filters a fetched page in the browser. */
export type OrderView =
  | "all"
  | "needs_approval"
  | "open"
  | "overdue"
  | "awaiting_invoice";

export interface OrderViewDef {
  id: OrderView;
  label: string;
  /** Why a purchasing user would click it — used as the control's title. */
  hint: string;
  query: Record<string, string>;
}

export const ORDER_VIEWS: OrderViewDef[] = [
  { id: "all", label: "All", hint: "Every purchase order, newest first", query: {} },
  {
    id: "needs_approval",
    label: "Needs approval",
    hint: "Blocked: these cannot be received until someone approves them",
    query: { approvalStatus: "pending" },
  },
  {
    id: "open",
    label: "Open",
    hint: "Ordered but not yet fully received",
    query: { status: "ordered" },
  },
  {
    id: "overdue",
    label: "Overdue",
    hint: "Expected date has passed and goods are still outstanding",
    query: { overdue: "true" },
  },
  {
    id: "awaiting_invoice",
    label: "Received, no invoice",
    hint: "Goods are in but no supplier invoice has been entered",
    query: { status: "received" },
  },
];

export function viewById(id: string | null | undefined): OrderViewDef {
  return ORDER_VIEWS.find((v) => v.id === id) ?? ORDER_VIEWS[0]!;
}

/**
 * Build the querystring for a page of orders.
 *
 * `cursor` is threaded through because the endpoint is keyset-paginated; the
 * caller keeps the stack of cursors so Previous works without a total.
 */
export function buildOrdersQuery(opts: {
  view: OrderView;
  search?: string;
  supplierId?: string;
  cursor?: string | null;
  limit?: number;
}): string {
  const params = new URLSearchParams(viewById(opts.view).query);
  const term = opts.search?.trim();
  if (term) params.set("search", term);
  if (opts.supplierId) params.set("supplierId", opts.supplierId);
  if (opts.cursor) params.set("cursor", opts.cursor);
  if (opts.limit) params.set("limit", String(opts.limit));
  const q = params.toString();
  return q ? `?${q}` : "";
}

export const APPROVAL_BADGE: Record<POApprovalStatus, BadgeVariant> = {
  approved: "green",
  pending: "yellow",
  rejected: "red",
};

export const APPROVAL_LABEL: Record<POApprovalStatus, string> = {
  approved: "Approved",
  pending: "Needs approval",
  rejected: "Rejected",
};

export const RECEIVE_BADGE: Record<string, BadgeVariant> = {
  ordered: "blue",
  partially_received: "yellow",
  received: "green",
  cancelled: "gray",
};

export const INVOICE_LABEL: Record<PurchaseOrderListRow["invoice_status"], string> = {
  none: "Not invoiced",
  open: "Invoice open",
  posted: "Invoiced",
};

export const INVOICE_BADGE: Record<PurchaseOrderListRow["invoice_status"], BadgeVariant> = {
  none: "gray",
  open: "yellow",
  posted: "green",
};

/** A short, plain-language reason a row needs attention, or null when it doesn't.
 *
 *  Ordered by what blocks work soonest: approval stops receiving outright, an
 *  overdue delivery is chased next, and an uninvoiced completed PO is finance's
 *  tail. Only the top reason is shown — a row with three chips reads as noise
 *  and the operator stops reading them. */
export function attentionReason(row: PurchaseOrderListRow): string | null {
  if (row.approval_status === "pending") return "Awaiting approval — cannot receive";
  if (row.approval_status === "rejected") return "Rejected";
  if (row.is_overdue) return "Past its expected date";
  if (row.status === "received" && row.invoice_status === "none") return "Received, no invoice entered";
  return null;
}

/** Received progress as a whole percentage, clamped. Returns null when nothing
 *  was ordered, so the caller renders "—" rather than a misleading 0% or NaN. */
export function receivedPct(row: PurchaseOrderListRow): number | null {
  if (!row.ordered_qty || row.ordered_qty <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((row.received_qty / row.ordered_qty) * 100)));
}

/** What the "Receive all remaining" action will actually do, spelled out for the
 *  confirmation step. The API treats an empty body as "receive every remaining
 *  line in full", which is irreversible — it books stock and posts a journal. */
export function receiveAllSummary(row: PurchaseOrderListRow): string {
  const units = row.remaining_qty;
  const lines = row.line_count;
  return `Receive all ${units} remaining unit${units === 1 ? "" : "s"} across ${lines} line${
    lines === 1 ? "" : "s"
  } in full. This books stock and posts to the ledger, and cannot be undone from here.`;
}

/** Turn the API's approval-gate refusal into something a user can act on.
 *  The raw 409 (`approval_pending`) is accurate and useless at the desk. */
export function explainReceiveError(code: string | undefined, message: string): string {
  if (code === "approval_pending") {
    return "This purchase order is waiting for approval and cannot be received yet. Approve it first — the Approve action is on this row and on the PO detail page.";
  }
  if (code === "rejected") {
    return "This purchase order was rejected, so it cannot be received. Create a new purchase order instead.";
  }
  if (code === "approval_tier") {
    return "This purchase order's amount requires an owner to approve it. Ask an owner to approve it.";
  }
  return message;
}
