import { expect, test } from "@playwright/test";
import { injectAdminSession } from "./fixtures/admin";

test.describe("Admin app accounts", () => {
  test.beforeEach(async ({ page, request }) => {
    await injectAdminSession(page, request);
  });

  test("accounts table renders with auth column", async ({ page }) => {
    await page.goto("/staff/app-accounts");
    await expect(page.getByTestId("admin-app-accounts-page")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("admin-app-accounts-table")).toBeVisible();
    await expect(page.getByTestId("admin-app-accounts-table").locator("thead tr").first().getByText("Вход")).toBeVisible();
  });
});
