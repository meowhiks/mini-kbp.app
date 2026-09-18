package com.kbp.journal;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Поиск расписаний kbp.by (порт searchApi.ts). */
public final class TimetableSearchHelper {
    private static final long DAY_MS = 24L * 60 * 60 * 1000;
    private static final int MAX_RECENT = 5;

    private TimetableSearchHelper() {}

    public static List<SearchResult> listEntities(Context ctx) throws IOException {
        JSONObject index = ensureIndex(ctx, false);
        return toResultList(index.optJSONArray("items"));
    }

    public static List<SearchResult> search(Context ctx, String query) throws IOException {
        if (query == null || query.trim().isEmpty()) return listEntities(ctx);
        JSONObject index = ensureIndex(ctx, false);
        JSONArray items = index.optJSONArray("items");
        if (items == null || items.length() == 0) {
            index = ensureIndex(ctx, true);
            items = index.optJSONArray("items");
        }
        String q = normalize(query);
        List<Scored> scored = new ArrayList<>();
        if (items != null) {
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                if (item == null) continue;
                SearchResult r = fromJson(item);
                int score = scoreItem(r.name, q, query.length());
                if (score > 0) scored.add(new Scored(r, score));
            }
        }
        scored.sort((a, b) -> {
            if (b.score != a.score) return b.score - a.score;
            return a.result.name.compareToIgnoreCase(b.result.name);
        });
        List<SearchResult> out = new ArrayList<>();
        for (int i = 0; i < Math.min(50, scored.size()); i++) out.add(scored.get(i).result);
        return out;
    }

    public static JSONObject fetchByCategory(String category, String id) throws IOException {
        String url = "https://kbp.by/rasp/timetable/view_beta_kbp/?page=stable&cat=" + category + "&id=" + id;
        String html = TimetableHelper.fetchGet(url);
        JSONObject data = TimetableHelper.parseTimetableHtml(html, id, category + "-" + id);
        try {
            Matcher titleM = Pattern.compile("<title>([^<]+)</title>", Pattern.CASE_INSENSITIVE).matcher(html);
            if (titleM.find()) {
                String title = TimetableSearchHelper.cleanEntityTitle(titleM.group(1));
                if (!title.isEmpty()) {
                    data.put("groupName", title);
                    data.put("title", title);
                }
            }
            data.put("id", id);
            data.put("category", category);
            data.put("url", url);
        } catch (Exception ignored) {}
        return data;
    }

    public static int forceRebuildIndex(Context ctx) throws IOException {
        JSONObject index = ensureIndex(ctx, true);
        JSONArray items = index.optJSONArray("items");
        return items != null ? items.length() : 0;
    }

    public static void saveRecentSearch(Context ctx, SearchResult result) {
        try {
            JSONArray recent = SessionStore.getRecentTimetableSearches(ctx);
            JSONArray next = new JSONArray();
            next.put(result.toJson());
            for (int i = 0; i < recent.length() && next.length() < MAX_RECENT; i++) {
                JSONObject item = recent.optJSONObject(i);
                if (item == null) continue;
                if (item.optString("id").equals(result.id) && item.optString("type").equals(result.type)) continue;
                next.put(item);
            }
            SessionStore.setRecentTimetableSearches(ctx, next);
        } catch (Exception ignored) {}
    }

    public static List<SearchResult> getRecentSearches(Context ctx) {
        return toResultList(SessionStore.getRecentTimetableSearches(ctx));
    }

    public static void removeRecentSearch(Context ctx, SearchResult result) {
        try {
            JSONArray recent = SessionStore.getRecentTimetableSearches(ctx);
            JSONArray next = new JSONArray();
            for (int i = 0; i < recent.length(); i++) {
                JSONObject item = recent.optJSONObject(i);
                if (item == null) continue;
                if (item.optString("id").equals(result.id) && item.optString("type").equals(result.type)) continue;
                next.put(item);
            }
            SessionStore.setRecentTimetableSearches(ctx, next);
        } catch (Exception ignored) {}
    }

    public static String cleanEntityTitle(String raw) {
        if (raw == null) return "";
        return raw
                .replaceAll("(?i)\\s*-\\s*Расписание КБП\\s*", "")
                .replaceAll("(?i)^Расписание КБП\\s*-?\\s*", "")
                .replaceAll("(?i)Расписание КБП", "")
                .trim();
    }

    private static JSONObject ensureIndex(Context ctx, boolean force) throws IOException {
        if (!force) {
            JSONObject cached = SessionStore.getSearchIndex(ctx);
            if (cached != null && cached.has("savedAt") && cached.has("items")) {
                long age = System.currentTimeMillis() - cached.optLong("savedAt", 0);
                if (age < DAY_MS) return cached;
            }
        }
        String html = TimetableHelper.fetchGet("https://kbp.by/rasp/timetable/view_beta_kbp/?q=");
        JSONArray items = parseSearchResults(html);
        JSONObject index = new JSONObject();
        try {
            index.put("savedAt", System.currentTimeMillis());
            index.put("items", items);
            SessionStore.setSearchIndex(ctx, index);
        } catch (Exception ignored) {}
        return index;
    }

    private static JSONArray parseSearchResults(String html) {
        JSONArray results = new JSONArray();
        Set<String> seen = new HashSet<>();
        if (html == null) return results;

        Matcher blockM = Pattern.compile(
                "<div class=\"find_block\"[^>]*>([\\s\\S]*?)</div>\\s*</div>",
                Pattern.CASE_INSENSITIVE
        ).matcher(html);
        String findBlock = blockM.find() ? blockM.group(1) : html;

        Matcher itemM = Pattern.compile(
                "<div[^>]*>\\s*(?:<span class=\"type_find\">([^<]+)</span>\\s*)?" +
                        "<a[^>]*href=\"[^\"]*\\?cat=(group|teacher|place|subject)(?:&amp;|&)id=([^\"&]+)[^\"]*\">([^<]+)</a>\\s*</div>",
                Pattern.CASE_INSENSITIVE
        ).matcher(findBlock);

        while (itemM.find()) {
            String typeLabel = itemM.group(1) != null ? itemM.group(1).trim() : "";
            String type = itemM.group(2).trim();
            String id = itemM.group(3).trim();
            String name = itemM.group(4).trim();
            String key = type + ":" + id;
            if (seen.contains(key) || type.isEmpty() || id.isEmpty() || name.isEmpty()) continue;
            seen.add(key);
            try {
                results.put(new JSONObject()
                        .put("id", id)
                        .put("name", name)
                        .put("type", type)
                        .put("typeLabel", typeLabel.isEmpty() ? type : typeLabel));
            } catch (Exception ignored) {}
        }
        return results;
    }

    private static int scoreItem(String name, String q, int queryLen) {
        String n = normalize(name);
        int score = 0;
        if (n.equals(q)) score += 1000;
        if (n.startsWith(q)) score += 400;
        if (n.contains(q)) score += 220;
        score += Math.max(0, 100 - Math.abs(name.length() - queryLen));
        return score;
    }

    private static String normalize(String value) {
        return value.toLowerCase(Locale.ROOT)
                .replaceAll("\\s+", "")
                .replaceAll("[.,_()\\-]", "")
                .trim();
    }

    private static List<SearchResult> toResultList(JSONArray arr) {
        List<SearchResult> out = new ArrayList<>();
        if (arr == null) return out;
        for (int i = 0; i < arr.length(); i++) {
            JSONObject item = arr.optJSONObject(i);
            if (item != null) out.add(fromJson(item));
        }
        return out;
    }

    private static SearchResult fromJson(JSONObject item) {
        return new SearchResult(
                item.optString("id"),
                item.optString("name"),
                item.optString("type"),
                item.optString("typeLabel", item.optString("type"))
        );
    }

    private static final class Scored {
        final SearchResult result;
        final int score;

        Scored(SearchResult result, int score) {
            this.result = result;
            this.score = score;
        }
    }

    public static final class SearchResult {
        public final String id;
        public final String name;
        public final String type;
        public final String typeLabel;

        public SearchResult(String id, String name, String type, String typeLabel) {
            this.id = id;
            this.name = name;
            this.type = type;
            this.typeLabel = typeLabel;
        }

        JSONObject toJson() throws Exception {
            return new JSONObject()
                    .put("id", id)
                    .put("name", name)
                    .put("type", type)
                    .put("typeLabel", typeLabel);
        }
    }
}
