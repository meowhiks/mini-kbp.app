package com.kbp.journal;

import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ThemeSystemBars")
public class ThemeSystemBarsPlugin extends Plugin {

    @PluginMethod
    public void setTheme(PluginCall call) {
        String theme = call.getString("theme", "light");
        boolean lightChrome = "light".equals(theme);
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            WindowCompat.setDecorFitsSystemWindows(window, false);
            window.setNavigationBarColor(Color.TRANSPARENT);
            window.setStatusBarColor(Color.TRANSPARENT);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                window.setNavigationBarContrastEnforced(false);
            }
            View decor = window.getDecorView();
            WindowInsetsControllerCompat insets = new WindowInsetsControllerCompat(window, decor);
            insets.setAppearanceLightNavigationBars(lightChrome);
            insets.setAppearanceLightStatusBars(lightChrome);
            call.resolve();
        });
    }
}
