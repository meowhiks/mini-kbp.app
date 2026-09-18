package com.kbp.journal;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;

/** /api/app/profile/ и связанные эндпоинты (как lib/client/userProfile.ts + appAuth sessions). */
public final class ProfileApi {
    private ProfileApi() {}

    public static JSONObject fetchProfile(String token) throws IOException {
        return ApiClient.get().get("/api/app/profile/", token);
    }

    public static JSONObject saveProfile(String token, JSONObject patch) throws IOException {
        return ApiClient.get().patch("/api/app/profile/", patch, token);
    }

    public static JSONObject requestEmailChange(String token, String email) throws IOException {
        JSONObject body = new JSONObject();
        try {
            body.put("email", email);
        } catch (Exception e) {
            throw new IOException(e);
        }
        return ApiClient.get().post("/api/app/profile/email/request/", body, token);
    }

    public static JSONObject confirmEmailChange(String token, String code) throws IOException {
        JSONObject body = new JSONObject();
        try {
            body.put("code", code);
        } catch (Exception e) {
            throw new IOException(e);
        }
        return ApiClient.get().post("/api/app/profile/email/confirm/", body, token);
    }

    public static JSONObject setupTwoFa(String token) throws IOException {
        return ApiClient.get().post("/api/app/profile/2fa/setup/", new JSONObject(), token);
    }

    public static JSONObject enableTwoFa(String token, String totpCode) throws IOException {
        JSONObject body = new JSONObject();
        try {
            body.put("totp_code", totpCode);
        } catch (Exception e) {
            throw new IOException(e);
        }
        return ApiClient.get().post("/api/app/profile/2fa/enable/", body, token);
    }

    public static JSONObject disableTwoFa(String token, String totpCode) throws IOException {
        JSONObject body = new JSONObject();
        try {
            body.put("totp_code", totpCode);
        } catch (Exception e) {
            throw new IOException(e);
        }
        return ApiClient.get().post("/api/app/profile/2fa/disable/", body, token);
    }

    public static JSONObject fetchSessions(String token) throws IOException {
        return ApiClient.get().get("/api/auth/sessions/", token);
    }

    public static void revokeSession(String token, long id) throws IOException {
        ApiClient.get().delete("/api/auth/sessions/" + id + "/", token);
    }

    public static void logout(String token) throws IOException {
        ApiClient.get().post("/api/auth/logout/", new JSONObject(), token);
    }

    public static JSONArray getSessionsArray(JSONObject response) {
        return response.optJSONArray("sessions");
    }

    public static int getSessionTtlDays(JSONObject response, int fallback) {
        return response.optInt("session_ttl_days", fallback);
    }

    public static String apiError(Exception e) {
        if (e instanceof ApiClient.ApiException) {
            String msg = e.getMessage();
            if (msg != null && !msg.isEmpty()) return msg;
        }
        return e.getMessage() != null ? e.getMessage() : "Ошибка запроса";
    }
}
