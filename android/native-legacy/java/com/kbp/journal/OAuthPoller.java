package com.kbp.journal;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

public class OAuthPoller {
    private static final long POLL_MS = 2000;
    private static final long TIMEOUT_MS = 300_000;

    private final Context context;
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile boolean cancelled;

    public OAuthPoller(Context context) {
        this.context = context;
    }

    public void cancel() {
        cancelled = true;
    }

    public void start(String kind, Callback callback) {
        cancelled = false;
        new Thread(() -> {
            try {
                JSONObject start = OAuthHelper.startMobileLink(kind);
                String token = start.getString("token");
                String authUrl = start.getString("auth_url");
                main.post(() -> openBrowser(authUrl));
                long deadline = System.currentTimeMillis() + TIMEOUT_MS;
                while (!cancelled && System.currentTimeMillis() < deadline) {
                    JSONObject poll = OAuthHelper.pollMobileLink(token);
                    if ("pending".equals(poll.optString("status"))) {
                        Thread.sleep(POLL_MS);
                        continue;
                    }
                    if ("expired".equals(poll.optString("status"))) {
                        main.post(() -> callback.onError("Время входа истекло"));
                        return;
                    }
                    main.post(() -> {
                        bringToFront();
                        callback.onSuccess(poll);
                    });
                    return;
                }
                main.post(() -> callback.onError(
                        cancelled ? "Отменено" : "Не дождались подтверждения на сайте"
                ));
            } catch (Exception e) {
                main.post(() -> callback.onError(
                        e.getMessage() != null ? e.getMessage() : "Ошибка входа"
                ));
            }
        }).start();
    }

    private void openBrowser(String url) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        if (!(context instanceof android.app.Activity)) {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        }
        context.startActivity(intent);
    }

    private void bringToFront() {
        if (!(context instanceof AuthActivity)) return;
        Intent intent = new Intent(context, AuthActivity.class);
        intent.setAction(Intent.ACTION_MAIN);
        intent.setData(null);
        intent.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        context.startActivity(intent);
    }

    public interface Callback {
        void onSuccess(JSONObject payload);
        void onError(String message);
    }
}
