import { defineConfig, devices } from "@playwright/test";

const API_URL = process.env.PLAYWRIGHT_API_URL || "http://127.0.0.1:8000";
const WEB_URL = process.env.PLAYWRIGHT_WEB_URL || "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"]],
  use: {
    baseURL: WEB_URL,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command:
        "cd server && python manage.py migrate --noinput && python manage.py seed_e2e && python manage.py runserver 127.0.0.1:8000",
      url: `${API_URL}/admin/login/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        DJANGO_SETTINGS_MODULE: "kbp_server.settings",
      },
    },
    {
      command: "npm run dev -- --port 3000",
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        NEXT_PUBLIC_MINIKBP_SERVER_URL: API_URL,
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
