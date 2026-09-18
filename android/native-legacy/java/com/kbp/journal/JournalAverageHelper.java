package com.kbp.journal;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Средний балл и форматирование (journalAverage.ts). */
public final class JournalAverageHelper {
    private JournalAverageHelper() {}

    public static Double parseMark(String raw) {
        if (raw == null) return null;
        String s = raw.trim().replaceAll("\\s+", "");
        if (s.isEmpty() || "-".equals(s) || "—".equals(s)) return null;
        if (s.matches("(?i)[а-яёa-z].*")) return null;
        try {
            double n = Double.parseDouble(s.replace(',', '.'));
            if (n < 1 || n > 10) return null;
            return n;
        } catch (Exception e) {
            return null;
        }
    }

    public static Double subjectAverage(JSONObject subject) {
        JSONObject matrix = subject.optJSONObject("gradesMatrix");
        if (matrix == null) return null;
        List<Double> vals = new ArrayList<>();
        JSONArray names = matrix.names();
        if (names == null) return null;
        for (int i = 0; i < names.length(); i++) {
            JSONArray grades = matrix.optJSONArray(names.optString(i));
            if (grades == null) continue;
            for (int j = 0; j < grades.length(); j++) {
                JSONObject g = grades.optJSONObject(j);
                if (g == null) continue;
                Double n = parseMark(g.optString("value", ""));
                if (n != null) vals.add(n);
            }
        }
        if (vals.isEmpty()) return null;
        double sum = 0;
        for (Double v : vals) sum += v;
        return sum / vals.size();
    }

    public static String formatAverage(Double value, boolean hundredths) {
        if (value == null || !Double.isFinite(value)) return "—";
        if (hundredths) return String.format(Locale.getDefault(), "%.2f", Math.round(value * 100.0) / 100.0);
        return String.format(Locale.getDefault(), "%.1f", Math.round(value * 10.0) / 10.0);
    }

    public static String totalAverage(JSONArray subjects, boolean hundredths) {
        if (subjects == null) return null;
        List<Double> avgs = new ArrayList<>();
        for (int i = 0; i < subjects.length(); i++) {
            Double a = subjectAverage(subjects.optJSONObject(i));
            if (a != null) avgs.add(a);
        }
        if (avgs.isEmpty()) return null;
        double sum = 0;
        for (Double v : avgs) sum += v;
        return formatAverage(sum / avgs.size(), hundredths);
    }
}
