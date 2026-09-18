package com.kbp.journal;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Загрузка и парсинг расписания kbp.by (полный порт kbpApi.ts). */
public final class TimetableHelper {
    private static final String KBP_TIMETABLE = "https://kbp.by/rasp/timetable/view_beta_kbp/";
    private static final String[] WEEK_DAYS = {
            "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"
    };

    private TimetableHelper() {}

    public static JSONObject fetchForProfile(JSONObject profile) throws IOException {
        String groupName = profile.optString("group_name", "");
        if (groupName.isEmpty()) groupName = profile.optString("groupName", "");
        if (groupName.isEmpty()) throw new IOException("Группа не указана в профиле");
        String url = resolveTimetableUrl(groupName);
        if (url == null) throw new IOException("Расписание для «" + groupName + "» не найдено на kbp.by");
        return fetchByUrl(url, groupName);
    }

    public static JSONObject fetchByCategory(String category, String id, String displayName) throws IOException {
        String url = KBP_TIMETABLE + "?page=stable&cat=" + category + "&id=" + id;
        JSONObject data = fetchByUrl(url, displayName);
        try {
            data.put("id", id);
            data.put("category", category);
        } catch (Exception ignored) {}
        return data;
    }

    public static JSONObject fetchByUrl(String url, String displayName) throws IOException {
        String html = fetchGet(url);
        if (html == null || html.length() < 500) throw new IOException("kbp.by вернул пустой ответ");
        JSONObject data = parseTimetableHtml(html, "", displayName);
        try {
            data.put("url", url);
            Matcher titleM = Pattern.compile("<title>([^<]+)</title>", Pattern.CASE_INSENSITIVE).matcher(html);
            if (titleM.find()) {
                String title = TimetableSearchHelper.cleanEntityTitle(titleM.group(1));
                if (!title.isEmpty()) data.put("title", title);
            }
        } catch (Exception ignored) {}
        return data;
    }

    public static String resolveTimetableUrl(String groupName) throws IOException {
        String searchUrl = "https://kbp.by/rasp/timetable/view_beta_kbp/data/search.php"
                + "?term=" + urlEncode(groupName) + "&type=group";
        String searchResponse = fetchGet(searchUrl);
        if (searchResponse == null || searchResponse.isEmpty()) return null;
        JSONArray results;
        try {
            results = new JSONArray(searchResponse);
        } catch (Exception e) {
            return null;
        }
        String lower = groupName.toLowerCase();
        for (int i = 0; i < results.length(); i++) {
            JSONObject item = results.optJSONObject(i);
            if (item == null) continue;
            String label = item.optString("label", "");
            String kbpId = item.optString("id", "");
            if (!kbpId.isEmpty() && label.toLowerCase().contains(lower)) {
                return KBP_TIMETABLE + "?page=stable&cat=group&id=" + kbpId;
            }
        }
        if (results.length() > 0) {
            JSONObject first = results.optJSONObject(0);
            if (first != null) {
                String kbpId = first.optString("id", "");
                if (!kbpId.isEmpty()) return KBP_TIMETABLE + "?page=stable&cat=group&id=" + kbpId;
            }
        }
        return null;
    }

