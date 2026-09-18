import { storageGet } from "./storage";
import { getServerUrl } from "./serverUrl";
import { getAuthAccessToken } from "./appAuth";
import { platformFetch } from "./platformFetch";

const ENV_URL = (typeof process !== "undefined" && process.env.NEXT_PUBLIC_MINIKBP_SERVER_URL) || "";

/** URL Django-бэкенда для push (настройки или env). */
export async function getPushBackendUrl(): Promise<string> {
  const fromEnv = String(ENV_URL).trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  try {
    const server = getServerUrl();
    if (server) return server.replace(/\/$/, "");
  } catch {}
  try {
    const raw = await storageGet("app_settings_v1");
    if (raw) {
      const s = JSON.parse(raw);
      const fromSettings = String(s?.pushBackendUrl || "").trim().replace(/\/$/, "");
      if (fromSettings) return fromSettings;
    }
  } catch {}
  return "";
}

export type PushRegisterPayload = {
  fcmToken: string;
  ejGroupId: string;
  groupName: string;
  deviceId: string;
  notifyTimetable: boolean;
  notifyJournal: boolean;
  active: boolean;
  platform?: string;
  timetableCat?: string;
  timetableEntityId?: string;
  timetableEntityName?: string;
};

export async function postPushRegister(payload: PushRegisterPayload): Promise<boolean> {
  const base = await getPushBackendUrl();
  if (!base) {
    console.warn("[Push] Django server URL not configured");
    return false;
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const access = await getAuthAccessToken();
  if (access) headers.Authorization = `Bearer ${access}`;

  const res = await platformFetch(`${base}/v0/push/register/`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...payload, platform: payload.platform || "android" }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[Push] register failed", res.status, text);
    return false;
  }

  console.log("[Push] registered on Django backend");
  return true;
}
