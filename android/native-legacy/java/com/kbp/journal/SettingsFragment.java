package com.kbp.journal;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.fragment.app.Fragment;

import com.google.android.material.switchmaterial.SwitchMaterial;

public class SettingsFragment extends Fragment {
    private LinearLayout themeCardLight;
    private LinearLayout themeCardDark;
    private LinearLayout themeCardOled;
    private TextView themeLabelLight;
    private TextView themeLabelDark;
    private TextView themeLabelOled;
    private View notificationSubSection;
    private SwitchMaterial notificationsSwitch;
    private TextView densityNormal;
    private TextView densityCompact;
    private TextView densitySmall;
    private SwitchMaterial clearCacheToggle;
    private SwitchMaterial clearLoginHistoryToggle;
    private SwitchMaterial clearTimetablesToggle;
    private TextView clearSelectedButton;
    private TextView resetJournalColumnsButton;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_settings, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);
        bindViews(view);
        bindThemeCards();
        bindBoolSwitch(R.id.notifyJournalSwitch, "notifyJournal", true, null);
        bindBoolSwitch(R.id.notifyTimetableSwitch, "notifyTimetable", true, null);
        bindBoolSwitch(R.id.journalShowAverageSwitch, "journalShowAverage", true, null);
        bindBoolSwitch(R.id.journalDenseCellsSwitch, "journalDenseCells", false, null);
        bindBoolSwitch(R.id.journalShowHundredthsSwitch, "journalShowHundredths", false, null);
        bindBoolSwitch(R.id.journalShowTotalSwitch, "journalShowTotal", true, null);
        bindBoolSwitch(R.id.showReplacementsSwitch, "showReplacementsByDefault", false, null);
        bindBoolSwitch(R.id.timetableHideTeacherRoomSwitch, "timetableHideTeacherRoom", false, null);
        bindBoolSwitch(R.id.timetableHidePairNumbersSwitch, "timetableHidePairNumbers", false, null);
        bindBoolSwitch(R.id.timetableDayStripSwitch, "timetableDayStrip", true, null);
        bindBoolSwitch(R.id.countdownSwitch, "countdownToLesson", true, null);

        notificationsSwitch.setChecked(SessionStore.notificationsEnabled(requireContext()));
        updateNotificationSubSection(notificationsSwitch.isChecked());
        notificationsSwitch.setOnCheckedChangeListener((button, checked) -> {
            SessionStore.setNotificationsEnabled(requireContext(), checked);
            updateNotificationSubSection(checked);
            syncBackgroundWork();
        });

        refreshThemeCards(SessionStore.getTheme(requireContext()));
        refreshDensity(SessionStore.getTimetableDensity(requireContext()));
        setupDensityButtons();
        setupClearData();
        setupResetColumns();
        setupExternalLinks(view);
        setupProfileRow(view);

        TextView versionText = view.findViewById(R.id.versionText);
        versionText.setText("Release " + BuildConfig.VERSION_NAME);
    }

    private void bindViews(View view) {
        themeCardLight = view.findViewById(R.id.themeCardLight);
        themeCardDark = view.findViewById(R.id.themeCardDark);
        themeCardOled = view.findViewById(R.id.themeCardOled);
        themeLabelLight = view.findViewById(R.id.themeLabelLight);
        themeLabelDark = view.findViewById(R.id.themeLabelDark);
        themeLabelOled = view.findViewById(R.id.themeLabelOled);
        notificationSubSection = view.findViewById(R.id.notificationSubSection);
        notificationsSwitch = view.findViewById(R.id.notificationsSwitch);
        densityNormal = view.findViewById(R.id.densityNormal);
        densityCompact = view.findViewById(R.id.densityCompact);
        densitySmall = view.findViewById(R.id.densitySmall);
        clearCacheToggle = view.findViewById(R.id.clearCacheToggle);
        clearLoginHistoryToggle = view.findViewById(R.id.clearLoginHistoryToggle);
        clearTimetablesToggle = view.findViewById(R.id.clearTimetablesToggle);
        clearSelectedButton = view.findViewById(R.id.clearSelectedButton);
        resetJournalColumnsButton = view.findViewById(R.id.resetJournalColumnsButton);
    }

    private void bindThemeCards() {
        themeCardLight.setOnClickListener(v -> selectTheme("light"));
        themeCardDark.setOnClickListener(v -> selectTheme("dark"));
        themeCardOled.setOnClickListener(v -> selectTheme("oled"));
    }

    private void selectTheme(String theme) {
        SessionStore.setTheme(requireContext(), theme);
        applyTheme(theme);
        refreshThemeCards(theme);
    }

    private void refreshThemeCards(String theme) {
        setThemeCardState(themeCardLight, themeLabelLight, "light".equals(theme));
        setThemeCardState(themeCardDark, themeLabelDark, "dark".equals(theme));
        setThemeCardState(themeCardOled, themeLabelOled, "oled".equals(theme));
    }

    private void setThemeCardState(LinearLayout card, TextView label, boolean active) {
        card.setBackgroundResource(active ? R.drawable.bg_theme_card_active : R.drawable.bg_theme_card_inactive);
        label.setSelected(active);
    }

    private void bindBoolSwitch(int id, String key, boolean defaultValue, @Nullable Runnable onChange) {
        SwitchMaterial sw = requireView().findViewById(id);
        sw.setChecked(SessionStore.getBool(requireContext(), key, defaultValue));
        sw.setOnCheckedChangeListener((button, checked) -> {
            SessionStore.setBool(requireContext(), key, checked);
            if (onChange != null) onChange.run();
        });
    }

    private void updateNotificationSubSection(boolean visible) {
        notificationSubSection.setVisibility(visible ? View.VISIBLE : View.GONE);
    }

    private void setupDensityButtons() {
        densityNormal.setOnClickListener(v -> selectDensity("normal"));
        densityCompact.setOnClickListener(v -> selectDensity("compact"));
        densitySmall.setOnClickListener(v -> selectDensity("small"));
    }

    private void selectDensity(String density) {
        SessionStore.setTimetableDensity(requireContext(), density);
        refreshDensity(density);
    }

    private void refreshDensity(String density) {
        densityNormal.setSelected("normal".equals(density));
        densityCompact.setSelected("compact".equals(density));
        densitySmall.setSelected("small".equals(density));
    }

    private void setupClearData() {
        SwitchMaterial.OnCheckedChangeListener listener = (button, checked) -> updateClearButton();
        clearCacheToggle.setOnCheckedChangeListener(listener);
        clearLoginHistoryToggle.setOnCheckedChangeListener(listener);
        clearTimetablesToggle.setOnCheckedChangeListener(listener);
        updateClearButton();

        clearSelectedButton.setOnClickListener(v -> {
            boolean cleared = false;
            if (clearCacheToggle.isChecked()) {
                SessionStore.clearJournalCache(requireContext());
                cleared = true;
            }
            if (clearTimetablesToggle.isChecked()) {
                SessionStore.clearTimetableCache(requireContext());
                TimetableArchiveHelper.clear(requireContext());
                cleared = true;
            }
            if (clearLoginHistoryToggle.isChecked()) {
                SessionStore.clearLoginHistory(requireContext());
                cleared = true;
            }
            clearCacheToggle.setChecked(false);
            clearTimetablesToggle.setChecked(false);
            clearLoginHistoryToggle.setChecked(false);
            updateClearButton();
            Toast.makeText(
                    requireContext(),
                    cleared ? "Данные очищены" : "Ничего не выбрано",
                    Toast.LENGTH_SHORT
            ).show();
        });
    }

    private void updateClearButton() {
        boolean any = clearCacheToggle.isChecked()
                || clearLoginHistoryToggle.isChecked()
                || clearTimetablesToggle.isChecked();
        clearSelectedButton.setEnabled(any);
    }

    private void setupResetColumns() {
        boolean custom = SessionStore.getBool(requireContext(), "journalColumnsCustom", false);
        resetJournalColumnsButton.setEnabled(custom);
        resetJournalColumnsButton.setAlpha(custom ? 1f : 0.4f);
        resetJournalColumnsButton.setOnClickListener(v -> {
            SessionStore.setBool(requireContext(), "journalColumnsCustom", false);
            resetJournalColumnsButton.setEnabled(false);
            resetJournalColumnsButton.setAlpha(0.4f);
            Toast.makeText(requireContext(), "Ширина колонок сброшена", Toast.LENGTH_SHORT).show();
        });
    }

    private void setupProfileRow(View view) {
        view.findViewById(R.id.profileRow).setOnClickListener(v -> {
            if (getActivity() instanceof MainActivity main) {
                main.openProfileTab();
            }
        });
    }

    private void setupExternalLinks(View view) {
        openLink(view.findViewById(R.id.linkDonation), "https://www.donationalerts.com/r/meowhiks_off");
        openLink(view.findViewById(R.id.linkTelegram), "https://t.me/meowhiks");
        openLink(view.findViewById(R.id.linkGithub), "https://github.com/meowhiks");
    }

    private void openLink(View target, String url) {
        target.setOnClickListener(v -> {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            startActivity(intent);
        });
    }

    private void syncBackgroundWork() {
        boolean enabled = SessionStore.notificationsEnabled(requireContext());
        if (enabled) {
            if (!NotificationScheduler.isPeriodicSyncRunning(requireContext())) {
                NotificationScheduler.schedulePeriodicSync(requireContext());
            }
            PushRegistrationHelper.setup(requireContext());
        } else {
            NotificationScheduler.cancelPeriodicSync(requireContext());
            PushRegistrationHelper.deactivate(requireContext());
        }
    }

    private void applyTheme(String theme) {
        int mode = AppCompatDelegate.MODE_NIGHT_NO;
        if ("dark".equals(theme) || "oled".equals(theme)) {
            mode = AppCompatDelegate.MODE_NIGHT_YES;
        }
        AppCompatDelegate.setDefaultNightMode(mode);
    }
}
