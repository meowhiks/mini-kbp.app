package com.kbp.journal;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import androidx.recyclerview.widget.RecyclerView;
import androidx.viewpager2.widget.ViewPager2;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.view.inputmethod.InputMethodManager;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.Fragment;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import com.google.android.material.card.MaterialCardView;
import com.google.android.material.switchmaterial.SwitchMaterial;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public class TimetableFragment extends Fragment implements TimetableDayPagerAdapter.DayBinder {
    private SwipeRefreshLayout swipeRefresh;
    private EditText searchInput;
    private ImageView searchClear;
    private TextView recentLabel;
    private View searchOverlay;
    private View searchOverlayContent;
    private View fixedHeader;
    private View searchBackdrop;
    private ScrollView timetableScroll;
    private MaterialCardView dayCard;
    private View searchDropdown;
    private TextView searchEmpty;
    private ScrollView searchResultsScroll;
    private LinearLayout searchResultsContainer;
    private HorizontalScrollView recentScroll;
    private LinearLayout recentContainer;
    private TextView timetableTitle;
    private TextView timetableSubtitle;
    private TextView kbpNotice;
    private LinearLayout dayStripRow;
    private LinearLayout dayStripContainer;
    private TextView dayPrevButton;
    private TextView dayNextButton;
    private TextView dayName;
    private TextView todayBadge;
    private TextView dayTimeRange;
    private TextView replacementLabel;
    private LinearLayout replacementToggleRow;
    private SwitchMaterial showReplacementsSwitch;
    private ViewPager2 dayPager;
    private TimetableDayPagerAdapter dayPagerAdapter;
    private TextView timetableEmpty;
    private View dayHeader;
    private int bottomSpacerHeightPx;

    private JSONObject timetableData;
    private int visibleDayIndex;
    private final boolean[] showReplacementsDays = new boolean[7];
    private String lastErrorNotice;
    private boolean suppressSearchEvents;
    private boolean pagerCallbackActive;
    private final Handler countdownHandler = new Handler(Looper.getMainLooper());
    private Runnable countdownRunnable;
    private final Handler searchHandler = new Handler(Looper.getMainLooper());
    private Runnable searchRunnable;
    private float pagerTouchStartX;
    private float pagerTouchStartY;
    private boolean pagerHorizontalLock;
    private int pagerTouchSlop;
    private int timetableRenderVersion;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_timetable, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);
        bindViews(view);
        pagerTouchSlop = ViewConfiguration.get(requireContext()).getScaledTouchSlop();
        visibleDayIndex = TimetableDisplay.getInitialDayIndex();
        initReplacementDefaults();
        swipeRefresh.setColorSchemeColors(requireContext().getColor(R.color.colorPrimary));
        swipeRefresh.setOnRefreshListener(this::refreshTimetable);
        setupSearch();
        setupDayPager();
        setupPagerTouchConflict();
        setupDayNavigation();
        setupBackToDismissSearch();
        showCachedOrLoad();
        renderRecentSearches();
    }

    @Override
    public void onResume() {
        super.onResume();
        initReplacementDefaults();
        if (timetableData != null) renderAll();
        startCountdownTimer();
    }

    @Override
    public void onPause() {
        stopCountdownTimer();
        super.onPause();
    }

    private void bindViews(View view) {
        swipeRefresh = view.findViewById(R.id.swipeRefresh);
        searchInput = view.findViewById(R.id.searchInput);
        searchClear = view.findViewById(R.id.searchClear);
        recentLabel = view.findViewById(R.id.recentLabel);
        searchOverlay = view.findViewById(R.id.searchOverlay);
        searchOverlayContent = view.findViewById(R.id.searchOverlayContent);
        fixedHeader = view.findViewById(R.id.fixedHeader);
        searchBackdrop = view.findViewById(R.id.searchBackdrop);
        searchDropdown = view.findViewById(R.id.searchDropdown);
        searchEmpty = view.findViewById(R.id.searchEmpty);
        searchResultsScroll = view.findViewById(R.id.searchResultsScroll);
        timetableScroll = view.findViewById(R.id.timetableScroll);
        dayCard = view.findViewById(R.id.dayCard);
        searchResultsContainer = view.findViewById(R.id.searchResultsContainer);
        recentScroll = view.findViewById(R.id.recentScroll);
        recentContainer = view.findViewById(R.id.recentContainer);
        timetableTitle = view.findViewById(R.id.timetableTitle);
        timetableSubtitle = view.findViewById(R.id.timetableSubtitle);
        kbpNotice = view.findViewById(R.id.kbpNotice);
        dayStripRow = view.findViewById(R.id.dayStripRow);
        dayStripContainer = view.findViewById(R.id.dayStripContainer);
        dayPrevButton = view.findViewById(R.id.dayPrevButton);
        dayNextButton = view.findViewById(R.id.dayNextButton);
        dayName = view.findViewById(R.id.dayName);
        todayBadge = view.findViewById(R.id.todayBadge);
        dayTimeRange = view.findViewById(R.id.dayTimeRange);
        replacementLabel = view.findViewById(R.id.replacementLabel);
        replacementToggleRow = view.findViewById(R.id.replacementToggleRow);
        showReplacementsSwitch = view.findViewById(R.id.showReplacementsSwitch);
        dayPager = view.findViewById(R.id.dayPager);
        timetableEmpty = view.findViewById(R.id.timetableEmpty);
        dayHeader = view.findViewById(R.id.dayHeader);
        applyDayCardSizing();
    }

    private void applyDayCardSizing() {
        if (dayCard == null) return;
        float density = getResources().getDisplayMetrics().density;
        int screenH = getResources().getDisplayMetrics().heightPixels;
        int minCardH = Math.max(0, screenH - (int) (14f * 16f * density));
        dayCard.setMinimumHeight(minCardH);
        bottomSpacerHeightPx = Math.max((int) (screenH * 0.3f), (int) (120 * density));
        if (dayPager != null) {
            dayPager.setMinimumHeight(Math.max((int) (screenH * 0.42f), (int) (240 * density)));
        }
    }

    private void setupDayPager() {
        dayPagerAdapter = new TimetableDayPagerAdapter(this);
        dayPager.setAdapter(dayPagerAdapter);
        dayPager.setOffscreenPageLimit(2);
        dayPager.setUserInputEnabled(true);
        RecyclerView rv = (RecyclerView) dayPager.getChildAt(0);
        if (rv != null) {
            rv.setOverScrollMode(View.OVER_SCROLL_NEVER);
        }
        dayPager.registerOnPageChangeCallback(new ViewPager2.OnPageChangeCallback() {
            @Override
            public void onPageSelected(int position) {
                if (pagerCallbackActive) return;
                visibleDayIndex = position;
                renderDayStrip();
                renderDayHeader();
                startCountdownTimer();
            }
        });
    }

    private void setupPagerTouchConflict() {
        if (dayPager == null) return;
        RecyclerView rv = (RecyclerView) dayPager.getChildAt(0);
        if (rv != null) {
            rv.setOverScrollMode(View.OVER_SCROLL_NEVER);
            try {
                java.lang.reflect.Field slopField = RecyclerView.class.getDeclaredField("mTouchSlop");
                slopField.setAccessible(true);
                int slop = slopField.getInt(rv);
                slopField.setInt(rv, Math.max(8, slop / 3));
            } catch (Exception ignored) {}
        }

        View.OnTouchListener lockVerticalScroll = (v, event) -> {
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    pagerTouchStartX = event.getX();
                    pagerTouchStartY = event.getY();
                    pagerHorizontalLock = false;
                    break;
                case MotionEvent.ACTION_MOVE:
                    float dx = event.getX() - pagerTouchStartX;
                    float dy = event.getY() - pagerTouchStartY;
                    if (!pagerHorizontalLock) {
                        float trigger = pagerTouchSlop * 0.45f;
                        if (Math.abs(dx) > trigger && Math.abs(dx) > Math.abs(dy) * 0.55f) {
                            pagerHorizontalLock = true;
                            swipeRefresh.setEnabled(false);
                            ViewParent parent = v.getParent();
                            while (parent != null) {
                                parent.requestDisallowInterceptTouchEvent(true);
                                parent = parent.getParent();
                            }
                            if (timetableScroll != null) {
                                timetableScroll.requestDisallowInterceptTouchEvent(true);
                            }
                        }
                    }
                    break;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    pagerHorizontalLock = false;
                    swipeRefresh.setEnabled(true);
                    if (timetableScroll != null) {
                        timetableScroll.requestDisallowInterceptTouchEvent(false);
                    }
                    break;
                default:
                    break;
            }
            return false;
        };
        dayPager.setOnTouchListener(lockVerticalScroll);
        if (dayCard != null) dayCard.setOnTouchListener(lockVerticalScroll);
        if (rv != null) rv.setOnTouchListener(lockVerticalScroll);
    }

    private void updateSearchOverlayPosition() {
        if (fixedHeader == null || searchOverlayContent == null) return;
        fixedHeader.post(() -> {
            if (!isAdded() || fixedHeader == null || searchOverlayContent == null) return;
            int[] headerLoc = new int[2];
            int[] overlayLoc = new int[2];
            fixedHeader.getLocationOnScreen(headerLoc);
            searchOverlay.getLocationOnScreen(overlayLoc);
            int topPad = headerLoc[1] - overlayLoc[1] + fixedHeader.getHeight();
            searchOverlayContent.setPadding(
                    searchOverlayContent.getPaddingLeft(),
                    Math.max(topPad, 0),
                    searchOverlayContent.getPaddingRight(),
                    searchOverlayContent.getPaddingBottom()
            );
        });
    }

    private void goToDay(int index, boolean smooth) {
        if (dayPager == null || timetableData == null) return;
        int max = TimetableDisplay.getDayCount(timetableData) - 1;
        index = Math.max(0, Math.min(index, max));
        visibleDayIndex = index;
        pagerCallbackActive = true;
        dayPager.setCurrentItem(index, smooth);
        pagerCallbackActive = false;
        renderDayStrip();
        renderDayHeader();
        startCountdownTimer();
    }

    @Override
    public int getDayCount() {
        return timetableData != null ? TimetableDisplay.getDayCount(timetableData) : 0;
    }

    @Override
    public int bottomSpacerHeightPx() {
        return bottomSpacerHeightPx;
    }

    @Override
    public void bindDayPage(int dayIndex, LinearLayout pairsContainer, View bottomSpacer) {
        renderDayPairsInto(dayIndex, pairsContainer);
    }

    private void initReplacementDefaults() {
        boolean defaultShow = SessionStore.getBool(requireContext(), "showReplacementsByDefault", true);
        for (int i = 0; i < showReplacementsDays.length; i++) showReplacementsDays[i] = defaultShow;
        if (timetableData != null) applyReplacementStatusDefaults();
    }

    private void applyReplacementStatusDefaults() {
        JSONArray statuses = timetableData.optJSONArray("dayReplacementStatus");
        if (statuses == null) return;
        boolean defaultShow = SessionStore.getBool(requireContext(), "showReplacementsByDefault", true);
        for (int i = 0; i < Math.min(statuses.length(), showReplacementsDays.length); i++) {
            JSONObject info = statuses.optJSONObject(i);
            if (info == null) continue;
            if (info.optBoolean("hasChanges")) showReplacementsDays[i] = defaultShow;
            else if (info.optBoolean("noChanges")) showReplacementsDays[i] = false;
        }
    }

    private void setupSearch() {
        searchBackdrop.setOnClickListener(v -> dismissSearch());
        searchClear.setOnClickListener(v -> {
            suppressSearchEvents = true;
            searchInput.setText("");
            searchClear.setVisibility(View.GONE);
            dismissSearch();
            suppressSearchEvents = false;
        });
        timetableScroll.setOnTouchListener((v, event) -> {
            if (searchOverlay.getVisibility() == View.VISIBLE) dismissSearch();
            return false;
        });
        searchInput.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
                if (suppressSearchEvents) return;
                searchClear.setVisibility(s != null && s.length() > 0 ? View.VISIBLE : View.GONE);
                if (searchRunnable != null) searchHandler.removeCallbacks(searchRunnable);
                searchRunnable = () -> performSearch(s != null ? s.toString() : "");
                searchHandler.postDelayed(searchRunnable, 300);
            }
            @Override public void afterTextChanged(Editable s) {}
        });
        searchInput.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEARCH) {
                if (searchResultsContainer.getChildCount() > 0) {
                    searchResultsContainer.getChildAt(0).performClick();
                } else {
                    dismissSearch();
                }
                return true;
            }
            return false;
        });
        searchInput.setOnFocusChangeListener((v, hasFocus) -> {
            if (suppressSearchEvents) return;
            if (hasFocus) {
                updateSearchOverlayPosition();
                if (searchInput.getText().toString().trim().isEmpty()) {
                    performSearch("");
                }
            } else {
                dismissSearch();
            }
        });
    }

    private void dismissSearch() {
        searchOverlay.setVisibility(View.GONE);
        searchDropdown.setVisibility(View.GONE);
        searchEmpty.setVisibility(View.GONE);
        searchResultsContainer.removeAllViews();
        searchInput.clearFocus();
        InputMethodManager imm = (InputMethodManager) requireContext().getSystemService(android.content.Context.INPUT_METHOD_SERVICE);
        if (imm != null) {
            imm.hideSoftInputFromWindow(searchInput.getWindowToken(), 0);
        }
    }

    private void performSearch(String query) {
        new Thread(() -> {
            try {
                List<TimetableSearchHelper.SearchResult> results = TimetableSearchHelper.search(requireContext(), query);
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> showSearchResults(results));
            } catch (Exception e) {
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    String msg = e.getMessage() != null ? e.getMessage() : "Ошибка поиска";
                    Toast.makeText(requireContext(), msg, Toast.LENGTH_SHORT).show();
                    dismissSearch();
                });
            }
        }).start();
    }

    private void showSearchResults(List<TimetableSearchHelper.SearchResult> results) {
        if (suppressSearchEvents || !searchInput.hasFocus()) {
            searchOverlay.setVisibility(View.GONE);
            return;
        }

        searchResultsContainer.removeAllViews();
        searchDropdown.setVisibility(View.GONE);
        searchEmpty.setVisibility(View.GONE);

        String query = searchInput.getText().toString().trim();
        updateSearchOverlayPosition();
        searchOverlay.setVisibility(View.VISIBLE);

        if (results.isEmpty()) {
            if (!query.isEmpty()) searchEmpty.setVisibility(View.VISIBLE);
            return;
        }

        LayoutInflater inflater = LayoutInflater.from(requireContext());
        int limit = Math.min(results.size(), query.isEmpty() ? 20 : 30);
        for (int i = 0; i < limit; i++) {
            if (i > 0) {
                inflater.inflate(R.layout.include_search_divider, searchResultsContainer, true);
            }
            TimetableSearchHelper.SearchResult result = results.get(i);
            View row = inflater.inflate(R.layout.item_timetable_search_result, searchResultsContainer, false);
            TextView name = row.findViewById(R.id.searchResultName);
            TextView type = row.findViewById(R.id.searchResultType);
            name.setText(result.name);
            if (result.typeLabel != null && !result.typeLabel.isEmpty()
                    && !result.typeLabel.equals(result.type)) {
                type.setText(result.typeLabel);
                type.setVisibility(View.VISIBLE);
            }
            row.setOnClickListener(v -> selectSearchResult(result));
            searchResultsContainer.addView(row);
        }
        searchDropdown.setVisibility(View.VISIBLE);
    }

    private void selectSearchResult(TimetableSearchHelper.SearchResult result) {
        suppressSearchEvents = true;
        dismissSearch();
        searchInput.setText(result.name);
        searchClear.setVisibility(View.VISIBLE);
        TimetableSearchHelper.saveRecentSearch(requireContext(), result);
        renderRecentSearches();
        swipeRefresh.setRefreshing(true);
        new Thread(() -> {
            try {
                JSONObject data = TimetableSearchHelper.fetchByCategory(result.type, result.id);
                JSONObject selected = new JSONObject()
                        .put("id", result.id)
                        .put("name", result.name)
                        .put("type", result.type)
                        .put("typeLabel", result.typeLabel);
                SessionStore.setSelectedTimetable(requireContext(), selected);
                SessionStore.cacheTimetable(requireContext(), data.toString(), data.optString("url", ""));
                TimetableArchiveHelper.upsert(requireContext(), result, data);
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    suppressSearchEvents = false;
                    swipeRefresh.setRefreshing(false);
                    lastErrorNotice = null;
                    bumpTimetableRender();
                    timetableData = data;
                    applyReplacementStatusDefaults();
                    visibleDayIndex = Math.min(visibleDayIndex, TimetableDisplay.getDayCount(data) - 1);
                    renderAll();
                });
            } catch (Exception e) {
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    suppressSearchEvents = false;
                    swipeRefresh.setRefreshing(false);
                    Toast.makeText(requireContext(), e.getMessage(), Toast.LENGTH_SHORT).show();
                });
            }
        }).start();
    }

    private void renderRecentSearches() {
        recentContainer.removeAllViews();
        List<TimetableSearchHelper.SearchResult> recent = TimetableSearchHelper.getRecentSearches(requireContext());
        if (recent.isEmpty()) {
            recentLabel.setVisibility(View.GONE);
            recentScroll.setVisibility(View.GONE);
            return;
        }
        LayoutInflater inflater = LayoutInflater.from(requireContext());
        for (TimetableSearchHelper.SearchResult r : recent) {
            View chip = inflater.inflate(R.layout.item_timetable_recent_chip, recentContainer, false);
            TextView name = chip.findViewById(R.id.recentChipName);
            View remove = chip.findViewById(R.id.recentChipRemove);
            name.setText(r.name);
            name.setOnClickListener(v -> selectSearchResult(r));
            remove.setOnClickListener(v -> {
                TimetableSearchHelper.removeRecentSearch(requireContext(), r);
                renderRecentSearches();
            });
            recentContainer.addView(chip);
        }
        recentLabel.setVisibility(View.VISIBLE);
        recentScroll.setVisibility(View.VISIBLE);
    }

    private void setupBackToDismissSearch() {
        requireActivity().getOnBackPressedDispatcher().addCallback(getViewLifecycleOwner(),
                new androidx.activity.OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        if (searchOverlay.getVisibility() == View.VISIBLE) {
                            dismissSearch();
                        } else {
                            setEnabled(false);
                            requireActivity().getOnBackPressedDispatcher().onBackPressed();
                            setEnabled(true);
                        }
                    }
                });
    }

    private void setupDayNavigation() {
        dayPrevButton.setOnClickListener(v -> goToDay(visibleDayIndex - 1, false));
        dayNextButton.setOnClickListener(v -> goToDay(visibleDayIndex + 1, false));
        showReplacementsSwitch.setOnCheckedChangeListener((button, checked) -> {
            if (visibleDayIndex >= 0 && visibleDayIndex < showReplacementsDays.length) {
                showReplacementsDays[visibleDayIndex] = checked;
                if (dayPagerAdapter != null) dayPagerAdapter.notifyItemChanged(visibleDayIndex);
            }
        });
    }

    private TimetableSearchHelper.SearchResult buildArchiveResult(
            JSONObject data, JSONObject selected, JSONObject profile) {
        if (selected != null && selected.has("id") && selected.has("type")) {
            return new TimetableSearchHelper.SearchResult(
                    selected.optString("id"),
                    TimetableSearchHelper.cleanEntityTitle(selected.optString("name", "")),
                    selected.optString("type"),
                    selected.optString("typeLabel", selected.optString("type"))
            );
        }
        String name = TimetableSearchHelper.cleanEntityTitle(data.optString("title", ""));
        if (name.isEmpty()) name = TimetableSearchHelper.cleanEntityTitle(data.optString("groupName", ""));
        if (name.isEmpty() && profile != null) {
            name = TimetableSearchHelper.cleanEntityTitle(profile.optString("group_name", ""));
            if (name.isEmpty()) name = TimetableSearchHelper.cleanEntityTitle(profile.optString("groupName", ""));
        }
        String id = data.optString("id", "");
        String type = data.optString("category", "group");
        if (id.isEmpty() || name.isEmpty()) return null;
        return new TimetableSearchHelper.SearchResult(id, name, type, type);
    }

    private String resolveEntityTitle() {
        JSONObject selected = SessionStore.getSelectedTimetable(requireContext());
        if (selected != null) {
            String name = TimetableSearchHelper.cleanEntityTitle(selected.optString("name", ""));
            if (!name.isEmpty()) return name;
        }
        if (timetableData == null) return "";
        String title = TimetableSearchHelper.cleanEntityTitle(timetableData.optString("title", ""));
        if (title.isEmpty()) title = TimetableSearchHelper.cleanEntityTitle(timetableData.optString("groupName", ""));
        return title;
    }

    private void showCachedOrLoad() {
        String cached = SessionStore.getCachedTimetable(requireContext());
        if (cached != null) {
            try {
                bumpTimetableRender();
                timetableData = new JSONObject(cached);
                applyReplacementStatusDefaults();
                renderAll();
            } catch (Exception ignored) {}
        } else {
            TimetableArchiveHelper.ArchiveEntry latest = TimetableArchiveHelper.loadLatest(requireContext());
            if (latest != null) {
                try {
                    bumpTimetableRender();
                    timetableData = latest.data;
                    SessionStore.setSelectedTimetable(requireContext(), latest.toSelectedJson());
                    applyReplacementStatusDefaults();
                    renderAll();
                } catch (Exception ignored) {}
            } else {
                timetableEmpty.setVisibility(View.VISIBLE);
                timetableEmpty.setText("Загрузка…");
            }
        }
        refreshTimetable();
    }

    private void refreshTimetable() {
        String token = SessionStore.getAccessToken(requireContext());
        if (token == null) {
            swipeRefresh.setRefreshing(false);
            if (timetableData == null) showError("Сессия истекла — войдите снова");
            return;
        }
        swipeRefresh.setRefreshing(true);
        JSONObject selected = SessionStore.getSelectedTimetable(requireContext());
        new Thread(() -> {
            try {
                JSONObject data;
                JSONObject profile = null;
                if (selected != null && selected.has("type") && selected.has("id")) {
                    data = TimetableSearchHelper.fetchByCategory(
                            selected.optString("type"),
                            selected.optString("id")
                    );
                } else {
                    profile = OAuthHelper.fetchProfile(token);
                    data = TimetableHelper.fetchForProfile(profile);
                }
                SessionStore.cacheTimetable(requireContext(), data.toString(), data.optString("url", ""));
                TimetableSearchHelper.SearchResult archiveResult = buildArchiveResult(data, selected, profile);
                if (archiveResult != null) {
                    TimetableArchiveHelper.upsert(requireContext(), archiveResult, data);
                }
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    swipeRefresh.setRefreshing(false);
                    lastErrorNotice = null;
                    bumpTimetableRender();
                    timetableData = data;
                    applyReplacementStatusDefaults();
                    visibleDayIndex = Math.min(visibleDayIndex, TimetableDisplay.getDayCount(data) - 1);
                    renderAll();
                });
            } catch (Exception e) {
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    swipeRefresh.setRefreshing(false);
                    String msg = e.getMessage() != null ? e.getMessage() : "Ошибка загрузки";
                    if (msg.contains("403")) {
                        lastErrorNotice = "Ошибка со стороны kbp.by (403). Показаны локальные данные.";
                        if (timetableData != null) renderAll();
                        else showError(msg);
                    } else if (timetableData != null) {
                        lastErrorNotice = "Не удалось обновить: " + msg;
                        renderAll();
                    } else {
                        showError(msg);
                    }
                });
            }
        }).start();
    }

    private void showError(String msg) {
        dayStripRow.setVisibility(View.GONE);
        dayCard.setVisibility(View.GONE);
        timetableEmpty.setVisibility(View.VISIBLE);
        timetableEmpty.setText(msg);
    }

    private void renderAll() {
        if (timetableData == null) return;
        timetableEmpty.setVisibility(View.GONE);
        dayCard.setVisibility(View.VISIBLE);

        String title = resolveEntityTitle();
        if (title.isEmpty()) title = "Расписание";
        timetableTitle.setText(title);
        timetableSubtitle.setVisibility(View.GONE);

        if (lastErrorNotice != null) {
            kbpNotice.setText(lastErrorNotice);
            kbpNotice.setVisibility(View.VISIBLE);
        } else {
            kbpNotice.setVisibility(View.GONE);
        }

        boolean showStrip = SessionStore.getBool(requireContext(), "timetableDayStrip", true);
        dayStripRow.setVisibility(showStrip ? View.VISIBLE : View.GONE);

        visibleDayIndex = Math.min(visibleDayIndex, TimetableDisplay.getDayCount(timetableData) - 1);
        if (dayPagerAdapter != null) {
            dayPagerAdapter.refreshDayCount();
        }
        goToDay(visibleDayIndex, false);
        if (showStrip) renderDayStrip();
        renderDayHeader();
        startCountdownTimer();

        if (!searchInput.hasFocus()) {
            String entityTitle = resolveEntityTitle();
            if (!entityTitle.isEmpty()) {
                suppressSearchEvents = true;
                searchInput.setText(entityTitle);
                searchClear.setVisibility(View.VISIBLE);
                suppressSearchEvents = false;
            }
        }
    }

    private void renderDayStrip() {
        dayStripContainer.removeAllViews();
        if (timetableData == null) return;
        int dayCount = TimetableDisplay.getDayCount(timetableData);
        LayoutInflater inflater = LayoutInflater.from(requireContext());
        for (int i = 0; i < dayCount; i++) {
            TextView chip = new TextView(requireContext());
            chip.setText(TimetableDisplay.getDayShortLabel(timetableData, i));
            chip.setTextSize(11);
            int padH = (int) (10 * getResources().getDisplayMetrics().density);
            int padV = (int) (6 * getResources().getDisplayMetrics().density);
            chip.setPadding(padH, padV, padH, padV);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.setMarginEnd((int) (4 * getResources().getDisplayMetrics().density));
            chip.setLayoutParams(lp);
            boolean active = i == visibleDayIndex;
            chip.setBackgroundResource(active ? R.drawable.bg_day_chip_active_solid : R.drawable.bg_day_chip_inactive);
            chip.setTextColor(active ? 0xFFFFFFFF : ContextCompat.getColor(requireContext(), R.color.textSecondary));
            int idx = i;
            chip.setOnClickListener(v -> goToDay(idx, false));
            dayStripContainer.addView(chip);
        }
        dayPrevButton.setAlpha(visibleDayIndex <= 0 ? 0.3f : 1f);
        dayNextButton.setAlpha(visibleDayIndex >= dayCount - 1 ? 0.3f : 1f);
    }

    private void renderDayHeader() {
        boolean showStrip = SessionStore.getBool(requireContext(), "timetableDayStrip", true);
        dayName.setText(TimetableDisplay.getDayLabel(timetableData, visibleDayIndex));
        dayName.setVisibility(showStrip ? View.GONE : View.VISIBLE);

        boolean isToday = visibleDayIndex == TimetableDisplay.getInitialDayIndex();
        todayBadge.setVisibility(isToday ? View.VISIBLE : View.GONE);
        dayHeader.setBackgroundResource(isToday ? R.drawable.bg_day_header_today : R.drawable.bg_day_header_normal);

        int strokePx = (int) ((isToday ? 2f : 1f) * getResources().getDisplayMetrics().density);
        dayCard.setStrokeWidth(strokePx);
        dayCard.setStrokeColor(ContextCompat.getColor(requireContext(),
                isToday ? R.color.colorPrimary : R.color.border));

        String timeRange = buildDayTimeRange(visibleDayIndex);
        dayTimeRange.setText(timeRange);
        dayTimeRange.setVisibility(timeRange.isEmpty() ? View.GONE : View.VISIBLE);

        JSONArray statuses = timetableData.optJSONArray("dayReplacementStatus");
        replacementLabel.setVisibility(View.GONE);
        replacementToggleRow.setVisibility(View.GONE);
        if (statuses != null && visibleDayIndex < statuses.length()) {
            JSONObject info = statuses.optJSONObject(visibleDayIndex);
            if (info != null) {
                String label = info.optString("label", "");
                if (!label.isEmpty()) {
                    replacementLabel.setText(label);
                    replacementLabel.setVisibility(View.VISIBLE);
                }
                if (info.optBoolean("hasChanges")) {
                    replacementToggleRow.setVisibility(View.VISIBLE);
                    showReplacementsSwitch.setOnCheckedChangeListener(null);
                    showReplacementsSwitch.setChecked(showReplacementsDays[visibleDayIndex]);
                    showReplacementsSwitch.setOnCheckedChangeListener((button, checked) -> {
                        showReplacementsDays[visibleDayIndex] = checked;
                        if (dayPagerAdapter != null) dayPagerAdapter.notifyItemChanged(visibleDayIndex);
                    });
                }
            }
        }
    }

    private String buildDayTimeRange(int dayIndex) {
        JSONArray dayStartTimes = timetableData.optJSONArray("dayStartTimes");
        if (dayStartTimes != null && dayIndex < dayStartTimes.length()) {
            JSONObject range = dayStartTimes.optJSONObject(dayIndex);
            if (range != null) {
                String start = KbpBellSchedule.formatBellClock(range.optString("start", ""));
                String end = KbpBellSchedule.formatBellClock(range.optString("end", ""));
                if (!start.isEmpty() && !end.isEmpty()) return start + " - " + end;
            }
        }
        JSONArray pairs = timetableData.optJSONArray("pairs");
        if (pairs == null) return "";
        int bellDay = TimetableDisplay.bellDayIndex(dayIndex);
        int firstNum = -1;
        int lastNum = -1;
        for (int i = 0; i < pairs.length(); i++) {
            JSONObject p = pairs.optJSONObject(i);
            if (p == null || !TimetableDisplay.pairMatchesDisplayDay(p, dayIndex)) continue;
            String subject = p.optString("subject", "").trim();
            if (subject.isEmpty() || "Урок снят".equals(subject)) continue;
            String status = p.optString("status", "normal");
            if ("removed".equals(status) || "cancelled".equals(status)) continue;
            int n = p.optInt("pairNumber");
            if (firstNum < 0 || n < firstNum) firstNum = n;
            if (lastNum < 0 || n > lastNum) lastNum = n;
        }
        if (firstNum < 0) return "";
        String[] first = KbpBellSchedule.getPairTime(firstNum, bellDay);
        String[] last = KbpBellSchedule.getPairTime(lastNum, bellDay);
        String start = KbpBellSchedule.formatBellClock(first[0]);
        String end = KbpBellSchedule.formatBellClock(last[1]);
        if (start.isEmpty() || end.isEmpty()) return "";
        return start + " - " + end;
    }

    private void bumpTimetableRender() {
        timetableRenderVersion++;
    }

    private void renderDayPairsInto(int dayIndex, LinearLayout pairsContainer) {
        boolean countdownEnabled = SessionStore.getBool(requireContext(), "countdownToLesson", true);
        boolean countdownToday = countdownEnabled && dayIndex == TimetableDisplay.getInitialDayIndex();
        String cacheKey = dayIndex + ":" + timetableRenderVersion;
        if (!countdownToday && cacheKey.equals(pairsContainer.getTag())) return;

        pairsContainer.removeAllViews();
        if (!countdownToday) {
            pairsContainer.setTag(cacheKey);
        } else {
            pairsContainer.setTag(null);
        }
        if (timetableData == null) return;
        List<JSONObject> pairs = getPairsForDay(dayIndex);
        if (pairs.isEmpty()) {
            TextView empty = new TextView(requireContext());
            empty.setText("Пар нет");
            empty.setTextColor(ContextCompat.getColor(requireContext(), R.color.textMuted));
            int pad = (int) (16 * getResources().getDisplayMetrics().density);
            empty.setPadding(pad, pad, pad, pad);
            empty.setTextSize(14f);
            pairsContainer.addView(empty);
            return;
        }
        LayoutInflater inflater = LayoutInflater.from(requireContext());
        String density = SessionStore.getTimetableDensity(requireContext());
        boolean hideTeacherRoom = SessionStore.getBool(requireContext(), "timetableHideTeacherRoom", false);
        boolean hidePairNumbers = SessionStore.getBool(requireContext(), "timetableHidePairNumbers", false);
        int currentPair = getCurrentPairNumber(dayIndex, pairs);
        Integer nextPair = getNextPairNumber(dayIndex, pairs);

        for (int i = 0; i < pairs.size(); i++) {
            if (i > 0) {
                inflater.inflate(R.layout.include_search_divider, pairsContainer, true);
            }
            View pairView = inflater.inflate(R.layout.item_timetable_pair, pairsContainer, false);
            bindPairView(pairView, dayIndex, pairs.get(i), density, hideTeacherRoom, hidePairNumbers, countdownEnabled,
                    currentPair, nextPair);
            pairsContainer.addView(pairView);
        }
    }

    private void bindPairView(View pairView, int dayIndex, JSONObject pair, String density,
                              boolean hideTeacherRoom, boolean hidePairNumbers,
                              boolean countdownEnabled, int currentPair, Integer nextPair) {
        View sidebarNow = pairView.findViewById(R.id.sidebarNow);
        View sidebarNext = pairView.findViewById(R.id.sidebarNext);
        View pairContent = pairView.findViewById(R.id.pairContent);
        TextView num = pairView.findViewById(R.id.pairNumber);
        TextView time = pairView.findViewById(R.id.pairTime);
        TextView subject = pairView.findViewById(R.id.pairSubject);
        View pairMetaRow = pairView.findViewById(R.id.pairMetaRow);
        TextView group = pairView.findViewById(R.id.pairGroup);
        View teacherRow = pairView.findViewById(R.id.pairTeacherRow);
        TextView teacher = pairView.findViewById(R.id.pairTeacher);
        View roomRow = pairView.findViewById(R.id.pairRoomRow);
        TextView room = pairView.findViewById(R.id.pairRoom);

        int pairNumber = pair.optInt("pairNumber");
        int bellDay = TimetableDisplay.bellDayIndex(dayIndex);
        String[] bell = KbpBellSchedule.getPairTime(pairNumber, bellDay);
        String start = KbpBellSchedule.formatBellClock(bell[0]);
        String end = KbpBellSchedule.formatBellClock(bell[1]);
        String timeText = start.isEmpty() ? "—" : start + " - " + end;
        if (countdownEnabled && dayIndex == TimetableDisplay.getInitialDayIndex()) {
            String countdown = getCountdownParen(pairNumber, bellDay);
            if (countdown != null) timeText += " " + countdown;
        }
        time.setText(timeText);

        boolean isNow = pairNumber == currentPair;
        boolean isNext = nextPair != null && pairNumber == nextPair;
        sidebarNow.setVisibility(isNow ? View.VISIBLE : View.GONE);
        sidebarNext.setVisibility(!isNow && isNext ? View.VISIBLE : View.GONE);

        num.setVisibility(hidePairNumbers ? View.GONE : View.VISIBLE);
        num.setText(String.valueOf(pairNumber));

        String status = pair.optString("status", "normal");
        String subjectText = pair.optString("subject", "");
        if ("empty".equals(status) || subjectText.isEmpty()) {
            subject.setText(" ");
            subject.setTextColor(ContextCompat.getColor(requireContext(), R.color.textMuted));
        } else if ("removed".equals(status) || "cancelled".equals(status)) {
            subject.setText(subjectText.isEmpty() ? "Урок снят" : subjectText);
            subject.setTextColor(ContextCompat.getColor(requireContext(), R.color.textPrimary));
        } else {
            subject.setText(subjectText);
            subject.setTextColor(ContextCompat.getColor(requireContext(), R.color.textPrimary));
        }

        int borderBg = R.drawable.bg_pair_border_normal;
        if ("added".equals(status)) borderBg = R.drawable.bg_pair_border_added;
        // «Урок снят» визуально как замена (жёлтый)
        else if ("replaced".equals(status) || "removed".equals(status) || "cancelled".equals(status)) {
            borderBg = R.drawable.bg_pair_border_replaced;
        }
        pairContent.setBackgroundResource(borderBg);

        int pad = "small".equals(density) ? 8 : "compact".equals(density) ? 10 : 12;
        int padPx = (int) (pad * getResources().getDisplayMetrics().density);
        int extraStart = (isNow || isNext) ? (int) (4 * getResources().getDisplayMetrics().density) : 0;
        pairContent.setPadding(padPx + extraStart, padPx, padPx, padPx);

        float subjectSize = "small".equals(density) ? 13f : "compact".equals(density) ? 14f : 15f;
        float metaSize = "small".equals(density) ? 12f : 13f;
        subject.setTextSize(subjectSize);
        teacher.setTextSize(metaSize);
        room.setTextSize(metaSize);

        String g = pair.optString("group", "");
        group.setText(g);
        group.setVisibility(!hideTeacherRoom && !g.isEmpty() ? View.VISIBLE : View.GONE);

        String t = pair.optString("teacher", "");
        teacher.setText(t);
        teacherRow.setVisibility(!hideTeacherRoom && !t.isEmpty() ? View.VISIBLE : View.GONE);

        String r = pair.optString("room", "");
        room.setText(r.isEmpty() ? "" : "ауд. " + r);
        roomRow.setVisibility(!hideTeacherRoom && !r.isEmpty() ? View.VISIBLE : View.GONE);

        pairMetaRow.setVisibility(!hideTeacherRoom && (group.getVisibility() == View.VISIBLE
                || teacherRow.getVisibility() == View.VISIBLE
                || roomRow.getVisibility() == View.VISIBLE) ? View.VISIBLE : View.GONE);

        setupEntityClick(subject, pair, "subject");
        setupEntityClick(teacher, pair, "teacher");
        setupEntityClick(room, pair, "place");
        setupEntityClick(group, pair, "group");
    }

    private void setupEntityClick(TextView view, JSONObject pair, String kind) {
        JSONObject refs = pair.optJSONObject("refs");
        if (refs == null) {
            view.setOnClickListener(null);
            return;
        }
        if ("teacher".equals(kind)) {
            JSONArray teachers = refs.optJSONArray("teachers");
            if (teachers != null && teachers.length() > 0) {
                JSONObject ref = teachers.optJSONObject(0);
                if (ref != null) {
                    view.setOnClickListener(v -> navigateEntity("teacher", ref.optString("id"), ref.optString("name")));
                    return;
                }
            }
            view.setOnClickListener(null);
            return;
        }
        JSONObject ref = refs.optJSONObject(kind);
        if (ref != null && ref.has("id")) {
            view.setOnClickListener(v -> navigateEntity(kind, ref.optString("id"), ref.optString("name")));
        } else {
            view.setOnClickListener(null);
        }
    }

    private void navigateEntity(String type, String id, String name) {
        if (id == null || id.isEmpty()) return;
        TimetableSearchHelper.SearchResult result = new TimetableSearchHelper.SearchResult(id, name, type, type);
        selectSearchResult(result);
    }

    private List<JSONObject> getPairsForDay(int dayIndex) {
        List<JSONObject> result = new ArrayList<>();
        JSONArray pairs = timetableData.optJSONArray("pairs");
        if (pairs == null) return result;
        boolean showReplacements = showReplacementsDays[dayIndex];

        List<JSONObject> dayPairs = new ArrayList<>();
        for (int i = 0; i < pairs.length(); i++) {
            JSONObject p = pairs.optJSONObject(i);
            if (p == null || !TimetableDisplay.pairMatchesDisplayDay(p, dayIndex)) continue;
            String status = p.optString("status", "normal");
            // «Урок снят» всегда виден — как замена, независимо от тогла
            if ("removed".equals(status) || "cancelled".equals(status)) {
                dayPairs.add(p);
            } else if (showReplacements) {
                if ("added".equals(status) || "replaced".equals(status) || "normal".equals(status) || status.isEmpty()) {
                    dayPairs.add(p);
                }
            } else if ("replaced".equals(status) || "normal".equals(status) || status.isEmpty()) {
                dayPairs.add(p);
            }
        }

        if (showReplacements) {
            dayPairs.sort((a, b) -> Integer.compare(a.optInt("pairNumber"), b.optInt("pairNumber")));
            return dayPairs;
        }

        Map<Integer, List<JSONObject>> byNumber = new HashMap<>();
        for (JSONObject p : dayPairs) {
            int n = p.optInt("pairNumber");
            if (!byNumber.containsKey(n)) byNumber.put(n, new ArrayList<>());
            byNumber.get(n).add(p);
        }
        List<Integer> numbers = new ArrayList<>(byNumber.keySet());
        Collections.sort(numbers);
        for (int n : numbers) {
            List<JSONObject> bucket = byNumber.get(n);
            JSONObject cancelled = findStatus(bucket, "removed", "cancelled");
            JSONObject normal = findStatus(bucket, "normal", null);
            JSONObject replaced = findStatus(bucket, "replaced", null);
            JSONObject added = findStatus(bucket, "added", null);
            if (cancelled != null) result.add(cancelled);
            else if (normal != null) result.add(normal);
            else if (replaced != null) result.add(replaced);
            else if (added != null) {
                try {
                    JSONObject empty = new JSONObject(added.toString());
                    empty.put("subject", "");
                    empty.put("teacher", "");
                    empty.put("room", "");
                    empty.put("status", "empty");
                    result.add(empty);
                } catch (Exception e) {
                    result.add(added);
                }
            }
        }
        return result;
    }

    private JSONObject findStatus(List<JSONObject> bucket, String primary, String secondary) {
        for (JSONObject p : bucket) {
            String s = p.optString("status", "normal");
            if (s.equals(primary) || (secondary != null && s.equals(secondary))) return p;
            if (primary.equals("normal") && (s.isEmpty() || "normal".equals(s))) return p;
        }
        return null;
    }

    private int getCurrentPairNumber(int dayIndex, List<JSONObject> pairs) {
        if (dayIndex != TimetableDisplay.getInitialDayIndex()) return -1;
        int now = Calendar.getInstance().get(Calendar.HOUR_OF_DAY) * 60
                + Calendar.getInstance().get(Calendar.MINUTE);
        for (JSONObject p : pairs) {
            int n = p.optInt("pairNumber");
            String[] bell = KbpBellSchedule.getPairTime(n, TimetableDisplay.bellDayIndex(dayIndex));
            int s = KbpBellSchedule.timeToMinutes(bell[0]);
            int e = KbpBellSchedule.timeToMinutes(bell[1]);
            if (s >= 0 && e >= 0 && now >= s && now < e) return n;
        }
        return -1;
    }

    private Integer getNextPairNumber(int dayIndex, List<JSONObject> pairs) {
        if (dayIndex != TimetableDisplay.getInitialDayIndex()) return null;
        int now = Calendar.getInstance().get(Calendar.HOUR_OF_DAY) * 60
                + Calendar.getInstance().get(Calendar.MINUTE);
        Integer bestNum = null;
        int bestStart = Integer.MAX_VALUE;
        for (JSONObject p : pairs) {
            int n = p.optInt("pairNumber");
            String[] bell = KbpBellSchedule.getPairTime(n, TimetableDisplay.bellDayIndex(dayIndex));
            int s = KbpBellSchedule.timeToMinutes(bell[0]);
            if (s > now && s < bestStart) {
                bestStart = s;
                bestNum = n;
            }
        }
        return bestNum;
    }

    private String getCountdownParen(int pairNumber, int bellDay) {
        String[] bell = KbpBellSchedule.getPairTime(pairNumber, bellDay);
        int sMin = KbpBellSchedule.timeToMinutes(bell[0]);
        int eMin = KbpBellSchedule.timeToMinutes(bell[1]);
        if (sMin < 0 || eMin < 0) return null;
        Calendar cal = Calendar.getInstance();
        int nowMin = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE);
        int nowSec = cal.get(Calendar.SECOND);
        long nowMs = (nowMin * 60L + nowSec) * 1000L;
        long startMs = sMin * 60L * 1000L;
        long endMs = eMin * 60L * 1000L;
        if (nowMs < startMs) return "(" + formatCountdown(startMs - nowMs) + ")";
        if (nowMs < endMs) return "(" + formatCountdown(endMs - nowMs) + ")";
        return null;
    }

    private String formatCountdown(long ms) {
        long totalSeconds = Math.max(0, ms / 1000);
        long h = totalSeconds / 3600;
        long m = (totalSeconds % 3600) / 60;
        long s = totalSeconds % 60;
        if (h > 0) return String.format(Locale.getDefault(), "%d:%02d:%02d", h, m, s);
        return String.format(Locale.getDefault(), "%d:%02d", m, s);
    }

    private void startCountdownTimer() {
        stopCountdownTimer();
        if (!SessionStore.getBool(requireContext(), "countdownToLesson", true)) return;
        if (timetableData == null) return;
        countdownRunnable = () -> {
            if (isAdded() && dayPagerAdapter != null) {
                int today = TimetableDisplay.getInitialDayIndex();
                dayPagerAdapter.notifyItemChanged(today);
            }
            countdownHandler.postDelayed(countdownRunnable, 1000);
        };
        countdownHandler.postDelayed(countdownRunnable, 1000);
    }

    private void stopCountdownTimer() {
        if (countdownRunnable != null) countdownHandler.removeCallbacks(countdownRunnable);
        countdownRunnable = null;
    }
}