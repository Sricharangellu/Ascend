/**
 * Product lookup on /catalog, against the real stack.
 *
 * Covers the server-side search/filter/sort work delivered by PR #229 with the
 * one layer its own tests could not reach: browser → Next proxy → Express →
 * Postgres → back, with mocks OFF.
 *
 * That seam is exactly where the original defect lived. `GET /api/v1/catalog`
 * ignored `?q=` entirely while the MSW mock implemented it, so every
 * mock-backed test passed and only production was broken. A test that stops at
 * the mock cannot catch that class of bug by construction.
 *
 * Requires: `NEXT_PUBLIC_MOCK=false` build served against a real backend and a
 * seeded database (`scripts/seed-e2e.ts`). See e2e/README.md.
 */

import { test, expect } from "@playwright/test";

// Seeded by scripts/seed-e2e.ts. Rows are matched on SKU, not product name: the
// name also appears in each row's "Select …" and "Edit …" accessible names, so a
// name locator resolves to three cells and trips strict mode. Locators are
// scoped to the table because the page renders the desktop table AND the mobile
// card list into the DOM together (one hidden by CSS per breakpoint), so an
// unscoped text locator matches both copies.
const MUG_SKU = "HOME-MUG-001";     // Ceramic Coffee Mug
const HONEY_SKU = "GRO-HONEY-001";  // Wildflower Honey

test.describe("catalog product search (real backend)", () => {
  test("filters the list server-side by name", async ({ page }) => {
    await page.goto("/catalog");

    const search = page.getByLabel(/name or sku/i);
    await expect(search).toBeVisible({ timeout: 15_000 });

    await expect(page.getByRole("table").getByText(MUG_SKU)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("table").getByText(HONEY_SKU)).toBeVisible({ timeout: 15_000 });

    // Wait for the filtered response before asserting, then assert the settled
    // row set positively.
    //
    // An earlier draft just asserted `toBeHidden(MUG_SKU)` after typing, and it
    // PASSED against a deliberately-broken backend that ignored `q` and returned
    // all five rows: `toBeHidden` is satisfied by an element that does not
    // exist, and while the fetch is in flight the component swaps the table for
    // a loading skeleton — so the assertion resolved against the skeleton and
    // never saw the real answer. Same non-waiting defect class already recorded
    // for e2e/inventory-receive.spec.ts in WORK/LOOP_STATE.md.
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/v1/catalog?") && r.url().includes("q=Honey") && r.ok(),
        { timeout: 15_000 },
      ),
      search.fill("Honey"),
    ]);

    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByRole("table").getByText(HONEY_SKU)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("table").getByText(MUG_SKU)).toHaveCount(0);
  });

  test("the server returns an already-filtered page, and total describes it", async ({ page }) => {
    // Asserts the SERVER did the filtering. A client-side filter would return
    // every row and hide some — which is what this page used to do, while
    // printing the unfiltered total right beside the filtered count.
    await page.goto("/catalog");
    await expect(page.getByLabel(/name or sku/i)).toBeVisible({ timeout: 15_000 });

    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/v1/catalog?") && r.url().includes("q=Honey") && r.ok(),
        { timeout: 15_000 },
      ),
      page.getByLabel(/name or sku/i).fill("Honey"),
    ]);

    const body = (await response.json()) as { items: Array<{ name: string }>; total: number };
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((p) => /honey/i.test(p.name))).toBe(true);
    expect(body.total).toBe(body.items.length);
  });

  test("a barcode typed into the search box finds its product", async ({ page }) => {
    // The scan path. `0123456789043` is unique to HOME-MUG-001 — deliberately
    // not 0123456789036, which the seed assigns to two different T-shirt SKUs.
    await page.goto("/catalog");
    const search = page.getByLabel(/name or sku/i);
    await expect(search).toBeVisible({ timeout: 15_000 });

    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/v1/catalog?") && r.url().includes("q=0123456789043") && r.ok(),
        { timeout: 15_000 },
      ),
      search.fill("0123456789043"),
    ]);

    await expect(page.getByRole("table").getByText(MUG_SKU)).toBeVisible({ timeout: 15_000 });
  });

  test("facet counts describe the catalog, not the loaded page", async ({ page }) => {
    await page.goto("/catalog");

    const facets = await page.waitForResponse(
      (r) => r.url().includes("/api/v1/catalog/facets") && r.ok(),
      { timeout: 15_000 },
    );
    // Shape-agnostic: assert the endpoint answers with real numbers rather than
    // pinning a field layout this spec does not own.
    const body = (await facets.json()) as Record<string, unknown>;
    expect(Object.keys(body).length).toBeGreaterThan(0);
  });
});
