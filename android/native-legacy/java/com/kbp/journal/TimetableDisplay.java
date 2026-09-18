package com.kbp.journal;

import org.json.JSONArray;
import org.json.JSONObject;

/** Хелперы отображения расписания (порт timetableDisplay.ts). */
public final class TimetableDisplay {
    public static final int SLOT_NEXT_MONDAY = 6;

    private static final String[] DAY_LABELS = {
            "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"
    };
    private static final String[] DAY_SHORT = {"Пн", "Вт", "Ср", "Чт", "Пт", "Сб"};

    private TimetableDisplay() {}

    public static int getDisplayDay(JSONObject pair) {
        int weekOffset = pair.optInt("weekOffset", 0);
        int day = pair.optInt("day", 0);
        if (weekOffset == 1 && day == 0) return SLOT_NEXT_MONDAY;
        return day;
    }

    public static boolean pairMatchesDisplayDay(JSONObject pair, int displayDay) {
        return getDisplayDay(pair) == displayDay;
    }

    public static boolean hasNextWeekMonday(JSONObject data) {
        if (data == null) return false;
        if (data.optBoolean("hasNextWeekMonday")) return true;
        JSONObject next = data.optJSONObject("nextWeekMonday");
        if (next != null) {
            if (!next.optString("dateRange", "").isEmpty()) return true;
            if (!next.optString("weekLabel", "").isEmpty()) return true;
        }
        if (data.optBoolean("hasNextWeek")) {
            JSONArray pairs = data.optJSONArray("pairs");
            if (pairs != null) {
                for (int i = 0; i < pairs.length(); i++) {
                    JSONObject p = pairs.optJSONObject(i);
                    if (p != null && p.optInt("weekOffset", 0) == 1 && p.optInt("day") == 0) return true;
                }
            }
        }
        JSONArray pairs = data.optJSONArray("pairs");
        if (pairs != null) {
            for (int i = 0; i < pairs.length(); i++) {
                JSONObject p = pairs.optJSONObject(i);
                if (p != null && p.optInt("weekOffset", 0) == 1 && p.optInt("day") == 0) return true;
            }
        }
        return false;
    }

    public static int getDayCount(JSONObject data) {
        return hasNextWeekMonday(data) ? 7 : 6;
    }

    public static String getDayLabel(JSONObject data, int index) {
        if (index >= 0 && index < 6) return DAY_LABELS[index];
        if (index == SLOT_NEXT_MONDAY && hasNextWeekMonday(data)) return "Понедельник";
        return DAY_LABELS[Math.max(0, Math.min(index, 5))];
    }

    public static String getDayShortLabel(JSONObject data, int index) {
        if (index >= 0 && index < 6) return DAY_SHORT[index];
        if (index == SLOT_NEXT_MONDAY && hasNextWeekMonday(data)) return "Пн";
        return DAY_SHORT[Math.max(0, Math.min(index, 5))];
    }

    public static int bellDayIndex(int displayDayIndex) {
        return displayDayIndex == SLOT_NEXT_MONDAY ? 0 : displayDayIndex;
    }

    public static int getInitialDayIndex() {
        java.util.Calendar cal = java.util.Calendar.getInstance();
        int dow = cal.get(java.util.Calendar.DAY_OF_WEEK);
        if (dow == java.util.Calendar.SUNDAY) return 5;
        return dow - java.util.Calendar.MONDAY;
    }
}
