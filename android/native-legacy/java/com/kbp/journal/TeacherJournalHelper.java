package com.kbp.journal;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.util.Locale;

/** API журнала преподавателя (/api/journal/). */
public final class TeacherJournalHelper {
    private TeacherJournalHelper() {}

    public static int resolveSubjectId(JSONObject assignment) {
        if (assignment == null) return -1;
        JSONObject detail = assignment.optJSONObject("subject_detail");
        if (detail != null && detail.has("id")) {
            return detail.optInt("id", -1);
        }
        return assignment.optInt("subject", -1);
    }

    public static String resolveSubjectName(JSONObject assignment) {
        if (assignment == null) return "Предмет";
        JSONObject detail = assignment.optJSONObject("subject_detail");
        if (detail != null) {
            String shortName = detail.optString("short_name", "").trim();
            if (!shortName.isEmpty()) return shortName;
            String name = detail.optString("name", "").trim();
            if (!name.isEmpty()) return name;
        }
        String subjectName = assignment.optString("subject_name", "").trim();
        if (!subjectName.isEmpty()) return subjectName;
        Object subject = assignment.opt("subject");
        if (subject instanceof String s && !s.trim().isEmpty()) return s.trim();
        return "Предмет";
    }

    /** «Иванов Иван Иванович» → «Иванов И.И.» */
    public static String formatStudentShortName(String fullName) {
        if (fullName == null) return "—";
        String trimmed = fullName.trim();
        if (trimmed.isEmpty()) return "—";
        String[] parts = trimmed.split("\\s+");
        if (parts.length <= 1) return trimmed;
        if (parts.length == 2) {
            return parts[0] + " " + parts[1].substring(0, 1).toUpperCase() + ".";
        }
        String surname = parts[0];
        String firstInit = parts[1].isEmpty() ? "" : parts[1].substring(0, 1).toUpperCase() + ".";
        String patInit = parts[2].isEmpty() ? "" : parts[2].substring(0, 1).toUpperCase() + ".";
        return surname + " " + firstInit + patInit;
    }

    public static String normDate(String iso) {
        if (iso == null) return "";
        return iso.length() >= 10 ? iso.substring(0, 10) : iso;
    }

    public static JSONArray fetchAccess(String accessToken) throws IOException {
        JSONArray arr = ApiClient.get().getArray("/api/journal/", accessToken);
        if (arr.length() > 0) return arr;
        JSONObject resp = ApiClient.get().get("/api/journal/", accessToken);
        JSONArray results = resp.optJSONArray("results");
        if (results != null) return results;
        JSONArray items = resp.optJSONArray("items");
        if (items != null) return items;
        if (resp.has("id")) {
            JSONArray single = new JSONArray();
            single.put(resp);
            return single;
        }
        return new JSONArray();
    }

    public static JSONObject fetchBundle(String accessToken, int assignmentId) throws IOException {
        return ApiClient.get().get("/api/journal/bundle/" + assignmentId + "/", accessToken);
    }

    public static JSONObject saveGrade(String accessToken, int assignmentId, int studentId,
                                       String date, String value, int slot, Integer gradeId) throws IOException {
        String iso = normDate(date);
        if (gradeId != null && gradeId > 0) {
            JSONObject body = new JSONObject();
            try {
                body.put("value", value);
            } catch (Exception e) {
                throw new IOException(e);
            }
            return ApiClient.get().patch("/api/grades/" + gradeId + "/", body, accessToken);
        }
        JSONArray existing = ApiClient.get().getArray(
                "/api/grades/?assignment=" + assignmentId + "&student=" + studentId,
                accessToken);
        for (int i = 0; i < existing.length(); i++) {
            JSONObject g = existing.optJSONObject(i);
            if (g == null) continue;
            if (iso.equals(normDate(g.optString("date", ""))) && g.optInt("slot", 0) == slot) {
                JSONObject body = new JSONObject();
                try {
                    body.put("value", value);
                } catch (Exception e) {
                    throw new IOException(e);
                }
                return ApiClient.get().patch("/api/grades/" + g.optInt("id") + "/", body, accessToken);
            }
        }
        JSONObject body = new JSONObject();
        try {
            body.put("assignment", assignmentId);
            body.put("student", studentId);
            body.put("date", iso);
            body.put("slot", slot);
            body.put("value", value);
        } catch (Exception e) {
            throw new IOException(e);
        }
        return ApiClient.get().post("/api/grades/", body, accessToken);
    }

    public static void deleteGrade(String accessToken, int gradeId) throws IOException {
        ApiClient.get().delete("/api/grades/" + gradeId + "/", accessToken);
    }

    public static JSONObject saveJournalDay(String accessToken, int assignmentId, String date, int slot,
                                            String dayType, String footerNote) throws IOException {
        return saveJournalDay(accessToken, assignmentId, date, slot, dayType, footerNote, null, null, null);
    }

