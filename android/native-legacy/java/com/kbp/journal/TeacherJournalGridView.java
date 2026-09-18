package com.kbp.journal;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.HorizontalScrollView;
import android.widget.TableLayout;
import android.widget.TableRow;
import android.widget.TextView;

import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Сетка журнала преподавателя — цвета и колонки как TeacherJournalTable.tsx. */
public final class TeacherJournalGridView extends HorizontalScrollView {
    public static final int MODE_JOURNAL = 0;
    public static final int MODE_LATENESS = 1;
    public static final int MODE_LAB = 2;

    public interface Listener {
        void onGradeClick(int studentId, int colIndex, String currentValue, int gradeId);
        void onLatenessClick(int studentId, int colIndex, int currentMinutes);
        void onFooterClick(int colIndex, String currentNote, int dayId);
        void onColumnHeaderClick(int colIndex);
    }

    public static final class Column {
        public final String date;
        public final int slot;
        public int dayId;
        public String dayType = "normal";
        public String footerNote = "";
        public boolean labCredited;
        public String labDueDate;
        public boolean redAbsent;

        Column(String date, int slot) {
            this.date = TeacherJournalHelper.normDate(date);
            this.slot = slot;
        }

        String key() {
            return date + ":" + slot;
        }

        String dayLabel() {
            return date.length() >= 10 ? date.substring(8, 10) : date;
        }
    }

    private Listener listener;
    private JSONObject bundle;
    private int mode = MODE_JOURNAL;
    private boolean canEdit;
    private final List<Column> columns = new ArrayList<>();

    public TeacherJournalGridView(Context context) {
        super(context);
        setHorizontalScrollBarEnabled(false);
        setFillViewport(true);
        setBackgroundColor(Color.WHITE);
    }

    public void setListener(Listener listener) {
        this.listener = listener;
    }

    public List<Column> getColumns() {
        return columns;
    }

