import { test, expect } from "@playwright/test";
import { injectTeacherSession } from "./fixtures/teacher";

test.describe("Teacher journal", () => {
  test.beforeEach(async ({ page, request }) => {
    await injectTeacherSession(page, request);
  });

  test("loads journal workspace with seeded grade", async ({ page }) => {
    await page.goto("/app/journal");
    await expect(page.getByText("E2E Subject")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("E2E-01")).toBeVisible();
    await expect(page.getByText("4", { exact: true }).first()).toBeVisible();
  });

  test("shows undo controls when editing", async ({ page }) => {
    await page.goto("/app/journal");
    await expect(page.getByRole("button", { name: "Отменить" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "История" })).toBeVisible();
  });
});
