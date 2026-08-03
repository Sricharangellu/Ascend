/**
 * @vitest-environment jsdom
 *
 * Retail setup checklist — live completion detection against the MSW mock
 * backend (which mirrors real response shapes). The mock tenant is fully set
 * up (outlets, registers, tax rates, payment modes, products, stock), so
 * those tasks report done; the receipt task fails closed because the mock has
 * no receipts endpoint — exactly the "not configured yet" behavior a fresh
 * tenant sees.
 */

import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { evaluateRetailSetupTasks } from "@/components/setup/RetailSetupChecklist";

describe("evaluateRetailSetupTasks", () => {
  it("detects completion from live tenant data", async () => {
    const tasks = await evaluateRetailSetupTasks();
    const byKey = Object.fromEntries(tasks.map((t) => [t.key, t.done]));

    expect(tasks).toHaveLength(7);
    expect(byKey["outlet"]).toBe(true);    // mock seeds outlets
    expect(byKey["register"]).toBe(true);  // ...with registers
    expect(byKey["tax"]).toBe(false);      // mock tenant has no tax rates yet
    expect(byKey["payments"]).toBe(false); // ...or payment modes
    expect(byKey["product"]).toBe(true);   // seeded catalog
    expect(byKey["receive"]).toBe(true);   // seeded stock levels
    expect(byKey["receipt"]).toBe(false);  // no receipt configured — fails closed
  });

  it("fails closed to not-done when the backend is unreachable", async () => {
    server.use(
      http.get("*/api/v1/outlets", () => HttpResponse.error()),
      http.get("*/api/v1/settings/tax-rates", () => HttpResponse.error()),
      http.get("*/api/v1/settings/payment-modes", () => HttpResponse.error()),
      http.get("*/api/v1/catalog", () => HttpResponse.error()),
      http.get("*/api/v1/inventory/levels", () => HttpResponse.error()),
    );

    const tasks = await evaluateRetailSetupTasks();
    expect(tasks.every((t) => !t.done)).toBe(true);

    server.resetHandlers();
  });

  it("gives every task a setup deep-link", async () => {
    const tasks = await evaluateRetailSetupTasks();
    for (const task of tasks) {
      expect(task.href.startsWith("/")).toBe(true);
      expect(task.label.length).toBeGreaterThan(0);
    }
  });
});
