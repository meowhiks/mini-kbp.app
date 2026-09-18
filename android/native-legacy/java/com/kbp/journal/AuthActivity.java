package com.kbp.journal;

import android.content.Intent;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.method.LinkMovementMethod;
import android.text.style.ClickableSpan;
import android.text.style.ForegroundColorSpan;
import android.text.style.StyleSpan;
import android.view.View;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

public class AuthActivity extends AppCompatActivity {
    @Nullable
    private static OAuthPoller activePoller;

    /** Отмена фонового polling OAuth (Telegram) при выходе из ЛК. */
    public static void cancelOAuthPolling() {
        if (activePoller != null) activePoller.cancel();
        activePoller = null;
    }

    private enum Step {
        CREDENTIALS,
        FORGOT,
        FORGOT_CONFIRM,
        EMAIL_VERIFY,
        PENDING
    }

    private TextView backButton;
    private TextView titleText;
    private TextView registerHint;
    private TextView stepDescription;
    private LinearLayout emailLayout;
    private LinearLayout passwordLayout;
    private LinearLayout passwordConfirmLayout;
    private LinearLayout extraLayout;
    private ImageView extraIcon;
    private EditText emailInput;
    private EditText passwordInput;
    private EditText passwordConfirmInput;
    private EditText extraInput;
    private TextView devHintText;
    private TextView errorText;
    private TextView hintText;
    private ProgressBar progress;
    private LinearLayout actionsRow;
    private TextView loginButton;
    private TextView forgotButton;
    private LinearLayout oauthSection;
    private LinearLayout siteLoginButton;

