package com.kbp.journal;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.view.Window;

import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    private static final long SPLASH_HOLD_MS = 900;
    private boolean keepSplash = true;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        splash.setKeepOnScreenCondition(() -> keepSplash);
        new Handler(Looper.getMainLooper()).postDelayed(() -> keepSplash = false, SPLASH_HOLD_MS);

        registerPlugin(NotificationPlugin.class);
        registerPlugin(ThemeSystemBarsPlugin.class);
        registerPlugin(AppOrientationPlugin.class);
        super.onCreate(savedInstanceState);
        applyTransparentSystemBars(true);
    }

    private void applyTransparentSystemBars(boolean lightChrome) {
        Window window = getWindow();
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
    }

    @Override
    public void onResume() {
        super.onResume();
        // Cancel any previously scheduled background sync — app must not keep running in background.
        NotificationScheduler.cancelPeriodicSync(this);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == 1001) {
            Log.d(TAG, "Notification permission result received");
        }
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }
}