    public static JSONObject parseTimetableHtml(String html, String groupId, String groupName) {
        JSONObject data = new JSONObject();
        try {
            data.put("groupId", groupId);
            data.put("groupName", groupName);
            data.put("pairs", new JSONArray());
            JSONArray dayStartTimes = new JSONArray();
            JSONArray dayReplacementStatus = new JSONArray();
            for (int i = 0; i < 6; i++) {
                dayStartTimes.put(new JSONObject().put("start", "").put("end", ""));
                dayReplacementStatus.put(replacementStatus("", false, false, true));
            }
            data.put("dayStartTimes", dayStartTimes);
            data.put("dayReplacementStatus", dayReplacementStatus);

            List<Segment> segments = new ArrayList<>();
            String leftBlock = extractWeekBlock(html, "left_week");
            String rightBlock = extractWeekBlock(html, "right_week");

            if (leftBlock != null) {
                String leftTable = extractScheduleTable(leftBlock);
                if (leftTable != null) {
                    segments.add(new Segment(leftTable, 0));
                    data.put("currentWeek", parseWeekMeta(leftBlock));
                    parseZamenaForDays(leftTable, new int[]{0, 1, 2, 3, 4, 5}, dayReplacementStatus);
                }
            }
            if (rightBlock != null) {
                String rightTable = extractScheduleTable(rightBlock);
                if (rightTable != null) {
                    segments.add(new Segment(rightTable, 1));
                    data.put("nextWeekMonday", parseWeekMeta(rightBlock));
                    data.put("hasNextWeekMonday", true);
                    dayStartTimes.put(new JSONObject().put("start", "").put("end", ""));
                    dayReplacementStatus.put(replacementStatus("", false, false, true));
                    parseZamenaForDays(rightTable, new int[]{6}, dayReplacementStatus);
                }
            }

            if (segments.isEmpty()) {
                fallbackSegments(html, segments, data, dayStartTimes, dayReplacementStatus);
            }

            data.put("dayStartTimes", dayStartTimes);
            data.put("dayReplacementStatus", dayReplacementStatus);
            data.put("hasNextWeek", data.optBoolean("hasNextWeekMonday"));

            JSONArray pairs = data.getJSONArray("pairs");
            for (Segment seg : segments) {
                parseTableSegment(seg.content, seg.weekOffset, pairs);
            }
            fillDayRanges(data);
        } catch (Exception ignored) {}
        return data;
    }

    private static void fallbackSegments(String html, List<Segment> segments, JSONObject data,
                                         JSONArray dayStartTimes, JSONArray dayReplacementStatus) throws Exception {
        int rwIdx = html.toLowerCase().indexOf("id=\"right_week\"");
        if (rwIdx < 0) rwIdx = html.toLowerCase().indexOf("id='right_week'");
        Matcher tableM = Pattern.compile("<table[^>]*>([\\s\\S]*?)</table>", Pattern.CASE_INSENSITIVE).matcher(html);
        while (tableM.find()) {
            String content = tableM.group(1);
            if (!content.contains("pair-number") && !content.contains("day=\"")) continue;
            int globalIdx = tableM.start();
            if (segments.isEmpty()) {
                segments.add(new Segment(content, 0));
                continue;
            }
            if (rwIdx >= 0 && globalIdx > rwIdx && !content.equals(segments.get(0).content)) {
                segments.add(new Segment(content, 1));
                data.put("hasNextWeekMonday", true);
                if (!data.has("nextWeekMonday")) {
                    data.put("nextWeekMonday", new JSONObject().put("dateRange", "").put("weekLabel", "след. нед."));
                }
                dayStartTimes.put(new JSONObject().put("start", "").put("end", ""));
                dayReplacementStatus.put(replacementStatus("", false, false, true));
                break;
            }
        }
    }

    private static JSONObject replacementStatus(String label, boolean hasChanges, boolean noChanges, boolean unknown) throws Exception {
        return new JSONObject()
                .put("label", label)
                .put("hasChanges", hasChanges)
                .put("noChanges", noChanges)
                .put("unknown", unknown);
    }

    private static String extractWeekBlock(String html, String weekId) {
        if ("left_week".equals(weekId)) {
            Matcher m = Pattern.compile(
                    "<div[^>]*id=[\"']left_week[\"'][^>]*>([\\s\\S]*?)<div[^>]*id=[\"']right_week[\"']",
                    Pattern.CASE_INSENSITIVE
            ).matcher(html);
            return m.find() ? m.group(1) : null;
        }
        Matcher m = Pattern.compile(
                "<div[^>]*id=[\"']right_week[\"'][^>]*>([\\s\\S]*)",
                Pattern.CASE_INSENSITIVE
        ).matcher(html);
        return m.find() ? m.group(1) : null;
    }

    private static String extractScheduleTable(String weekBlock) {
        Matcher m = Pattern.compile("<table[^>]*>([\\s\\S]*?)</table>", Pattern.CASE_INSENSITIVE).matcher(weekBlock);
        while (m.find()) {
            String content = m.group(1);
            if (content.contains("pair-number") || content.contains("day=\"")) return content;
        }
        return null;
    }

