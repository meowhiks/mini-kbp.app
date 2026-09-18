package com.kbp.journal;

import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.util.Base64;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.Fragment;

import com.google.android.material.button.MaterialButton;

import com.google.android.material.imageview.ShapeableImageView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

public class ProfileFragment extends Fragment {
    private static final int[] TTL_VALUES = {7, 14, 30, 90, 180, 365};
    private static final String[] TTL_LABELS = {
            "7 дней", "14 дней", "30 дней", "90 дней", "180 дней", "365 дней"
    };
    private static final String[] GENDER_VALUES = {"", "male", "female", "other"};
    private static final String[] GENDER_LABELS = {"Не указан", "Мужской", "Женский", "Другой"};

    private ProgressBar profileLoading;
    private ScrollView profileScroll;
    private TextView profileError;
    private TextView profileOk;

    private JSONObject form;
    private DisplayNameHelper.Parts fio = new DisplayNameHelper.Parts();
    private JSONArray sessionsList = new JSONArray();
    private int sessionTtl = 30;
    private boolean sessionTtlReady;
    private String emailPending = "";
    private String emailStep = "idle";
    private String twoFaMode = "idle";
    private String twoFaOtpAuthUrl = "";
    private boolean profileLocked;

    private ActivityResultLauncher<String> pickAvatarLauncher;

