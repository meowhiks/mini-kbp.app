package com.kbp.journal;

import android.content.Intent;

import androidx.activity.result.ActivityResultLauncher;
import androidx.appcompat.app.AppCompatActivity;

import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.CommonStatusCodes;
import com.google.android.gms.tasks.Task;

/** Нативный Google Sign-In (системный выбор аккаунта). */
public final class GoogleSignInHelper {
    private GoogleSignInHelper() {}

    public static void launch(
            AppCompatActivity activity,
            ActivityResultLauncher<Intent> launcher,
            String webClientId) {
        GoogleSignInOptions options = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestIdToken(webClientId)
                .requestEmail()
                .build();
        GoogleSignInClient client = GoogleSignIn.getClient(activity, options);
        launcher.launch(client.getSignInIntent());
    }

    public static String parseIdToken(Intent data) throws Exception {
        if (data == null) {
            throw new Exception("Google не вернул данные");
        }
        Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(data);
        try {
            GoogleSignInAccount account = task.getResult(ApiException.class);
            String token = account != null ? account.getIdToken() : null;
            if (token == null || token.isEmpty()) {
                throw new Exception(
                        "Google не вернул id token. Проверьте SHA-1 debug/release в Google Cloud Console для com.kbp.journal");
            }
            return token;
        } catch (ApiException e) {
            throw new Exception(mapGoogleError(e));
        }
    }

    private static String mapGoogleError(ApiException e) {
        int code = e.getStatusCode();
        if (code == CommonStatusCodes.DEVELOPER_ERROR) {
            return "Google DEVELOPER_ERROR: добавьте SHA-1 отпечаток APK в Google Cloud Console (OAuth Android client, package com.kbp.journal)";
        }
        if (code == CommonStatusCodes.CANCELED || code == 12501) {
            return "Вход через Google отменён";
        }
        if (code == CommonStatusCodes.NETWORK_ERROR) {
            return "Нет сети для Google Sign-In";
        }
        String msg = e.getMessage();
        return "Google ошибка " + code + (msg != null && !msg.isEmpty() ? ": " + msg : "");
    }
}