    private static JSONObject parseWeekMeta(String weekBlock) throws Exception {
        Matcher dateM = Pattern.compile("<p[^>]*class=[\"']date[\"'][^>]*>([^<]*)</p>", Pattern.CASE_INSENSITIVE).matcher(weekBlock);
        Matcher todayM = Pattern.compile("<p[^>]*class=[\"']today[\"'][^>]*>([^<]*)</p>", Pattern.CASE_INSENSITIVE).matcher(weekBlock);
        JSONObject meta = new JSONObject();
        meta.put("dateRange", dateM.find() ? dateM.group(1).trim() : "");
        meta.put("weekLabel", todayM.find() ? todayM.group(1).trim() : "");
        return meta;
    }

    private static void parseZamenaForDays(String tableContent, int[] dayIndices, JSONArray dayReplacementStatus) throws Exception {
        Matcher rowM = Pattern.compile("<tr[^>]*class=\"[^\"]*zamena[^\"]*\"[^>]*>([\\s\\S]*?)</tr>", Pattern.CASE_INSENSITIVE).matcher(tableContent);
        if (!rowM.find()) return;
        Matcher cellM = Pattern.compile("<th[^>]*>([\\s\\S]*?)</th>", Pattern.CASE_INSENSITIVE).matcher(rowM.group(1));
        List<String> cells = new ArrayList<>();
        while (cellM.find()) cells.add(cellM.group(1));
        for (int i = 0; i < dayIndices.length; i++) {
            int storeIndex = dayIndices[i];
            String cellContent = i + 1 < cells.size() ? cells.get(i + 1) : "";
            String plain = cellContent.replaceAll("<[^>]+>", " ").replaceAll("\\s+", " ").trim();
            boolean hasChanges = plain.toLowerCase().matches(".*показать\\s+замены.*");
            boolean noChanges = plain.toLowerCase().matches(".*нету?\\s+замен.*");
            while (dayReplacementStatus.length() <= storeIndex) {
                dayReplacementStatus.put(replacementStatus("", false, false, true));
            }
            dayReplacementStatus.put(storeIndex, replacementStatus(plain, hasChanges, noChanges, !hasChanges && !noChanges));
        }
    }

    private static void parseTableSegment(String tableContent, int weekOffset, JSONArray pairs) throws Exception {
        Matcher rowM = Pattern.compile("<tr[^>]*>([\\s\\S]*?)</tr>", Pattern.CASE_INSENSITIVE).matcher(tableContent);
        while (rowM.find()) {
            String rowContent = rowM.group(1);
            Matcher numM = Pattern.compile("<td[^>]*class=\"[^\"]*number[^\"]*\"[^>]*>(\\d+)</td>", Pattern.CASE_INSENSITIVE).matcher(rowContent);
            if (!numM.find()) continue;
            int pairNumber = Integer.parseInt(numM.group(1));

            Matcher cellM = Pattern.compile("<td[^>]*>([\\s\\S]*?)</td>", Pattern.CASE_INSENSITIVE).matcher(rowContent);
            List<String> dayCells = new ArrayList<>();
            while (cellM.find()) dayCells.add(cellM.group(1));
            if (dayCells.size() < 8) continue;

            for (int cellIndex = 1; cellIndex < dayCells.size() - 1; cellIndex++) {
                String cellContent = dayCells.get(cellIndex);
                Integer dayIndex = null;
                Matcher dayCommentM = Pattern.compile("<!--[^>]*day=\"(\\d+)\"[^>]*-->").matcher(cellContent);
                if (dayCommentM.find()) {
                    int dayFromComment = Integer.parseInt(dayCommentM.group(1));
                    if (dayFromComment >= 1 && dayFromComment <= 6) dayIndex = dayFromComment - 1;
                }
                if (dayIndex == null) {
                    dayIndex = cellIndex - 1;
                    if (dayIndex < 0 || dayIndex > 5) continue;
                }
                if (weekOffset == 1 && dayIndex != 0) continue;
                if (cellContent.contains("empty-pair") && !cellContent.contains("pair")) continue;
                parsePairsInCell(cellContent, pairNumber, dayIndex, weekOffset, pairs);
            }
        }
    }

