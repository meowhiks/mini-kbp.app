package com.kbp.journal;

import android.content.Intent;
import android.net.Uri;

/** Deep link com.kbp.journal://auth/{telegram|google}?code=…|done=1 */
public final class MobileAuthDeepLink {
    private MobileAuthDeepLink() {}

    public static boolean isAuthUri(Uri uri) {
        return uri != null
                && "com.kbp.journal".equals(uri.getScheme())
                && "auth".equals(uri.getHost());
    }

    public static String getMobileCode(Uri uri) {
        if (uri == null) return "";
        String code = uri.getQueryParameter("code");
        return code != null ? code.trim() : "";
    }

    public static boolean isDone(Uri uri) {
        return uri != null && "1".equals(uri.getQueryParameter("done"));
    }
}
