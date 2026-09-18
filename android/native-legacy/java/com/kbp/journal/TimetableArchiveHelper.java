package com.kbp.journal;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** Офлайн-архив расписаний (offline_timetables_archive_v1). */
public final class TimetableArchiveHelper {
    private static final String KEY = "offline_timetables_archive_v1";

    private TimetableArchiveHelper() {}

    public static String archiveId(String type, String entityId) {
        return type + "|" + entityId;
    }

    public static void upsert(Context ctx, TimetableSearchHelper.SearchResult result, JSONObject data) {
        if (result == null || data == null) return;
        try {
            List<ArchiveEntry> list = loadAll(ctx);
            String id = archiveId(result.type, result.id);
            ArchiveEntry next = new ArchiveEntry(id, result, data, System.currentTimeMillis());
            boolean found = false;
            for (int i = 0; i < list.size(); i++) {
                if (list.get(i).id.equals(id)) {
                    list.set(i, next);
                    found = true;
                    break;
                }
            }
            if (!found) list.add(0, next);
            list.sort((a, b) -> Long.compare(b.savedAt, a.savedAt));
            saveAll(ctx, list);
        } catch (Exception ignored) {}
    }

    public static ArchiveEntry loadLatest(Context ctx) {
        List<ArchiveEntry> list = loadAll(ctx);
        return list.isEmpty() ? null : list.get(0);
    }

    public static void clear(Context ctx) {
        SessionStore.setStringRaw(ctx, KEY, "[]");
    }

    public static List<ArchiveEntry> loadAll(Context ctx) {
        List<ArchiveEntry> out = new ArrayList<>();
        try {
            String raw = SessionStore.getStringRaw(ctx, KEY);
            if (raw == null || raw.isEmpty()) return out;
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject item = arr.optJSONObject(i);
                if (item == null) continue;
                JSONObject resultObj = item.optJSONObject("result");
                JSONObject data = item.optJSONObject("data");
                if (resultObj == null || data == null) continue;
                TimetableSearchHelper.SearchResult result = new TimetableSearchHelper.SearchResult(
                        resultObj.optString("id"),
                        resultObj.optString("name"),
                        resultObj.optString("type"),
                        resultObj.optString("typeLabel", resultObj.optString("type"))
                );
                out.add(new ArchiveEntry(
                        item.optString("id", archiveId(result.type, result.id)),
                        result,
                        data,
                        item.optLong("savedAt", 0)
                ));
            }
            out.sort((a, b) -> Long.compare(b.savedAt, a.savedAt));
        } catch (Exception ignored) {}
        return out;
    }

    private static void saveAll(Context ctx, List<ArchiveEntry> list) throws Exception {
        JSONArray arr = new JSONArray();
        for (ArchiveEntry e : list) {
            arr.put(new JSONObject()
                    .put("id", e.id)
                    .put("savedAt", e.savedAt)
                    .put("result", e.result.toJson())
                    .put("data", e.data));
        }
        SessionStore.setStringRaw(ctx, KEY, arr.toString());
    }

    public static final class ArchiveEntry {
        public final String id;
        public final TimetableSearchHelper.SearchResult result;
        public final JSONObject data;
        public final long savedAt;

        ArchiveEntry(String id, TimetableSearchHelper.SearchResult result, JSONObject data, long savedAt) {
            this.id = id;
            this.result = result;
            this.data = data;
            this.savedAt = savedAt;
        }

        JSONObject toSelectedJson() throws Exception {
            return new JSONObject()
                    .put("id", result.id)
                    .put("name", result.name)
                    .put("type", result.type)
                    .put("typeLabel", result.typeLabel);
        }
    }
}