    public void bind(JSONObject bundle, int mode, boolean canEdit) {
        this.bundle = bundle;
        this.mode = mode;
        this.canEdit = canEdit;
        removeAllViews();
        columns.clear();
        if (bundle == null) return;

        JSONArray students = bundle.optJSONArray("students");
        JSONArray grades = bundle.optJSONArray("grades");
        JSONArray days = bundle.optJSONArray("days");
        if (students == null || students.length() == 0) return;

        buildColumns(days, grades, mode);
        if (columns.isEmpty()) return;

        float density = getResources().getDisplayMetrics().density;
        int cellW = (int) (31 * density);
        int cellH = (int) (36 * density);
        int nameW = (int) (108 * density);
        int numW = (int) (28 * density);
        int footerH = (int) (72 * density);
        int totalW = (int) (44 * density);
        boolean latenessMode = mode == MODE_LATENESS;

        int cellBg = Color.parseColor("#FEFCE8");
        int headerBg = Color.parseColor("#F9FAFB");
        int border = ContextCompat.getColor(getContext(), R.color.border);
        int textPrimary = ContextCompat.getColor(getContext(), R.color.textPrimary);
        int textSecondary = ContextCompat.getColor(getContext(), R.color.textSecondary);
        int alert = ContextCompat.getColor(getContext(), R.color.markAlert);
        int primary = ContextCompat.getColor(getContext(), R.color.colorPrimary);
        String today = TeacherJournalHelper.isoToday();

        TableLayout table = new TableLayout(getContext());

        TableRow monthRow = new TableRow(getContext());
        monthRow.addView(headerCell("", numW, cellH, headerBg, border, textSecondary));
        monthRow.addView(headerCell("", nameW, cellH, headerBg, border, textSecondary));
        addMonthCells(monthRow, cellW, cellH, headerBg, border, textSecondary);
        if (latenessMode) monthRow.addView(headerCell("", totalW, cellH, headerBg, border, textSecondary));
        table.addView(monthRow);

        TableRow header = new TableRow(getContext());
        header.addView(headerCell("№", numW, cellH, headerBg, border, textPrimary));
        header.addView(headerCell("Студент", nameW, cellH, headerBg, border, textPrimary));
        for (int ci = 0; ci < columns.size(); ci++) {
            Column col = columns.get(ci);
            boolean isToday = today.equals(col.date);
            TextView tv = headerCell(col.dayLabel(), cellW, cellH, headerBg, border, textSecondary);
            if (isToday) applyTodayBorder(tv, primary);
            final int colIndex = ci;
            if (canEdit && mode == MODE_JOURNAL) {
                tv.setOnClickListener(v -> {
                    if (listener != null) listener.onColumnHeaderClick(colIndex);
                });
            }
            header.addView(tv);
        }
        if (latenessMode) {
            header.addView(headerCell("Всего", totalW, cellH, headerBg, border, textPrimary));
        }
        table.addView(header);

        for (int si = 0; si < students.length(); si++) {
            JSONObject st = students.optJSONObject(si);
            if (st == null) continue;
            int studentId = st.optInt("id", -1);
            TableRow row = new TableRow(getContext());
            row.addView(dataCell(String.valueOf(si + 1), numW, cellH, cellBg, border, textSecondary, false));
            row.addView(dataCell(
                    TeacherJournalHelper.formatStudentShortName(st.optString("full_name", "—")),
                    nameW, cellH, cellBg, border, textPrimary, false));
            int rowTotal = 0;
            for (int ci = 0; ci < columns.size(); ci++) {
                Column col = columns.get(ci);
                if (latenessMode) {
                    int mins = findLatenessMinutes(bundle, studentId, col);
                    rowTotal += mins;
                    int bg = mins > 0 ? Color.parseColor("#DCFCE7") : cellBg;
                    TextView cell = dataCell(mins > 0 ? mins + "м" : "", cellW, cellH, bg, border, textPrimary, false);
                    if (today.equals(col.date)) applyTodayBorder(cell, primary);
                    if (canEdit && listener != null) {
                        final int colIndex = ci;
                        final int current = mins;
                        cell.setOnClickListener(v -> listener.onLatenessClick(studentId, colIndex, current));
                    }
                    row.addView(cell);
                } else {
                    String value = findGrade(grades, studentId, col);
                    int gradeId = findGradeId(grades, studentId, col);
                    int bg = cellBgForColumn(col, cellBg);
                    boolean red = TeacherJournalHelper.isRedGrade(value)
                            || (col.redAbsent && "н".equalsIgnoreCase(value.trim()));
                    int fg = red ? alert : textPrimary;
                    TextView cell = dataCell(TeacherJournalHelper.formatGradeDisplay(value), cellW, cellH, bg, border, fg, false);
                    if (today.equals(col.date)) applyTodayBorder(cell, primary);
                    if (canEdit && listener != null) {
                        final int colIndex = ci;
                        cell.setOnClickListener(v -> listener.onGradeClick(studentId, colIndex, value, gradeId));
                    }
                    row.addView(cell);
                }
            }
            if (latenessMode) {
                row.addView(dataCell(rowTotal > 0 ? rowTotal + "м" : "", totalW, cellH, Color.WHITE, border, textPrimary, true));
            }
            table.addView(row);
        }

        if (mode == MODE_JOURNAL) {
            TableRow footer = new TableRow(getContext());
            footer.addView(headerCell("", numW, footerH, headerBg, border, textSecondary));
            footer.addView(headerCell("", nameW, footerH, headerBg, border, textSecondary));
            for (int ci = 0; ci < columns.size(); ci++) {
                Column col = columns.get(ci);
                String note = col.footerNote;
                TextView tv = footerNoteCell(note.isEmpty() ? "+" : note, cellW, footerH, headerBg, border);
                if (canEdit && listener != null) {
                    final int colIndex = ci;
                    tv.setOnClickListener(v -> listener.onFooterClick(colIndex, note, col.dayId));
                }
                footer.addView(tv);
            }
            table.addView(footer);
        }

        addView(table);
    }

    private void buildColumns(JSONArray days, JSONArray grades, int mode) {
        Map<String, Column> map = new LinkedHashMap<>();
        if (days != null) {
            for (int i = 0; i < days.length(); i++) {
                JSONObject d = days.optJSONObject(i);
                if (d == null) continue;
                Column col = new Column(d.optString("date", ""), d.optInt("slot", 0));
                col.dayId = d.optInt("id", 0);
                col.dayType = d.optString("day_type", "normal");
                col.footerNote = d.optString("footer_note", "").trim();
                col.labCredited = d.optBoolean("lab_credited", false);
                col.labDueDate = d.optString("lab_due_date", null);
                col.redAbsent = d.optBoolean("red_absent", false);
                map.put(col.key(), col);
            }
        }
        if (grades != null) {
            for (int i = 0; i < grades.length(); i++) {
                JSONObject g = grades.optJSONObject(i);
                if (g == null) continue;
                if (g.optString("value", "").trim().isEmpty()) continue;
                Column col = new Column(g.optString("date", ""), g.optInt("slot", 0));
                map.putIfAbsent(col.key(), col);
            }
        }
        List<Column> all = new ArrayList<>(map.values());
        Collections.sort(all, (a, b) -> {
            int c = a.date.compareTo(b.date);
            return c != 0 ? c : Integer.compare(a.slot, b.slot);
        });
        if (mode == MODE_LAB) {
            for (Column col : all) {
                if ("lab".equals(col.dayType) || "okr".equals(col.dayType)) {
                    columns.add(col);
                }
            }
        } else {
            columns.addAll(all);
        }
    }

