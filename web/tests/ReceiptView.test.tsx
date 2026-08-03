/**
 * Component tests for ReceiptView title/status rendering.
 *
 * Regression guard: after a successful tender the terminal passes a "completed"
 * order to ReceiptView. A stale "open" status used to fall through the title
 * switch and mistitle the success screen "Order Voided" (and hide refund/void).
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReceiptView } from "@/components/terminal/ReceiptView";
import { ToastProvider } from "@/components/Toast";
import type { Order, OrderStatus, Payment } from "@/api-client/types";

function makeOrder(status: OrderStatus): Order {
  return {
    id: "ord_test",
    orderNumber: "FP-TEST0001",
    stateCode: "CA",
    status,
    subtotalCents: 2699,
    discountCents: 0,
    taxCents: 99,
    totalCents: 2798,
    lines: [
      {
        id: "ln_1",
        orderId: "ord_test",
        productId: "prd_1",
        name: "Ceramic Coffee Mug",
        quantity: 1,
        unitCents: 1200,
        taxCents: 99,
        lineCents: 1200,
        taxable: true,
      },
    ],
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  };
}

const payment: Payment = {
  id: "pay_test",
  orderId: "ord_test",
  method: "cash",
  amountCents: 2798,
  cashCents: 5000,
  cardCents: 0,
  changeCents: 2202,
  status: "captured",
  createdAt: 1_700_000_000_000,
};

function renderReceipt(status: OrderStatus) {
  return render(
    <ToastProvider>
      <ReceiptView order={makeOrder(status)} payment={payment} onNewSale={() => {}} role="owner" />
    </ToastProvider>,
  );
}

describe("ReceiptView title", () => {
  it("titles a completed sale 'Payment Complete'", () => {
    renderReceipt("completed");
    expect(screen.getByRole("heading", { name: "Payment Complete" })).toBeInTheDocument();
    expect(screen.queryByText("Order Voided")).not.toBeInTheDocument();
  });

  it("titles a refunded order 'Order Refunded'", () => {
    renderReceipt("refunded");
    expect(screen.getByRole("heading", { name: "Order Refunded" })).toBeInTheDocument();
  });

  it("titles a voided order 'Order Voided'", () => {
    renderReceipt("voided");
    expect(screen.getByRole("heading", { name: "Order Voided" })).toBeInTheDocument();
  });

  it("shows refund + void actions for a completed sale (owner)", () => {
    renderReceipt("completed");
    expect(screen.getByRole("button", { name: "Refund this order" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Void this order" })).toBeInTheDocument();
  });
});
