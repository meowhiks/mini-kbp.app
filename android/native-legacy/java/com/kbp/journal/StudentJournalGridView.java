package com.kbp.journal;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.util.TypedValue;
import android.view.Gravity;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TableLayout;
import android.widget.TableRow;
import android.widget.TextView;

import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

/** Студенческая сетка журнала (read-only, JournalGrid.tsx). */
public final class StudentJournalGridView extends HorizontalScrollView {

    public interface CellClickListener {
        void onCellClick(String subjectName, String dateLabel, String explanation, String grades);
    }

    private CellClickListener cellClickListener;

    public StudentJournalGridView(Context context) {
        super(context);
        setHorizontalScrollBarEnabled(false);
        setFillViewport(true);
    }

    public void setCellClickListener(CellClickListener listener) {
        this.cellClickListener = listener;
    }

    public void bind(JSONObject data) {
        removeAllViews();
        if (data == null) return;

        JSONArray subjects = data.optJSONArray("subjects");
        JSONArray dates = data.optJSONArray("dates");
        JSONArray months = data.optJSONArray("months");
        JSONArray monthColspans = data.optJSONArray("monthColspans");
        if (subjects == null || dates == null || subjects.length() == 0) return;

        boolean dense = SessionStore.getBool(getContext(), "journalDenseCells", false);
        boolean showAvg = SessionStore.getBool(getContext(), "journalShowAverage", true);
        boolean hundredths = SessionStore.getBool(getContext(), "journalShowHundredths", false);
        boolean showTotal = SessionStore.getBool(getContext(), "journalShowTotal", true);

        float density = getResources().getDisplayMetrics().density;
        int cellW = (int) ((dense ? 27 : 31) * density);
        int cellH = (int) ((dense ? 32 : 36) * density);
        int subjectW = (int) (96 * density);
        int avgW = (int) (40 * density);
        int gap = (int) (1 * density);

        int textPrimary = ContextCompat.getColor(getContext(), R.color.textPrimary);
        int textSecondary = ContextCompat.getColor(getContext(), R.color.textSecondary);
        int cellBg = Color.parseColor("#FEFCE8");
        int headerBg = ContextCompat.getColor(getContext(), R.color.surface);
        int border = ContextCompat.getColor(getContext(), R.color.border);
        int alert = ContextCompat.getColor(getContext(), R.color.markAlert);

        TableLayout table = new TableLayout(getContext());
        table.setStretchAllColumns(false);
        table.setShrinkAllColumns(false);

        // Month row
        if (months != null && monthColspans != null) {
            TableRow monthRow = new TableRow(getContext());
            monthRow.addView(spacerCell(subjectW, cellH / 2, headerBg, border));
            monthRow.addView(spacerCell(gap, cellH / 2, headerBg, border));
            for (int mi = 0; mi < months.length(); mi++) {
                int span = monthColspans.optInt(mi, 1);
                int w = span * cellW;
                TextView tv = headerCell(months.optString(mi, ""), w, cellH / 2, headerBg, border, textSecondary, 11);
                monthRow.addView(tv);
            }
            if (showAvg) monthRow.addView(spacerCell(avgW, cellH / 2, headerBg, border));
            table.addView(monthRow);
        }

        // Date row
        TableRow dateRow = new TableRow(getContext());
        TextView subjectHead = headerCell("Предмет", subjectW, cellH, headerBg, border, textPrimary, 12);
        subjectHead.setTypeface(subjectHead.getTypeface(), Typeface.BOLD);
        dateRow.addView(subjectHead);
        dateRow.addView(spacerCell(gap, cellH, headerBg, border));
        for (int d = 0; d < dates.length(); d++) {
            dateRow.addView(headerCell(dates.optString(d, ""), cellW, cellH, headerBg, border, textSecondary, 12));
        }
        if (showAvg) {
            TextView avgHead = headerCell("Ср.зн.", avgW, cellH, headerBg, border, textPrimary, 11);
            avgHead.setTypeface(avgHead.getTypeface(), Typeface.BOLD);
            dateRow.addView(avgHead);
        }
        table.addView(dateRow);

        // Subject rows
        for (int si = 0; si < subjects.length(); si++) {
            JSONObject subject = subjects.optJSONObject(si);
            if (subject == null) continue;
            String name = subject.optString("shortName", subject.optString("short_name", subject.optString("name", "—")));
            TableRow row = new TableRow(getContext());
            TextView subj = headerCell(name, subjectW, cellH, cellBg, border, textPrimary, 12);
            subj.setMaxLines(2);
            row.addView(subj);
            row.addView(spacerCell(gap, cellH, cellBg, border));

            JSONObject matrix = subject.optJSONObject("gradesMatrix");
            for (int d = 0; d < dates.length(); d++) {
                final int dateIdx = d;
                String marks = formatMarks(matrix, dateIdx);
                boolean alertMark = hasAlert(matrix, dateIdx);
                TextView cell = markCell(marks, cellW, cellH, cellBg, border, alertMark ? alert : textPrimary, dense ? 12 : 13);
                cell.setOnClickListener(v -> {
                    if (cellClickListener == null) return;
                    cellClickListener.onCellClick(
                            name,
                            dates.optString(dateIdx, ""),
                            extractExplanation(matrix, dateIdx),
                            marks
                    );
                });
                row.addView(cell);
            }
            if (showAvg) {
                String avg = JournalAverageHelper.formatAverage(JournalAverageHelper.subjectAverage(subject), hundredths);
                row.addView(headerCell(avg, avgW, cellH, cellBg, border, textSecondary, 12));
            }
            table.addView(row);
        }

        // Footer total
        if (showTotal && showAvg) {
            String total = JournalAverageHelper.totalAverage(subjects, hundredths);
            if (total != null) {
                TableRow footer = new TableRow(getContext());
                TextView label = headerCell("Итого", subjectW, cellH, headerBg, border, textPrimary, 12);
                label.setTypeface(label.getTypeface(), Typeface.BOLD);
                footer.addView(label);
                footer.addView(spacerCell(gap, cellH, headerBg, border));
                for (int d = 0; d < dates.length(); d++) {
                    footer.addView(spacerCell(cellW, cellH, headerBg, border));
                }
                TextView totalCell = headerCell(total, avgW, cellH, headerBg, border, textPrimary, 12);
                totalCell.setTypeface(totalCell.getTypeface(), Typeface.BOLD);
                footer.addView(totalCell);
                table.addView(footer);
            }
        }

        LinearLayout wrap = new LinearLayout(getContext());
        wrap.setOrientation(LinearLayout.VERTICAL);
        wrap.addView(table);
        addView(wrap);
    }

