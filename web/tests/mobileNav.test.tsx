/**
 * @vitest-environment jsdom
 *
 * Mobile navigation + mobile table rendering.
 *
 * These are the two changes that alter what a phone user can reach, so the
 * guards here are about REACHABILITY, not looks:
 *  - the tab bar must never offer a route the tenant or role cannot use, and
 *    must never gate away the escape hatch ("More") that reaches everything else;
 *  - the card layout must not silently drop a column, because on mobile the
 *    card is the whole row and a dropped column is data the user cannot get to.
 *
 * jsdom has no matchMedia, so every test states the viewport it is asserting
 * about rather than inheriting an ambient default.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MobileTabBar } from "@/components/MobileTabBar";
import { DataTable, type DataColumn } from "@/components/DataTable";
import { MOBILE_QUERY } from "@/lib/useMediaQuery";

// ── Test doubles for the two gating layers ──────────────────────────────────
const permissions = { hasFeature: (_f: string) => true };
const capabilities = { routeEnabled: (_h: string) => true };

vi.mock("@/contexts/PermissionsContext", () => ({
  usePermissions: () => permissions,
}));
vi.mock("@/contexts/CapabilitiesContext", () => ({
  useCapabilities: () => capabilities,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn() }),
}));

/** Point matchMedia at a chosen viewport. jsdom ships no implementation. */
function setViewport(mobile: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query === MOBILE_QUERY ? mobile : !mobile,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  permissions.hasFeature = () => true;
  capabilities.routeEnabled = () => true;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("MobileTabBar", () => {
  const noop = () => {};

  it("puts the primary retail tasks one tap from anywhere", () => {
    render(<MobileTabBar onMoreClick={noop} onScanClick={noop} moreOpen={false} />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getByRole("link", { name: "Home" })).toHaveAttribute("href", "/dashboard");
    expect(within(nav).getByRole("link", { name: "Sell" })).toHaveAttribute("href", "/terminal");
    expect(within(nav).getByRole("link", { name: "Stock" })).toHaveAttribute("href", "/inventory");
    expect(within(nav).getByRole("button", { name: "Scan a barcode" })).toBeInTheDocument();
  });

  it("marks the current tab with aria-current, not colour alone", () => {
    render(<MobileTabBar onMoreClick={noop} onScanClick={noop} moreOpen={false} />);
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Sell" })).not.toHaveAttribute("aria-current");
  });

  it("hides a tab the user's role cannot use", () => {
    permissions.hasFeature = (f) => f !== "register";
    render(<MobileTabBar onMoreClick={noop} onScanClick={noop} moreOpen={false} />);
    expect(screen.queryByRole("link", { name: "Sell" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Stock" })).toBeInTheDocument();
  });

  it("hides a tab whose route the tenant has disabled", () => {
    capabilities.routeEnabled = (h) => h !== "/inventory";
    render(<MobileTabBar onMoreClick={noop} onScanClick={noop} moreOpen={false} />);
    expect(screen.queryByRole("link", { name: "Stock" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sell" })).toBeInTheDocument();
  });

  it("keeps Scan and More when every gated tab is removed", () => {
    // The failure this guards against is a user with a narrow role landing on
    // a nav bar with nothing on it and no way to open the rest of the app.
    permissions.hasFeature = () => false;
    capabilities.routeEnabled = () => false;
    render(<MobileTabBar onMoreClick={noop} onScanClick={noop} moreOpen={false} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scan a barcode" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More navigation" })).toBeInTheDocument();
  });

  it("reports the drawer's open state on the More control", () => {
    const { rerender } = render(
      <MobileTabBar onMoreClick={noop} onScanClick={noop} moreOpen={false} />,
    );
    expect(screen.getByRole("button", { name: "More navigation" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    rerender(<MobileTabBar onMoreClick={noop} onScanClick={noop} moreOpen />);
    expect(screen.getByRole("button", { name: "More navigation" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });
});

// ── DataTable mobile layout ─────────────────────────────────────────────────

interface Row {
  id: string;
  sku: string;
  name: string;
  onHand: number;
  cost: string;
}

const ROWS: Row[] = [
  { id: "1", sku: "SKU-1", name: "Banana", onHand: 12, cost: "$1.20" },
  { id: "2", sku: "SKU-2", name: "Apple", onHand: 3, cost: "$0.80" },
];

const COLUMNS: DataColumn<Row>[] = [
  { key: "name", header: "Product", render: (r) => r.name, primary: true },
  { key: "sku", header: "SKU", render: (r) => r.sku },
  { key: "onHand", header: "On hand", render: (r) => r.onHand, numeric: true },
  { key: "cost", header: "Cost", render: (r) => r.cost, numeric: true },
];

describe("DataTable — mobile layout", () => {
  it("renders a real table on desktop", () => {
    setViewport(false);
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} caption="Products" />);
    expect(screen.getByRole("table", { name: "Products" })).toBeInTheDocument();
  });

  it("renders cards instead of a sideways-scrolling table on mobile", () => {
    setViewport(true);
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} caption="Products" />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Products" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  });

  it("keeps every column's data on the card", () => {
    // The regression this exists for: "tidying" the card by showing only the
    // name and one metric, which loses the columns a stock check is FOR.
    setViewport(true);
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} caption="Products" />);
    const first = within(screen.getByRole("list", { name: "Products" })).getAllByRole(
      "listitem",
    )[0]!;
    expect(within(first).getByText("Banana")).toBeInTheDocument();
    expect(within(first).getByText("SKU-1")).toBeInTheDocument();
    expect(within(first).getByText("12")).toBeInTheDocument();
    expect(within(first).getByText("$1.20")).toBeInTheDocument();
    // Labelled, not just present — a bare "12" tells the user nothing.
    expect(within(first).getByText("On hand")).toBeInTheDocument();
  });

  it("omits a column only when it opts out explicitly", () => {
    setViewport(true);
    const cols: DataColumn<Row>[] = [
      ...COLUMNS.slice(0, 3),
      { key: "cost", header: "Cost", render: (r) => r.cost, mobileHidden: true },
    ];
    render(<DataTable columns={cols} rows={ROWS} rowKey={(r) => r.id} caption="Products" />);
    expect(screen.queryByText("$1.20")).not.toBeInTheDocument();
    expect(screen.getByText("SKU-1")).toBeInTheDocument();
  });

  it("honours mobileLayout=scroll for matrix tables", () => {
    setViewport(true);
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        caption="Products"
        mobileLayout="scroll"
      />,
    );
    expect(screen.getByRole("table", { name: "Products" })).toBeInTheDocument();
  });

  it("keeps row selection reachable and labelled on a card", () => {
    setViewport(true);
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        caption="Products"
        selectable
      />,
    );
    expect(screen.getByRole("checkbox", { name: "Select row 1" })).toBeInTheDocument();
  });

  it("still shows the empty state on mobile", () => {
    setViewport(true);
    render(
      <DataTable
        columns={COLUMNS}
        rows={[]}
        rowKey={(r) => r.id}
        caption="Products"
        emptyTitle="No products"
      />,
    );
    expect(screen.getByText("No products")).toBeInTheDocument();
  });
});
