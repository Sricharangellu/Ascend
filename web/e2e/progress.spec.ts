/**
 * E2E — Progress intelligence golden path.
 *
 * Walks the whole truth-tracking loop against the real backend:
 *   1. Open /progress
 *   2. State a hypothesis
 *   3. Try to decide it with no evidence → refused (the backend's rule,
 *      surfaced in the UI as a disabled control rather than a failed request)
 *   4. Attach evidence
 *   5. Validate it → the hypothesis is recorded as Validated, and survives a reload
 *
 * Step 3 is the point of this spec. `POST /progress/hypotheses/:id/decisions`
 * rejects a decision on a hypothesis with no evidence, and the page mirrors
 * that rule client-side; if the two ever drift, the user either sees a button
 * that 400s or is blocked from a decision the backend would accept. Asserting
 * both sides of the gate in one flow is what catches that.
 *
 * `exact: true` on the headings is load-bearing: role-name matching is
 * substring-and-case-insensitive by default, so a bare "Hypotheses" also
 * matches the empty state's "No hypotheses yet".
 */

import { test, expect, type Page } from "@playwright/test";
import { expectNoAppCrash } from "./helpers";

// Unique per run so repeated runs against a persistent DB never collide.
// Deliberately free of regex metacharacters — it is used inside locators.
const STATEMENT = `E2E belief best sellers run out early ${Date.now()}`;
const REASON = "Two SKUs stocked out before delivery.";

/**
 * This spec logs in through the form instead of reusing the suite's saved
 * `storageState`, and that is not incidental.
 *
 * `web/lib/auth.ts` keeps the user profile in **sessionStorage**, which
 * Playwright's `storageState` does not capture (it persists cookies and
 * localStorage only). Restoring that state therefore leaves `getUser()` null,
 * so `hasRole("manager")` is false and every manager-gated control stays
 * hidden — verified against the shipped dashboard ProgressPanel, whose
 * "New task" form is equally invisible under the saved state. A real login
 * runs `setSession`, which populates sessionStorage for this tab.
 *
 * The consequence is broader than this file: no storageState-based spec can
 * currently see a manager-gated control at all. Filed in WORK/LOOP_STATE.md.
 */
test.use({ storageState: { cookies: [], origins: [] } });

async function loginAndGoto(page: Page, path: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("owner@ascend.dev");
  await page.getByRole("textbox", { name: /password/i }).fill("AscendDemo!2026");
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((url) => new URL(url).pathname !== "/login", { timeout: 20_000 });
  await page.goto(path); // sessionStorage survives same-tab navigation
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
  await expect(page).not.toHaveURL(/\/login/);
}

test.describe("Progress — hypothesis to decision", () => {
  test("states a hypothesis, gates the decision on evidence, then validates it", async ({ page }) => {
    // Walks the whole loop — create, gate, attach, decide, reload — and each
    // mutation refetches both the list and the detail. That is more round
    // trips than the suite's 30s default budget allows; this is a deliberately
    // long golden path, not a slow page.
    test.setTimeout(120_000);

    await loginAndGoto(page, "/progress");
    await expectNoAppCrash(page);
    await expect(page.getByRole("heading", { name: "Hypotheses", exact: true }))
      .toBeVisible({ timeout: 15_000 });

    // ── 1. State a hypothesis ────────────────────────────────────────────
    await page.getByLabel("New hypothesis").fill(STATEMENT);
    await page.getByRole("button", { name: /add hypothesis/i }).click();

    // It appears in the list and is auto-selected, so the detail pane shows it.
    await expect(page.getByRole("heading", { name: STATEMENT, exact: true }))
      .toBeVisible({ timeout: 15_000 });

    // ── 2. The decision is gated until evidence exists ───────────────────
    // Same rule the backend enforces — asserted here so UI and API cannot drift.
    await expect(page.getByRole("button", { name: "Validate", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Invalidate", exact: true })).toBeDisabled();
    await expect(page.getByText(/attach at least one piece of evidence/i)).toBeVisible();

    // ── 3. Attach evidence ───────────────────────────────────────────────
    await page.getByLabel("Attach evidence").fill("30-day sales export");
    await page.getByRole("button", { name: "Attach", exact: true }).click();

    await expect(page.getByText("30-day sales export")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Evidence (1)")).toBeVisible();

    // ── 4. Now the decision is available ─────────────────────────────────
    const validate = page.getByRole("button", { name: "Validate", exact: true });
    await expect(validate).toBeEnabled({ timeout: 15_000 });

    await page.getByLabel(/^reason/i).fill(REASON);
    await validate.click();

    // ── 5. The loop is closed and persisted ──────────────────────────────
    // Decision controls disappear once decided, and the reason is on record.
    await expect(page.getByText(REASON)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Validate", exact: true })).toHaveCount(0);
    await expectNoAppCrash(page);

    // Survives a reload — this came from the database, not component state.
    await page.reload();
    await expect(page.getByRole("heading", { name: STATEMENT, exact: true }))
      .toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(REASON)).toBeVisible({ timeout: 15_000 });
  });

  test("the progress surface renders without crashing", async ({ page }) => {
    await loginAndGoto(page, "/progress");
    await expect(page.getByRole("heading", { name: "Hypotheses", exact: true }))
      .toBeVisible({ timeout: 15_000 });
    await expectNoAppCrash(page);
  });
});
