import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { getAppSession } from "./appAuth";
import { isNativeApp } from "./platform";
import { storageGet, storageSet } from "./storage";
import { postPushRegister } from "./pushBackend";
import { scheduleLocalNotification } from "./notifications";
import { getKbpGroupId, getKbpGroupsCache } from "./kbpStorageKeys";

const DEVICE_ID_KEY = "push_device_id_v1";
const FCM_TOKEN_KEY = "fcm_token_v1";

let handlersReady = false;

async function getOrCreateDeviceId(): Promise<string> {
  const existing = await storageGet(DEVICE_ID_KEY);
  if (existing) return existing;
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await storageSet(DEVICE_ID_KEY, id);
  return id;
}

async function readGroupContext(): Promise<{ ejGroupId: string; groupName: string } | null> {
  const ejGroupId = (await getKbpGroupId()) || "";
  if (ejGroupId) {
    let groupName = "";
    const selectedRaw = await storageGet("cached_selected_timetable_result");
    if (selectedRaw) {
      try {
        const o = JSON.parse(selectedRaw);
        if (o?.name) groupName = String(o.name);
      } catch {}
    }
    if (!groupName) {
      const groupsRaw = await getKbpGroupsCache();
      if (groupsRaw) {
        try {
          const list = JSON.parse(groupsRaw) as Array<{ id?: string; name?: string }>;
          const g = list.find((x) => String(x?.id) === ejGroupId);
          if (g?.name) groupName = String(g.name);
        } catch {}
      }
    }
    if (!groupName) {
      const app = await getAppSession();
      if (app?.groupId === ejGroupId && app.groupName) groupName = app.groupName;
    }
    if (!groupName) groupName = `Группа ${ejGroupId}`;
    return { ejGroupId, groupName };
  }

  const app = await getAppSession();
  if (app?.groupId) {
    return {
      ejGroupId: app.groupId,
      groupName: app.groupName || `Группа ${app.groupId}`,
    };
  }

  return null;
}

async function readTimetableEntity(): Promise<{
  ejGroupId: string;
  groupName: string;
  timetableCat: string;
  timetableEntityId: string;
  timetableEntityName: string;
} | null> {
  const selectedRaw = await storageGet("cached_selected_timetable_result");
  let cat = "";
  let entityId = "";
  let entityName = "";
  if (selectedRaw) {
    try {
      const o = JSON.parse(selectedRaw);
      cat = String(o?.type || "").trim().toLowerCase();
      entityId = String(o?.id || "").trim();
      entityName = String(o?.name || "").trim();
    } catch {}
  }

  const legacy = await readGroupContext();
  if (cat && entityId) {
    const ejGroupId =
      cat === "group" ? entityId : legacy?.ejGroupId || entityId || "0";
    const groupName = entityName || legacy?.groupName || "-";
    return {
      ejGroupId,
      groupName,
      timetableCat: cat,
      timetableEntityId: entityId,
      timetableEntityName: entityName || groupName,
    };
  }

  if (!legacy) return null;
  return {
    ejGroupId: legacy.ejGroupId,
    groupName: legacy.groupName,
    timetableCat: "group",
    timetableEntityId: legacy.ejGroupId,
    timetableEntityName: legacy.groupName,
  };
}

async function readNotifyFlags(): Promise<{ notifyTimetable: boolean; notifyJournal: boolean; enabled: boolean }> {
  const defaults = { notifyTimetable: true, notifyJournal: true, enabled: false };
  const raw = await storageGet("app_settings_v1");
  if (!raw) return defaults;
  try {
    const s = JSON.parse(raw);
    return {
      enabled: Boolean(s?.notificationsEnabled),
      notifyTimetable: s?.notifyTimetable !== false,
      notifyJournal: s?.notifyJournal !== false,
    };
  } catch {
    return defaults;
  }
}

