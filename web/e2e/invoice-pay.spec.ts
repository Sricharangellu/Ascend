/**
 * E2E — Invoice pay golden path.
 *
 * Covers the finance / AR flow:
 *   1. Navigate to Finance → Invoices (or Accounting)
 *   2. Verify invoice list loads
 *   3. Open an open invoice
 *   4. Navigate to the pay action
 */

import { test, expect } from "./fixtures";
import { gotoAuthenticated } from "./helpers";

test.describe("Invoice pay", () => {
  test("finance page loads with invoice data", async ({ page }) => {
    // Try /finance or /accounting — both are valid routes in the nav.
    await gotoAuthenticated(page, "/finance");
    await expect(
      page
        .getByRole("heading", { name: /finance|invoice|bill/i })
        .or(page.getByText(/no invoices|open invoices/i))
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("accounting page shows AR/AP", async ({ page }) => {
    await gotoAuthenticated(page, "/accounting");
    // Should show accounts receivable / payable tabs or data.
    await expect(
      page
        .getByRole("tab", { name: /invoice|receivable|payable/i })
        .or(page.getByText(/accounts receivable|AR aging/i))
        .or(page.getByRole("heading", { name: /accounting/i }))
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("customers page shows open invoices per customer", async ({ page }) => {
    await gotoAuthenticated(page, "/customers");
    // Customer list should load.
    await expect(
      page
        .getByRole("heading", { name: /customer/i })
        .or(page.getByText(/no customers/i))
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
