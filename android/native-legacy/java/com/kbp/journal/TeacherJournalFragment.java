package com.kbp.journal;

import android.graphics.Typeface;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.GridLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AlertDialog;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.Fragment;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Журнал преподавателя — редактирование оценок как на вебе. */
public class TeacherJournalFragment extends Fragment {
    private static final String[] DAY_TYPES = {"normal", "lab", "okr"};
    private static final String[] DAY_TYPE_LABELS = {"Обычный", "Лаб. работа", "ОКР"};

    private SwipeRefreshLayout swipeRefresh;
    private TextView teacherSubtitle;
    private TextView teacherEmpty;
    private TextView teacherError;
    private TextView readOnlyBadge;
    private LinearLayout subjectChipRow;
    private LinearLayout groupChipRow;
    private FrameLayout teacherGridHost;
    private View teacherToolbar;
    private View teacherModeRow;
    private Spinner dayTypeSpinner;
    private EditText newDateInput;
    private TextView addDateButton;
    private TextView addTodayButton;
    private TextView undoButton;
    private TextView modeJournal;
    private TextView modeLateness;
    private TextView modeLab;

    private JSONArray accessGroups = new JSONArray();
    private JSONObject activeBundle;
    private TeacherJournalGridView gridView;
    private int selectedSubjectId = -1;
    private int selectedAssignmentId = -1;
    private int activeMode = TeacherJournalGridView.MODE_JOURNAL;
    private boolean canEdit;
    private final ArrayList<String> undoStack = new ArrayList<>();

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_teacher_journal, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);
        bindViews(view);
        setupToolbar();
        JSONObject staff = SessionStore.getStaffSession(requireContext());
        if (staff != null) {
            teacherSubtitle.setText(staff.optString("fullName", staff.optString("username", "Преподаватель")));
        }
        swipeRefresh.setColorSchemeColors(requireContext().getColor(R.color.colorPrimary));
        swipeRefresh.setOnRefreshListener(this::loadAccess);
        loadAccess();
    }

    private void bindViews(View view) {
        swipeRefresh = view.findViewById(R.id.swipeRefresh);
        teacherSubtitle = view.findViewById(R.id.teacherSubtitle);
        teacherEmpty = view.findViewById(R.id.teacherEmpty);
        teacherError = view.findViewById(R.id.teacherError);
        readOnlyBadge = view.findViewById(R.id.readOnlyBadge);
        subjectChipRow = view.findViewById(R.id.subjectChipRow);
        groupChipRow = view.findViewById(R.id.groupChipRow);
        teacherGridHost = view.findViewById(R.id.teacherGridHost);
        teacherToolbar = view.findViewById(R.id.teacherToolbar);
        teacherModeRow = view.findViewById(R.id.teacherModeRow);
        dayTypeSpinner = view.findViewById(R.id.dayTypeSpinner);
        newDateInput = view.findViewById(R.id.newDateInput);
        addDateButton = view.findViewById(R.id.addDateButton);
        addTodayButton = view.findViewById(R.id.addTodayButton);
        undoButton = view.findViewById(R.id.undoButton);
        modeJournal = view.findViewById(R.id.modeJournal);
        modeLateness = view.findViewById(R.id.modeLateness);
        modeLab = view.findViewById(R.id.modeLab);
    }

    private void setupToolbar() {
        dayTypeSpinner.setAdapter(new ArrayAdapter<>(
                requireContext(), android.R.layout.simple_spinner_dropdown_item, DAY_TYPE_LABELS));
        newDateInput.setText(TeacherJournalHelper.isoToday());
        addDateButton.setOnClickListener(v -> addDate(newDateInput.getText().toString().trim()));
        addTodayButton.setOnClickListener(v -> {
            newDateInput.setText(TeacherJournalHelper.isoToday());
            addDate(TeacherJournalHelper.isoToday());
        });
        undoButton.setOnClickListener(v -> undoLast());
        modeJournal.setOnClickListener(v -> setMode(TeacherJournalGridView.MODE_JOURNAL));
        modeLateness.setOnClickListener(v -> setMode(TeacherJournalGridView.MODE_LATENESS));
        modeLab.setOnClickListener(v -> setMode(TeacherJournalGridView.MODE_LAB));
    }

    private void setMode(int mode) {
        activeMode = mode;
        styleModeTabs();
        renderGrid();
    }

    private void styleModeTabs() {
        styleTab(modeJournal, activeMode == TeacherJournalGridView.MODE_JOURNAL);
        styleTab(modeLateness, activeMode == TeacherJournalGridView.MODE_LATENESS);
        styleTab(modeLab, activeMode == TeacherJournalGridView.MODE_LAB);
    }

    private void styleTab(TextView tab, boolean active) {
        tab.setBackgroundResource(active ? R.drawable.bg_day_chip_active_solid : R.drawable.bg_day_chip_inactive);
        tab.setTextColor(active ? 0xFFFFFFFF : ContextCompat.getColor(requireContext(), R.color.textSecondary));
    }

    private void loadAccess() {
        String token = SessionStore.getAccessToken(requireContext());
        if (token == null) {
            swipeRefresh.setRefreshing(false);
            showEmpty("Сессия истекла — войдите снова");
            return;
        }
        swipeRefresh.setRefreshing(true);
        new Thread(() -> {
            try {
                JSONArray access = TeacherJournalHelper.fetchAccess(token);
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    swipeRefresh.setRefreshing(false);
                    accessGroups = access;
                    buildSubjectChips();
                    if (access.length() == 0) showEmpty("Нет назначенных журналов");
                });
            } catch (Exception e) {
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    swipeRefresh.setRefreshing(false);
                    showEmpty(e.getMessage() != null ? e.getMessage() : "Ошибка загрузки");
                });
            }
        }).start();
    }

    private void buildSubjectChips() {
        subjectChipRow.removeAllViews();
        groupChipRow.removeAllViews();
        teacherGridHost.removeAllViews();
        gridView = null;

        Map<Integer, String> subjects = new LinkedHashMap<>();
        for (int i = 0; i < accessGroups.length(); i++) {
            JSONObject group = accessGroups.optJSONObject(i);
            if (group == null) continue;
            JSONArray assignments = group.optJSONArray("assignments");
            if (assignments == null) continue;
            for (int j = 0; j < assignments.length(); j++) {
                JSONObject a = assignments.optJSONObject(j);
                if (a == null) continue;
                int sid = TeacherJournalHelper.resolveSubjectId(a);
                if (sid >= 0) subjects.putIfAbsent(sid, TeacherJournalHelper.resolveSubjectName(a));
            }
        }
        List<Map.Entry<Integer, String>> sorted = new ArrayList<>(subjects.entrySet());
        sorted.sort(Comparator.comparing(e -> e.getValue(), String.CASE_INSENSITIVE_ORDER));

        LayoutInflater inflater = LayoutInflater.from(requireContext());
        boolean first = true;
        for (Map.Entry<Integer, String> entry : sorted) {
            View chip = inflater.inflate(R.layout.item_timetable_recent_chip, subjectChipRow, false);
            TextView name = chip.findViewById(R.id.recentChipName);
            chip.findViewById(R.id.recentChipRemove).setVisibility(View.GONE);
            name.setText(entry.getValue());
            chip.setBackgroundResource(R.drawable.bg_day_chip_inactive);
            int sid = entry.getKey();
            chip.setOnClickListener(v -> selectSubject(sid));
            subjectChipRow.addView(chip);
            if (first) {
                selectSubject(sid);
                first = false;
            }
        }
    }

    private void selectSubject(int subjectId) {
        selectedSubjectId = subjectId;
        for (int i = 0; i < subjectChipRow.getChildCount(); i++) {
            View chip = subjectChipRow.getChildAt(i);
            TextView name = chip.findViewById(R.id.recentChipName);
            boolean active = matchesSubjectChip(name.getText().toString(), subjectId);
            chip.setBackgroundResource(active ? R.drawable.bg_day_chip_active_solid : R.drawable.bg_day_chip_inactive);
            name.setTextColor(active ? 0xFFFFFFFF : ContextCompat.getColor(requireContext(), R.color.textSecondary));
        }
        buildGroupChips();
    }

    private boolean matchesSubjectChip(String label, int subjectId) {
        for (int i = 0; i < accessGroups.length(); i++) {
            JSONObject group = accessGroups.optJSONObject(i);
            if (group == null) continue;
            JSONArray assignments = group.optJSONArray("assignments");
            if (assignments == null) continue;
            for (int j = 0; j < assignments.length(); j++) {
                JSONObject a = assignments.optJSONObject(j);
                if (a == null) continue;
                if (TeacherJournalHelper.resolveSubjectId(a) == subjectId
                        && TeacherJournalHelper.resolveSubjectName(a).equals(label)) {
                    return true;
                }
            }
        }
        return false;
    }

    private void buildGroupChips() {
        groupChipRow.removeAllViews();
        teacherGridHost.removeAllViews();
        gridView = null;
        LayoutInflater inflater = LayoutInflater.from(requireContext());
        boolean first = true;
        for (int i = 0; i < accessGroups.length(); i++) {
            JSONObject group = accessGroups.optJSONObject(i);
            if (group == null) continue;
            JSONArray assignments = group.optJSONArray("assignments");
            if (assignments == null) continue;
            for (int j = 0; j < assignments.length(); j++) {
                JSONObject a = assignments.optJSONObject(j);
                if (a == null) continue;
                if (TeacherJournalHelper.resolveSubjectId(a) != selectedSubjectId) continue;
                String groupName = group.optString("name", "");
                int assignmentId = a.optInt("id", -1);
                View chip = inflater.inflate(R.layout.item_timetable_recent_chip, groupChipRow, false);
                TextView name = chip.findViewById(R.id.recentChipName);
                chip.findViewById(R.id.recentChipRemove).setVisibility(View.GONE);
                name.setText(groupName);
                chip.setBackgroundResource(R.drawable.bg_day_chip_inactive);
                chip.setOnClickListener(v -> loadBundle(assignmentId, groupName));
                groupChipRow.addView(chip);
                if (first) {
                    loadBundle(assignmentId, groupName);
                    first = false;
                }
            }
        }
    }

    private void loadBundle(int assignmentId, String groupName) {
        selectedAssignmentId = assignmentId;
        for (int i = 0; i < groupChipRow.getChildCount(); i++) {
            View chip = groupChipRow.getChildAt(i);
            TextView name = chip.findViewById(R.id.recentChipName);
            boolean active = groupName.equals(name.getText().toString());
            chip.setBackgroundResource(active ? R.drawable.bg_day_chip_active_solid : R.drawable.bg_day_chip_inactive);
            name.setTextColor(active ? 0xFFFFFFFF : ContextCompat.getColor(requireContext(), R.color.textSecondary));
        }
        String token = SessionStore.getAccessToken(requireContext());
        if (token == null || assignmentId < 0) return;
        showEmpty("Загрузка…");
        teacherGridHost.removeAllViews();
        new Thread(() -> {
            try {
                JSONObject bundle = TeacherJournalHelper.fetchBundle(token, assignmentId);
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    activeBundle = bundle;
                    undoStack.clear();
                    canEdit = bundle.optBoolean("can_edit", false);
                    updateChromeVisibility();
                    teacherEmpty.setVisibility(View.GONE);
                    renderGrid();
                });
            } catch (Exception e) {
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> showEmpty(e.getMessage() != null ? e.getMessage() : "Ошибка"));
            }
        }).start();
    }

    private void updateChromeVisibility() {
        boolean hasData = activeBundle != null;
        teacherToolbar.setVisibility(canEdit && hasData ? View.VISIBLE : View.GONE);
        teacherModeRow.setVisibility(hasData ? View.VISIBLE : View.GONE);
        readOnlyBadge.setVisibility(hasData && !canEdit ? View.VISIBLE : View.GONE);
        undoButton.setEnabled(canEdit && !undoStack.isEmpty());
        undoButton.setAlpha(canEdit && !undoStack.isEmpty() ? 1f : 0.4f);
        modeLab.setVisibility(hasLabOkr() ? View.VISIBLE : View.GONE);
        if (!hasLabOkr() && activeMode == TeacherJournalGridView.MODE_LAB) {
            activeMode = TeacherJournalGridView.MODE_JOURNAL;
            styleModeTabs();
        }
    }

    private boolean hasLabOkr() {
        if (activeBundle == null) return false;
        JSONArray days = activeBundle.optJSONArray("days");
        if (days == null) return false;
        for (int i = 0; i < days.length(); i++) {
            JSONObject d = days.optJSONObject(i);
            if (d == null) continue;
            String t = d.optString("day_type", "normal");
            if ("lab".equals(t) || "okr".equals(t)) return true;
        }
        return false;
    }

    private void renderGrid() {
        teacherGridHost.removeAllViews();
        if (activeBundle == null) return;
        JSONArray students = activeBundle.optJSONArray("students");
        if (students == null || students.length() == 0) {
            showEmpty("Нет студентов");
            return;
        }
        gridView = new TeacherJournalGridView(requireContext());
        gridView.setListener(new TeacherJournalGridView.Listener() {
            @Override
            public void onGradeClick(int studentId, int colIndex, String currentValue, int gradeId) {
                showGradeDialog(studentId, colIndex, currentValue, gradeId);
            }

            @Override
            public void onLatenessClick(int studentId, int colIndex, int currentMinutes) {
                showLatenessDialog(studentId, colIndex, currentMinutes);
            }

            @Override
            public void onFooterClick(int colIndex, String currentNote, int dayId) {
                showFooterDialog(colIndex, currentNote);
            }

            @Override
            public void onColumnHeaderClick(int colIndex) {
                showColumnMenu(colIndex);
            }
        });
        gridView.bind(activeBundle, activeMode, canEdit);
        if (gridView.getColumns().isEmpty() && activeMode != TeacherJournalGridView.MODE_JOURNAL) {
            showEmpty("Нет лабораторных или ОКР");
            return;
        }
        if (gridView.getColumns().isEmpty()) {
            showEmpty("Нет занятий — нажмите «Добавить»");
            teacherGridHost.addView(gridView);
            return;
        }
        teacherEmpty.setVisibility(View.GONE);
        teacherGridHost.addView(gridView);
    }

    private void pushUndo() {
        if (activeBundle != null) undoStack.add(activeBundle.toString());
        undoButton.setEnabled(canEdit && !undoStack.isEmpty());
        undoButton.setAlpha(canEdit && !undoStack.isEmpty() ? 1f : 0.4f);
    }

    private void undoLast() {
        if (undoStack.isEmpty() || activeBundle == null) return;
        try {
            activeBundle = new JSONObject(undoStack.remove(undoStack.size() - 1));
            renderGrid();
            undoButton.setEnabled(!undoStack.isEmpty());
            undoButton.setAlpha(!undoStack.isEmpty() ? 1f : 0.4f);
        } catch (Exception e) {
            Toast.makeText(requireContext(), "Не удалось отменить", Toast.LENGTH_SHORT).show();
        }
    }

    private void showGradeDialog(int studentId, int colIndex, String currentValue, int gradeId) {
        if (!canEdit || gridView == null || activeBundle == null) return;
        List<TeacherJournalGridView.Column> cols = gridView.getColumns();
        if (colIndex < 0 || colIndex >= cols.size()) return;
        TeacherJournalGridView.Column col = cols.get(colIndex);
        String normalized = currentValue == null ? "" : currentValue.trim().toLowerCase(Locale.ROOT);

        ScrollView scroll = new ScrollView(requireContext());
        int pad = (int) (12 * getResources().getDisplayMetrics().density);
        LinearLayout root = new LinearLayout(requireContext());
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(pad, pad, pad, pad);

        TextView title = new TextView(requireContext());
        title.setText("Оценка 0–10 · " + col.dayLabel());
        title.setTextSize(12f);
        title.setTypeface(title.getTypeface(), Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, 0, 0, pad);
        root.addView(title);

        GridLayout grid = new GridLayout(requireContext());
        grid.setColumnCount(6);
        int cellPad = (int) (4 * getResources().getDisplayMetrics().density);
        int primary = ContextCompat.getColor(requireContext(), R.color.colorPrimary);
        for (int n = 0; n <= 10; n++) {
            TextView btn = gradeChip(String.valueOf(n), normalized.equals(String.valueOf(n)), primary);
            GridLayout.LayoutParams lp = new GridLayout.LayoutParams();
            lp.width = 0;
            lp.columnSpec = GridLayout.spec(GridLayout.UNDEFINED, 1f);
            lp.setMargins(cellPad, cellPad, cellPad, cellPad);
            btn.setLayoutParams(lp);
            grid.addView(btn);
        }
        root.addView(grid);

        LinearLayout special = new LinearLayout(requireContext());
        special.setOrientation(LinearLayout.HORIZONTAL);
        special.setPadding(0, pad, 0, pad);
        String[][] marks = {{"н", "н"}, {"н.", "н"}, {"зач", "зач"}};
        boolean[] red = {false, true, false};
        for (int i = 0; i < marks.length; i++) {
            TextView btn = gradeChip(marks[i][1],
                    normalized.equals(marks[i][0].toLowerCase(Locale.ROOT)), primary);
            if (red[i]) btn.setTextColor(ContextCompat.getColor(requireContext(), R.color.markAlert));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            lp.setMargins(cellPad, 0, cellPad, 0);
            btn.setLayoutParams(lp);
            special.addView(btn);
        }
        root.addView(special);

        TextView clear = new TextView(requireContext());
        clear.setText(gradeId > 0 ? "Удалить отметку" : "Очистить отметку");
        clear.setGravity(Gravity.CENTER);
        clear.setPadding(0, pad, 0, 0);
        clear.setTextColor(ContextCompat.getColor(requireContext(), R.color.textMuted));
        root.addView(clear);

        scroll.addView(root);
        AlertDialog dialog = new AlertDialog.Builder(requireContext())
                .setView(scroll)
                .setNegativeButton("Закрыть", null)
                .create();
        for (int n = 0; n <= 10; n++) {
            TextView btn = (TextView) grid.getChildAt(n);
            final String pick = String.valueOf(n);
            btn.setOnClickListener(v -> {
                dialog.dismiss();
                saveGrade(studentId, colIndex, pick, gradeId);
            });
        }
        for (int i = 0; i < special.getChildCount(); i++) {
            TextView btn = (TextView) special.getChildAt(i);
            final String pick = marks[i][0];
            btn.setOnClickListener(v -> {
                dialog.dismiss();
                saveGrade(studentId, colIndex, pick, gradeId);
            });
        }
        clear.setOnClickListener(v -> {
            dialog.dismiss();
            saveGrade(studentId, colIndex, "", gradeId);
        });
        dialog.show();
    }

    private TextView gradeChip(String label, boolean selected, int primary) {
        TextView tv = new TextView(requireContext());
        tv.setText(label);
        tv.setGravity(Gravity.CENTER);
        int vPad = (int) (10 * getResources().getDisplayMetrics().density);
        tv.setPadding(0, vPad, 0, vPad);
        tv.setTextSize(14f);
        tv.setBackgroundResource(selected ? R.drawable.bg_day_chip_active_solid : R.drawable.bg_day_chip_inactive);
        tv.setTextColor(selected ? 0xFFFFFFFF : ContextCompat.getColor(requireContext(), R.color.textPrimary));
        if (selected && !label.equals("н")) tv.setTextColor(0xFFFFFFFF);
        return tv;
    }

    private void showLatenessDialog(int studentId, int colIndex, int currentMinutes) {
        if (!canEdit || gridView == null || activeBundle == null) return;
        List<TeacherJournalGridView.Column> cols = gridView.getColumns();
        if (colIndex < 0 || colIndex >= cols.size()) return;
        TeacherJournalGridView.Column col = cols.get(colIndex);

        ScrollView scroll = new ScrollView(requireContext());
        int pad = (int) (12 * getResources().getDisplayMetrics().density);
        LinearLayout root = new LinearLayout(requireContext());
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(pad, pad, pad, pad);

        TextView title = new TextView(requireContext());
        title.setText("Опоздание 0–25 мин · " + col.dayLabel());
        title.setTextSize(12f);
        title.setTypeface(title.getTypeface(), Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, 0, 0, pad);
        root.addView(title);

        GridLayout grid = new GridLayout(requireContext());
        grid.setColumnCount(5);
        int cellPad = (int) (4 * getResources().getDisplayMetrics().density);
        int primary = ContextCompat.getColor(requireContext(), R.color.colorPrimary);
        for (int n = 0; n <= 25; n++) {
            TextView btn = gradeChip(String.valueOf(n), currentMinutes == n, primary);
            GridLayout.LayoutParams lp = new GridLayout.LayoutParams();
            lp.width = 0;
            lp.columnSpec = GridLayout.spec(GridLayout.UNDEFINED, 1f);
            lp.setMargins(cellPad, cellPad, cellPad, cellPad);
            btn.setLayoutParams(lp);
            grid.addView(btn);
        }
        root.addView(grid);

        TextView clear = new TextView(requireContext());
        clear.setText("Очистить");
        clear.setGravity(Gravity.CENTER);
        clear.setPadding(0, pad, 0, 0);
        clear.setTextColor(ContextCompat.getColor(requireContext(), R.color.textMuted));
        root.addView(clear);

        scroll.addView(root);
        AlertDialog dialog = new AlertDialog.Builder(requireContext())
                .setView(scroll)
                .setNegativeButton("Закрыть", null)
                .create();
        for (int n = 0; n <= 25; n++) {
            TextView btn = (TextView) grid.getChildAt(n);
            final int pick = n;
            btn.setOnClickListener(v -> {
                dialog.dismiss();
                saveLateness(studentId, colIndex, pick);
            });
        }
        clear.setOnClickListener(v -> {
            dialog.dismiss();
            saveLateness(studentId, colIndex, 0);
        });
        dialog.show();
    }

    private void saveLateness(int studentId, int colIndex, int minutes) {
        if (gridView == null || activeBundle == null) return;
        List<TeacherJournalGridView.Column> cols = gridView.getColumns();
        if (colIndex < 0 || colIndex >= cols.size()) return;
        TeacherJournalGridView.Column col = cols.get(colIndex);
        int groupId = TeacherJournalHelper.resolveGroupId(activeBundle);
        String token = SessionStore.getAccessToken(requireContext());
        if (token == null || groupId < 0) return;

        pushUndo();
        new Thread(() -> {
            try {
                TeacherJournalHelper.saveLateness(token, groupId, studentId, col.date, col.slot, minutes);
                JSONObject fresh = TeacherJournalHelper.fetchBundle(token, selectedAssignmentId);
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    activeBundle = fresh;
                    clearError();
                    renderGrid();
                });
            } catch (Exception e) {
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> showError(e.getMessage()));
            }
        }).start();
    }

    private void saveGrade(int studentId, int colIndex, String value, int gradeId) {
        if (gridView == null || activeBundle == null) return;
        List<TeacherJournalGridView.Column> cols = gridView.getColumns();
        if (colIndex < 0 || colIndex >= cols.size()) return;
        TeacherJournalGridView.Column col = cols.get(colIndex);
        String token = SessionStore.getAccessToken(requireContext());
        if (token == null) return;

        pushUndo();
        new Thread(() -> {
            try {
                if (value.isEmpty() && gradeId > 0) {
                    TeacherJournalHelper.deleteGrade(token, gradeId);
                } else if (!value.isEmpty()) {
                    TeacherJournalHelper.saveGrade(token, selectedAssignmentId, studentId, col.date, value, col.slot,
                            gradeId > 0 ? gradeId : null);
                    TeacherJournalHelper.saveJournalDay(token, selectedAssignmentId, col.date, col.slot, null, null);
                }
                JSONObject fresh = TeacherJournalHelper.fetchBundle(token, selectedAssignmentId);
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    activeBundle = fresh;
                    clearError();
                    renderGrid();
                });
            } catch (Exception e) {
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> showError(e.getMessage()));
            }
        }).start();
    }

    private void showFooterDialog(int colIndex, String currentNote) {
        if (!canEdit || gridView == null) return;
        List<TeacherJournalGridView.Column> cols = gridView.getColumns();
        if (colIndex < 0 || colIndex >= cols.size()) return;
        TeacherJournalGridView.Column col = cols.get(colIndex);

        EditText input = new EditText(requireContext());
        input.setInputType(InputType.TYPE_CLASS_TEXT);
        input.setText(currentNote);
        int pad = (int) (16 * getResources().getDisplayMetrics().density);
        input.setPadding(pad, pad, pad, pad);

        new AlertDialog.Builder(requireContext())
                .setTitle("Подпись урока · " + col.dayLabel())
                .setView(input)
                .setPositiveButton("Сохранить", (d, w) -> saveFooter(colIndex, input.getText().toString().trim()))
                .setNegativeButton("Отмена", null)
                .show();
    }

    private void saveFooter(int colIndex, String note) {
        if (gridView == null || activeBundle == null) return;
        List<TeacherJournalGridView.Column> cols = gridView.getColumns();
        if (colIndex < 0 || colIndex >= cols.size()) return;
        TeacherJournalGridView.Column col = cols.get(colIndex);
        String token = SessionStore.getAccessToken(requireContext());
        if (token == null) return;

        pushUndo();
        new Thread(() -> {
            try {
                TeacherJournalHelper.saveJournalDay(token, selectedAssignmentId, col.date, col.slot,
                        col.dayType, note, col.labDueDate, col.labCredited, col.redAbsent);
                JSONObject fresh = TeacherJournalHelper.fetchBundle(token, selectedAssignmentId);
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    activeBundle = fresh;
                    clearError();
                    renderGrid();
                });
            } catch (Exception e) {
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> showError(e.getMessage()));
            }
        }).start();
    }

    private void showColumnMenu(int colIndex) {
        if (!canEdit || gridView == null || activeBundle == null) return;
        List<TeacherJournalGridView.Column> cols = gridView.getColumns();
        if (colIndex < 0 || colIndex >= cols.size()) return;
        TeacherJournalGridView.Column col = cols.get(colIndex);
        boolean isLab = "lab".equals(col.dayType) || "okr".equals(col.dayType);

        List<String> items = new ArrayList<>();
        items.add("Лаб. работа");
        items.add("ОКР");
        items.add("Обычный");
        if (isLab) items.add("Срок сдачи…");
        if (isLab) items.add(col.labCredited ? "Снять зач." : "Зач.");
        items.add(col.redAbsent ? "✓ Красная н" : "Красная н");
        items.add("Добавить урок");
        items.add("Удалить колонку");

        new AlertDialog.Builder(requireContext())
                .setTitle(TeacherJournalHelper.formatColumnDateFull(col.date))
                .setItems(items.toArray(new CharSequence[0]), (d, which) -> {
                    int idx = which;
                    if (idx == 0) changeDayType(colIndex, "lab");
                    else if (idx == 1) changeDayType(colIndex, "okr");
                    else if (idx == 2) changeDayType(colIndex, "normal");
                    else if (isLab && idx == 3) showLabDueDateDialog(colIndex);
                    else if (isLab && idx == 4) toggleLabCredited(colIndex);
                    else if (idx == (isLab ? 5 : 3)) toggleRedAbsent(colIndex);
                    else if (idx == (isLab ? 6 : 4)) addLessonAfter(colIndex);
                    else if (idx == (isLab ? 7 : 5)) deleteColumn(colIndex);
                })
                .show();
    }

    private void changeDayType(int colIndex, String type) {
        if (gridView == null || activeBundle == null) return;
        TeacherJournalGridView.Column col = gridView.getColumns().get(colIndex);
        saveColumnMeta(colIndex, type, col.footerNote, col.labDueDate, col.labCredited, col.redAbsent);
    }

    private void toggleRedAbsent(int colIndex) {
        if (gridView == null) return;
        TeacherJournalGridView.Column col = gridView.getColumns().get(colIndex);
        saveColumnMeta(colIndex, col.dayType, col.footerNote, col.labDueDate, col.labCredited, !col.redAbsent);
    }

    private void toggleLabCredited(int colIndex) {
        if (gridView == null) return;
        TeacherJournalGridView.Column col = gridView.getColumns().get(colIndex);
        saveColumnMeta(colIndex, col.dayType, col.footerNote, col.labDueDate, !col.labCredited, col.redAbsent);
    }

    private void showLabDueDateDialog(int colIndex) {
        if (gridView == null) return;
        TeacherJournalGridView.Column col = gridView.getColumns().get(colIndex);
        EditText input = new EditText(requireContext());
        input.setInputType(InputType.TYPE_CLASS_DATETIME | InputType.TYPE_DATETIME_VARIATION_DATE);
        input.setHint("ГГГГ-ММ-ДД");
        if (col.labDueDate != null && !col.labDueDate.isEmpty()) {
            input.setText(TeacherJournalHelper.normDate(col.labDueDate));
        }
        int pad = (int) (16 * getResources().getDisplayMetrics().density);
        input.setPadding(pad, pad, pad, pad);
        new AlertDialog.Builder(requireContext())
                .setTitle("Срок сдачи")
                .setView(input)
                .setPositiveButton("Сохранить", (d, w) -> {
                    TeacherJournalGridView.Column c = gridView.getColumns().get(colIndex);
                    String due = input.getText().toString().trim();
                    saveColumnMeta(colIndex, c.dayType, c.footerNote, due, c.labCredited, c.redAbsent);
                })
                .setNeutralButton("Очистить", (d, w) -> {
                    TeacherJournalGridView.Column c = gridView.getColumns().get(colIndex);
                    saveColumnMeta(colIndex, c.dayType, c.footerNote, "", c.labCredited, c.redAbsent);
                })
                .setNegativeButton("Отмена", null)
                .show();
    }

    private void saveColumnMeta(int colIndex, String dayType, String footerNote, String labDueDate,
                                boolean labCredited, boolean redAbsent) {
        if (gridView == null || activeBundle == null) return;
        TeacherJournalGridView.Column col = gridView.getColumns().get(colIndex);
        String token = SessionStore.getAccessToken(requireContext());
        if (token == null) return;

        pushUndo();
        new Thread(() -> {
            try {
                TeacherJournalHelper.saveJournalDay(token, selectedAssignmentId, col.date, col.slot,
                        dayType, footerNote, labDueDate, labCredited, redAbsent);
                JSONObject fresh = TeacherJournalHelper.fetchBundle(token, selectedAssignmentId);
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    activeBundle = fresh;
                    updateChromeVisibility();
                    clearError();
                    renderGrid();
                });
            } catch (Exception e) {
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> showError(e.getMessage()));
            }
        }).start();
    }

    private void deleteColumn(int colIndex) {
        if (gridView == null || activeBundle == null) return;
        TeacherJournalGridView.Column col = gridView.getColumns().get(colIndex);
        String token = SessionStore.getAccessToken(requireContext());
        if (token == null) return;

        new AlertDialog.Builder(requireContext())
                .setTitle("Удалить колонку?")
                .setMessage(TeacherJournalHelper.formatColumnDateFull(col.date))
                .setPositiveButton("Удалить", (d, w) -> {
                    pushUndo();
                    new Thread(() -> {
                        try {
                            if (col.dayId > 0) {
                                TeacherJournalHelper.deleteJournalDay(token, col.dayId);
                            }
                            JSONObject fresh = TeacherJournalHelper.fetchBundle(token, selectedAssignmentId);
                            if (!isAdded()) return;
                            requireActivity().runOnUiThread(() -> {
                                activeBundle = fresh;
                                updateChromeVisibility();
                                clearError();
                                renderGrid();
                            });
                        } catch (Exception e) {
                            if (!isAdded()) return;
                            requireActivity().runOnUiThread(() -> showError(e.getMessage()));
                        }
                    }).start();
                })
                .setNegativeButton("Отмена", null)
                .show();
    }

    private void addDate(String iso) {
        if (!canEdit || iso.isEmpty()) return;
        String date = TeacherJournalHelper.normDate(iso);
        if (date.length() < 10) {
            Toast.makeText(requireContext(), "Формат: ГГГГ-ММ-ДД", Toast.LENGTH_SHORT).show();
            return;
        }
        String dayType = DAY_TYPES[dayTypeSpinner.getSelectedItemPosition()];
        String token = SessionStore.getAccessToken(requireContext());
        if (token == null) return;

        int slot = computeNewDateSlot(date);
        pushUndo();
        new Thread(() -> {
            try {
                TeacherJournalHelper.saveJournalDay(token, selectedAssignmentId, date, slot, dayType, "",
                        null, null, null);
                JSONObject fresh = TeacherJournalHelper.fetchBundle(token, selectedAssignmentId);
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    activeBundle = fresh;
                    updateChromeVisibility();
                    clearError();
                    renderGrid();
                });
            } catch (Exception e) {
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> showError(e.getMessage()));
            }
        }).start();
    }

    private void addLessonAfter(int colIndex) {
        if (!canEdit || gridView == null || activeBundle == null) return;
        List<TeacherJournalGridView.Column> cols = gridView.getColumns();
        if (colIndex < 0 || colIndex >= cols.size()) return;
        TeacherJournalGridView.Column col = cols.get(colIndex);
        int maxSlot = col.slot;
        for (TeacherJournalGridView.Column c : cols) {
            if (c.date.equals(col.date)) maxSlot = Math.max(maxSlot, c.slot);
        }
        int newSlot = maxSlot + 1;
        String token = SessionStore.getAccessToken(requireContext());
        if (token == null) return;

        pushUndo();
        new Thread(() -> {
            try {
                TeacherJournalHelper.saveJournalDay(token, selectedAssignmentId, col.date, newSlot, col.dayType, "",
                        col.labDueDate, col.labCredited, col.redAbsent);
                JSONObject fresh = TeacherJournalHelper.fetchBundle(token, selectedAssignmentId);
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    activeBundle = fresh;
                    clearError();
                    renderGrid();
                });
            } catch (Exception e) {
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> showError(e.getMessage()));
            }
        }).start();
    }

    private int computeNewDateSlot(String date) {
        if (gridView == null) return 0;
        boolean found = false;
        int maxSlot = -1;
        for (TeacherJournalGridView.Column c : gridView.getColumns()) {
            if (c.date.equals(date)) {
                found = true;
                maxSlot = Math.max(maxSlot, c.slot);
            }
        }
        return found ? maxSlot + 1 : 0;
    }

    private void showEmpty(String msg) {
        teacherEmpty.setVisibility(View.VISIBLE);
        teacherEmpty.setText(msg);
        teacherGridHost.removeAllViews();
        teacherToolbar.setVisibility(View.GONE);
        teacherModeRow.setVisibility(View.GONE);
    }

    private void showError(String msg) {
        if (msg == null || msg.isEmpty()) return;
        teacherError.setText(msg);
        teacherError.setVisibility(View.VISIBLE);
        Toast.makeText(requireContext(), msg, Toast.LENGTH_SHORT).show();
    }

    private void clearError() {
        teacherError.setVisibility(View.GONE);
    }
}
