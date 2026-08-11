import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PurchaseOrderListRow } from "@/api-client/types";
import {
  attentionReason,
  buildOrdersQuery,
  explainReceiveError,
  receiveAllSummary,
  receivedPct,
  viewById,
} from "@/app/(protected)/purchasing/_lib/orders";
import { OrdersTab } from "@/app/(protected)/purchasing/_components/OrdersTab";

// jsdom does not implement <dialog>.showModal()/close(); stub them so
// ConfirmDialog can open, matching tests/securityBackupCodes.test.tsx.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.open = false; };
});

const now = Date.now();
const DAY = 86_400_000;

function mkRow(over: Partial<PurchaseOrderListRow> = {}): PurchaseOrderListRow {
  return {
    id: "po_1",
    supplier_id: "sup_1",
    supplier_name: "Acme Coffee Co",
    po_number: 4001,
    status: "ordered",
    receive_status: "pending",
    approval_status: "approved",
    approved_at: now,
    total_cost_cents: 12_500,
    notes: null,
    expected_date: null,
    created_at: now - DAY,
    received_at: null,
    line_count: 2,
    ordered_qty: 20,
    received_qty: 0,
    remaining_qty: 20,
    bill_count: 0,
    invoice_status: "none",
    is_overdue: false,
    ...over,
  };
}

// ── Pure logic ───────────────────────────────────────────────────────────────

describe("order list query building", () => {
  it("maps each saved view to a server-side query, never a client filter", () => {
    expect(buildOrdersQuery({ view: "needs_approval" })).toBe("?approvalStatus=pending");
    expect(buildOrdersQuery({ view: "overdue" })).toBe("?overdue=true");
    expect(buildOrdersQuery({ view: "open" })).toBe("?status=ordered");
    expect(buildOrdersQuery({ view: "all" })).toBe("");
  });

  it("combines view, search, supplier, cursor and limit", () => {
    const qs = buildOrdersQuery({
      view: "open",
      search: " 4001 ",
      supplierId: "sup_9",
      cursor: "abc",
      limit: 25,
    });
    const params = new URLSearchParams(qs.slice(1));
    expect(params.get("status")).toBe("ordered");
    expect(params.get("search")).toBe("4001");
    expect(params.get("supplierId")).toBe("sup_9");
    expect(params.get("cursor")).toBe("abc");
    expect(params.get("limit")).toBe("25");
  });

  it("omits an all-whitespace search rather than sending an empty filter", () => {
    expect(buildOrdersQuery({ view: "all", search: "   " })).toBe("");
  });

  it("falls back to the All view for an unknown id", () => {
    expect(viewById("nonsense").id).toBe("all");
    expect(viewById(null).id).toBe("all");
  });
});

describe("attention reasons", () => {
  it("ranks the blocking reason first — approval stops receiving outright", () => {
    const row = mkRow({ approval_status: "pending", is_overdue: true });
    expect(attentionReason(row)).toMatch(/approval/i);
  });

  it("flags an overdue PO once approval is not the problem", () => {
    expect(attentionReason(mkRow({ is_overdue: true }))).toMatch(/expected date/i);
  });

  it("flags a received PO with no invoice entered", () => {
    const row = mkRow({ status: "received", remaining_qty: 0, invoice_status: "none" });
    expect(attentionReason(row)).toMatch(/no invoice/i);
  });

  it("says nothing about a healthy PO", () => {
    expect(attentionReason(mkRow())).toBeNull();
  });

  it("does not call a PO with an invoice 'not invoiced'", () => {
    const row = mkRow({ status: "received", remaining_qty: 0, invoice_status: "posted" });
    expect(attentionReason(row)).toBeNull();
  });
});

describe("received progress", () => {
  it("returns null when nothing was ordered, so the UI shows '—' not 0% or NaN", () => {
    expect(receivedPct(mkRow({ ordered_qty: 0, received_qty: 0 }))).toBeNull();
  });

  it("rounds and clamps", () => {
    expect(receivedPct(mkRow({ ordered_qty: 3, received_qty: 1 }))).toBe(33);
    expect(receivedPct(mkRow({ ordered_qty: 10, received_qty: 99 }))).toBe(100);
  });
});

