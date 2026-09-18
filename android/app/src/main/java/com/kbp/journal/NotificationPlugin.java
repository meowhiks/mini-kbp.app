package com.kbp.journal;

import android.Manifest;
import android.util.Log;

import androidx.work.Data;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "NotificationPlugin",
    permissions = {
        @Permission(
            alias = "notifications",
            strings = {Manifest.permission.POST_NOTIFICATIONS}
        )
    }
)
public class NotificationPlugin extends Plugin {
    private static final String TAG = "NotificationPlugin";

    @PluginMethod
    public void scheduleBackgroundNotification(PluginCall call) {
        String title = call.getString("title", "Уведомление");
        String body = call.getString("body", "Новое уведомление");
        String channel = call.getString("channel", NotificationWorker.CHANNEL_ID_GENERAL);
        int delaySeconds = call.getInt("delaySeconds", 0);

        Log.d(TAG, "Scheduling background notification: " + title + " [channel: " + channel + "]");
        NotificationScheduler.scheduleNotification(getContext(), title, body, channel, delaySeconds);
        call.resolve();
    }

    @PluginMethod
    public void cancelAllNotifications(PluginCall call) {
        NotificationScheduler.cancelAllNotifications(getContext());
        call.resolve();
    }

    @PluginMethod
    public void startPeriodicSync(PluginCall call) {
        // Background keep-alive disabled — do not schedule periodic WorkManager jobs.
        try {
            NotificationScheduler.cancelPeriodicSync(getContext());
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to stop periodic sync: " + e.getMessage());
        }
    }

    @PluginMethod
    public void scheduleQuickSync(PluginCall call) {
        // No background wake after close.
        call.resolve();
    }

    @PluginMethod
    public void stopPeriodicSync(PluginCall call) {
        try {
            NotificationScheduler.cancelPeriodicSync(getContext());
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to stop periodic sync: " + e.getMessage());
        }
    }

    @PluginMethod
    public void syncNow(PluginCall call) {
        try {
            Data inputData = new Data.Builder().putBoolean("force_sync", true).build();
            OneTimeWorkRequest syncWork = new OneTimeWorkRequest.Builder(BackgroundSyncWorker.class)
                    .setInputData(inputData)
                    .build();
            WorkManager.getInstance(getContext()).enqueue(syncWork);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to run immediate sync: " + e.getMessage());
        }
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", PermissionHelper.hasNotificationPermission(getContext()));
        result.put("required", PermissionHelper.isNotificationPermissionRequired());
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (PermissionHelper.hasNotificationPermission(getContext())) {
            call.resolve();
            return;
        }
        if (PermissionHelper.isNotificationPermissionRequired()) {
            requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
        } else {
            call.resolve();
        }
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        if (PermissionHelper.hasNotificationPermission(getContext())) {
            call.resolve();
        } else {
            call.reject("Notification permission denied");
        }
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        String type = call.getString("type", "app");
        if ("notification".equals(type)) {
            PermissionHelper.openNotificationSettings(getContext());
        } else {
            PermissionHelper.openAppSettings(getContext());
        }
        call.resolve();
    }

    @PluginMethod
    public void isSyncRunning(PluginCall call) {
        JSObject result = new JSObject();
        result.put("running", NotificationScheduler.isPeriodicSyncRunning(getContext()));
        call.resolve(result);
    }
}
