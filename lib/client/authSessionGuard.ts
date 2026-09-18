/**
 * При протухшем/битом JWT — сброс локальных сессий и жёсткий переход на экран входа.
 */

import { INVALID_TOKEN_MESSAGE } from "@/lib/client/authErrorCopy";

let reauthInFlight = false;

export function isInvalidTokenResponse(status: number, detail: string, hadAuth: boolean): boolean {
  if (!hadAuth) return false;
  if (status === 401) return true;
  const d = detail.toLowerCase();
  if (status === 403 && (d.includes("токен") || d.includes("token"))) return true;
  if (d.includes("сессия завершена")) return true;
  return (
    d.includes("недействителен для любого типа токена") ||
    d.includes("not valid for any token type") ||
    d.includes("token_not_valid")
  );
}

function isDeadToken(detail: string): boolean {
  const d = detail.toLowerCase();
  return (
    d.includes("недействителен для любого типа токена") ||
    d.includes("not valid for any token type") ||
    d.includes("token_not_valid")
  );
}

export function handleInvalidToken(status: number, detail: string, hadAuth: boolean): void {
  if (!isInvalidTokenResponse(status, detail, hadAuth)) return;
  if (isDeadToken(detail)) {
    void forceReauth();
    return;
  }
  void trySilentReauthOrForce();
}

async function trySilentReauthOrForce(): Promise<void> {
  if (reauthInFlight) return;
  const { trySilentReauth } = await import("@/lib/client/tokenRefresh");
  if (await trySilentReauth()) return;
  await forceReauth();
}

const LOGIN_STORAGE_KEYS = [
  "app_quick_login_token_v1",
  "app_auth_pending_v1",
  "app_session_v1",
  "student_session_v1",
  "minikbp_staff_session_v1",
];

/** Полный сброс клиентских сессий и переход на /app (без вызова logout API — токен уже мёртв). */
export async function forceReauth(): Promise<void> {
  if (typeof window === "undefined") return;
  if (reauthInFlight) return;
  reauthInFlight = true;

  try {
    const { clearAppSession, clearPendingAuth } = await import("@/lib/client/appAuth");
    const { clearStaffSession } = await import("@/lib/client/miniKbpServer");
    const { clearStudentSession } = await import("@/lib/client/studentApi");
    const { storageRemove } = await import("@/lib/client/storage");

    await Promise.all([
      clearPendingAuth(),
      clearAppSession(),
      clearStaffSession(),
      clearStudentSession(),
      ...LOGIN_STORAGE_KEYS.map((key) => storageRemove(key)),
    ]);

    try {
      sessionStorage.setItem("minikbp_auth_flash", INVALID_TOKEN_MESSAGE);
    } catch {
      // ignore
    }

    const path = (window.location.pathname.replace(/\/+$/, "") || "/").toLowerCase();
    const onAuthScreen = path === "/app" || path === "/";
    if (onAuthScreen) {
      window.location.reload();
    } else {
      const { getLkAppUrl } = await import("@/lib/client/lkAppUrl");
      window.location.replace(getLkAppUrl("/app"));
    }
  } catch {
    window.location.replace("/app");
  } finally {
    reauthInFlight = false;
  }
}