describe("receive-all confirmation copy", () => {
  it("states the quantity, the line count and that it is irreversible", () => {
    const msg = receiveAllSummary(mkRow({ remaining_qty: 20, line_count: 2 }));
    expect(msg).toContain("20 remaining units");
    expect(msg).toContain("2 lines");
    expect(msg).toMatch(/cannot be undone/i);
  });

  it("uses singular wording for one unit on one line", () => {
    const msg = receiveAllSummary(mkRow({ remaining_qty: 1, line_count: 1 }));
    expect(msg).toContain("1 remaining unit ");
    expect(msg).toContain("1 line in full");
  });
});

describe("receive error explanations", () => {
  it("turns the approval 409 into an instruction instead of a status code", () => {
    const out = explainReceiveError("approval_pending", "purchase order is awaiting approval");
    expect(out).toMatch(/approve it first/i);
  });

  it("explains that a rejected PO needs a new one", () => {
    expect(explainReceiveError("rejected", "x")).toMatch(/create a new purchase order/i);
  });

  it("passes an unrecognised error through unchanged rather than inventing advice", () => {
    expect(explainReceiveError("some_other_code", "Original message")).toBe("Original message");
  });
});

// ── Component ────────────────────────────────────────────────────────────────

const apiGet = vi.fn();
const apiPost = vi.fn();

vi.mock("@/api-client/client", async () => {
  const actual = await vi.importActual<typeof import("@/api-client/client")>(
    "@/api-client/client",
  );
  return {
    ...actual,
    apiGet: (...args: unknown[]) => apiGet(...args),
    apiPost: (...args: unknown[]) => apiPost(...args),
  };
});

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, hasRole: () => true };
});

function stubApi(rows: PurchaseOrderListRow[], nextCursor: string | null = null) {
  apiGet.mockImplementation(async (path: string) => {
    if (path.startsWith("/api/v1/purchasing/suppliers")) {
      return { items: [{ id: "sup_1", name: "Acme Coffee Co" }] };
    }
    if (path.startsWith("/api/v1/purchasing/orders")) {
      return { items: rows, nextCursor, limit: 25 };
    }
    return { items: [] };
  });
}

