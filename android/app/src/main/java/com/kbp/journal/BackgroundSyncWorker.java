package com.kbp.journal;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Iterator;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class BackgroundSyncWorker extends Worker {

    private static final String TAG = "BackgroundSyncWorker";

    /*
     * Capacitor Preferences bridge:
     * @capacitor/preferences v5+  → "CAPPreferences"
     * @capacitor/preferences v4   → "PluginStorage"
     */
    private static final String CAP_PREFS_V5 = "CAPPreferences";
    private static final String CAP_PREFS_V4 = "PluginStorage";
    private static final String NATIVE_PREFS = "minikbp_native_v1";

    // ─── Ключи (совпадают с lib/client) ───────────────────────────────────────
    private static final String KEY_STUDENT_SESSION   = "student_session_v1";
    private static final String KEY_APP_SESSION       = "app_session_v1";
    private static final String KEY_LOGIN_DATA        = "kbp_login_data_v1";
    private static final String KEY_LOGIN_DATA_LEGACY = "ej_login_data";
    private static final String KEY_APP_SETTINGS      = "app_settings_v1";
    private static final String KEY_JOURNAL_CACHE     = "cached_journal_data";
    private static final String KEY_TIMETABLE_CACHE   = "cached_timetable_data";
    private static final String KEY_TIMETABLE_URL     = "cached_timetable_url";
    private static final String KEY_TIMETABLE_ENTITY  = "cached_selected_timetable_result";
    private static final String KEY_GROUP_ID          = "kbp_group_id_v1";
    private static final String KEY_GROUP_ID_LEGACY   = "ej_group_id";
    private static final String KEY_LAST_SYNC         = "last_sync_time";
    private static final String KEY_SERVER_URL        = "minikbp_server_url";

    // ─── Внутренние хэши Java-воркера ─────────────────────────────────────────
    private static final String KEY_LAST_JOURNAL_HASH   = "java_last_journal_hash";
    private static final String KEY_LAST_TIMETABLE_HASH = "java_last_timetable_hash";

    private static final String KBP_TIMETABLE = "https://kbp.by/rasp/timetable/view_beta_kbp/";
    private static final String DEFAULT_API  = "https://lk.mini-kbp.site";

    // Имя SharedPreferences, определяется один раз в ensureCapPrefsName()
    private String capPrefsName = null;

    public BackgroundSyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  Capacitor Preferences bridge
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Определение имени SharedPreferences для Capacitor:
     * v5 хранит в CAPPreferences, v4 — в PluginStorage.
     */
    private String ensureCapPrefsName() {
        if (capPrefsName != null) return capPrefsName;

        SharedPreferences nativePrefs = getApplicationContext()
                .getSharedPreferences(NATIVE_PREFS, Context.MODE_PRIVATE);
        if (nativePrefs.contains(KEY_STUDENT_SESSION) || nativePrefs.contains(KEY_APP_SESSION)) {
            Log.d(TAG, "Using minikbp_native_v1 (native app)");
            capPrefsName = NATIVE_PREFS;
            return capPrefsName;
        }

        SharedPreferences v5 = getApplicationContext()
                .getSharedPreferences(CAP_PREFS_V5, Context.MODE_PRIVATE);
        if (v5.contains(KEY_STUDENT_SESSION) || v5.contains(KEY_APP_SESSION)
                || v5.contains(KEY_GROUP_ID) || v5.contains(KEY_GROUP_ID_LEGACY)) {
            Log.d(TAG, "Using CAPPreferences (Capacitor v5)");
            capPrefsName = CAP_PREFS_V5;
            return capPrefsName;
        }

        SharedPreferences v4 = getApplicationContext()
                .getSharedPreferences(CAP_PREFS_V4, Context.MODE_PRIVATE);
        if (v4.contains(KEY_STUDENT_SESSION) || v4.contains(KEY_APP_SESSION)
                || v4.contains(KEY_GROUP_ID) || v4.contains(KEY_GROUP_ID_LEGACY)) {
            Log.d(TAG, "Using PluginStorage (Capacitor v4)");
            capPrefsName = CAP_PREFS_V4;
            return capPrefsName;
        }

        Log.d(TAG, "CAPPreferences keys: " + v5.getAll().keySet().toString());
        Log.d(TAG, "PluginStorage keys:  " + v4.getAll().keySet().toString());

        capPrefsName = CAP_PREFS_V5; // fallback
        return capPrefsName;
    }

    private String capGet(String key) {
        return getApplicationContext()
                .getSharedPreferences(ensureCapPrefsName(), Context.MODE_PRIVATE)
                .getString(key, null);
    }

    private void capSet(String key, String value) {
        getApplicationContext()
                .getSharedPreferences(ensureCapPrefsName(), Context.MODE_PRIVATE)
                .edit().putString(key, value).apply();
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  Точка входа WorkManager
    // ══════════════════════════════════════════════════════════════════════════

    @Override
    @NonNull
    public Result doWork() {
        Log.d(TAG, "=== BackgroundSyncWorker START (attempt " + getRunAttemptCount() + ") ===");

        // Диагностика: покажем что есть в хранилище
        logStorageState();

        try {
            String settingsRaw       = capGet(KEY_APP_SETTINGS);
            boolean notificationsEnabled = false;
            boolean notifyJournal        = true;
            boolean notifyTimetable      = true;

            if (settingsRaw != null) {
                JSONObject s     = new JSONObject(settingsRaw);
                notificationsEnabled = s.optBoolean("notificationsEnabled", false);
                notifyJournal        = s.optBoolean("notifyJournal", true);
                notifyTimetable      = s.optBoolean("notifyTimetable", true);
            }

            boolean forceSync = getInputData().getBoolean("force_sync", false);
            Log.d(TAG, "notificationsEnabled=" + notificationsEnabled
                    + " notifyJournal=" + notifyJournal
                    + " notifyTimetable=" + notifyTimetable
                    + " forceSync=" + forceSync);

            if (!notificationsEnabled && !forceSync) {
                Log.d(TAG, "Notifications disabled — skip");
                return Result.success();
            }

            int changes = 0;

            // Расписание не требует авторизации — запускаем первым
            if (notifyTimetable) {
                changes += syncTimetable();
            }

            // Журнал — через MiniKBP API (JWT), не через ej.kbp.by
            if (notifyJournal) {
                String access = resolveAccessToken();
                if (access != null) {
                    changes += syncJournalApi(access);
                } else {
                    Log.w(TAG, "Could not get JWT for journal sync");
                }
            }

            capSet(KEY_LAST_SYNC, String.valueOf(System.currentTimeMillis()));
            Log.d(TAG, "=== BackgroundSyncWorker END, changes=" + changes + " ===");
            return Result.success();

        } catch (Exception e) {
            if (isNetworkError(e)) {
                Log.w(TAG, "Network error — retry: " + e.getMessage());
                return Result.retry();
            }
            Log.e(TAG, "Sync failed", e);
            return Result.failure();
        }
    }

    private boolean isNetworkError(Throwable e) {
        while (e != null) {
            if (e instanceof java.net.UnknownHostException
                    || e instanceof java.net.SocketTimeoutException
                    || e instanceof java.io.IOException) {
                return true;
            }
            e = e.getCause();
        }
        return false;
    }

    /** Дамп ключевых значений хранилища для отладки */
    private void logStorageState() {
        Log.d(TAG, "--- Storage state ---");
        Log.d(TAG, "student_session:     " + (capGet(KEY_STUDENT_SESSION) != null ? "EXISTS" : "NULL"));
        Log.d(TAG, "app_session:         " + (capGet(KEY_APP_SESSION) != null ? "EXISTS" : "NULL"));
        Log.d(TAG, "kbp_login_data:      " + (capGetMigrated(KEY_LOGIN_DATA, KEY_LOGIN_DATA_LEGACY) != null ? "EXISTS" : "NULL"));
        Log.d(TAG, "cached_timetable_url:" + capGet(KEY_TIMETABLE_URL));
        Log.d(TAG, "cached_t_entity:     " + (capGet(KEY_TIMETABLE_ENTITY) != null ? "EXISTS" : "NULL"));
        Log.d(TAG, "kbp_group_id:        " + capGetMigrated(KEY_GROUP_ID, KEY_GROUP_ID_LEGACY));
        Log.d(TAG, "app_settings:        " + capGet(KEY_APP_SETTINGS));
        Log.d(TAG, "---------------------");
    }

    private String capGetMigrated(String newKey, String legacyKey) {
        String v = capGet(newKey);
        if (v != null && !v.isEmpty()) return v;
        return capGet(legacyKey);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  Timetable sync — не требует авторизации
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Синхронизация расписания kbp.by:
     * 1. Определяет URL расписания из 3 источников по приоритету.
     * 2. Скачивает HTML.
     * 3. Хэширует только блоки пар (игнорирует динамические части).
     * 4. Сравнивает с прошлым хэшем → уведомление при изменении.
     */
    private int syncTimetable() {
        try {
            String url = resolveTimetableUrl();
            if (url == null) {
                Log.w(TAG, "syncTimetable: no URL available — open timetable tab in app first");
                return 0;
            }
            Log.d(TAG, "syncTimetable: fetching " + url);

            String html = fetchGet(url, null);
            if (html == null || html.length() < 500) {
                Log.w(TAG, "syncTimetable: response too short (" + (html == null ? 0 : html.length()) + " chars)");
                return 0;
            }

            // Хэшируем только блоки пар, а не всю страницу (динамические части не попадут)
            String pairsSection = extractPairsSection(html);
            Log.d(TAG, "syncTimetable: pairsSection length=" + pairsSection.length());

            String currentHash = sha256(pairsSection);
            String lastHash    = capGet(KEY_LAST_TIMETABLE_HASH);
            Log.d(TAG, "syncTimetable: currentHash=" + currentHash.substring(0, 8) + "... lastHash=" + (lastHash != null ? lastHash.substring(0, 8) + "..." : "NULL"));

            if (currentHash.equals(lastHash)) {
                Log.d(TAG, "syncTimetable: no changes");
                return 0;
            }

            if (lastHash == null) {
                // Первый запуск — сохраняем базовый хэш
                capSet(KEY_LAST_TIMETABLE_HASH, currentHash);
                Log.d(TAG, "syncTimetable: baseline saved");
                return 0;
            }

            // Изменения есть — формируем конкретное сообщение
            String msg = buildTimetableMessage(html);
            Log.d(TAG, "syncTimetable: CHANGE DETECTED — " + msg);
            showNotification("📅 Изменение в расписании", msg, NotificationWorker.CHANNEL_ID_TIMETABLE);
            capSet(KEY_LAST_TIMETABLE_HASH, currentHash);
            return 1;

        } catch (Exception e) {
            Log.e(TAG, "syncTimetable failed", e);
            return 0;
        }
    }

    /**
     * Определение URL расписания из 3 источников (по приоритету):
     * 1. cached_timetable_url  — сохранён kbpApi.ts после fetchTimetable
     * 2. cached_selected_timetable_result — {id, type} из backgroundSync.ts
     * 3. Грубый fallback через поиск по group_id на kbp.by
     */
    private String resolveTimetableUrl() {
        // Источник 1: прямой URL (kbpApi.ts сохраняет при открытии расписания)
        String directUrl = capGet(KEY_TIMETABLE_URL);
        if (directUrl != null && !directUrl.isEmpty()) {
            Log.d(TAG, "resolveTimetableUrl: using cached_timetable_url");
            return directUrl;
        }

        // Источник 2: выбранная сущность расписания (backgroundSync.ts)
        String entityRaw = capGet(KEY_TIMETABLE_ENTITY);
        if (entityRaw != null) {
            try {
                JSONObject entity = new JSONObject(entityRaw);
                String id   = entity.optString("id", "");
                String type = entity.optString("type", "group");
                if (!id.isEmpty()) {
                    String url = KBP_TIMETABLE + "?page=stable&cat=" + type + "&id=" + id;
                    Log.d(TAG, "resolveTimetableUrl: built from cached_selected_timetable_result → " + url);
                    return url;
                }
            } catch (Exception e) {
                Log.w(TAG, "resolveTimetableUrl: entity parse failed", e);
            }
        }

        // Источник 3: fallback — поиск на kbp.by по названию группы из login data
        try {
            String loginRaw = capGetMigrated(KEY_LOGIN_DATA, KEY_LOGIN_DATA_LEGACY);
            if (loginRaw != null) {
                JSONObject login   = new JSONObject(loginRaw);
                String groupId     = login.optString("group_id", "");
                String studentName = login.optString("student_name", "");
                if (!groupId.isEmpty()) {
                    String url = resolveKbpTimetableUrl(groupId, studentName);
                    if (url != null) {
                        Log.d(TAG, "resolveTimetableUrl: resolved via kbp.by search → " + url);
                        capSet(KEY_TIMETABLE_URL, url);
                        return url;
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "resolveTimetableUrl: fallback search failed", e);
        }

        Log.e(TAG, "resolveTimetableUrl: all sources exhausted");
        return null;
    }

    /**
     * Резолвинг URL расписания через kbp.by search по названию группы.
     * groupId здесь — id группы MiniKBP / сохранённый id; для поиска используем
     * имя из login data или entity cache.
     */
    private String resolveKbpTimetableUrl(String groupId, String studentName) throws Exception {
        String groupName = null;
        String entityRaw = capGet(KEY_TIMETABLE_ENTITY);
        if (entityRaw != null) {
            try {
                groupName = new JSONObject(entityRaw).optString("name", null);
            } catch (Exception ignored) {}
        }
        if (groupName == null || groupName.isEmpty()) {
            // Прямой URL если groupId уже id расписания kbp.by
            if (groupId.matches("\\d+")) {
                return KBP_TIMETABLE + "?page=stable&cat=group&id=" + groupId;
            }
            groupName = groupId;
        }
        Log.d(TAG, "resolveKbpTimetableUrl: group name=" + groupName);

        String searchUrl = "https://kbp.by/rasp/timetable/view_beta_kbp/data/search.php"
                + "?term=" + urlEncode(groupName) + "&type=group";
        String searchResponse = fetchGet(searchUrl, null);
        if (searchResponse == null || searchResponse.isEmpty()) return null;

        JSONArray results = new JSONArray(searchResponse);
        for (int i = 0; i < results.length(); i++) {
            JSONObject item  = results.getJSONObject(i);
            String    label  = item.optString("label", "");
            String    kbpId  = item.optString("id", "");
            if (!kbpId.isEmpty() && label.toLowerCase().contains(groupName.toLowerCase())) {
                return KBP_TIMETABLE + "?page=stable&cat=group&id=" + kbpId;
            }
        }
        return null;
    }

    /**
     * Извлечение блоков пар расписания для хэширования:
     * берёт только div/td с классом pair, чтобы не реагировать
     * на изменение шапки, времени генерации и других динамических частей.
     */
    private String extractPairsSection(String html) {
        StringBuilder sb = new StringBuilder();

        // Блоки с классом pair (основная разметка kbp.by)
        Pattern p = Pattern.compile(
                "<(?:div|td)[^>]*class\\s*=\\s*[\"'][^\"']*\\bpair\\b[^\"']*[\"'][^>]*>[\\s\\S]*?</(?:div|td)>",
                Pattern.CASE_INSENSITIVE);
        Matcher m = p.matcher(html);
        while (m.find()) sb.append(m.group());

        if (sb.length() > 0) return sb.toString();

        // Fallback: вся таблица расписания
        int start = html.indexOf("<table");
        int end   = html.lastIndexOf("</table>");
        if (start != -1 && end > start) return html.substring(start, end + 8);

        return html;
    }

    /**
     * Формирование текста уведомления об изменении расписания:
     * ищет классы added/removed/changed в HTML.
     */
    private String buildTimetableMessage(String html) {
        boolean hasAdded   = html.contains("pair added")   || html.contains("pair  added");
        boolean hasRemoved = html.contains("pair removed") || html.contains("pair  removed");
        boolean hasChanged = html.contains("pair changed") || html.contains("pair  changed");

        if (hasAdded && hasRemoved) return "Добавлены и сняты пары";
        if (hasAdded)   return "Добавлены новые пары";
        if (hasRemoved) return "Сняты пары из расписания";
        if (hasChanged) return "Изменения в расписании";
        return "Обновлено расписание";
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  Journal sync — MiniKBP API (JWT), без ej.kbp.by
    // ══════════════════════════════════════════════════════════════════════════

    private String resolveApiBase() {
        String fromSession = null;
        try {
            String raw = capGet(KEY_STUDENT_SESSION);
            if (raw == null) raw = capGet(KEY_APP_SESSION);
            if (raw != null) {
                fromSession = new JSONObject(raw).optString("serverUrl", null);
            }
        } catch (Exception ignored) {}
        if (fromSession != null && !fromSession.isEmpty()) {
            return fromSession.replaceAll("/+$", "");
        }
        String stored = capGet(KEY_SERVER_URL);
        if (stored != null && !stored.isEmpty()) return stored.replaceAll("/+$", "");
        return DEFAULT_API;
    }

    private String resolveAccessToken() {
        try {
            String raw = capGet(KEY_STUDENT_SESSION);
            if (raw != null) {
                String access = new JSONObject(raw).optString("access", "");
                if (!access.isEmpty()) return access;
            }
            raw = capGet(KEY_APP_SESSION);
            if (raw != null) {
                String access = new JSONObject(raw).optString("access", "");
                if (!access.isEmpty()) return access;
            }
        } catch (Exception e) {
            Log.w(TAG, "resolveAccessToken failed", e);
        }
        return null;
    }

    private int syncJournalApi(String accessToken) {
        try {
            String url = resolveApiBase() + "/api/student/journal/";
            Log.d(TAG, "syncJournalApi: " + url);

            HttpURLConnection conn = openConnection(url);
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Authorization", "Bearer " + accessToken);
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("User-Agent", "MiniKBP-Android-BackgroundSync");
            conn.connect();
            int code = conn.getResponseCode();
            String body = readBody(conn);
            conn.disconnect();

            if (code != 200 || body == null || body.isEmpty()) {
                Log.w(TAG, "syncJournalApi: HTTP " + code);
                return 0;
            }

            String currentHash = sha256(body);
            String lastHash = capGet(KEY_LAST_JOURNAL_HASH);
            Log.d(TAG, "syncJournalApi: hash=" + currentHash.substring(0, 8) + "...");

            if (currentHash.equals(lastHash)) {
                Log.d(TAG, "syncJournalApi: no changes");
                return 0;
            }

            if (lastHash == null) {
                capSet(KEY_LAST_JOURNAL_HASH, currentHash);
                capSet(KEY_JOURNAL_CACHE, body);
                Log.d(TAG, "syncJournalApi: baseline saved");
                return 0;
            }

            int newCount = countNewMarksFromJson(body, capGet(KEY_JOURNAL_CACHE));
            String msg = newCount > 0
                    ? "Появилось " + newCount + " новых оценок!"
                    : "Изменились оценки в журнале";

            Log.d(TAG, "syncJournalApi: CHANGE — " + msg);
            showNotification("Обновление журнала", msg, NotificationWorker.CHANNEL_ID_JOURNAL);
            capSet(KEY_LAST_JOURNAL_HASH, currentHash);
            capSet(KEY_JOURNAL_CACHE, body);
            return Math.max(1, newCount);

        } catch (Exception e) {
            Log.e(TAG, "syncJournalApi failed", e);
            return 0;
        }
    }

    private int countNewMarksFromJson(String newJson, String oldJson) {
        try {
            int newCount = countMarksInJournalJson(newJson);
            if (oldJson == null) return 0;
            int oldCount = countMarksInJournalJson(oldJson);
            return Math.max(0, newCount - oldCount);
        } catch (Exception e) {
            return 0;
        }
    }

    private int countMarksInJournalJson(String json) throws Exception {
        JSONArray subjects = new JSONObject(json).optJSONArray("subjects");
        if (subjects == null) return 0;
        int count = 0;
        for (int i = 0; i < subjects.length(); i++) {
            JSONObject matrix = subjects.getJSONObject(i).optJSONObject("gradesMatrix");
            if (matrix == null) continue;
            for (Iterator<String> it = matrix.keys(); it.hasNext(); ) {
                JSONArray grades = matrix.optJSONArray(it.next());
                if (grades != null) count += grades.length();
            }
        }
        return count;
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  HTTP helpers
    // ══════════════════════════════════════════════════════════════════════════

    private String fetchGet(String urlStr, String cookies) throws Exception {
        HttpURLConnection conn = openGet(urlStr, cookies);
        String body = readBody(conn);
        conn.disconnect();
        return body;
    }

    private HttpURLConnection openGet(String urlStr, String cookies) throws Exception {
        HttpURLConnection conn = openConnection(urlStr);
        conn.setRequestMethod("GET");
        setCommonHeaders(conn, cookies);
        conn.connect();
        return conn;
    }


    private HttpURLConnection openConnection(String urlStr) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setConnectTimeout(15_000);
        conn.setReadTimeout(15_000);
        conn.setInstanceFollowRedirects(true);
        return conn;
    }

    private void setCommonHeaders(HttpURLConnection conn, String cookies) {
        conn.setRequestProperty("User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36");
        conn.setRequestProperty("Accept", "text/html,application/xhtml+xml,*/*;q=0.8");
        conn.setRequestProperty("Accept-Language", "ru,en;q=0.9");
        conn.setRequestProperty("Referer", "https://kbp.by/");
        conn.setRequestProperty("Cache-Control", "no-cache, no-store, must-revalidate");
        conn.setRequestProperty("Pragma", "no-cache");
        if (cookies != null && !cookies.isEmpty()) {
            conn.setRequestProperty("Cookie", cookies);
        }
    }

    private String readBody(HttpURLConnection conn) throws Exception {
        int code       = conn.getResponseCode();
        InputStream is = code < 400 ? conn.getInputStream() : conn.getErrorStream();
        if (is == null) return "";
        BufferedReader reader = new BufferedReader(new InputStreamReader(is, "UTF-8"));
        StringBuilder  sb     = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) sb.append(line).append('\n');
        reader.close();
        return sb.toString();
    }

    private String joinSetCookies(List<String> headers) {
        if (headers == null || headers.isEmpty()) return null;
        StringBuilder sb = new StringBuilder();
        for (String h : headers) {
            String pair = h.split(";")[0].trim();
            if (pair.contains("=")) {
                if (sb.length() > 0) sb.append("; ");
                sb.append(pair);
            }
        }
        return sb.length() > 0 ? sb.toString() : null;
    }

    private String urlEncode(String s) {
        try { return java.net.URLEncoder.encode(s, "UTF-8"); }
        catch (Exception e) { return s; }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  Utils
    // ══════════════════════════════════════════════════════════════════════════

    private String sha256(String data) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(data.getBytes("UTF-8"));
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (Exception e) {
            return String.valueOf(data.hashCode());
        }
    }

    private void showNotification(String title, String body, String channelId) {
        NotificationScheduler.scheduleImmediateNotification(
                getApplicationContext(), title, body, channelId);
    }
}