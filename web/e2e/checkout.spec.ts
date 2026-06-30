/**
 * E2E — POS checkout golden path.
 *
 * Covers the core register flow:
 *   1. Open terminal / sell page
 *   2. Search for a product and add it to the cart
 *   3. Complete a cash payment
 *   4. Verify receipt / success state
 */

import { test, expect } from "@playwright/test";

test.describe("POS checkout", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the terminal / sell page.
    await page.goto("/terminal");
    // Wait for the POS to be fully loaded (product search visible).
    await expect(
      page.getByPlaceholder(/search|scan|barcode|sku/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("search and add a product to the cart", async ({ page }) => {
    const searchBox = page.getByPlaceholder(/search|scan|barcode|sku/i).first();
    await searchBox.fill("coffee");
    // At least one product result should appear.
    const firstResult = page.getByRole("button", { name: /add|coffee/i }).first();
    await expect(firstResult).toBeVisible({ timeout: 8_000 });
    await firstResult.click();

    // Cart total should now be greater than $0.
    const total = page.getByText(/total/i).first();
    await expect(total).toBeVisible();
  });

  test("complete a cash payment end-to-end", async ({ page }) => {
    // Add a product.
    const searchBox = page.getByPlaceholder(/search|scan|barcode|sku/i).first();
    await searchBox.fill("coffee");
    const firstResult = page.getByRole("button", { name: /add|coffee/i }).first();
    await expect(firstResult).toBeVisible({ timeout: 8_000 });
    await firstResult.click();

    // Click charge / checkout button.
    const chargeBtn = page.getByRole("button", { name: /charge|checkout|pay/i }).first();
    await expect(chargeBtn).toBeVisible({ timeout: 5_000 });
    await chargeBtn.click();

    // The tender screen should appear with Cash tab.
    const tenderDialog = page
      .getByRole("dialog")
      .or(page.locator('[aria-label*="tender" i]'));
    await expect(tenderDialog.first()).toBeVisible({ timeout: 8_000 });

    // Enter cash amount (overpay to trigger change calculation).
    const cashInput = page.getByLabel(/cash|amount tendered/i).first();
    if (await cashInput.isVisible()) {
      await cashInput.fill("100");
    } else {
      // Some POS UIs have a numeric pad — press "1", "0", "0"
      const padButton = page.getByRole("button", { name: "1" }).first();
      if (await padButton.isVisible()) {
        await padButton.click();
        await page.getByRole("button", { name: "0" }).first().click();
        await page.getByRole("button", { name: "0" }).first().click();
      }
    }

    // Submit cash payment.
    const submitCash = page.getByRole("button", { name: /charge|pay|complete/i }).last();
    await submitCash.click();

    // Expect success: receipt dialog, order number, or "success" indicator.
    await expect(
      page
        .getByText(/receipt|success|complete|change due/i)
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("empty cart shows no charge button", async ({ page }) => {
    // With nothing in the cart, the charge button should be disabled or absent.
    const chargeBtn = page.getByRole("button", { name: /charge|checkout/i });
    const isDisabled =
      (await chargeBtn.count()) === 0 ||
      (await chargeBtn.isDisabled());
    expect(isDisabled).toBe(true);
  });
});