describe("OrdersTab", () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it("links every PO row to its own detail page", async () => {
    stubApi([mkRow()]);
    render(<OrdersTab />);
    const link = await screen.findByRole("link", { name: "#4001" });
    expect(link).toHaveAttribute("href", "/purchasing/po_1");
  });

  it("shows the PO number rather than the opaque id", async () => {
    stubApi([mkRow({ id: "po_0192f3ab", po_number: 4207 })]);
    render(<OrdersTab />);
    expect(await screen.findByRole("link", { name: "#4207" })).toBeInTheDocument();
    expect(screen.queryByText("po_0192f3ab")).not.toBeInTheDocument();
  });

  it("asks the server for pending approvals — it does not filter a loaded page", async () => {
    stubApi([mkRow()]);
    render(<OrdersTab />);
    await screen.findByRole("link", { name: "#4001" });
    apiGet.mockClear();

    await userEvent.click(screen.getByRole("button", { name: "Needs approval" }));

    await waitFor(() => {
      const calls = apiGet.mock.calls.map((c) => String(c[0]));
      expect(calls.some((p) => p.includes("approvalStatus=pending"))).toBe(true);
    });
  });

  it("offers Approve/Reject on a pending PO and no receive action", async () => {
    stubApi([mkRow({ approval_status: "pending" })]);
    render(<OrdersTab />);
    await screen.findByRole("link", { name: "#4001" });
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Receive all" })).not.toBeInTheDocument();
  });

  it("approves through the real endpoint after confirmation", async () => {
    stubApi([mkRow({ approval_status: "pending" })]);
    apiPost.mockResolvedValue({});
    render(<OrdersTab />);
    await screen.findByRole("link", { name: "#4001" });

    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /^Approve$/ }));

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/api/v1/purchasing/orders/po_1/approve", {}),
    );
  });

  it("names the full-receive action for what it does and confirms before firing", async () => {
    stubApi([mkRow({ remaining_qty: 20, line_count: 2 })]);
    apiPost.mockResolvedValue({});
    render(<OrdersTab />);
    await screen.findByRole("link", { name: "#4001" });

    // The label says "Receive all", not a bare "Receive" that hides the fact
    // that an empty body means every remaining line, in full.
    await userEvent.click(screen.getByRole("button", { name: "Receive all" }));
    expect(apiPost).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/20 remaining units/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: /Receive all remaining/ }));

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/api/v1/purchasing/orders/po_1/receive", {}),
    );
  });

  it("explains the approval block instead of surfacing the raw 409", async () => {
    stubApi([mkRow({ remaining_qty: 5 })]);
    const { ApiResponseError } = await import("@/api-client/client");
    apiPost.mockRejectedValue(
      new ApiResponseError("approval_pending", "purchase order is awaiting approval", "req_1", 409),
    );
    render(<OrdersTab />);
    await screen.findByRole("link", { name: "#4001" });

    await userEvent.click(screen.getByRole("button", { name: "Receive all" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /Receive all remaining/ }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/approve it first/i);
  });

  it("renders an unset expected date as unknown, never as on-time", async () => {
    stubApi([mkRow({ expected_date: null, is_overdue: false })]);
    render(<OrdersTab />);
    await screen.findByRole("link", { name: "#4001" });
    expect(screen.getByTitle("No expected date recorded")).toHaveTextContent("—");
  });

  it("pages forward with the cursor the API returned", async () => {
    stubApi([mkRow()], "cursor_abc");
    render(<OrdersTab />);
    await screen.findByRole("link", { name: "#4001" });
    apiGet.mockClear();

    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      const calls = apiGet.mock.calls.map((c) => String(c[0]));
      expect(calls.some((p) => p.includes("cursor=cursor_abc"))).toBe(true);
    });
  });

  it("does not offer Next when the API says there is no more", async () => {
    stubApi([mkRow()], null);
    render(<OrdersTab />);
    await screen.findByRole("link", { name: "#4001" });
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });

  it("prefills the create panel from a vendor deep link, resolving the product name", async () => {
    apiGet.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/v1/purchasing/suppliers")) {
        return { items: [{ id: "sup_1", name: "Acme Coffee Co" }] };
      }
      if (path.startsWith("/api/v1/purchasing/orders")) return { items: [], nextCursor: null, limit: 25 };
      if (path === "/api/v1/catalog/prod_7") return { name: "House Blend 1kg", sku: "COF-001" };
      return { items: [] };
    });
    render(<OrdersTab initialSupplierId="sup_1" initialProductId="prod_7" />);

    // The panel opens already on the task rather than behind a "New PO" button,
    // and shows the product's name — not the raw prod_… id.
    expect(await screen.findByText("COF-001 House Blend 1kg")).toBeInTheDocument();
    expect(screen.queryByText("prod_7")).not.toBeInTheDocument();
  });

  it("reloads the list after a PO is created while already on the All view", async () => {
    apiGet.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/v1/purchasing/suppliers")) {
        return { items: [{ id: "sup_1", name: "Acme Coffee Co" }] };
      }
      if (path.startsWith("/api/v1/purchasing/orders")) return { items: [mkRow()], nextCursor: null, limit: 25 };
      if (path.startsWith("/api/v1/search")) return { products: [{ id: "prod_7", label: "House Blend", sublabel: "COF-001" }] };
      return { items: [] };
    });
    apiPost.mockResolvedValue({ id: "po_new", po_number: 4004, approval_status: "approved" });
    render(<OrdersTab />);
    await screen.findByRole("link", { name: "#4001" });

    await userEvent.click(screen.getByRole("button", { name: "New purchase order" }));
    const picker = screen.getByLabelText("Product");
    await userEvent.type(picker, "House");
    await userEvent.click(await screen.findByRole("button", { name: /House Blend/ }));
    await userEvent.type(screen.getByLabelText(/^Unit cost/), "3.50");
    apiGet.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Create purchase order" }));

    // Regression guard, not a bug catch: the query is unchanged (still the All
    // view, still no cursor), so resetting the cursor to the value it already
    // held cannot trigger the effect. Something has to force the reload — today
    // that is `refreshKey`. This fails if that mechanism is dropped.
    await waitFor(() => {
      const calls = apiGet.mock.calls.map((c) => String(c[0]));
      expect(calls.some((p) => p.startsWith("/api/v1/purchasing/orders"))).toBe(true);
    });
  });

  it("reports a load failure instead of showing an empty list that looks like no data", async () => {
    const { ApiResponseError } = await import("@/api-client/client");
    apiGet.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/v1/purchasing/orders")) {
        throw new ApiResponseError("server_error", "Database unavailable", "req_2", 500);
      }
      return { items: [] };
    });
    render(<OrdersTab />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Database unavailable/);
    expect(screen.queryByText(/No purchase orders yet/)).not.toBeInTheDocument();
  });
});
