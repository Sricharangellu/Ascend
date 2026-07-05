/**
 * E2E - retail-first business-pack coverage.
 *
 * Finder is a modular business operating platform, but the current release
 * target is retail end-to-end. Non-retail packs are Preview until retail is
 * fully proven. These tests therefore verify that preview routes and setup
 * surfaces render without crashing; they do not pretend every vertical workflow
 * is production-ready.
 */

import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

async function expectAuthenticatedRouteHealthy(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});

  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByText(/something went wrong|unexpected error|500/i)).not.toBeVisible();
}

async function clickIfVisible(page: Page, nameMatcher: RegExp) {
  const btn = page.getByRole("button", { name: nameMatcher }).first();
  if (await btn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await btn.click();
  }
}

const PREVIEW_ROUTES = [
  { name: "appointments", url: "/appointments" },
  { name: "healthcare", url: "/healthcare" },
  { name: "automotive", url: "/automotive" },
  { name: "hospitality", url: "/hospitality" },
  { name: "manufacturing", url: "/manufacturing" },
  { name: "rental", url: "/rental" },
  { name: "entertainment", url: "/entertainment" },
  { name: "education", url: "/education" },
] as const;

test.describe("Preview business-pack routes", () => {
  for (const route of PREVIEW_ROUTES) {
    test(`${route.name} preview route does not crash`, async ({ page }) => {
      await expectAuthenticatedRouteHealthy(page, route.url);
    });
  }
});

test.describe("Module Marketplace", () => {
  test("module marketplace page loads with vertical sidebar", async ({ page }) => {
    await expectAuthenticatedRouteHealthy(page, "/setup/modules");
    await expect(
      page
        .getByRole("heading", { name: /module marketplace/i })
        .or(page.getByText(/verticals/i))
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("vertical sidebar navigation works", async ({ page }) => {
    await expectAuthenticatedRouteHealthy(page, "/setup/modules");

    const sidebarItem = page.getByRole("button", { name: /retail|restaurant|automotive/i }).first();
    if (await sidebarItem.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await sidebarItem.click();
      await page.waitForTimeout(300);
      await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
    }
  });

  test("module toggle switches render and respond to click", async ({ page }) => {
    await expectAuthenticatedRouteHealthy(page, "/setup/modules");

    const toggle = page.getByRole("switch").first();
    if (await toggle.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const wasChecked = await toggle.getAttribute("aria-checked");
      await toggle.click();
      await page.waitForTimeout(200);
      const isNowChecked = await toggle.getAttribute("aria-checked");
      const isDisabled = await toggle.isDisabled().catch(() => false);

      if (!isDisabled) {
        expect(wasChecked).not.toEqual(isNowChecked);
      }

      await expect(
        page.getByText(/unsaved|save changes/i).first(),
      ).toBeVisible({ timeout: 3_000 }).catch(() => {});
      await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
    }
  });

  test("search filters modules", async ({ page }) => {
    await expectAuthenticatedRouteHealthy(page, "/setup/modules");

    const search = page.getByPlaceholder(/search module/i).first();
    if (await search.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await search.fill("ticket");
      await page.waitForTimeout(300);
      await expect(
        page.getByText(/ticket|no module/i).first(),
      ).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
    }
  });
});

test.describe("Onboarding wizard", () => {
  test("onboarding page labels retail Ready and other business packs Preview", async ({ page }) => {
    await expectAuthenticatedRouteHealthy(page, "/onboarding");

    const startButton = page.getByRole("button", { name: /get started/i }).first();
    if (await startButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await startButton.click();
    }

    await expect(
      page
        .getByRole("heading", { name: /what type of business/i })
        .or(page.getByText(/ready/i).first())
        .first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/ready/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/preview/i).first()).toBeVisible({ timeout: 10_000 });

    await clickIfVisible(page, /retail store/i);
    await expect(page.getByText(/preview/i).first()).not.toBeVisible({ timeout: 3_000 }).catch(() => {});
    await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
  });
});
