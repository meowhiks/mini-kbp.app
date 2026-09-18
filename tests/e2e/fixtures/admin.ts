import { execSync } from "node:child_process";
import path from "node:path";
import { APIRequestContext, Page } from "@playwright/test";

export const E2E_ADMIN = {
  username: "e2e_admin",
  password: "E2eAdminPass1!",
};

const SESSION_KEY = "minikbp_staff_session_v1";
let seeded = false;

function ensureE2eAdmin() {
  if (seeded) return;
  execSync("python manage.py seed_e2e", {
    cwd: path.join(process.cwd(), "server"),
    stdio: "pipe",
    env: { ...process.env, DJANGO_SETTINGS_MODULE: "kbp_server.settings", DJANGO_DEBUG: "1", DJANGO_SECRET_KEY: "e2e" },
  });
  seeded = true;
}

export async function loginAdminViaApi(request: APIRequestContext) {
  ensureE2eAdmin();
  const apiUrl = process.env.PLAYWRIGHT_API_URL || "http://127.0.0.1:8000";
  const resp = await request.post(`${apiUrl}/v0/auth/admin-login/`, {
    data: { username: E2E_ADMIN.username, password: E2E_ADMIN.password },
  });
  if (!resp.ok()) {
    throw new Error(`Admin login failed: ${resp.status()} ${await resp.text()}`);
  }
  return resp.json() as Promise<{
    access: string;
    refresh: string;
    username: string;
    is_staff: boolean;
    is_superuser: boolean;
  }>;
}

export async function injectAdminSession(page: Page, request: APIRequestContext) {
  const tokens = await loginAdminViaApi(request);
  const serverUrl = process.env.PLAYWRIGHT_API_URL || "http://127.0.0.1:8000";
  await page.addInitScript(
    ({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session));
    },
    {
      key: SESSION_KEY,
      session: {
        role: "admin",
        access: tokens.access,
        refresh: tokens.refresh,
        serverUrl,
        username: tokens.username,
        isSuperuser: tokens.is_superuser,
      },
    }
  );
}