    @Override
    public void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        pickAvatarLauncher = registerForActivityResult(
                new ActivityResultContracts.GetContent(),
                this::onAvatarPicked
        );
    }

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_profile, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);
        profileLoading = view.findViewById(R.id.profileLoading);
        profileScroll = view.findViewById(R.id.profileScroll);
        profileError = view.findViewById(R.id.profileError);
        profileOk = view.findViewById(R.id.profileOk);

        setupSpinners(view);
        view.findViewById(R.id.avatarButton).setOnClickListener(v -> pickAvatarLauncher.launch("image/*"));
        view.findViewById(R.id.changePhotoButton).setOnClickListener(v -> pickAvatarLauncher.launch("image/*"));
        view.findViewById(R.id.saveButton).setOnClickListener(v -> saveProfile(view));
        view.findViewById(R.id.logoutButton).setOnClickListener(v -> logout());
        view.findViewById(R.id.emailSendCodeButton).setOnClickListener(v -> requestEmailCode(view));
        view.findViewById(R.id.emailConfirmButton).setOnClickListener(v -> confirmEmail(view));
        view.findViewById(R.id.emailCancelButton).setOnClickListener(v -> cancelEmailChange(view));
        view.findViewById(R.id.twoFaEnableButton).setOnClickListener(v -> startTwoFaSetup(view));
        view.findViewById(R.id.twoFaConfirmButton).setOnClickListener(v -> enableTwoFa(view));
        view.findViewById(R.id.twoFaSetupCancel).setOnClickListener(v -> cancelTwoFaSetup(view));
        view.findViewById(R.id.twoFaDisableStartButton).setOnClickListener(v -> showTwoFaDisableForm(view));
        view.findViewById(R.id.twoFaDisableConfirmButton).setOnClickListener(v -> disableTwoFa(view));
        view.findViewById(R.id.twoFaDisableCancel).setOnClickListener(v -> cancelTwoFaDisable(view));

        EditText emailDraft = view.findViewById(R.id.emailDraftInput);
        emailDraft.addTextChangedListener(new SimpleTextWatcher() {
            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                updateEmailSendState(view);
            }
        });

        loadAll(view);
    }

    private void updateEmailSendState(View view) {
        if (form == null) return;
        String draft = textOf(view, R.id.emailDraftInput).trim();
        String current = form.optString("email", "").trim();
        View send = view.findViewById(R.id.emailSendCodeButton);
        boolean enabled = !draft.isEmpty() && !draft.equals(current);
        send.setEnabled(enabled);
        send.setAlpha(enabled ? 1f : 0.4f);
    }

    private static String formatSessionTime(String iso, DateTimeFormatter fmt) {
        if (iso == null || iso.isEmpty()) return "—";
        try {
            return fmt.format(Instant.parse(iso).atZone(ZoneId.systemDefault()));
        } catch (Exception e) {
            return iso;
        }
    }

    private void showAvatarBitmap(ImageView image, TextView initials, Bitmap bmp) {
        image.setImageBitmap(bmp);
        image.setVisibility(View.VISIBLE);
        initials.setVisibility(View.GONE);
        if (image instanceof ShapeableImageView) {
            ((ShapeableImageView) image).setStrokeWidth(0f);
        }
    }

    private void loadAvatarFromUrl(String url, ImageView image, TextView initials) {
        new Thread(() -> {
            try {
                okhttp3.Response response = ApiClient.get().fetchRaw(url);
                if (!response.isSuccessful() || response.body() == null) return;
                byte[] data = response.body().bytes();
                Bitmap bmp = BitmapFactory.decodeByteArray(data, 0, data.length);
                if (bmp == null || !isAdded()) return;
                requireActivity().runOnUiThread(() -> showAvatarBitmap(image, initials, bmp));
            } catch (Exception ignored) {}
        }).start();
    }

    private void setupSpinners(View view) {
        Spinner ttlSpinner = view.findViewById(R.id.sessionTtlSpinner);
        ttlSpinner.setAdapter(new ArrayAdapter<>(
                requireContext(), android.R.layout.simple_spinner_dropdown_item, TTL_LABELS));
        ttlSpinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View v, int position, long id) {
                if (!sessionTtlReady || form == null) return;
                int days = TTL_VALUES[position];
                if (days == sessionTtl) return;
                sessionTtl = days;
                saveSessionTtl(days);
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {}
        });

        Spinner genderSpinner = view.findViewById(R.id.genderSpinner);
        genderSpinner.setAdapter(new ArrayAdapter<>(
                requireContext(), android.R.layout.simple_spinner_dropdown_item, GENDER_LABELS));
    }

    private void loadAll(View view) {
        profileLoading.setVisibility(View.VISIBLE);
        profileScroll.setVisibility(View.GONE);
        hideMessages();

        new Thread(() -> {
            try {
                String token = requireToken();
                JSONObject profile = ProfileApi.fetchProfile(token);
                JSONObject sessionsResp = ProfileApi.fetchSessions(token);
                JSONArray sessions = ProfileApi.getSessionsArray(sessionsResp);
                if (sessions == null) sessions = new JSONArray();
                final JSONArray sessionsFinal = sessions;
                final JSONObject profileFinal = profile;
                int ttl = ProfileApi.getSessionTtlDays(sessionsResp, profile.optInt("session_ttl_days", 30));
                final int ttlFinal = ttl;
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    profileLoading.setVisibility(View.GONE);
                    profileScroll.setVisibility(View.VISIBLE);
                    bindForm(view, profileFinal, sessionsFinal, ttlFinal);
                });
            } catch (Exception e) {
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    profileLoading.setVisibility(View.GONE);
                    profileScroll.setVisibility(View.VISIBLE);
                    showError(ProfileApi.apiError(e));
                });
            }
        }).start();
    }

    private void bindForm(View view, JSONObject profile, JSONArray sessions, int ttl) {
        form = profile;
        sessionsList = sessions;
        sessionTtl = ttl;
        profileLocked = profile.optBoolean("profile_locked", false);
        fio = DisplayNameHelper.parse(profile.optString("display_name", profile.optString("nickname", "")));

        bindAvatar(view);
        bindSecurity(view);
        bindMainFields(view);
        bindEmail(view);
        bindTwoFa(view);
        applyLockedState(view);
        hideMessages();
    }

    private void bindAvatar(View view) {
        TextView initials = view.findViewById(R.id.avatarInitials);
        ImageView image = view.findViewById(R.id.avatarImage);
        TextView name = view.findViewById(R.id.avatarName);
        TextView group = view.findViewById(R.id.avatarGroup);
        TextView telegram = view.findViewById(R.id.avatarTelegram);

        String display = DisplayNameHelper.compose(fio);
        if (display.isEmpty()) display = form.optString("display_name", "");
        name.setText(DisplayNameHelper.label(display));
        initials.setText(DisplayNameHelper.initial(display, form.optString("email", "")));

        String avatarUrl = form.optString("avatar_url", "");
        if (!avatarUrl.isEmpty()) {
            Bitmap bmp = decodeAvatarDataUrl(avatarUrl);
            if (bmp != null) {
                showAvatarBitmap(image, initials, bmp);
            } else if (avatarUrl.startsWith("http")) {
                image.setVisibility(View.GONE);
                initials.setVisibility(View.VISIBLE);
                loadAvatarFromUrl(avatarUrl, image, initials);
            } else {
                image.setVisibility(View.GONE);
                initials.setVisibility(View.VISIBLE);
            }
        } else {
            image.setVisibility(View.GONE);
            initials.setVisibility(View.VISIBLE);
        }

        if (form.optBoolean("has_group", false) && form.optBoolean("show_group", true)) {
            group.setVisibility(View.VISIBLE);
            group.setText(form.optString("group_name", ""));
        } else {
            group.setVisibility(View.GONE);
        }

        String tg = form.optString("telegram_username", "");
        if (!tg.isEmpty()) {
            telegram.setVisibility(View.VISIBLE);
            telegram.setText("@" + tg);
        } else {
            telegram.setVisibility(View.GONE);
        }
    }

    private void bindSecurity(View view) {
        TextView locked = view.findViewById(R.id.profileLockedBanner);
        locked.setVisibility(profileLocked ? View.VISIBLE : View.GONE);

        Spinner ttlSpinner = view.findViewById(R.id.sessionTtlSpinner);
        sessionTtlReady = false;
        int idx = 2;
        for (int i = 0; i < TTL_VALUES.length; i++) {
            if (TTL_VALUES[i] == sessionTtl) {
                idx = i;
                break;
            }
        }
        ttlSpinner.setSelection(idx);
        sessionTtlReady = true;

        renderSessions(view);
    }

    private void renderSessions(View view) {
        LinearLayout container = view.findViewById(R.id.sessionsContainer);
        container.removeAllViews();
        if (sessionsList.length() == 0) {
            TextView empty = new TextView(requireContext());
            empty.setText("Нет активных сеансов");
            empty.setTextColor(ContextCompat.getColor(requireContext(), R.color.textMuted));
            empty.setTextSize(12f);
            container.addView(empty);
            return;
        }
        LayoutInflater inflater = LayoutInflater.from(requireContext());
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("dd.MM.yyyy, HH:mm", Locale.getDefault());
        for (int i = 0; i < sessionsList.length(); i++) {
            JSONObject s = sessionsList.optJSONObject(i);
            if (s == null) continue;
            View row = inflater.inflate(R.layout.item_profile_session, container, false);
            TextView title = row.findViewById(R.id.sessionTitle);
            TextView meta = row.findViewById(R.id.sessionMeta);
            TextView revoke = row.findViewById(R.id.sessionRevoke);

            String kind = "mobile".equals(s.optString("device_kind")) ? "Мобильное" : "Веб";
            StringBuilder titleText = new StringBuilder(kind);
            if (s.optBoolean("is_current")) titleText.append(" · текущий");
            if (s.optBoolean("is_most_trusted")) titleText.append(" · наиболее доверенный");
            title.setText(titleText.toString());

            String ip = s.optString("ip_address", "—");
            if (ip.isEmpty()) ip = "—";
            String seen = s.optString("last_seen", "");
            String seenLabel = formatSessionTime(seen, fmt);
            meta.setText(ip + " · " + seenLabel);

            if (!s.optBoolean("is_current")) {
                revoke.setVisibility(View.VISIBLE);
                long id = s.optLong("id");
                revoke.setOnClickListener(v -> revokeSession(view, id));
            }
            container.addView(row);
        }
    }

    private void bindMainFields(View view) {
        ((EditText) view.findViewById(R.id.lastNameInput)).setText(fio.lastName);
        ((EditText) view.findViewById(R.id.firstNameInput)).setText(fio.firstName);
        ((EditText) view.findViewById(R.id.patronymicInput)).setText(fio.patronymic);
        ((EditText) view.findViewById(R.id.phoneInput)).setText(form.optString("phone", ""));
        ((EditText) view.findViewById(R.id.infoInput)).setText(form.optString("info", ""));

        Spinner genderSpinner = view.findViewById(R.id.genderSpinner);
        String gender = form.optString("gender", "");
        int gIdx = 0;
        for (int i = 0; i < GENDER_VALUES.length; i++) {
            if (GENDER_VALUES[i].equals(gender)) {
                gIdx = i;
                break;
            }
        }
        genderSpinner.setSelection(gIdx);

        LinearLayout groupRow = view.findViewById(R.id.groupRow);
        if (form.optBoolean("has_group", false)) {
            groupRow.setVisibility(View.VISIBLE);
            ((TextView) view.findViewById(R.id.groupNameText)).setText(form.optString("group_name", ""));
            ((CheckBox) view.findViewById(R.id.showGroupCheck)).setChecked(form.optBoolean("show_group", true));
        } else {
            groupRow.setVisibility(View.GONE);
        }
    }

    private void bindEmail(View view) {
        String email = form.optString("email", "");
        TextView title = view.findViewById(R.id.emailSectionTitle);
        if ("idle".equals(emailStep)) {
            SpannableString sp = new SpannableString("Email  " + (email.isEmpty() ? "не указан" : email));
            sp.setSpan(new ForegroundColorSpan(ContextCompat.getColor(requireContext(), R.color.textMuted)),
                    5, sp.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            title.setText(sp);
        } else {
            title.setText("Email");
        }
        ((EditText) view.findViewById(R.id.emailDraftInput)).setText(email);
        updateEmailSendState(view);
        view.findViewById(R.id.emailIdleBlock).setVisibility("idle".equals(emailStep) ? View.VISIBLE : View.GONE);
        view.findViewById(R.id.emailCodeBlock).setVisibility("code".equals(emailStep) ? View.VISIBLE : View.GONE);
        if ("code".equals(emailStep)) {
            ((TextView) view.findViewById(R.id.emailPendingText)).setText("Код на " + emailPending);
        }
    }

    private void bindTwoFa(View view) {
        boolean enabled = form.optBoolean("two_fa_enabled", false);
        TextView badge = view.findViewById(R.id.twoFaBadge);
        if (enabled) {
            badge.setText("Вкл.");
            badge.setBackgroundResource(R.drawable.bg_badge_on);
            badge.setTextColor(ContextCompat.getColor(requireContext(), R.color.success));
        } else {
            badge.setText("Выкл.");
            badge.setBackgroundResource(R.drawable.bg_badge_off);
            badge.setTextColor(ContextCompat.getColor(requireContext(), R.color.textMuted));
        }

        view.findViewById(R.id.twoFaEnableButton).setVisibility(!enabled && "idle".equals(twoFaMode) ? View.VISIBLE : View.GONE);
        view.findViewById(R.id.twoFaSetupBlock).setVisibility(!enabled && "setup".equals(twoFaMode) ? View.VISIBLE : View.GONE);
        view.findViewById(R.id.twoFaDisableBlock).setVisibility(enabled ? View.VISIBLE : View.GONE);
        view.findViewById(R.id.twoFaDisableForm).setVisibility(enabled && "disable".equals(twoFaMode) ? View.VISIBLE : View.GONE);
        view.findViewById(R.id.twoFaDisableStartButton).setVisibility(!"disable".equals(twoFaMode) ? View.VISIBLE : View.GONE);
        view.findViewById(R.id.twoFaDisableCancel).setVisibility("disable".equals(twoFaMode) ? View.VISIBLE : View.GONE);

        if ("setup".equals(twoFaMode) && !twoFaOtpAuthUrl.isEmpty()) {
            try {
                Bitmap qr = QrHelper.encode(twoFaOtpAuthUrl, 512);
                ((ImageView) view.findViewById(R.id.twoFaQrImage)).setImageBitmap(qr);
            } catch (Exception ignored) {}
        }
    }

    private void applyLockedState(View view) {
        boolean editable = !profileLocked;
        int[] ids = {
                R.id.lastNameInput, R.id.firstNameInput, R.id.patronymicInput,
                R.id.phoneInput, R.id.infoInput, R.id.genderSpinner,
                R.id.showGroupCheck, R.id.emailDraftInput, R.id.saveButton,
                R.id.avatarButton, R.id.changePhotoButton
        };
        for (int id : ids) {
            View v = view.findViewById(id);
            v.setEnabled(editable);
            if (v instanceof ViewGroup) {
                v.setAlpha(editable ? 1f : 0.6f);
            }
        }
    }

    private void saveProfile(View view) {
        if (form == null || profileLocked) return;
        hideMessages();
        MaterialButton saveButton = view.findViewById(R.id.saveButton);
        saveButton.setEnabled(false);
        saveButton.setText("Сохраняем…");

        fio.lastName = textOf(view, R.id.lastNameInput);
        fio.firstName = textOf(view, R.id.firstNameInput);
        fio.patronymic = textOf(view, R.id.patronymicInput);
        String phone = textOf(view, R.id.phoneInput);
        String info = textOf(view, R.id.infoInput);
        String gender = GENDER_VALUES[((Spinner) view.findViewById(R.id.genderSpinner)).getSelectedItemPosition()];
        boolean showGroup = ((CheckBox) view.findViewById(R.id.showGroupCheck)).isChecked();

        new Thread(() -> {
            try {
                String token = requireToken();
                JSONObject patch = new JSONObject();
                patch.put("display_name", DisplayNameHelper.compose(fio));
                patch.put("phone", phone);
                patch.put("gender", gender);
                patch.put("info", info);
                patch.put("show_group", showGroup);
                patch.put("avatar_url", form.optString("avatar_url", ""));
                JSONObject updated = ProfileApi.saveProfile(token, patch);
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    form = updated;
                    fio = DisplayNameHelper.parse(updated.optString("display_name", ""));
                    bindAvatar(view);
                    bindMainFields(view);
                    saveButton.setEnabled(true);
                    saveButton.setText("Сохранить изменения");
                    showOk("Сохранено");
                });
            } catch (Exception e) {
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    saveButton.setEnabled(true);
                    saveButton.setText("Сохранить изменения");
                    showError(ProfileApi.apiError(e));
                });
            }
        }).start();
    }

    private void saveSessionTtl(int days) {
        new Thread(() -> {
            try {
                String token = requireToken();
                JSONObject patch = new JSONObject();
                patch.put("session_ttl_days", days);
                ProfileApi.saveProfile(token, patch);
            } catch (Exception ignored) {}
        }).start();
    }

    private void requestEmailCode(View view) {
        hideMessages();
        String draft = textOf(view, R.id.emailDraftInput).trim();
        if (draft.isEmpty() || draft.equals(form.optString("email", ""))) return;
        setEmailBusy(view, true);
        new Thread(() -> {
            try {
                String token = requireToken();
                JSONObject resp = ProfileApi.requestEmailChange(token, draft);
                emailPending = resp.optString("email", draft);
                String devCode = resp.optString("dev_code", "");
                emailStep = "code";
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    setEmailBusy(view, false);
                    bindEmail(view);
                    if (!devCode.isEmpty()) {
                        ((EditText) view.findViewById(R.id.emailCodeInput)).setText(devCode);
                    }
                    showOk("Код отправлен на " + emailPending);
                });
            } catch (Exception e) {
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    setEmailBusy(view, false);
                    showError(ProfileApi.apiError(e));
                });
            }
        }).start();
    }

    private void confirmEmail(View view) {
        hideMessages();
        String code = textOf(view, R.id.emailCodeInput).trim();
        if (code.length() < 6) return;
        setEmailBusy(view, true);
        new Thread(() -> {
            try {
                String token = requireToken();
                JSONObject updated = ProfileApi.confirmEmailChange(token, code);
                form = updated;
                emailStep = "idle";
                emailPending = "";
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    setEmailBusy(view, false);
                    ((EditText) view.findViewById(R.id.emailCodeInput)).setText("");
                    bindEmail(view);
                    bindAvatar(view);
                    showOk("Email обновлён");
                });
            } catch (Exception e) {
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    setEmailBusy(view, false);
                    showError(ProfileApi.apiError(e));
                });
            }
        }).start();
    }

    private void cancelEmailChange(View view) {
        emailStep = "idle";
        emailPending = "";
        ((EditText) view.findViewById(R.id.emailCodeInput)).setText("");
        bindEmail(view);
    }

    private void startTwoFaSetup(View view) {
        hideMessages();
        view.findViewById(R.id.twoFaEnableButton).setEnabled(false);
        new Thread(() -> {
            try {
                String token = requireToken();
                JSONObject setup = ProfileApi.setupTwoFa(token);
                twoFaOtpAuthUrl = setup.optString("otpauth_url", "");
                twoFaMode = "setup";
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    view.findViewById(R.id.twoFaEnableButton).setEnabled(true);
                    bindTwoFa(view);
                });
            } catch (Exception e) {
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    view.findViewById(R.id.twoFaEnableButton).setEnabled(true);
                    showError(ProfileApi.apiError(e));
                });
            }
        }).start();
    }

    private void enableTwoFa(View view) {
        hideMessages();
        String code = textOf(view, R.id.twoFaCodeInput).trim();
        if (code.length() < 6) return;
        view.findViewById(R.id.twoFaConfirmButton).setEnabled(false);
        new Thread(() -> {
            try {
                String token = requireToken();
                JSONObject updated = ProfileApi.enableTwoFa(token, code);
                form = updated;
                twoFaMode = "idle";
                twoFaOtpAuthUrl = "";
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    ((EditText) view.findViewById(R.id.twoFaCodeInput)).setText("");
                    view.findViewById(R.id.twoFaConfirmButton).setEnabled(true);
                    bindTwoFa(view);
                    showOk("Двухфакторная аутентификация включена");
                });
            } catch (Exception e) {
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    view.findViewById(R.id.twoFaConfirmButton).setEnabled(true);
                    showError(ProfileApi.apiError(e));
                });
            }
        }).start();
    }

    private void cancelTwoFaSetup(View view) {
        twoFaMode = "idle";
        twoFaOtpAuthUrl = "";
        ((EditText) view.findViewById(R.id.twoFaCodeInput)).setText("");
        bindTwoFa(view);
    }

    private void showTwoFaDisableForm(View view) {
        twoFaMode = "disable";
        bindTwoFa(view);
    }

    private void disableTwoFa(View view) {
        hideMessages();
        String code = textOf(view, R.id.twoFaDisableCodeInput).trim();
        if (code.length() < 6) return;
        new Thread(() -> {
            try {
                String token = requireToken();
                JSONObject updated = ProfileApi.disableTwoFa(token, code);
                form = updated;
                twoFaMode = "idle";
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> {
                    ((EditText) view.findViewById(R.id.twoFaDisableCodeInput)).setText("");
                    bindTwoFa(view);
                    showOk("2FA отключена");
                });
            } catch (Exception e) {
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> showError(ProfileApi.apiError(e)));
            }
        }).start();
    }

    private void cancelTwoFaDisable(View view) {
        twoFaMode = "idle";
        ((EditText) view.findViewById(R.id.twoFaDisableCodeInput)).setText("");
        bindTwoFa(view);
    }

    private void revokeSession(View root, long id) {
        new Thread(() -> {
            try {
                String token = requireToken();
                ProfileApi.revokeSession(token, id);
                JSONArray next = new JSONArray();
                for (int i = 0; i < sessionsList.length(); i++) {
                    JSONObject s = sessionsList.optJSONObject(i);
                    if (s != null && s.optLong("id") != id) next.put(s);
                }
                sessionsList = next;
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> renderSessions(root));
            } catch (Exception e) {
                if (!isAdded()) return;
                requireActivity().runOnUiThread(() -> showError(ProfileApi.apiError(e)));
            }
        }).start();
    }

    private void logout() {
        AuthActivity.cancelOAuthPolling();
        new Thread(() -> {
            try {
                String token = SessionStore.getAccessToken(requireContext());
                if (token != null) ProfileApi.logout(token);
            } catch (Exception ignored) {}
            if (!isAdded()) return;
            requireActivity().runOnUiThread(() -> {
                SessionStore.clearSession(requireContext());
                NotificationScheduler.cancelPeriodicSync(requireContext());
                PushRegistrationHelper.deactivate(requireContext());
                Intent intent = new Intent(requireContext(), AuthActivity.class);
                intent.setAction(Intent.ACTION_MAIN);
                intent.setData(null);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
                startActivity(intent);
                requireActivity().finish();
            });
        }).start();
    }

    private void onAvatarPicked(@Nullable Uri uri) {
        if (uri == null || form == null || profileLocked || getView() == null) return;
        try {
            InputStream in = requireContext().getContentResolver().openInputStream(uri);
            if (in == null) return;
            byte[] bytes = readLimited(in, 400_000);
            in.close();
            if (bytes == null) {
                showError("Фото до 400 КБ");
                return;
            }
            String mime = requireContext().getContentResolver().getType(uri);
            if (mime == null) mime = "image/jpeg";
            String dataUrl = "data:" + mime + ";base64," + Base64.encodeToString(bytes, Base64.NO_WRAP);
            try {
                form.put("avatar_url", dataUrl);
            } catch (Exception ignored) {}
            bindAvatar(getView());
        } catch (Exception e) {
            showError("Не удалось загрузить фото");
        }
    }

    @Nullable
    private static byte[] readLimited(InputStream in, int max) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int total = 0;
        int n;
        while ((n = in.read(buf)) != -1) {
            total += n;
            if (total > max) return null;
            out.write(buf, 0, n);
        }
        return out.toByteArray();
    }

    @Nullable
    private Bitmap decodeAvatarDataUrl(String url) {
        try {
            if (url.startsWith("data:")) {
                int comma = url.indexOf(',');
                if (comma < 0) return null;
                byte[] data = Base64.decode(url.substring(comma + 1), Base64.DEFAULT);
                return BitmapFactory.decodeByteArray(data, 0, data.length);
            }
        } catch (Exception ignored) {}
        return null;
    }

    private String requireToken() throws Exception {
        String token = SessionStore.getAccessToken(requireContext());
        if (token == null) throw new Exception("Сессия истекла — войдите снова");
        return token;
    }

    private static String textOf(View view, int id) {
        View v = view.findViewById(id);
        if (v instanceof EditText) return ((EditText) v).getText().toString();
        return "";
    }

    private void setEmailBusy(View view, boolean busy) {
        View send = view.findViewById(R.id.emailSendCodeButton);
        View confirm = view.findViewById(R.id.emailConfirmButton);
        send.setEnabled(!busy);
        confirm.setEnabled(!busy);
        if (busy) {
            send.setAlpha(0.4f);
            confirm.setAlpha(0.4f);
        } else {
            updateEmailSendState(view);
            confirm.setAlpha(1f);
        }
        if (send instanceof TextView) {
            ((TextView) send).setText(busy ? "…" : "Отправить код");
        }
    }

    private void showError(String msg) {
        profileOk.setVisibility(View.GONE);
        profileError.setVisibility(View.VISIBLE);
        profileError.setText(msg);
    }

    private void showOk(String msg) {
        profileError.setVisibility(View.GONE);
        profileOk.setVisibility(View.VISIBLE);
        profileOk.setText("✓ " + msg);
    }

    private void hideMessages() {
        profileError.setVisibility(View.GONE);
        profileOk.setVisibility(View.GONE);
    }
}