    private static void parsePairsInCell(String cellContent, int pairNumber, int dayIndex, int weekOffset, JSONArray pairs) throws Exception {
        int pairStartIndex = 0;
        int iterations = 0;
        while (pairStartIndex < cellContent.length() && iterations < 100) {
            iterations++;
            String rest = cellContent.substring(pairStartIndex);
            Matcher openM = Pattern.compile("<div[^>]*class=\"([^\"]*)\"[^>]*>", Pattern.CASE_INSENSITIVE).matcher(rest);
            if (!openM.find()) break;
            String pairClasses = openM.group(1);
            if (!pairClasses.contains("pair")) {
                pairStartIndex += openM.start() + openM.group().length();
                continue;
            }
            int pairTagStart = pairStartIndex + openM.start() + openM.group().length();
            int pairEndPos = findMatchingDivClose(cellContent, pairTagStart);
            if (pairEndPos < 0) break;
            String pairContent = cellContent.substring(pairTagStart, pairEndPos);
            if (pairContent.trim().length() > 0) {
                JSONObject pair = extractPairData(pairContent, pairNumber, dayIndex, weekOffset, pairClasses);
                if (pair != null) pairs.put(pair);
            }
            pairStartIndex = pairEndPos + 6;
        }
    }

    private static JSONObject extractPairData(String pairContent, int pairNumber, int dayIndex, int weekOffset, String pairClasses) throws Exception {
        JSONObject pair = new JSONObject();
        pair.put("pairNumber", pairNumber);
        pair.put("day", dayIndex);
        pair.put("dayName", WEEK_DAYS[dayIndex]);
        pair.put("weekOffset", weekOffset);
        if (weekOffset == 1) pair.put("isNextWeekMonday", true);
        pair.put("subject", "");
        pair.put("teacher", "");
        pair.put("room", "");
        pair.put("group", "");
        JSONObject refs = new JSONObject();
        refs.put("teachers", new JSONArray());
        pair.put("refs", refs);

        Matcher subM = Pattern.compile(
                "<div[^>]*class=\"[^\"]*subject[^\"]*\"[^>]*>[\\s\\S]*?<a[^>]*>([^<]+)</a>",
                Pattern.CASE_INSENSITIVE
        ).matcher(pairContent);
        if (!subM.find()) return null;
        pair.put("subject", subM.group(1).trim());

        Matcher subRefM = Pattern.compile(
                "<div[^>]*class=\"[^\"]*subject[^\"]*\"[^>]*>[\\s\\S]*?<a[^>]*href=\"[^\"]*\\?cat=subject(?:&amp;|&)id=(\\d+)[^\"]*\"[^>]*>([^<]+)</a>",
                Pattern.CASE_INSENSITIVE
        ).matcher(pairContent);
        if (subRefM.find()) {
            refs.put("subject", new JSONObject().put("id", subRefM.group(1)).put("name", subRefM.group(2).trim()));
        }

        String leftColumn = extractColumn(pairContent, "left-column");
        if (leftColumn != null) {
            Matcher teacherDivM = Pattern.compile(
                    "<div[^>]*class=\"[^\"]*teacher[^\"]*\"[^>]*>([\\s\\S]*?)</div>",
                    Pattern.CASE_INSENSITIVE
            ).matcher(leftColumn);
            StringBuilder teachers = new StringBuilder();
            JSONArray teacherRefs = refs.getJSONArray("teachers");
            while (teacherDivM.find()) {
                String teacherDiv = teacherDivM.group(1);
                Matcher linkM = Pattern.compile("<a[^>]*>([^<]+)</a>", Pattern.CASE_INSENSITIVE).matcher(teacherDiv);
                while (linkM.find()) {
                    String t = linkM.group(1).trim();
                    if (!t.isEmpty() && !"&nbsp;".equals(t)) {
                        if (teachers.length() > 0) teachers.append(", ");
                        teachers.append(t);
                    }
                }
                Matcher refM = Pattern.compile(
                        "<a[^>]*href=\"[^\"]*\\?cat=teacher(?:&amp;|&)id=(\\d+)[^\"]*\"[^>]*>([^<]*)</a>",
                        Pattern.CASE_INSENSITIVE
                ).matcher(teacherDiv);
                while (refM.find()) {
                    String id = refM.group(1);
                    String name = refM.group(2).trim();
                    if (!id.isEmpty() && !name.isEmpty()) {
                        teacherRefs.put(new JSONObject().put("id", id).put("name", name));
                    }
                }
            }
            if (teachers.length() > 0) pair.put("teacher", teachers.toString());
        }

        String rightColumn = extractColumn(pairContent, "right-column");
        if (rightColumn != null) {
            Matcher placeDivM = Pattern.compile(
                    "<div[^>]*class=\"[^\"]*place[^\"]*\"[^>]*>([\\s\\S]*?)</div>",
                    Pattern.CASE_INSENSITIVE
            ).matcher(rightColumn);
            if (placeDivM.find()) {
                String placeDiv = placeDivM.group(1);
                Matcher roomM = Pattern.compile("<a[^>]*>([^<]+)</a>", Pattern.CASE_INSENSITIVE).matcher(placeDiv);
                while (roomM.find()) {
                    String room = roomM.group(1).trim();
                    if (!room.isEmpty() && !"&nbsp;".equals(room)) {
                        pair.put("room", room);
                        break;
                    }
                }
                Matcher placeRefM = Pattern.compile(
                        "<a[^>]*href=\"[^\"]*\\?cat=place(?:&amp;|&)id=(\\d+)[^\"]*\"[^>]*>([^<]+)</a>",
                        Pattern.CASE_INSENSITIVE
                ).matcher(placeDiv);
                if (placeRefM.find()) {
                    refs.put("place", new JSONObject().put("id", placeRefM.group(1)).put("name", placeRefM.group(2).trim()));
                }
            }
            Matcher groupDivM = Pattern.compile(
                    "<div[^>]*class=\"[^\"]*group[^\"]*\"[^>]*>([\\s\\S]*?)</div>",
                    Pattern.CASE_INSENSITIVE
            ).matcher(rightColumn);
            if (groupDivM.find()) {
                String groupDiv = groupDivM.group(1);
                Matcher groupM = Pattern.compile("<a[^>]*>([^<]+)</a>", Pattern.CASE_INSENSITIVE).matcher(groupDiv);
                if (groupM.find()) pair.put("group", groupM.group(1).trim());
                Matcher groupRefM = Pattern.compile(
                        "<a[^>]*href=\"[^\"]*\\?cat=group(?:&amp;|&)id=(\\d+)[^\"]*\"[^>]*>([^<]+)</a>",
                        Pattern.CASE_INSENSITIVE
                ).matcher(groupDiv);
                if (groupRefM.find()) {
                    refs.put("group", new JSONObject().put("id", groupRefM.group(1)).put("name", groupRefM.group(2).trim()));
                }
            }
        }

        String status = "normal";
        if (pairClasses.contains("added")) status = "added";
        else if (pairClasses.contains("replaced")) status = "replaced";
        else if (pairClasses.contains("removed")) status = "removed";
        else if (pairClasses.contains("cancelled")) status = "cancelled";
        pair.put("status", status);
        return pair;
    }

