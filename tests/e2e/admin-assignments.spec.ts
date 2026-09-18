import { expect, test } from "@playwright/test";
import { injectAdminSession } from "./fixtures/admin";

test.describe("Admin assignments", () => {
  test.beforeEach(async ({ page, request }) => {
    await injectAdminSession(page, request);
  });

  test("assignments table renders", async ({ page }) => {
    await page.goto("/staff/assignments");
    await expect(page.getByTestId("admin-assignments-page")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("admin-assignments-table")).toBeVisible();
    await expect(page.getByTestId("admin-assignments-table").locator("thead tr").first().getByText("Преподаватель")).toBeVisible();
  });
});
