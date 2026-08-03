import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ReportsDashboard } from "@/components/reports/ReportsDashboard";
import type { SalesSummary, TopProduct } from "@/api-client/types";

const summary: SalesSummary = {
  orders: { open: 2, completed: 5, refunded: 1, voided: 0, total: 8 },
  revenue: { grossCents: 21650, taxCents: 1650, netCents: 20000 },
  payments: { capturedCount: 5, capturedCents: 21651, byMethod: { cash: 11651, card: 10000 } },
  kpi: {
    saleCount: 5,
    grossProfitCents: 8460,
    cogsCents: 13190,
    costCoveragePct: 100,
    customerCount: 4,
    avgSaleValueCents: 4330,
    avgItemsPerSale: 2.4,
    discountedAmountCents: 1200,
    discountedPct: 40,
  },
  sparklines: {
    revenue: [1000, 2500, 1800, 4200, 3100, 5200, 3850],
    saleCount: [1, 2, 1, 3, 2, 4, 2],
  },
};

const topProducts: TopProduct[] = [
  { productId: "prod_001", name: "Latte", units: 34, revenueCents: 16966 },
];

describe("ReportsDashboard", () => {
  it("renders money KPIs from the real summary payload", () => {
    render(<ReportsDashboard summary={summary} />);
    expect(screen.getByText("$216.50")).toBeInTheDocument(); // revenue.grossCents
    expect(screen.getByText("$84.60")).toBeInTheDocument();  // kpi.grossProfitCents (real, not 62% of gross)
    expect(screen.getByText("$43.30")).toBeInTheDocument();  // kpi.avgSaleValueCents
  });

  it("renders spec KPIs from summary.kpi, not hardcoded values", () => {
    render(<ReportsDashboard summary={summary} />);
    expect(screen.getByText("Customer Count")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();     // kpi.customerCount
    expect(screen.getByText("2.4")).toBeInTheDocument();   // kpi.avgItemsPerSale
    expect(screen.getByText("40%")).toBeInTheDocument();   // kpi.discountedPct
    expect(screen.getByText("$12.00")).toBeInTheDocument(); // kpi.discountedAmountCents
  });

  it("shows gross profit as unavailable when no sold unit has a known cost", () => {
    const noCosts: SalesSummary = {
      ...summary,
      kpi: { ...summary.kpi, grossProfitCents: null, cogsCents: 0, costCoveragePct: 0 },
    };
    render(<ReportsDashboard summary={noCosts} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("No product costs recorded")).toBeInTheDocument();
  });

  it("flags low-confidence gross profit when cost coverage is partial", () => {
    const partial: SalesSummary = {
      ...summary,
      kpi: { ...summary.kpi, grossProfitCents: 5000, costCoveragePct: 62 },
    };
    render(<ReportsDashboard summary={partial} />);
    expect(screen.getByText("$50.00")).toBeInTheDocument();
    expect(screen.getByText("62% of units costed")).toBeInTheDocument();
  });

  it("renders order counts and payment methods", () => {
    render(<ReportsDashboard summary={summary} />);
    expect(screen.getByText("Sale Count")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument(); // kpi.saleCount
    expect(screen.getByText("Payment methods")).toBeInTheDocument();
    expect(screen.getByText(/cash/i)).toBeInTheDocument();
    expect(screen.getByText(/card/i)).toBeInTheDocument();
  });

  it("renders backend top products when provided", () => {
    render(<ReportsDashboard summary={summary} topProducts={topProducts} />);
    expect(screen.getByText("Products sold")).toBeInTheDocument();
    expect(screen.getByText("34 units total")).toBeInTheDocument();

    const row = screen.getByRole("row", { name: /latte/i });
    expect(within(row).getByText("Latte")).toBeInTheDocument();
    expect(within(row).getByText("34")).toBeInTheDocument();
    expect(within(row).getByText("$169.66")).toBeInTheDocument();
  });
});