    private static String extractColumn(String pairContent, String className) {
        Matcher startM = Pattern.compile("<div[^>]*class=\"[^\"]*" + className + "[^\"]*\"[^>]*>", Pattern.CASE_INSENSITIVE).matcher(pairContent);
        if (!startM.find()) return null;
        int tagStart = startM.start() + startM.group().length();
        int end = findMatchingDivClose(pairContent, tagStart);
        if (end < 0) return null;
        return pairContent.substring(tagStart, end);
    }

    private static int findMatchingDivClose(String content, int pos) {
        int depth = 1;
        int i = pos;
        while (i < content.length() && depth > 0) {
            int open = content.indexOf("<div", i);
            int close = content.indexOf("</div>", i);
            if (close == -1) return -1;
            if (open != -1 && open < close) {
                depth++;
                i = open + 4;
            } else {
                depth--;
                if (depth == 0) return close;
                i = close + 6;
            }
        }
        return -1;
    }

    private static void fillDayRanges(JSONObject data) throws Exception {
        JSONArray pairs = data.optJSONArray("pairs");
        JSONArray dayStartTimes = data.getJSONArray("dayStartTimes");
        if (pairs == null) return;
        for (int dayIndex = 0; dayIndex < 6; dayIndex++) {
            fillDayRange(data, pairs, dayStartTimes, dayIndex, dayIndex, 0);
        }
        if (data.optBoolean("hasNextWeekMonday")) {
            fillDayRange(data, pairs, dayStartTimes, 6, 0, 1);
        }
    }

