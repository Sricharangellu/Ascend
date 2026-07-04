import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ReportsDashboard } from "@/components/reports/ReportsDashboard";
import type { SalesSummary, TopProduct } from "@/api-client/types";

const summary: SalesSummary = {
  orders: { open: 2, completed: 5, refunded: 1, voided: 0, total: 8 },
  revenue: { grossCents: 21650, taxCents: 1650, netCents: 20000 },
  payments: { capturedCount: 5, capturedCents: 21651, byMethod: { cash: 11651, card: 10000 } },
};

const topProducts: TopProduct[] = [
  { productId: "prod_001", name: "Latte", units: 34, revenueCents: 16966 },
];

describe("ReportsDashboard", () => {
  it("renders revenue KPIs formatted as money", () => {
    render(<ReportsDashboard summary={summary} />);
    expect(screen.getByText("$216.50")).toBeInTheDocument(); // gross
    expect(screen.getByText("$134.23")).toBeInTheDocument(); // mock gross profit
    expect(screen.getByText("$43.30")).toBeInTheDocument();  // avg sale value
  });

  it("renders order counts and payment methods", () => {
    render(<ReportsDashboard summary={summary} />);
    expect(screen.getByText("Sale Count")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
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
