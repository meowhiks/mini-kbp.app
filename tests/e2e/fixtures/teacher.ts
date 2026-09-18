import { execSync } from "node:child_process";
import path from "node:path";
import { APIRequestContext, Page } from "@playwright/test";

export const E2E_TEACHER = {
  username: "e2e_teacher",
  password: "E2eTeacherPass1!",
};

const SESSION_KEY = "minikbp_staff_session_v1";
let seeded = false;

function ensureE2eSeed() {
  if (seeded) return;
  execSync("python manage.py seed_e2e", {
    cwd: path.join(process.cwd(), "server"),
    stdio: "pipe",
    env: { ...process.env, DJANGO_SETTINGS_MODULE: "kbp_server.settings", DJANGO_DEBUG: "1", DJANGO_SECRET_KEY: "e2e" },
  });
  seeded = true;
}

export async function loginTeacherViaApi(request: APIRequestContext) {
  ensureE2eSeed();
  const apiUrl = process.env.PLAYWRIGHT_API_URL || "http://127.0.0.1:8000";
  const resp = await request.post(`${apiUrl}/v0/auth/login/`, {
    data: { username: E2E_TEACHER.username, password: E2E_TEACHER.password },
  });
  if (!resp.ok()) {
    throw new Error(`Teacher login failed: ${resp.status()} ${await resp.text()}`);
  }
  return resp.json() as Promise<{
    access: string;
    refresh: string;
    teacher_id: number;
    full_name: string;
  }>;
}

export async function injectTeacherSession(page: Page, request: APIRequestContext) {
  const tokens = await loginTeacherViaApi(request);
  const serverUrl = process.env.PLAYWRIGHT_API_URL || "http://127.0.0.1:8000";
  await page.addInitScript(
    ({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session));
    },
    {
      key: SESSION_KEY,
      session: {
        role: "teacher",
        access: tokens.access,
        refresh: tokens.refresh,
        serverUrl,
        teacherId: tokens.teacher_id,
        fullName: tokens.full_name,
      },
    }
  );
}