    private static void fillDayRange(JSONObject data, JSONArray pairs, JSONArray dayStartTimes,
                                     int storeIndex, int bellDay, int weekOffset) throws Exception {
        List<JSONObject> dayPairs = new ArrayList<>();
        for (int i = 0; i < pairs.length(); i++) {
            JSONObject p = pairs.getJSONObject(i);
            if (p.optInt("weekOffset", 0) != weekOffset) continue;
            if (p.optInt("day") != (weekOffset == 1 ? 0 : storeIndex)) continue;
            String subject = p.optString("subject", "").trim();
            if (subject.isEmpty() || "Урок снят".equals(subject)) continue;
            String status = p.optString("status", "normal");
            if ("removed".equals(status) || "cancelled".equals(status)) continue;
            dayPairs.add(p);
        }
        if (dayPairs.isEmpty()) return;
        int firstNum = dayPairs.get(0).optInt("pairNumber");
        int lastNum = firstNum;
        for (JSONObject p : dayPairs) {
            int n = p.optInt("pairNumber");
            if (n < firstNum) firstNum = n;
            if (n > lastNum) lastNum = n;
        }
        int bell = weekOffset == 1 ? 0 : bellDay;
        String[] first = KbpBellSchedule.getPairTime(firstNum, bell);
        String[] last = KbpBellSchedule.getPairTime(lastNum, bell);
        while (dayStartTimes.length() <= storeIndex) {
            dayStartTimes.put(new JSONObject().put("start", "").put("end", ""));
        }
        dayStartTimes.put(storeIndex, new JSONObject().put("start", first[0]).put("end", last[1]));
    }

    public static String fetchGet(String urlStr) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setConnectTimeout(15_000);
        conn.setReadTimeout(15_000);
        conn.setInstanceFollowRedirects(true);
        conn.setRequestMethod("GET");
        conn.setRequestProperty("User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36");
        conn.setRequestProperty("Accept", "text/html,application/xhtml+xml,*/*;q=0.8");
        conn.setRequestProperty("Accept-Language", "ru,en;q=0.9");
        conn.setRequestProperty("Referer", "https://kbp.by/");
        conn.setRequestProperty("Cache-Control", "no-cache");

        int code = conn.getResponseCode();
        InputStream is = code < 400 ? conn.getInputStream() : conn.getErrorStream();
        if (is == null) {
            conn.disconnect();
            if (code == 403) throw new IOException("kbp.by заблокировал запрос (403)");
            throw new IOException("Ошибка kbp.by: " + code);
        }
        BufferedReader reader = new BufferedReader(new InputStreamReader(is, "UTF-8"));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) sb.append(line).append('\n');
        reader.close();
        conn.disconnect();
        if (code == 403) throw new IOException("kbp.by заблокировал запрос (403)");
        return sb.toString();
    }

    private static String urlEncode(String s) {
        try {
            return URLEncoder.encode(s, "UTF-8");
        } catch (Exception e) {
            return s;
        }
    }

    private static final class Segment {
        final String content;
        final int weekOffset;

        Segment(String content, int weekOffset) {
            this.content = content;
            this.weekOffset = weekOffset;
        }
    }
}