    private int cellBgForColumn(Column col, int defaultBg) {
        if ("lab".equals(col.dayType) || "okr".equals(col.dayType)) {
            if (col.labCredited) return Color.parseColor("#BBF7D0");
            if (col.labDueDate != null && !col.labDueDate.isEmpty()
                    && TeacherJournalHelper.normDate(col.labDueDate).compareTo(TeacherJournalHelper.isoToday()) < 0) {
                return Color.parseColor("#FECACA");
            }
            return Color.parseColor("#E0F2FE");
        }
        return defaultBg;
    }

    private void addMonthCells(TableRow row, int cellW, int cellH, int bg, int border, int textColor) {
        String last = "";
        for (Column col : columns) {
            String month = monthLabel(col.date);
            row.addView(headerCell(month.equals(last) ? "" : month, cellW, cellH, bg, border, textColor));
            last = month;
        }
    }

    private static String monthLabel(String iso) {
        if (iso.length() < 7) return "";
        try {
            int m = Integer.parseInt(iso.substring(5, 7));
            String[] names = {"январь", "февраль", "март", "апрель", "май", "июнь",
                    "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"};
            if (m >= 1 && m <= 12) return names[m - 1];
        } catch (NumberFormatException ignored) {}
        return "";
    }

    private static String findGrade(JSONArray grades, int studentId, Column col) {
        if (grades == null) return "";
        for (int i = 0; i < grades.length(); i++) {
            JSONObject g = grades.optJSONObject(i);
            if (g == null) continue;
            if (g.optInt("student", -1) == studentId
                    && col.date.equals(TeacherJournalHelper.normDate(g.optString("date", "")))
                    && g.optInt("slot", 0) == col.slot) {
                return g.optString("value", "");
            }
        }
        return "";
    }

    private static int findGradeId(JSONArray grades, int studentId, Column col) {
        if (grades == null) return -1;
        for (int i = 0; i < grades.length(); i++) {
            JSONObject g = grades.optJSONObject(i);
            if (g == null) continue;
            if (g.optInt("student", -1) == studentId
                    && col.date.equals(TeacherJournalHelper.normDate(g.optString("date", "")))
                    && g.optInt("slot", 0) == col.slot) {
                return g.optInt("id", -1);
            }
        }
        return -1;
    }

    private static int findLatenessMinutes(JSONObject bundle, int studentId, Column col) {
        JSONArray lateness = bundle.optJSONArray("lateness");
        if (lateness == null) return 0;
        for (int i = 0; i < lateness.length(); i++) {
            JSONObject l = lateness.optJSONObject(i);
            if (l == null) continue;
            if (l.optInt("student", -1) == studentId
                    && col.date.equals(TeacherJournalHelper.normDate(l.optString("date", "")))
                    && l.optInt("slot", 0) == col.slot) {
                return l.optInt("minutes", 0);
            }
        }
        return 0;
    }

    private TextView headerCell(String text, int w, int h, int bg, int border, int textColor) {
        TextView tv = new TextView(getContext());
        tv.setText(text);
        tv.setGravity(Gravity.CENTER);
        tv.setPadding(4, 4, 4, 4);
        tv.setTextSize(11f);
        tv.setTypeface(tv.getTypeface(), Typeface.BOLD);
        tv.setTextColor(textColor);
        tv.setBackgroundResource(R.drawable.bg_journal_header_cell);
        tv.setLayoutParams(new TableRow.LayoutParams(w, h));
        return tv;
    }

    private TextView dataCell(String text, int w, int h, int bgColor, int border, int textColor, boolean bold) {
        TextView tv = new TextView(getContext());
        tv.setText(text);
        tv.setGravity(Gravity.CENTER);
        tv.setPadding(4, 4, 4, 4);
        tv.setTextSize(13f);
        if (bold) tv.setTypeface(tv.getTypeface(), Typeface.BOLD);
        tv.setTextColor(textColor);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(bgColor);
        bg.setStroke(Math.max(1, (int) (1 * getResources().getDisplayMetrics().density)), border);
        tv.setBackground(bg);
        tv.setLayoutParams(new TableRow.LayoutParams(w, h));
        return tv;
    }

    private TextView footerNoteCell(String text, int w, int h, int bg, int border) {
        TextView tv = dataCell(text, w, h, bg, border,
                ContextCompat.getColor(getContext(), R.color.textMuted), false);
        tv.setTextSize(10f);
        if (!"+".equals(text)) {
            tv.setRotation(270f);
        }
        return tv;
    }

    private static void applyTodayBorder(TextView tv, int primaryColor) {
        GradientDrawable border = new GradientDrawable();
        border.setColor(Color.parseColor("#FEFCE8"));
        border.setStroke(3, primaryColor);
        tv.setBackground(border);
    }
}
