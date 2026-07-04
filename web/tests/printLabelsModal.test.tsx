import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PrintLabelsModal } from "@/app/(protected)/catalog/_components/PrintLabelsModal";
import type { Product } from "@/api-client/types";

const maliciousProduct = {
  id: "prod_xss",
  name: `Bad </div><img src=x onerror=alert("xss")>`,
  sku: `SKU<script>alert("sku")</script>`,
  barcode: `<svg onload=alert("barcode")>`,
  price_cents: 1299,
} as Product;

describe("PrintLabelsModal", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints label product fields as text, not executable HTML", async () => {
    const user = userEvent.setup();
    const popupDocument = document.implementation.createHTMLDocument("Popup");
    const print = vi.fn();
    const close = vi.fn();
    const popup = {
      document: popupDocument,
      print,
      close,
      setTimeout: vi.fn((handler: TimerHandler) => {
        if (typeof handler === "function") handler();
        return 0;
      }),
    } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(popup);

    render(<PrintLabelsModal selected={[maliciousProduct]} onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Print" }));

    expect(popupDocument.querySelector(".name")?.textContent).toBe(maliciousProduct.name);
    expect(popupDocument.querySelector(".sku")?.textContent).toBe(maliciousProduct.sku);
    expect(popupDocument.querySelector(".barcode-box")?.textContent).toBe(maliciousProduct.barcode);
    expect(popupDocument.querySelector("img")).toBeNull();
    expect(popupDocument.querySelector("script")).toBeNull();
    expect(popupDocument.querySelector("svg")).toBeNull();
    expect(print).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});
