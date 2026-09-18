package com.kbp.journal;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/** Локальное хранилище — те же ключи, что в lib/client (app_settings_v1). */
public final class SessionStore {
    private static final String PREFS = "minikbp_native_v1";
    private static final String KEY_APP_SESSION = "app_session_v1";
    private static final String KEY_STUDENT_SESSION = "student_session_v1";
    private static final String KEY_APP_SETTINGS = "app_settings_v1";
    private static final String KEY_JOURNAL_CACHE = "cached_journal_data";
    private static final String KEY_TIMETABLE_CACHE = "cached_timetable_data";
    private static final String KEY_TIMETABLE_URL = "cached_timetable_url";
    private static final String KEY_LOGIN_HISTORY = "journal_login_history_v1";
    private static final String KEY_SELECTED_TIMETABLE = "cached_selected_timetable_result";
    private static final String KEY_SEARCH_INDEX = "timetable_search_index_v1";
    private static final String KEY_RECENT_SEARCHES = "recent_timetable_searches_v1";
    private static final String KEY_STAFF_SESSION = "minikbp_staff_session_v1";

    private SessionStore() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static boolean hasSession(Context ctx) {
        return prefs(ctx).contains(KEY_APP_SESSION) || prefs(ctx).contains(KEY_STAFF_SESSION);
    }

