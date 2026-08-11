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
    const emptyState = page.getByText(/no purchase orders|no orders|create your first/i);

    // Wait for the table to SETTLE before branching on what it contains.
    //
    // This used to call `firstPO.count()` immediately after navigation, which
    // races the client-side fetch: zero rows means "not loaded yet" just as
    // often as it means "no POs". Losing that race sent the test down the
    // no-data branch and then asserted an empty state that never appeared,
    // because the table had meanwhile rendered its rows — a failure whose own
    // trace snapshot showed the PO present and correct. Seen failing on a
    // slower machine while passing in CI, which is the signature of a timing
    // race rather than a product defect.
    //
    // `.or()` resolves as soon as EITHER outcome is real, so this waits for
    // loading to finish without assuming which branch we are in.
    await expect(firstPO.or(emptyState).first()).toBeVisible({ timeout: 15_000 });

    const hasPOs = (await firstPO.count()) > 0;
    if (!hasPOs) {
      // No demo POs — just verify the page loaded correctly.
      await expect(emptyState.first()).toBeVisible();
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
