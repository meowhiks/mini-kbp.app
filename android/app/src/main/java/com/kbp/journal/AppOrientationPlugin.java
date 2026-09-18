package com.kbp.journal;

import android.app.Activity;
import android.content.pm.ActivityInfo;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AppOrientation")
public class AppOrientationPlugin extends Plugin {

    @PluginMethod
    public void setAllowRotation(PluginCall call) {
        boolean allow = Boolean.TRUE.equals(call.getBoolean("allow", false));
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity");
            return;
        }
        activity.runOnUiThread(() -> {
            activity.setRequestedOrientation(
                allow ? ActivityInfo.SCREEN_ORIENTATION_FULL_USER : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            );
            call.resolve();
        });
    }
}
