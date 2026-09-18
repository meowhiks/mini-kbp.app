package com.kbp.journal;

import android.content.Context;
import android.util.Log;

import com.google.android.gms.tasks.Tasks;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

import java.util.UUID;
import java.util.concurrent.TimeUnit;

/** FCM token registration on Django backend (/api/push/register/). */
public final class PushRegistrationHelper {
    private static final String TAG = "PushRegistration";
    private static final String KEY_FCM_TOKEN = "fcm_token_v1";
    private static final String KEY_DEVICE_ID = "push_device_id_v1";

    private PushRegistrationHelper() {}

    public static void setup(Context context) {
        Context app = context.getApplicationContext();
        if (!SessionStore.notificationsEnabled(app)) return;
        new Thread(() -> {
            try {
                String token = Tasks.await(FirebaseMessaging.getInstance().getToken(), 20, TimeUnit.SECONDS);
                if (token != null && !token.isEmpty()) {
                    registerToken(app, token, true);
                }
            } catch (Exception e) {
                Log.w(TAG, "FCM token fetch failed", e);
            }
        }).start();
    }

    public static void registerToken(Context context, String token, boolean active) {
        Context app = context.getApplicationContext();
        SessionStore.setStringSetting(app, KEY_FCM_TOKEN, token);
        if (!active || !SessionStore.notificationsEnabled(app)) {
            deactivate(app);
            return;
        }

        String groupId = resolveGroupId(app);
        String groupName = resolveGroupName(app, groupId);
        if (groupId.isEmpty() || groupName.isEmpty()) {
            Log.w(TAG, "Skip push register — no group context");
            return;
        }

        try {
            JSONObject body = new JSONObject();
            body.put("fcmToken", token);
            body.put("ejGroupId", groupId);
            body.put("groupName", groupName);
            body.put("deviceId", getOrCreateDeviceId(app));
            body.put("notifyTimetable", SessionStore.getBool(app, "notifyTimetable", true));
            body.put("notifyJournal", SessionStore.getBool(app, "notifyJournal", true));
            body.put("active", true);
            ApiClient.get().post("/api/push/register/", body);
            Log.d(TAG, "Push registered for group " + groupName);
        } catch (Exception e) {
            Log.w(TAG, "Push register failed", e);
        }
    }

    public static void deactivate(Context context) {
        Context app = context.getApplicationContext();
        String token = SessionStore.getStringSetting(app, KEY_FCM_TOKEN, "");
        if (token.isEmpty()) return;
        try {
            JSONObject body = new JSONObject();
            body.put("fcmToken", token);
            body.put("ejGroupId", resolveGroupId(app));
            body.put("groupName", resolveGroupName(app, resolveGroupId(app)));
            body.put("deviceId", getOrCreateDeviceId(app));
            body.put("notifyTimetable", false);
            body.put("notifyJournal", false);
            body.put("active", false);
            ApiClient.get().post("/api/push/register/", body);
            Log.d(TAG, "Push deactivated");
        } catch (Exception e) {
            Log.w(TAG, "Push deactivate failed", e);
        }
    }

    private static String getOrCreateDeviceId(Context app) {
        String id = SessionStore.getStringSetting(app, KEY_DEVICE_ID, "");
        if (!id.isEmpty()) return id;
        id = UUID.randomUUID().toString();
        SessionStore.setStringSetting(app, KEY_DEVICE_ID, id);
        return id;
    }

    private static String resolveGroupId(Context app) {
        JSONObject session = SessionStore.getAppSession(app);
        if (session != null) {
            String gid = session.optString("groupId", "").trim();
            if (!gid.isEmpty()) return gid;
        }
        JSONObject selected = SessionStore.getSelectedTimetable(app);
        if (selected != null && "group".equals(selected.optString("type", ""))) {
            return selected.optString("id", "").trim();
        }
        return "";
    }

    private static String resolveGroupName(Context app, String groupId) {
        JSONObject session = SessionStore.getAppSession(app);
        if (session != null) {
            String name = session.optString("groupName", "").trim();
            if (!name.isEmpty()) return name;
        }
        JSONObject selected = SessionStore.getSelectedTimetable(app);
        if (selected != null) {
            String name = selected.optString("name", "").trim();
            if (!name.isEmpty()) return name;
        }
        if (!groupId.isEmpty()) return "Группа " + groupId;
        return "";
    }
}