export async function registerPushWithBackend(fcmToken: string, opts?: { force?: boolean }): Promise<boolean> {
  const entity = await readTimetableEntity();
  const flags = await readNotifyFlags();
  if (!opts?.force && !flags.enabled) return false;

  const deviceId = await getOrCreateDeviceId();
  const access = await import("./appAuth").then((m) => m.getAuthAccessToken());
  if (!entity && !access) {
    console.warn("[Push] no group and no auth — skip register");
    return false;
  }

  const active = opts?.force ? flags.enabled : true;

  return postPushRegister({
    fcmToken,
    ejGroupId: entity?.ejGroupId || "0",
    groupName: entity?.groupName || "-",
    deviceId,
    notifyTimetable: flags.notifyTimetable,
    notifyJournal: flags.notifyJournal,
    active,
    timetableCat: entity?.timetableCat,
    timetableEntityId: entity?.timetableEntityId,
    timetableEntityName: entity?.timetableEntityName,
  });
}

export async function deactivatePushOnBackend(): Promise<void> {
  const token = await storageGet(FCM_TOKEN_KEY);
  if (!token) return;
  const deviceId = await getOrCreateDeviceId();
  const entity = await readTimetableEntity();
  await postPushRegister({
    fcmToken: token,
    ejGroupId: entity?.ejGroupId || "0",
    groupName: entity?.groupName || "-",
    deviceId,
    notifyTimetable: false,
    notifyJournal: false,
    active: false,
    timetableCat: entity?.timetableCat,
    timetableEntityId: entity?.timetableEntityId,
    timetableEntityName: entity?.timetableEntityName,
  });
}

function ensurePushHandlers() {
  if (handlersReady || !isNativeApp()) return;
  handlersReady = true;

  PushNotifications.addListener("registration", async (token) => {
    await storageSet(FCM_TOKEN_KEY, token.value);
    await registerPushWithBackend(token.value);
  });

  PushNotifications.addListener("registrationError", (err) => {
    console.error("[Push] registrationError", err);
  });

  PushNotifications.addListener("pushNotificationReceived", (n) => {
    const title = n.title || n.data?.title || "Мини КБиП";
    const body = n.body || n.data?.body || "";
    if (body) {
      void scheduleLocalNotification(title, body, Date.now(), "timetable");
    }
  });

  PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    console.log("[Push] action", action);
  });
}

/** Запросить разрешения FCM и зарегистрировать токен на Vercel. */
export async function setupRemotePushNotifications(): Promise<boolean> {
  if (!isNativeApp() || Capacitor.getPlatform() !== "android") {
    return false;
  }

  ensurePushHandlers();

  const perm = await PushNotifications.checkPermissions();
  let receive = perm.receive;
  if (receive !== "granted") {
    const req = await PushNotifications.requestPermissions();
    receive = req.receive;
  }
  if (receive !== "granted") {
    console.warn("[Push] permission denied");
    return false;
  }

  await PushNotifications.register();

  const cached = await storageGet(FCM_TOKEN_KEY);
  if (cached) {
    await registerPushWithBackend(cached);
  }

  return true;
}

/** Переслать настройки уведомлений на бэкенд (без повторного register). */
export async function syncPushSubscriptionSettings(): Promise<void> {
  const flags = await readNotifyFlags();
  const token = await storageGet(FCM_TOKEN_KEY);
  if (!token) return;
  if (!flags.enabled) {
    await deactivatePushOnBackend();
    return;
  }
  await registerPushWithBackend(token);
}

/** После входа или включения уведомлений — зарегистрировать FCM на сервере. */
export async function ensurePushRegisteredOnServer(): Promise<void> {
  if (!isNativeApp() || Capacitor.getPlatform() !== "android") return;
  const flags = await readNotifyFlags();
  if (!flags.enabled) return;
  const access = await import("./appAuth").then((m) => m.getAuthAccessToken());
  const group = await readGroupContext();
  if (!access && !group) return;

  ensurePushHandlers();
  const cached = await storageGet(FCM_TOKEN_KEY);
  if (cached) {
    await registerPushWithBackend(cached);
    return;
  }
  await setupRemotePushNotifications();
}
