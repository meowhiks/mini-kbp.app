import { expect, test } from "@playwright/test";
import { injectAdminSession } from "./fixtures/admin";

test.describe("Admin analytics", () => {
  test.beforeEach(async ({ page, request }) => {
    await injectAdminSession(page, request);
  });

  test("dashboard loads metrics without error", async ({ page }) => {
    await page.goto("/staff/dashboard");
    await expect(page.getByTestId("admin-analytics-page")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("admin-analytics-metrics")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Оценки за период")).toBeVisible();
    await expect(page.locator("text=Не удалось загрузить аналитику")).toHaveCount(0);
  });
});
