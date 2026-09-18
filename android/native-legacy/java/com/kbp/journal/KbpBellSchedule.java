package com.kbp.journal;

import java.util.HashMap;
import java.util.Map;

/** Официальное расписание звонков КБиП (порт kbpBellSchedule.ts). */
public final class KbpBellSchedule {
    private static final Map<Integer, String[]> STD = new HashMap<>();
    private static final Map<Integer, String[]> THU_FROM7 = new HashMap<>();
    private static final Map<Integer, String[]> SAT_FROM5 = new HashMap<>();

    static {
        put(STD, 1, "8.00", "8.45");
        put(STD, 2, "8.55", "9.40");
        put(STD, 3, "9.50", "10.35");
        put(STD, 4, "10.45", "11.30");
        put(STD, 5, "12.00", "12.45");
        put(STD, 6, "12.55", "13.40");
        put(STD, 7, "14.00", "14.45");
        put(STD, 8, "14.55", "15.40");
        put(STD, 9, "16.00", "16.45");
        put(STD, 10, "16.55", "17.40");
        put(STD, 11, "17.50", "18.35");
        put(STD, 12, "18.45", "19.30");
        put(STD, 13, "19.40", "20.25");

        put(THU_FROM7, 7, "14.40", "15.25");
        put(THU_FROM7, 8, "15.35", "16.20");
        put(THU_FROM7, 9, "16.30", "17.15");
        put(THU_FROM7, 10, "17.25", "18.10");
        put(THU_FROM7, 11, "18.20", "19.05");
        put(THU_FROM7, 12, "19.15", "20.00");
        put(THU_FROM7, 13, "20.10", "20.55");

        put(SAT_FROM5, 5, "11.40", "12.25");
        put(SAT_FROM5, 6, "12.35", "13.20");
        put(SAT_FROM5, 7, "13.40", "14.25");
        put(SAT_FROM5, 8, "14.35", "15.20");
        put(SAT_FROM5, 9, "15.30", "16.15");
        put(SAT_FROM5, 10, "16.25", "17.10");
        put(SAT_FROM5, 11, "17.20", "18.05");
        put(SAT_FROM5, 12, "18.15", "19.00");
        put(SAT_FROM5, 13, "19.10", "19.55");
    }

    private KbpBellSchedule() {}

    private static void put(Map<Integer, String[]> map, int pair, String start, String end) {
        map.put(pair, new String[]{start, end});
    }

    public static String[] getPairTime(int pairNumber, int dayIndex) {
        if (pairNumber < 1 || pairNumber > 13) return new String[]{"", ""};
        Map<Integer, String[]> source = STD;
        if (dayIndex == 3 && pairNumber >= 7) source = THU_FROM7;
        else if (dayIndex == 5 && pairNumber >= 5) source = SAT_FROM5;
        String[] t = source.get(pairNumber);
        return t != null ? t : new String[]{"", ""};
    }

    public static int timeToMinutes(String time) {
        if (time == null || time.trim().isEmpty()) return -1;
        String[] parts = time.trim().split("[.:]");
        try {
            int h = Integer.parseInt(parts[0].trim());
            int m = parts.length > 1 ? Integer.parseInt(parts[1].trim()) : 0;
            return h * 60 + m;
        } catch (Exception e) {
            return -1;
        }
    }

    public static String formatBellClock(String time) {
        int mins = timeToMinutes(time);
        if (mins < 0) return time != null ? time : "";
        int h = mins / 60;
        int m = mins % 60;
        return h + ":" + (m < 10 ? "0" : "") + m;
    }
}