    public static JSONObject saveJournalDay(String accessToken, int assignmentId, String date, int slot,
                                            String dayType, String footerNote, String labDueDate,
                                            Boolean labCredited, Boolean redAbsent) throws IOException {
        String iso = normDate(date);
        JSONArray existing = ApiClient.get().getArray(
                "/api/journal-days/?assignment=" + assignmentId,
                accessToken);
        for (int i = 0; i < existing.length(); i++) {
            JSONObject d = existing.optJSONObject(i);
            if (d == null) continue;
            if (iso.equals(normDate(d.optString("date", ""))) && d.optInt("slot", 0) == slot) {
                JSONObject body = new JSONObject();
                try {
                    if (dayType != null) body.put("day_type", dayType);
                    if (footerNote != null) body.put("footer_note", footerNote);
                    if (labDueDate != null) body.put("lab_due_date", labDueDate.isEmpty() ? JSONObject.NULL : labDueDate);
                    if (labCredited != null) body.put("lab_credited", labCredited);
                    if (redAbsent != null) body.put("red_absent", redAbsent);
                } catch (Exception e) {
                    throw new IOException(e);
                }
                return ApiClient.get().patch("/api/journal-days/" + d.optInt("id") + "/", body, accessToken);
            }
        }
        JSONObject body = new JSONObject();
        try {
            body.put("assignment", assignmentId);
            body.put("date", iso);
            body.put("slot", slot);
            body.put("day_type", dayType != null ? dayType : "normal");
            body.put("footer_note", footerNote != null ? footerNote : "");
            if (labDueDate != null) body.put("lab_due_date", labDueDate.isEmpty() ? JSONObject.NULL : labDueDate);
            if (labCredited != null) body.put("lab_credited", labCredited);
            if (redAbsent != null) body.put("red_absent", redAbsent);
        } catch (Exception e) {
            throw new IOException(e);
        }
        return ApiClient.get().post("/api/journal-days/", body, accessToken);
    }

    public static void deleteJournalDay(String accessToken, int dayId) throws IOException {
        ApiClient.get().delete("/api/journal-days/" + dayId + "/", accessToken);
    }

    public static JSONObject saveLateness(String accessToken, int groupId, int studentId,
                                          String date, int slot, int minutes) throws IOException {
        String iso = normDate(date);
        JSONArray existing = ApiClient.get().getArray("/api/lateness/?group=" + groupId, accessToken);
        for (int i = 0; i < existing.length(); i++) {
            JSONObject l = existing.optJSONObject(i);
            if (l == null) continue;
            if (l.optInt("student", -1) == studentId
                    && iso.equals(normDate(l.optString("date", "")))
                    && l.optInt("slot", 0) == slot) {
                JSONObject body = new JSONObject();
                try {
                    body.put("minutes", minutes);
                } catch (Exception e) {
                    throw new IOException(e);
                }
                return ApiClient.get().patch("/api/lateness/" + l.optInt("id") + "/", body, accessToken);
            }
        }
        JSONObject body = new JSONObject();
        try {
            body.put("group", groupId);
            body.put("student", studentId);
            body.put("date", iso);
            body.put("slot", slot);
            body.put("minutes", minutes);
        } catch (Exception e) {
            throw new IOException(e);
        }
        return ApiClient.get().post("/api/lateness/", body, accessToken);
    }

    public static int resolveGroupId(JSONObject bundle) {
        if (bundle == null) return -1;
        JSONObject assignment = bundle.optJSONObject("assignment");
        if (assignment == null) return -1;
        return assignment.optInt("group", -1);
    }

    public static String formatColumnDateFull(String iso) {
        if (iso == null || iso.length() < 10) return iso != null ? iso : "";
        try {
            int y = Integer.parseInt(iso.substring(0, 4));
            int m = Integer.parseInt(iso.substring(5, 7));
            int d = Integer.parseInt(iso.substring(8, 10));
            String[] months = {"января", "февраля", "марта", "апреля", "мая", "июня",
                    "июля", "августа", "сентября", "октября", "ноября", "декабря"};
            if (m >= 1 && m <= 12) return d + " " + months[m - 1] + " " + y;
        } catch (NumberFormatException ignored) {}
        return iso;
    }

    public static String isoToday() {
        java.util.Calendar c = java.util.Calendar.getInstance();
        return String.format(Locale.US, "%04d-%02d-%02d",
                c.get(java.util.Calendar.YEAR),
                c.get(java.util.Calendar.MONTH) + 1,
                c.get(java.util.Calendar.DAY_OF_MONTH));
    }

    public static String formatGradeDisplay(String value) {
        if (value == null) return "";
        String v = value.trim().toLowerCase(Locale.ROOT);
        if ("н.".equals(v)) return "н";
        if ("н. зач.".equals(v)) return "зач";
        return value.trim();
    }

    public static boolean isRedGrade(String value) {
        if (value == null) return false;
        String v = value.trim().toLowerCase(Locale.ROOT);
        return "н.".equals(v) || "н. зач.".equals(v);
    }
}
