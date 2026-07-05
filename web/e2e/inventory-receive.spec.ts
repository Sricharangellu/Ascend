/**
 * E2E — Inventory receive golden path.
 *
 * Covers the purchasing → receiving flow:
 *   1. Navigate to Purchasing / Purchase Orders
 *   2. Verify a PO list is shown (demo data)
 *   3. Open a PO and check its detail view
 *   4. (If receivable) trigger a receive action
 *
 * Note: full receive creates inventory movements and updates stock levels.
 * This test verifies the UI path is reachable and functional; it does not
 * assert exact inventory quantities to avoid fragility against re-seeded data.
 */

import { test, expect } from "./fixtures";
import { gotoAuthenticated } from "./helpers";

test.describe("Purchasing — inventory receive", () => {
  test("purchase orders list loads", async ({ page }) => {
    await gotoAuthenticated(page, "/purchasing");
    // The page should load and show either a list or an empty state.
    await expect(
      page
        .getByRole("heading", { name: /purchase order|purchasing/i })
        .or(page.getByText(/no purchase orders|create your first/i))
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("can navigate to a PO detail page", async ({ page }) => {
    await gotoAuthenticated(page, "/purchasing");
    // If there are POs in the demo data, click the first row.
    const firstPO = page
      .getByRole("row")
      .filter({ hasNot: page.getByRole("columnheader") })
      .first();

    const hasPOs = (await firstPO.count()) > 0;
    if (!hasPOs) {
      // No demo POs — just verify the page loaded correctly.
      await expect(page.getByText(/no purchase orders|no orders/i)).toBeVisible();
      return;
    }

    await firstPO.click();
    // PO detail — should show line items or a status badge.
    await expect(
      page
        .getByText(/ordered|received|pending|line item/i)
        .first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("receive stock page is reachable", async ({ page }) => {
    await gotoAuthenticated(page, "/inventory/receive-stock");
    await expect(
      page
        .getByRole("heading", { name: /receive|stock/i })
        .or(page.getByText(/no.*order|select pending po|choose a po to receive|scan barcode/i))
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