    public static JSONObject getAppSession(Context ctx) {
        try {
            String raw = prefs(ctx).getString(KEY_APP_SESSION, null);
            if (raw == null) return null;
            return new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }

    public static String getAccessToken(Context ctx) {
        JSONObject staff = getStaffSession(ctx);
        if (staff != null && staff.has("access")) return staff.optString("access", null);
        JSONObject s = getAppSession(ctx);
        if (s == null) return null;
        return s.optString("access", null);
    }

    public static JSONObject getStaffSession(Context ctx) {
        try {
            String raw = prefs(ctx).getString(KEY_STAFF_SESSION, null);
            if (raw != null) return new JSONObject(raw);
        } catch (Exception ignored) {}
        return null;
    }

    public static void saveStaffSession(Context ctx, JSONObject session) throws Exception {
        prefs(ctx).edit()
                .putString(KEY_STAFF_SESSION, session.toString())
                .remove(KEY_APP_SESSION)
                .remove(KEY_STUDENT_SESSION)
                .apply();
    }

    public static boolean isStaffJournal(Context ctx) {
        JSONObject staff = getStaffSession(ctx);
        if (staff == null) return false;
        String role = staff.optString("role", "");
        return "teacher".equals(role) || "admin".equals(role);
    }

    public static void clearStaffSession(Context ctx) {
        prefs(ctx).edit().remove(KEY_STAFF_SESSION).apply();
    }

    public static void saveAppSession(Context ctx, JSONObject session) throws Exception {
        prefs(ctx).edit()
                .putString(KEY_APP_SESSION, session.toString())
                .putString(KEY_STUDENT_SESSION, session.toString())
                .remove(KEY_STAFF_SESSION)
                .apply();
    }

    public static void clearSession(Context ctx) {
        prefs(ctx).edit()
                .remove(KEY_APP_SESSION)
                .remove(KEY_STUDENT_SESSION)
                .remove(KEY_STAFF_SESSION)
                .apply();
    }

    public static void cacheJournal(Context ctx, String json) {
        prefs(ctx).edit().putString(KEY_JOURNAL_CACHE, json).apply();
    }

    public static String getCachedJournal(Context ctx) {
        return prefs(ctx).getString(KEY_JOURNAL_CACHE, null);
    }

    public static void cacheTimetable(Context ctx, String json, String url) {
        prefs(ctx).edit()
                .putString(KEY_TIMETABLE_CACHE, json)
                .putString(KEY_TIMETABLE_URL, url != null ? url : "")
                .apply();
    }

    public static String getCachedTimetable(Context ctx) {
        return prefs(ctx).getString(KEY_TIMETABLE_CACHE, null);
    }

    public static String getCachedTimetableUrl(Context ctx) {
        return prefs(ctx).getString(KEY_TIMETABLE_URL, null);
    }

    public static void clearTimetableCache(Context ctx) {
        prefs(ctx).edit()
                .remove(KEY_TIMETABLE_CACHE)
                .remove(KEY_TIMETABLE_URL)
                .apply();
    }

    public static void clearJournalCache(Context ctx) {
        prefs(ctx).edit().remove(KEY_JOURNAL_CACHE).apply();
    }

    public static void clearLoginHistory(Context ctx) {
        prefs(ctx).edit().remove(KEY_LOGIN_HISTORY).apply();
    }

    private static JSONObject getSettingsObj(Context ctx) {
        try {
            String raw = prefs(ctx).getString(KEY_APP_SETTINGS, null);
            if (raw != null) return new JSONObject(raw);
        } catch (Exception ignored) {}
        return new JSONObject();
    }

    private static void saveSettings(Context ctx, JSONObject obj) {
        try {
            prefs(ctx).edit().putString(KEY_APP_SETTINGS, obj.toString()).apply();
        } catch (Exception ignored) {}
    }

    public static boolean getBool(Context ctx, String key, boolean defaultValue) {
        return getSettingsObj(ctx).optBoolean(key, defaultValue);
    }

    public static void setBool(Context ctx, String key, boolean value) {
        try {
            JSONObject obj = getSettingsObj(ctx);
            obj.put(key, value);
            saveSettings(ctx, obj);
        } catch (Exception ignored) {}
    }

    public static String getStringSetting(Context ctx, String key, String defaultValue) {
        return getSettingsObj(ctx).optString(key, defaultValue);
    }

    public static void setStringSetting(Context ctx, String key, String value) {
        try {
            JSONObject obj = getSettingsObj(ctx);
            obj.put(key, value);
            saveSettings(ctx, obj);
        } catch (Exception ignored) {}
    }

    public static boolean notificationsEnabled(Context ctx) {
        return getBool(ctx, "notificationsEnabled", false);
    }

    public static void setNotificationsEnabled(Context ctx, boolean enabled) {
        setBool(ctx, "notificationsEnabled", enabled);
    }

    public static boolean notifyJournal(Context ctx) {
        return getBool(ctx, "notifyJournal", true);
    }

    public static void setNotifyJournal(Context ctx, boolean enabled) {
        setBool(ctx, "notifyJournal", enabled);
    }

    public static boolean notifyTimetable(Context ctx) {
        return getBool(ctx, "notifyTimetable", true);
    }

    public static void setNotifyTimetable(Context ctx, boolean enabled) {
        setBool(ctx, "notifyTimetable", enabled);
    }

    public static String getTheme(Context ctx) {
        return getStringSetting(ctx, "theme", "light");
    }

    public static void setTheme(Context ctx, String theme) {
        setStringSetting(ctx, "theme", theme);
    }

    public static String getTimetableDensity(Context ctx) {
        String v = getStringSetting(ctx, "timetableDensity", "normal");
        if ("compact".equals(v) || "small".equals(v)) return v;
        return "normal";
    }

    public static void setTimetableDensity(Context ctx, String density) {
        setStringSetting(ctx, "timetableDensity", density);
    }

    public static void setSelectedTimetable(Context ctx, JSONObject selected) {
        try {
            if (selected == null) {
                prefs(ctx).edit().remove(KEY_SELECTED_TIMETABLE).apply();
            } else {
                prefs(ctx).edit().putString(KEY_SELECTED_TIMETABLE, selected.toString()).apply();
            }
        } catch (Exception ignored) {}
    }

    public static JSONObject getSelectedTimetable(Context ctx) {
        try {
            String raw = prefs(ctx).getString(KEY_SELECTED_TIMETABLE, null);
            if (raw != null) return new JSONObject(raw);
        } catch (Exception ignored) {}
        return null;
    }

    public static void setSearchIndex(Context ctx, JSONObject index) {
        try {
            prefs(ctx).edit().putString(KEY_SEARCH_INDEX, index.toString()).apply();
        } catch (Exception ignored) {}
    }

    public static JSONObject getSearchIndex(Context ctx) {
        try {
            String raw = prefs(ctx).getString(KEY_SEARCH_INDEX, null);
            if (raw != null) return new JSONObject(raw);
        } catch (Exception ignored) {}
        return null;
    }

    public static JSONArray getRecentTimetableSearches(Context ctx) {
        try {
            String raw = prefs(ctx).getString(KEY_RECENT_SEARCHES, null);
            if (raw != null) return new JSONArray(raw);
        } catch (Exception ignored) {}
        return new JSONArray();
    }

    public static void setRecentTimetableSearches(Context ctx, JSONArray arr) {
        try {
            prefs(ctx).edit().putString(KEY_RECENT_SEARCHES, arr.toString()).apply();
        } catch (Exception ignored) {}
    }

    public static String getStringRaw(Context ctx, String key) {
        return prefs(ctx).getString(key, null);
    }

    public static void setStringRaw(Context ctx, String key, String value) {
        prefs(ctx).edit().putString(key, value).apply();
    }
}
