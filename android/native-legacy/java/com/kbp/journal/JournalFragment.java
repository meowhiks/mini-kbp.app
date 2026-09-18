package com.kbp.journal;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
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

import java.io.IOException;

public class JournalFragment extends Fragment {
    private static final int MODE_JOURNAL = 0;
    private static final int MODE_LATENESS = 1;
    private static final int MODE_LAB = 2;

    private SwipeRefreshLayout swipeRefresh;
    private TextView journalSubtitle;
    private TextView journalEmpty;
    private FrameLayout journalContentHost;
    private TextView modeJournal;
    private TextView modeLateness;
    private TextView modeLab;

    private JSONObject journalData;
    private JSONObject latenessData;
    private int activeMode = MODE_JOURNAL;
    private StudentJournalGridView gridView;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_journal, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);
        swipeRefresh = view.findViewById(R.id.swipeRefresh);
        journalSubtitle = view.findViewById(R.id.journalSubtitle);
        journalEmpty = view.findViewById(R.id.journalEmpty);
        journalContentHost = view.findViewById(R.id.journalContentHost);
        modeJournal = view.findViewById(R.id.modeJournal);
        modeLateness = view.findViewById(R.id.modeLateness);
        modeLab = view.findViewById(R.id.modeLab);

        JSONObject session = SessionStore.getAppSession(requireContext());
        if (session != null) {
            String name = session.optString("fullName", "");
            String group = session.optString("groupName", "");
            journalSubtitle.setText(name + (group.isEmpty() ? "" : " · " + group));
        }

        modeJournal.setOnClickListener(v -> setMode(MODE_JOURNAL));
        modeLateness.setOnClickListener(v -> setMode(MODE_LATENESS));
        modeLab.setOnClickListener(v -> setMode(MODE_LAB));

        swipeRefresh.setColorSchemeColors(requireContext().getColor(R.color.colorPrimary));
        swipeRefresh.setOnRefreshListener(this::loadJournal);
        showCachedOrLoad();
    }

    @Override
    public void onResume() {
        super.onResume();
        if (journalData != null) renderActiveMode();
    }

    private void setMode(int mode) {
        activeMode = mode;
        styleModeTabs();
        renderActiveMode();
    }

    private void styleModeTabs() {
        styleTab(modeJournal, activeMode == MODE_JOURNAL);
        styleTab(modeLateness, activeMode == MODE_LATENESS);
        styleTab(modeLab, activeMode == MODE_LAB);
    }

    private void styleTab(TextView tab, boolean active) {
        tab.setBackgroundResource(active ? R.drawable.bg_day_chip_active_solid : R.drawable.bg_day_chip_inactive);
        tab.setTextColor(active ? 0xFFFFFFFF : ContextCompat.getColor(requireContext(), R.color.textSecondary));
    }

    private void showCachedOrLoad() {
        String cached = SessionStore.getCachedJournal(requireContext());
        if (cached != null) {
            try {
                journalData = new JSONObject(cached);
                updateLabTabVisibility();
                renderActiveMode();
            } catch (Exception ignored) {}
        }
        loadJournal();
    }

    private void loadJournal() {
        String token = SessionStore.getAccessToken(requireContext());
        if (token == null) {
            swipeRefresh.setRefreshing(false);
            journalEmpty.setVisibility(View.VISIBLE);
            journalEmpty.setText("Сессия истекла — войдите снова");
            return;
        }
        swipeRefresh.setRefreshing(true);

        new Thread(() -> {
            try {
                JSONObject data = OAuthHelper.fetchJournal(token);
                if (!data.has("subjects") && !data.has("dates")) {
                    String detail = data.optString("detail", "");
                    if (!detail.isEmpty()) {
                        throw new IOException(detail);
                    }
                }
                SessionStore.cacheJournal(requireContext(), data.toString());
                JSONObject lateness = null;
                try {
                    lateness = ApiClient.get().getFlexible("/api/student/lateness/", token);
                } catch (Exception ignored) {}
                JSONObject finalLateness = lateness;
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    swipeRefresh.setRefreshing(false);
                    journalData = data;
                    latenessData = finalLateness;
                    updateLabTabVisibility();
                    renderActiveMode();
                });
            } catch (Exception e) {
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    swipeRefresh.setRefreshing(false);
                    if (journalData == null) {
                        journalEmpty.setVisibility(View.VISIBLE);
                        journalEmpty.setText(e.getMessage() != null ? e.getMessage() : "Не удалось загрузить журнал");
                    } else {
                        Toast.makeText(requireContext(), e.getMessage(), Toast.LENGTH_SHORT).show();
                    }
                });
            }
        }).start();
    }

    private void updateLabTabVisibility() {
        boolean hasLab = false;
        if (journalData != null) {
            JSONObject dayTypes = journalData.optJSONObject("dayTypes");
            if (dayTypes != null) {
                JSONArray names = dayTypes.names();
                if (names != null) {
                    for (int i = 0; i < names.length(); i++) {
                        String t = dayTypes.optString(names.optString(i), "");
                        if ("lab".equals(t) || "okr".equals(t)) {
                            hasLab = true;
                            break;
                        }
                    }
                }
            }
        }
        modeLab.setVisibility(hasLab ? View.VISIBLE : View.GONE);
        if (!hasLab && activeMode == MODE_LAB) activeMode = MODE_JOURNAL;
        styleModeTabs();
    }

    private void renderActiveMode() {
        journalContentHost.removeAllViews();
        if (journalData == null) return;
        JSONArray subjects = journalData.optJSONArray("subjects");
        if (subjects == null || subjects.length() == 0) {
            journalEmpty.setVisibility(View.VISIBLE);
            journalEmpty.setText("Нет данных журнала");
            return;
        }
        journalEmpty.setVisibility(View.GONE);

        if (activeMode == MODE_JOURNAL) {
            renderJournalGrid(false);
        } else if (activeMode == MODE_LATENESS) {
            renderLateness();
        } else {
            renderJournalGrid(true);
        }
    }

    private void renderJournalGrid(boolean labOnly) {
        JSONObject source = journalData;
        if (labOnly) source = filterLabOkr(journalData);
        if (source.optJSONArray("dates") == null || source.optJSONArray("dates").length() == 0) {
            journalEmpty.setVisibility(View.VISIBLE);
            journalEmpty.setText("Нет лабораторных или ОКР");
            return;
        }
        gridView = new StudentJournalGridView(requireContext());
        gridView.setCellClickListener((subject, date, explanation, grades) -> {
            if (explanation.isEmpty() && grades.isEmpty()) return;
            String body = explanation.isEmpty() ? grades : explanation + (grades.isEmpty() ? "" : "\n\n" + grades);
            new AlertDialog.Builder(requireContext())
                    .setTitle(subject + " · " + date)
                    .setMessage(body)
                    .setPositiveButton("OK", null)
                    .show();
        });
        gridView.bind(source);
        journalContentHost.addView(gridView);
    }

    private void renderLateness() {
        TextView tv = new TextView(requireContext());
        tv.setText(buildLatenessText());
        tv.setTextColor(ContextCompat.getColor(requireContext(), R.color.textPrimary));
        tv.setTextSize(14f);
        tv.setLineSpacing(4f, 1f);
        int pad = (int) (8 * getResources().getDisplayMetrics().density);
        tv.setPadding(pad, pad, pad, pad);
        journalContentHost.addView(tv);
    }

    private String buildLatenessText() {
        if (latenessData == null) return "Нет данных об опозданиях";
        JSONArray items = latenessData.optJSONArray("items");
        if (items == null) items = latenessData.optJSONArray("results");
        if (items == null || items.length() == 0) return "Опозданий нет";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null) continue;
            if (sb.length() > 0) sb.append("\n\n");
            sb.append(item.optString("subject", item.optString("subject_name", "Предмет")));
            sb.append(" · ").append(item.optString("date", ""));
            sb.append(": ").append(item.optInt("minutes", item.optInt("value", 0))).append(" мин");
        }
        return sb.toString();
    }

    private static JSONObject filterLabOkr(JSONObject data) {
        try {
            JSONObject out = new JSONObject(data.toString());
            JSONObject dayTypes = data.optJSONObject("dayTypes");
            JSONArray dates = data.optJSONArray("dates");
            if (dayTypes == null || dates == null) return out;
            JSONArray newDates = new JSONArray();
            JSONObject indexMap = new JSONObject();
            int ni = 0;
            for (int i = 0; i < dates.length(); i++) {
                String t = dayTypes.optString(String.valueOf(i), dayTypes.optString("" + i, "normal"));
                if ("lab".equals(t) || "okr".equals(t)) {
                    newDates.put(dates.get(i));
                    indexMap.put(String.valueOf(i), ni++);
                }
            }
            out.put("dates", newDates);
            JSONArray subjects = out.optJSONArray("subjects");
            if (subjects != null) {
                for (int si = 0; si < subjects.length(); si++) {
                    JSONObject subject = subjects.optJSONObject(si);
                    if (subject == null) continue;
                    JSONObject matrix = subject.optJSONObject("gradesMatrix");
                    if (matrix == null) continue;
                    JSONObject nm = new JSONObject();
                    JSONArray names = indexMap.names();
                    if (names == null) continue;
                    for (int k = 0; k < names.length(); k++) {
                        String oldKey = names.getString(k);
                        String newKey = indexMap.optString(oldKey);
                        nm.put(newKey, matrix.optJSONArray(oldKey));
                    }
                    subject.put("gradesMatrix", nm);
                }
            }
            return out;
        } catch (Exception e) {
            return data;
        }
    }
}
