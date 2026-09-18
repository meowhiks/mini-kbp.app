package com.kbp.journal;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.util.concurrent.TimeUnit;

import androidx.annotation.Nullable;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

public final class ApiClient {
    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");
    private static ApiClient instance;

    private final OkHttpClient client;

    private ApiClient() {
        client = new OkHttpClient.Builder()
                .connectTimeout(20, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .writeTimeout(30, TimeUnit.SECONDS)
                .build();
    }

    public static ApiClient get() {
        if (instance == null) instance = new ApiClient();
        return instance;
    }

    public Response fetchRaw(String url) throws IOException {
        Request request = new Request.Builder().url(url).get().build();
        return client.newCall(request).execute();
    }

    public JSONObject post(String path, JSONObject body) throws IOException {
        return post(path, body, null);
    }

    public JSONObject post(String path, JSONObject body, String bearer) throws IOException {
        RequestBody reqBody = RequestBody.create(body.toString(), JSON);
        Request.Builder b = new Request.Builder()
                .url(BuildConfig.SERVER_URL + path)
                .post(reqBody)
                .header("Content-Type", "application/json")
                .header("Accept", "application/json");
        if (bearer != null && !bearer.isEmpty()) {
            b.header("Authorization", "Bearer " + bearer);
        }
        return executeObject(b.build());
    }

    public JSONObject get(String path) throws IOException {
        return get(path, null);
    }

    public JSONObject get(String path, String bearer) throws IOException {
        Request.Builder b = new Request.Builder()
                .url(BuildConfig.SERVER_URL + path)
                .get()
                .header("Accept", "application/json");
        if (bearer != null && !bearer.isEmpty()) {
            b.header("Authorization", "Bearer " + bearer);
        }
        return executeObject(b.build());
    }

    /** Parses object or wraps array as {"items": [...]}. */
    public JSONObject getFlexible(String path, String bearer) throws IOException {
        Request.Builder b = new Request.Builder()
                .url(BuildConfig.SERVER_URL + path)
                .get()
                .header("Accept", "application/json");
        if (bearer != null && !bearer.isEmpty()) {
            b.header("Authorization", "Bearer " + bearer);
        }
        try (Response response = client.newCall(b.build()).execute()) {
            String text = response.body() != null ? response.body().string() : "";
            if (!response.isSuccessful()) {
                JSONObject json = parseJsonObject(text, response.code());
                throw new ApiException(json.optString("detail", "Ошибка " + response.code()), response.code(), json);
            }
            return parseJsonObject(text, response.code());
        }
    }

    public JSONObject patch(String path, JSONObject body, String bearer) throws IOException {
        RequestBody reqBody = RequestBody.create(body.toString(), JSON);
        Request.Builder b = new Request.Builder()
                .url(BuildConfig.SERVER_URL + path)
                .patch(reqBody)
                .header("Content-Type", "application/json")
                .header("Accept", "application/json");
        if (bearer != null && !bearer.isEmpty()) {
            b.header("Authorization", "Bearer " + bearer);
        }
        return executeObject(b.build());
    }

    public void delete(String path, String bearer) throws IOException {
        Request.Builder b = new Request.Builder()
                .url(BuildConfig.SERVER_URL + path)
                .delete();
        if (bearer != null && !bearer.isEmpty()) {
            b.header("Authorization", "Bearer " + bearer);
        }
        try (Response response = client.newCall(b.build()).execute()) {
            if (!response.isSuccessful()) {
                String text = response.body() != null ? response.body().string() : "{}";
                JSONObject json;
                try {
                    json = new JSONObject(text.isEmpty() ? "{}" : text);
                } catch (JSONException e) {
                    throw new ApiException("Ошибка " + response.code(), response.code(), null);
                }
                throw new ApiException(json.optString("detail", "Ошибка " + response.code()), response.code(), json);
            }
        }
    }

    public JSONArray getArray(String path, String bearer) throws IOException {
        Request.Builder b = new Request.Builder()
                .url(BuildConfig.SERVER_URL + path)
                .get()
                .header("Accept", "application/json");
        if (bearer != null && !bearer.isEmpty()) {
            b.header("Authorization", "Bearer " + bearer);
        }
        return executeArray(b.build());
    }

    public JSONArray getArray(String path) throws IOException {
        return getArray(path, null);
    }

    private JSONObject parseJsonObject(String raw, int httpCode) throws IOException {
        String text = raw == null ? "" : raw;
        if (text.startsWith("\uFEFF")) {
            text = text.substring(1);
        }
        text = text.trim();
        if (text.isEmpty() || "null".equalsIgnoreCase(text)) {
            return new JSONObject();
        }
        try {
            return new JSONObject(text);
        } catch (JSONException objectError) {
            try {
                JSONArray arr = new JSONArray(text);
                return new JSONObject().put("items", arr);
            } catch (JSONException arrayError) {
                if (text.startsWith("\"")) {
                    try {
                        String inner = new JSONArray("[" + text + "]").getString(0).trim();
                        if (!inner.isEmpty()) {
                            return new JSONObject(inner);
                        }
                    } catch (JSONException ignored) {}
                }
                String preview = text.length() > 120 ? text.substring(0, 120) + "…" : text;
                if (preview.startsWith("<")) {
                    throw new IOException("Сервер вернул HTML вместо JSON (код " + httpCode + ")", objectError);
                }
                throw new IOException("Некорректный ответ сервера (код " + httpCode + ")", objectError);
            }
        }
    }

    private JSONObject executeObject(Request request) throws IOException {
        try (Response response = client.newCall(request).execute()) {
            String text = response.body() != null ? response.body().string() : "";
            JSONObject json = parseJsonObject(text, response.code());
            if (!response.isSuccessful()) {
                String detail = json.optString("detail", "Ошибка " + response.code());
                throw new ApiException(detail, response.code(), json);
            }
            return json;
        }
    }

    private JSONArray executeArray(Request request) throws IOException {
        try (Response response = client.newCall(request).execute()) {
            String text = response.body() != null ? response.body().string() : "";
            if (text.startsWith("\uFEFF")) {
                text = text.substring(1);
            }
            text = text.trim();
            JSONArray json;
            try {
                json = new JSONArray(text.isEmpty() ? "[]" : text);
            } catch (JSONException e) {
                JSONObject obj = parseJsonObject(text, response.code());
                JSONArray items = obj.optJSONArray("items");
                if (items != null) {
                    json = items;
                } else {
                    throw new IOException("Некорректный ответ сервера (код " + response.code() + ")", e);
                }
            }
            if (!response.isSuccessful()) {
                throw new ApiException("Ошибка " + response.code(), response.code(), null);
            }
            return json;
        }
    }

    private JSONObject execute(Request request) throws IOException {
        return executeObject(request);
    }

    public static class ApiException extends IOException {
        public final int code;
        @Nullable
        public final JSONObject body;

        public ApiException(String message, int code, @Nullable JSONObject body) {
            super(message);
            this.code = code;
            this.body = body;
        }
    }
}
