package com.kbp.journal;

import android.util.Log;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/** Receives FCM push from Django backend and shows system notifications. */
public class MiniKbpMessagingService extends FirebaseMessagingService {
    private static final String TAG = "MiniKbpFCM";

    @Override
    public void onNewToken(@NonNull String token) {
        Log.d(TAG, "New FCM token");
        PushRegistrationHelper.registerToken(this, token, true);
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        String title = "Мини КБиП";
        String body = "";
        String channel = NotificationWorker.CHANNEL_ID_GENERAL;

        if (message.getNotification() != null) {
            if (message.getNotification().getTitle() != null) {
                title = message.getNotification().getTitle();
            }
            if (message.getNotification().getBody() != null) {
                body = message.getNotification().getBody();
            }
        }

        if (message.getData().size() > 0) {
            if (message.getData().containsKey("title")) {
                title = message.getData().get("title");
            }
            if (message.getData().containsKey("body")) {
                body = message.getData().get("body");
            }
            String type = message.getData().get("type");
            if ("journal".equals(type)) {
                channel = NotificationWorker.CHANNEL_ID_JOURNAL;
            } else if ("timetable".equals(type)) {
                channel = NotificationWorker.CHANNEL_ID_TIMETABLE;
            }
        }

        if (body == null || body.isEmpty()) return;

        NotificationScheduler.scheduleImmediateNotification(this, title, body, channel);
    }
}
