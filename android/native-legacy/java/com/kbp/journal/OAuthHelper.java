package com.kbp.journal;

import org.json.JSONObject;

import java.io.IOException;

/** Вход через Chrome + polling (как mobileWebAuthLink.ts). */
public final class OAuthHelper {
    public interface Callback {
        void onSuccess(JSONObject authPayload);
        void onError(String message);
    }

    private OAuthHelper() {}

    public static JSONObject startMobileLink(String kind) throws IOException {
        JSONObject body = new JSONObject();
        try {
            body.put("kind", kind);
        } catch (Exception e) {
            throw new IOException(e);
        }
        return ApiClient.get().post("/api/auth/app/mobile/link/start/", body);
    }

    public static JSONObject pollMobileLink(String token) throws IOException {
        try {
            return ApiClient.get().get("/api/auth/app/mobile/link/poll/?token=" + token);
        } catch (ApiClient.ApiException e) {
            if (e.code == 404) {
                JSONObject expired = new JSONObject();
                try {
                    expired.put("status", "expired");
                } catch (Exception ignored) {}
                return expired;
            }
            throw e;
        }
    }

    public static JSONObject loginEmail(String email, String password) throws IOException {
        JSONObject body = new JSONObject();
        try {
            body.put("email", email);
            body.put("password", password);
        } catch (Exception e) {
            throw new IOException(e);
        }
        return ApiClient.get().post("/api/auth/app/login/", body);
    }

    public static JSONObject verifyCurator(String pendingToken, String curatorCode) throws IOException {
        JSONObject body = new JSONObject();
        try {
            body.put("pending_token", pendingToken);
            body.put("curator_code", curatorCode);
        } catch (Exception e) {
            throw new IOException(e);
        }
        return ApiClient.get().post("/api/auth/app/verify/", body);
    }

    public static JSONObject verify2fa(String pendingToken, String totpCode) throws IOException {
        JSONObject body = new JSONObject();
        try {
            body.put("pending_token", pendingToken);
            body.put("totp_code", totpCode);
        } catch (Exception e) {
            throw new IOException(e);
        }
        return ApiClient.get().post("/api/auth/app/2fa/", body);
    }

    public static JSONObject registerEmail(String email, String password, String passwordConfirm) throws IOException {
        JSONObject body = new JSONObject();
        try {
            body.put("email", email);
            body.put("password", password);
            body.put("password_confirm", passwordConfirm);
        } catch (Exception e) {
            throw new IOException(e);
        }
        return ApiClient.get().post("/api/auth/app/register/", body);
    }

    public static JSONObject verifyRegistrationEmail(String email, String code) throws IOException {
        JSONObject body = new JSONObject();
        try {
            body.put("email", email);
            body.put("code", code);
        } catch (Exception e) {
            throw new IOException(e);
        }
        return ApiClient.get().post("/api/auth/app/verify-email/", body);
    }

    public static JSONObject requestPasswordReset(String email) throws IOException {
        JSONObject body = new JSONObject();
        try {
            body.put("email", email);
        } catch (Exception e) {
            throw new IOException(e);
        }
        return ApiClient.get().post("/api/auth/app/password-reset/", body);
    }

    public static JSONObject confirmPasswordReset(
            String email, String code, String password, String passwordConfirm) throws IOException {
        JSONObject body = new JSONObject();
        try {
            body.put("email", email);
            body.put("code", code);
            body.put("password", password);
            body.put("password_confirm", passwordConfirm);
        } catch (Exception e) {
            throw new IOException(e);
        }
        return ApiClient.get().post("/api/auth/app/password-reset/confirm/", body);
    }

    public static JSONObject loginGoogle(String idToken) throws IOException {
        JSONObject body = new JSONObject();
        try {
            body.put("credential", idToken);
        } catch (Exception e) {
            throw new IOException(e);
        }
        return ApiClient.get().post("/api/auth/app/google/", body);
    }

    public static JSONObject exchangeMobileCode(String code) throws IOException {
        JSONObject body = new JSONObject();
        try {
            body.put("code", code.trim());
        } catch (Exception e) {
            throw new IOException(e);
        }
        return ApiClient.get().post("/api/auth/app/mobile/exchange/", body);
    }

    public static String fetchGoogleClientId() throws IOException {
        JSONObject cfg = ApiClient.get().get("/api/public/app-config/");
        return cfg.optString("google_client_id", "").trim();
    }

    public static boolean needsEmailVerify(JSONObject payload) {
        return payload.optBoolean("needs_email_verify", false);
    }

    public static JSONObject fetchJournal(String accessToken) throws IOException {
        return ApiClient.get().get("/api/student/journal/", accessToken);
    }

    public static JSONObject fetchProfile(String accessToken) throws IOException {
        return ApiClient.get().get("/api/app/profile/", accessToken);
    }

    /** Преобразует auth payload в сохраняемую сессию (student). */
    public static JSONObject toAppSession(JSONObject payload) throws Exception {
        JSONObject session = new JSONObject();
        session.put("access", payload.getString("access"));
        session.put("refresh", payload.getString("refresh"));
        session.put("studentId", payload.optInt("student_id", 0));
        session.put("fullName", payload.optString("full_name", ""));
        session.put("groupId", payload.optString("group_id", ""));
        session.put("groupName", payload.optString("group_name", ""));
        session.put("twoFaEnabled", payload.optBoolean("two_fa_enabled", false));
        session.put("serverUrl", BuildConfig.SERVER_URL);
        return session;
    }

    public static boolean isStaffRole(JSONObject payload) {
        String role = payload.optString("role", "student");
        return "teacher".equals(role) || "admin".equals(role);
    }

    public static JSONObject toStaffSession(JSONObject payload) throws Exception {
        JSONObject session = new JSONObject();
        session.put("role", payload.optString("role", "teacher"));
        session.put("access", payload.getString("access"));
        session.put("refresh", payload.getString("refresh"));
        session.put("fullName", payload.optString("full_name", ""));
        session.put("username", payload.optString("username", ""));
        session.put("teacherId", payload.optInt("teacher_id", 0));
        session.put("isSuperuser", payload.optBoolean("is_superuser", false));
        session.put("serverUrl", BuildConfig.SERVER_URL);
        return session;
    }

    public static boolean isPending(JSONObject payload) {
        return payload.has("pending_token") && !payload.has("access");
    }
}