    private OAuthPoller oAuthPoller;
    private Step step = Step.CREDENTIALS;
    private boolean registerMode;
    private String pendingToken;
    private boolean needs2fa;
    private boolean needsCurator = true;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_auth);

        backButton = findViewById(R.id.backButton);
        titleText = findViewById(R.id.titleText);
        registerHint = findViewById(R.id.registerHint);
        stepDescription = findViewById(R.id.stepDescription);
        emailLayout = findViewById(R.id.emailLayout);
        passwordLayout = findViewById(R.id.passwordLayout);
        passwordConfirmLayout = findViewById(R.id.passwordConfirmLayout);
        extraLayout = findViewById(R.id.extraLayout);
        extraIcon = findViewById(R.id.extraIcon);
        emailInput = findViewById(R.id.emailInput);
        passwordInput = findViewById(R.id.passwordInput);
        passwordConfirmInput = findViewById(R.id.passwordConfirmInput);
        extraInput = findViewById(R.id.extraInput);
        devHintText = findViewById(R.id.devHintText);
        errorText = findViewById(R.id.errorText);
        hintText = findViewById(R.id.hintText);
        progress = findViewById(R.id.progress);
        actionsRow = findViewById(R.id.actionsRow);
        loginButton = findViewById(R.id.loginButton);
        forgotButton = findViewById(R.id.forgotButton);
        oauthSection = findViewById(R.id.oauthSection);
        siteLoginButton = findViewById(R.id.siteLoginButton);

        backButton.setOnClickListener(v -> goBack());
        loginButton.setOnClickListener(v -> onPrimaryClick());
        siteLoginButton.setOnClickListener(v -> startSiteLogin());
        forgotButton.setOnClickListener(v -> {
            hideError();
            hideDevHint();
            step = Step.FORGOT;
            applyStepUi();
        });

        applyStepUi();
        handleDeepLink(getIntent(), false);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDeepLink(intent, true);
    }

    private void handleDeepLink(Intent intent, boolean fromNewIntent) {
        if (intent == null) return;
        if (!Intent.ACTION_VIEW.equals(intent.getAction())) return;
        if (intent.getData() == null) return;
        Uri uri = intent.getData();
        if (!MobileAuthDeepLink.isAuthUri(uri)) return;

        String code = MobileAuthDeepLink.getMobileCode(uri);
        if (!code.isEmpty()) {
            clearDeepLinkIntent();
            hideHint();
            setLoading(true);
            new Thread(() -> {
                try {
                    JSONObject payload = OAuthHelper.exchangeMobileCode(code);
                    runOnUiThread(() -> handleAuthPayload(payload));
                } catch (Exception e) {
                    runOnUiThread(() -> {
                        setLoading(false);
                        showError(e.getMessage() != null ? e.getMessage() : "Ошибка входа");
                    });
                }
            }).start();
            return;
        }

        if (MobileAuthDeepLink.isDone(uri) && SessionStore.hasSession(this)) {
            clearDeepLinkIntent();
            openMain();
            return;
        }

        if (fromNewIntent && MobileAuthDeepLink.isDone(uri)) {
            hideHint();
            showHint("Вход подтверждён на сайте. Если экран не обновился — подождите несколько секунд.");
        }
    }

    @Override
    protected void onDestroy() {
        if (oAuthPoller != null) oAuthPoller.cancel();
        if (activePoller == oAuthPoller) activePoller = null;
        super.onDestroy();
    }

    private void clearDeepLinkIntent() {
        Intent clean = new Intent(this, AuthActivity.class);
        clean.setAction(Intent.ACTION_MAIN);
        clean.setData(null);
        setIntent(clean);
    }

    private void goBack() {
        hideError();
        hideDevHint();
        hideHint();
        pendingToken = null;
        registerMode = false;
        step = Step.CREDENTIALS;
        applyStepUi();
    }

    private void setRegisterMode(boolean register) {
        hideError();
        registerMode = register;
        step = Step.CREDENTIALS;
        applyStepUi();
    }

    private void applyStepUi() {
        backButton.setVisibility(step == Step.CREDENTIALS ? View.GONE : View.VISIBLE);
        registerHint.setVisibility(step == Step.CREDENTIALS ? View.VISIBLE : View.GONE);
        oauthSection.setVisibility(step == Step.CREDENTIALS ? View.VISIBLE : View.GONE);
        actionsRow.setVisibility(
                step == Step.CREDENTIALS || step == Step.FORGOT || step == Step.FORGOT_CONFIRM || step == Step.EMAIL_VERIFY
                        ? View.VISIBLE
                        : View.GONE);

        stepDescription.setVisibility(View.GONE);
        devHintText.setVisibility(View.GONE);
        extraLayout.setVisibility(View.GONE);
        passwordConfirmLayout.setVisibility(View.GONE);
        emailLayout.setVisibility(View.VISIBLE);
        passwordLayout.setVisibility(View.VISIBLE);
        extraInput.setInputType(InputType.TYPE_CLASS_TEXT);
        extraIcon.setImageResource(R.drawable.ic_mail);

        switch (step) {
            case CREDENTIALS:
                titleText.setText(registerMode ? "Регистрация" : "Вход");
                setupModeHint();
                passwordLayout.setVisibility(View.VISIBLE);
                passwordInput.setHint(registerMode ? "Пароль" : "Пароль");
                passwordConfirmLayout.setVisibility(registerMode ? View.VISIBLE : View.GONE);
                forgotButton.setVisibility(registerMode ? View.GONE : View.VISIBLE);
                loginButton.setText(registerMode ? "Зарегистрироваться" : "Войти");
                setPrimaryButtonWide(false);
                break;
            case FORGOT:
                titleText.setText("Сброс пароля");
                registerHint.setVisibility(View.GONE);
                passwordLayout.setVisibility(View.GONE);
                forgotButton.setVisibility(View.GONE);
                loginButton.setText("Отправить код");
                setPrimaryButtonWide(true);
                break;
            case FORGOT_CONFIRM:
                titleText.setText("Новый пароль");
                registerHint.setVisibility(View.GONE);
                emailLayout.setVisibility(View.GONE);
                extraLayout.setVisibility(View.VISIBLE);
                extraInput.setHint("Код из письма");
                extraInput.setInputType(InputType.TYPE_CLASS_NUMBER);
                passwordInput.setHint("Новый пароль");
                passwordConfirmLayout.setVisibility(View.VISIBLE);
                passwordConfirmInput.setHint("Повторите пароль");
                forgotButton.setVisibility(View.GONE);
                loginButton.setText("Сохранить пароль");
                setPrimaryButtonWide(true);
                break;
            case EMAIL_VERIFY:
                titleText.setText("Подтвердите почту");
                registerHint.setVisibility(View.GONE);
                emailLayout.setVisibility(View.GONE);
                passwordLayout.setVisibility(View.GONE);
                extraLayout.setVisibility(View.VISIBLE);
                extraInput.setHint("Код из письма");
                extraInput.setInputType(InputType.TYPE_CLASS_NUMBER);
                stepDescription.setVisibility(View.VISIBLE);
                stepDescription.setText("Мы отправили письмо на " + textOf(emailInput) + ". Введите код ниже.");
                forgotButton.setVisibility(View.GONE);
                loginButton.setText("Подтвердить");
                setPrimaryButtonWide(true);
                break;
            case PENDING:
                titleText.setText(needs2fa && !needsCurator ? "Двухфакторная аутентификация" : "Подтверждение");
                registerHint.setVisibility(View.GONE);
                emailLayout.setVisibility(View.GONE);
                passwordLayout.setVisibility(View.GONE);
                extraLayout.setVisibility(View.VISIBLE);
                extraIcon.setImageResource(R.drawable.ic_lock);
                extraInput.setHint(needs2fa && !needsCurator ? "Код 2FA" : "Код куратора");
                extraInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS);
                forgotButton.setVisibility(View.GONE);
                loginButton.setText("Подтвердить");
                setPrimaryButtonWide(true);
                break;
        }
    }

    private void setPrimaryButtonWide(boolean wide) {
        LinearLayout.LayoutParams params = (LinearLayout.LayoutParams) loginButton.getLayoutParams();
        params.width = wide ? LinearLayout.LayoutParams.MATCH_PARENT : LinearLayout.LayoutParams.WRAP_CONTENT;
        params.weight = wide ? 0f : 0f;
        loginButton.setLayoutParams(params);
        loginButton.setGravity(wide ? android.view.Gravity.CENTER : android.view.Gravity.CENTER);
    }

    private void setupModeHint() {
        if (registerMode) {
            setHintLink("Уже есть аккаунт? Войти", "Войти", () -> setRegisterMode(false));
        } else {
            setHintLink("Нет аккаунта? Создать", "Создать", () -> setRegisterMode(true));
        }
    }

    private void setHintLink(String full, String link, Runnable action) {
        SpannableString span = new SpannableString(full);
        int start = full.indexOf(link);
        int end = start + link.length();
        int linkColor = ContextCompat.getColor(this, R.color.colorPrimary);
        span.setSpan(new ForegroundColorSpan(linkColor), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        span.setSpan(new StyleSpan(Typeface.BOLD), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        span.setSpan(new ClickableSpan() {
            @Override
            public void onClick(@NonNull View widget) {
                action.run();
            }
        }, start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        registerHint.setText(span);
        registerHint.setMovementMethod(LinkMovementMethod.getInstance());
    }

    private void onPrimaryClick() {
        hideError();
        switch (step) {
            case CREDENTIALS:
                if (registerMode) onRegisterClick();
                else onLoginClick();
                break;
            case FORGOT:
                onForgotRequest();
                break;
            case FORGOT_CONFIRM:
                onForgotConfirm();
                break;
            case EMAIL_VERIFY:
                onEmailVerify();
                break;
            case PENDING:
                verifyPending();
                break;
        }
    }

    private void onLoginClick() {
        if (pendingToken != null) {
            verifyPending();
            return;
        }
        String email = textOf(emailInput);
        String password = textOf(passwordInput);
        if (email.isEmpty() || password.isEmpty()) {
            showError("Введите email и пароль");
            return;
        }
        setLoading(true);
        new Thread(() -> {
            try {
                JSONObject payload = OAuthHelper.loginEmail(email, password);
                runOnUiThread(() -> handleAuthPayload(payload));
            } catch (ApiClient.ApiException e) {
                runOnUiThread(() -> {
                    setLoading(false);
                    if (e.body != null && OAuthHelper.needsEmailVerify(e.body)) {
                        showDevHint(e.body.optString("dev_code", ""));
                        step = Step.EMAIL_VERIFY;
                        applyStepUi();
                        showError(e.getMessage());
                        return;
                    }
                    showError(e.getMessage());
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    setLoading(false);
                    showError(e.getMessage() != null ? e.getMessage() : "Ошибка входа");
                });
            }
        }).start();
    }

    private void onRegisterClick() {
        String email = textOf(emailInput);
        String password = textOf(passwordInput);
        String passwordConfirm = textOf(passwordConfirmInput);
        if (email.isEmpty() || password.isEmpty()) {
            showError("Введите email и пароль");
            return;
        }
        if (!password.equals(passwordConfirm)) {
            showError("Пароли не совпадают");
            return;
        }
        setLoading(true);
        new Thread(() -> {
            try {
                JSONObject payload = OAuthHelper.registerEmail(email, password, passwordConfirm);
                runOnUiThread(() -> {
                    setLoading(false);
                    if (OAuthHelper.needsEmailVerify(payload)) {
                        showDevHint(payload.optString("dev_code", ""));
                        step = Step.EMAIL_VERIFY;
                        applyStepUi();
                        return;
                    }
                    handleAuthPayload(payload);
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    setLoading(false);
                    showError(e.getMessage() != null ? e.getMessage() : "Ошибка регистрации");
                });
            }
        }).start();
    }

    private void onForgotRequest() {
        String email = textOf(emailInput);
        if (email.isEmpty()) {
            showError("Укажите email");
            return;
        }
        setLoading(true);
        new Thread(() -> {
            try {
                JSONObject payload = OAuthHelper.requestPasswordReset(email);
                runOnUiThread(() -> {
                    setLoading(false);
                    showDevHint(payload.optString("dev_code", ""));
                    step = Step.FORGOT_CONFIRM;
                    applyStepUi();
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    setLoading(false);
                    showError(e.getMessage() != null ? e.getMessage() : "Ошибка");
                });
            }
        }).start();
    }

    private void onForgotConfirm() {
        String email = textOf(emailInput);
        String code = textOf(extraInput);
        String password = textOf(passwordInput);
        String passwordConfirm = textOf(passwordConfirmInput);
        if (code.isEmpty() || password.isEmpty()) {
            showError("Введите код и новый пароль");
            return;
        }
        if (!password.equals(passwordConfirm)) {
            showError("Пароли не совпадают");
            return;
        }
        setLoading(true);
        new Thread(() -> {
            try {
                OAuthHelper.confirmPasswordReset(email, code, password, passwordConfirm);
                runOnUiThread(() -> {
                    setLoading(false);
                    hideError();
                    hideDevHint();
                    extraInput.setText("");
                    passwordConfirmInput.setText("");
                    registerMode = false;
                    step = Step.CREDENTIALS;
                    applyStepUi();
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    setLoading(false);
                    showError(e.getMessage() != null ? e.getMessage() : "Ошибка");
                });
            }
        }).start();
    }

    private void onEmailVerify() {
        String email = textOf(emailInput);
        String code = textOf(extraInput);
        if (code.length() < 6) {
            showError("Введите 6-значный код");
            return;
        }
        setLoading(true);
        new Thread(() -> {
            try {
                JSONObject payload = OAuthHelper.verifyRegistrationEmail(email, code);
                runOnUiThread(() -> handleAuthPayload(payload));
            } catch (Exception e) {
                runOnUiThread(() -> {
                    setLoading(false);
                    showError(e.getMessage() != null ? e.getMessage() : "Ошибка");
                });
            }
        }).start();
    }

    private void verifyPending() {
        String code = textOf(extraInput);
        if (code.isEmpty()) {
            showError(needs2fa ? "Введите код 2FA" : "Введите код куратора");
            return;
        }
        setLoading(true);
        new Thread(() -> {
            try {
                JSONObject payload = needs2fa
                        ? OAuthHelper.verify2fa(pendingToken, code)
                        : OAuthHelper.verifyCurator(pendingToken, code);
                runOnUiThread(() -> handleAuthPayload(payload));
            } catch (Exception e) {
                runOnUiThread(() -> {
                    setLoading(false);
                    showError(e.getMessage() != null ? e.getMessage() : "Ошибка");
                });
            }
        }).start();
    }

    private void startSiteLogin() {
        startOAuth("site");
    }

    private void startOAuth(String kind) {
        hideError();
        setLoading(true);
        showHint("Откройте браузер, войдите или зарегистрируйтесь на сайте. Приложение получит токены автоматически…");
        if (oAuthPoller != null) oAuthPoller.cancel();
        oAuthPoller = new OAuthPoller(this);
        activePoller = oAuthPoller;
        oAuthPoller.start(kind, new OAuthPoller.Callback() {
            @Override
            public void onSuccess(JSONObject payload) {
                hideHint();
                handleAuthPayload(payload);
            }

            @Override
            public void onError(String message) {
                setLoading(false);
                hideHint();
                if (message != null && !message.isEmpty() && !"Отменено".equals(message)) {
                    showError(message);
                }
            }
        });
    }

    private void handleAuthPayload(JSONObject payload) {
        try {
            if (OAuthHelper.isPending(payload)) {
                pendingToken = payload.getString("pending_token");
                needs2fa = payload.optBoolean("needs_2fa", false);
                needsCurator = payload.optBoolean("needs_curator_code", true);
                step = Step.PENDING;
                applyStepUi();
                setLoading(false);
                return;
            }
            if (!payload.has("access")) {
                setLoading(false);
                showError("Сервер не вернул сессию");
                return;
            }
            if (OAuthHelper.isStaffRole(payload)) {
                SessionStore.saveStaffSession(this, OAuthHelper.toStaffSession(payload));
            } else {
                SessionStore.saveAppSession(this, OAuthHelper.toAppSession(payload));
            }
            openMain();
        } catch (Exception e) {
            setLoading(false);
            showError(e.getMessage() != null ? e.getMessage() : "Ошибка сохранения сессии");
        }
    }

    private void openMain() {
        setLoading(false);
        Toast.makeText(this, "Вход выполнен успешно", Toast.LENGTH_SHORT).show();
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(intent);
        finish();
    }

    private void setLoading(boolean loading) {
        progress.setVisibility(loading ? View.VISIBLE : View.GONE);
        setInteractive(loginButton, !loading);
        setInteractive(siteLoginButton, !loading);
        forgotButton.setEnabled(!loading);
        backButton.setEnabled(!loading);
    }

    private static void setInteractive(View view, boolean enabled) {
        view.setEnabled(enabled);
        view.setAlpha(enabled ? 1f : 0.55f);
    }

    private void showError(String msg) {
        errorText.setText(msg);
        errorText.setVisibility(View.VISIBLE);
    }

    private void hideError() {
        errorText.setVisibility(View.GONE);
    }

    private void showDevHint(String code) {
        if (code == null || code.isEmpty()) {
            devHintText.setVisibility(View.GONE);
            return;
        }
        devHintText.setText("Dev-код: " + code);
        devHintText.setVisibility(View.VISIBLE);
    }

    private void hideDevHint() {
        devHintText.setVisibility(View.GONE);
    }

    private void showHint(String msg) {
        hintText.setText(msg);
        hintText.setVisibility(View.VISIBLE);
    }

    private void hideHint() {
        hintText.setVisibility(View.GONE);
    }

    private static String textOf(EditText edit) {
        return edit.getText() != null ? edit.getText().toString().trim() : "";
    }
}