    private TextView headerCell(String text, int w, int h, int bg, int border, int color, int sp) {
        TextView tv = new TextView(getContext());
        tv.setText(text);
        tv.setTextColor(color);
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        tv.setGravity(Gravity.CENTER);
        tv.setPadding(4, 4, 4, 4);
        TableRow.LayoutParams lp = new TableRow.LayoutParams(w, h);
        tv.setLayoutParams(lp);
        tv.setBackgroundColor(bg);
        return tv;
    }

    private TextView markCell(String text, int w, int h, int bg, int border, int color, int sp) {
        TextView tv = headerCell(text, w, h, bg, border, color, sp);
        tv.setBackgroundResource(R.drawable.bg_journal_cell);
        return tv;
    }

    private TextView spacerCell(int w, int h, int bg, int border) {
        TextView tv = new TextView(getContext());
        TableRow.LayoutParams lp = new TableRow.LayoutParams(w, h);
        tv.setLayoutParams(lp);
        tv.setBackgroundColor(bg);
        return tv;
    }

    private static String formatMarks(JSONObject matrix, int dateIdx) {
        if (matrix == null) return "";
        JSONArray grades = matrix.optJSONArray(String.valueOf(dateIdx));
        if (grades == null) grades = matrix.optJSONArray("" + dateIdx);
        if (grades == null || grades.length() == 0) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < grades.length(); i++) {
            JSONObject g = grades.optJSONObject(i);
            if (g == null) continue;
            String v = g.optString("value", "").trim();
            if (v.isEmpty()) continue;
            if (sb.length() > 0) sb.append('\n');
            sb.append(v);
        }
        return sb.toString();
    }

    private static boolean hasAlert(JSONObject matrix, int dateIdx) {
        if (matrix == null) return false;
        JSONArray grades = matrix.optJSONArray(String.valueOf(dateIdx));
        if (grades == null) grades = matrix.optJSONArray("" + dateIdx);
        if (grades == null) return false;
        for (int i = 0; i < grades.length(); i++) {
            JSONObject g = grades.optJSONObject(i);
            if (g != null && "alert".equals(g.optString("kind"))) return true;
        }
        return false;
    }

    private static String extractExplanation(JSONObject matrix, int dateIdx) {
        if (matrix == null) return "";
        JSONArray grades = matrix.optJSONArray(String.valueOf(dateIdx));
        if (grades == null) grades = matrix.optJSONArray("" + dateIdx);
        if (grades == null) return "";
        for (int i = 0; i < grades.length(); i++) {
            JSONObject g = grades.optJSONObject(i);
            if (g == null) continue;
            String exp = g.optString("explanation", g.optString("comment", ""));
            if (!exp.isEmpty()) return exp;
        }
        return "";
    }
}
