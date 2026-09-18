# Регистрация на телефоне

Capacitor WebView → UI `AppAuthScreen`, API Django (`NEXT_PUBLIC_MINIKBP_SERVER_URL`), сессия `@capacitor/preferences`.

## Цепочка (email)

```
credentials → email_verify → verify (код куратора) → /app/journal
     │              │                │
     │              │                └─ POST /api/auth/app/verify/
     │              └─ POST /api/auth/app/verify-email/
     └─ POST /api/auth/app/register/
```

OAuth (Telegram/Google native) пропускает `email_verify`, но без роли всё равно идёт на `verify`.

---

## Шаг 1 — UI: форма регистрации

`AppAuthScreen` определяет нативное приложение и обрабатывает submit:

```typescript
// app/components/app/AppAuthScreen.tsx
useEffect(() => {
  setNativeMobileAuth(isNativeMobileAuth()); // Capacitor.isNativePlatform()
  if (isNativeMobileAuth()) {
    void ensureNativeSocialLoginInit().catch(() => {});
  }
}, []);

const handleCredentials = async (e: React.FormEvent) => {
  e.preventDefault();
  setError("");
  setLoading(true);
  const r =
    mode === "register"
      ? await registerWithEmail({ email, password, passwordConfirm })
      : await loginWithEmail({ email, password });
  setLoading(false);

  if (!r.ok) {
    if (r.needsEmailVerify) {
      setDevCodeHint(r.devCode || "");
      setStep("email_verify");
    }
    setError(r.error);
    return;
  }
  if ("needsEmailVerify" in r && r.needsEmailVerify) {
    setDevCodeHint(r.devCode || "");
    setStep("email_verify");
    return;
  }
  if ("role" in r) {
    goAfterAuth(r.role); // router.replace → /app/journal
    return;
  }
  finishPending(r.pending); // step "verify"
};
```

Клиентский API-вызов:

```typescript
// lib/client/appAuth.ts
export async function registerWithEmail(input: {
  email: string;
  password: string;
  passwordConfirm: string;
}) {
  const r = await api<AuthPayload>("/api/auth/app/register/", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      password_confirm: input.passwordConfirm,
      referral: getStoredReferral() || undefined,
    }),
  });
  if (!r.ok) return { ok: false, error: r.detail };

  if (r.data.needs_email_verify) {
    return {
      ok: true,
      needsEmailVerify: true,
      email: r.data.email || input.email,
      devCode: r.data.dev_code, // только DEBUG без SMTP
    };
  }
  const result = await persistAuthPayload(r.data);
  if ("role" in result) return { ok: true, role: result.role };
  return { ok: true, pending: result.pending };
}
```

Базовый HTTP-клиент (все auth-запросы идут через него):

```typescript
// lib/client/appAuth.ts
async function api<T>(path: string, options: RequestInit = {}) {
  const res = await fetch(`${getServerUrl()}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      detail: body?.detail ?? `Ошибка ${res.status}`,
      needsEmailVerify: Boolean(body?.needs_email_verify),
      devCode: body?.dev_code,
    };
  }
  return { ok: true, data: body as T };
}
```

**Request:**
```json
POST /api/auth/app/register/
{ "email": "student@test.by", "password": "...", "password_confirm": "...", "referral": "tg" }
```

**Response (нужна верификация):**
```json
{ "needs_email_verify": true, "email": "student@test.by" }
```

---

## Шаг 2 — Сервер: создание аккаунта и письмо

```python
# server/accounts/app_auth_views.py
REG_EMAIL_TTL = 86400  # 24 часа

class AppRegisterView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email = (request.data.get("email") or "").strip().lower()
        password = request.data.get("password") or ""
        password2 = request.data.get("password_confirm") or password

        if not email or not password:
            return Response({"detail": "Электронная почта и пароль обязательны"}, status=400)
        if password != password2:
            return Response({"detail": "Пароли не совпадают"}, status=400)

        existing = AppAccount.objects.filter(email__iexact=email).select_related("user").first()
        if existing and _email_is_verified(existing):
            return Response({"detail": "Аккаунт с такой почтой уже есть"}, status=400)
        if existing and _registration_expired(existing):
            _purge_unverified_account(existing)
            existing = None

        validate_password(password)
        account, created = get_or_create_app_account(
            email=email, password=password, display_name=email.split("@")[0]
        )

        if not _email_is_verified(account):
            sent, dev_code = _send_registration_verification(account)
            if not sent:
                if created:
                    account.user.delete()
                return Response({"detail": "Не удалось отправить письмо"}, status=503)
            payload = {"needs_email_verify": True, "email": email}
            if dev_code:
                payload["dev_code"] = dev_code
            return Response(payload)

        return Response(_auth_step_response(account))
```

Отправка кода и magic link:

```python
def _send_registration_verification(account: AppAccount) -> tuple[bool, str | None]:
    code = f"{secrets.randbelow(900_000) + 100_000:06d}"
    cache.set(f"app_reg_verify:{account.pk}", code, REG_EMAIL_TTL)
    if not outbound_email_enabled():
        if settings.DEBUG:
            return True, code  # dev_code в ответе API
        return False, None
    token = _signer.sign(str(account.pk))
    magic_link = build_registration_magic_link(token)
    send_registration_email(to_email=account.email, magic_link=magic_link, code=code)
    return True, None
```

```python
# server/accounts/app_email.py
def build_registration_magic_link(token: str) -> str:
    return f"{APP_PUBLIC_URL}/app?verify_email={token}"
```

---

## Шаг 3 — Подтверждение почты

### A. Код в приложении (6 цифр)

UI:

```typescript
// app/components/app/AppAuthScreen.tsx
const handleEmailVerify = async (e: React.FormEvent) => {
  e.preventDefault();
  const r = await verifyRegistrationEmail({
    email,
    code: emailVerifyCode.trim(),
  });
  if (!r.ok) { setError(r.error); return; }
  if ("role" in r) { goAfterAuth(r.role); return; }
  finishPending(r.pending);
};

// input: только цифры, max 6
onChange={(e) => setEmailVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
```

Клиент:

```typescript
// lib/client/appAuth.ts
export async function verifyRegistrationEmail(input: {
  token?: string;
  email?: string;
  code?: string;
}) {
  const r = await api<AuthPayload>("/api/auth/app/verify-email/", {
    method: "POST",
    body: JSON.stringify({
      token: input.token || "",
      email: input.email || "",
      code: input.code || "",
    }),
  });
  if (!r.ok) return { ok: false, error: r.detail };
  const result = await persistAuthPayload(r.data);
  if ("role" in result) return { ok: true, role: result.role };
  return { ok: true, pending: result.pending };
}
```

**Request:**
```json
POST /api/auth/app/verify-email/
{ "email": "student@test.by", "code": "482913", "token": "" }
```

### B. Magic link из письма

Ссылка: `https://lk.mini-kbp.site/app?verify_email=<signed_token>`

При открытии в приложении (или браузере с редиректом в app):

```typescript
// app/components/app/AppAuthScreen.tsx
useEffect(() => {
  (async () => {
    const q = parseAppQuery(searchParams.toString());
    // parseAppQuery: sp.get("verify_email")

    if (q.verifyEmail) {
      const r = await verifyRegistrationEmail({ token: q.verifyEmail });
      if (!r.ok) {
        setError(r.error);
        setStep("email_verify"); // fallback на ручной ввод кода
        return;
      }
      if ("role" in r) { goAfterAuth(r.role); return; }
      finishPending(r.pending);
      return;
    }

    // восстановление незавершённой регистрации после перезапуска app
    const p = await getPendingAuth();
    if (p) {
      setPending(p);
      setStep("verify");
    }
  })();
}, [searchParams]);
```

Сервер:

```python
class AppVerifyEmailView(APIView):
    def post(self, request):
        token = (request.data.get("token") or "").strip()
        code = (request.data.get("code") or "").strip()
        account = None

        if token:
            account_id = int(_signer.unsign(token, max_age=REG_EMAIL_TTL))
            account = AppAccount.objects.filter(pk=account_id).first()
        elif code and (request.data.get("email") or "").strip():
            email = str(request.data.get("email")).strip().lower()
            account = AppAccount.objects.filter(email__iexact=email).first()
            cached = cache.get(f"app_reg_verify:{account.pk}") if account else None
            if not cached or cached != code:
                return Response({"detail": "Неверный или просроченный код"}, status=400)

        if _registration_expired(account):
            _purge_unverified_account(account)
            return Response({"detail": "Срок подтверждения истёк — зарегистрируйтесь снова"}, status=400)

        if not account.email_verified_at:
            account.email_verified_at = timezone.now()
            account.save(update_fields=["email_verified_at"])
        cache.delete(f"app_reg_verify:{account.pk}")

        return Response(_auth_step_response(account))
```

**Response после verify-email (роль не назначена):**
```json
{
  "pending_token": "eyJ...",
  "needs_curator_code": true,
  "needs_2fa": false,
  "display_name": "student",
  "email": "student@test.by"
}
```

---

## Шаг 4 — Код куратора (+ 2FA)

Сервер решает, что вернуть после любого auth-шага:

```python
def _auth_step_response(account: AppAccount) -> dict:
    if _account_has_assigned_role(account):
        if account.two_fa_enabled:
            return {
                "pending_token": make_pending_token(account.user, step=STEP_2FA),
                "needs_2fa": True,
                "needs_curator_code": False,
                "display_name": account.display_name,
                "email": account.email,
            }
        return _full_auth_response_for_account(account)  # access + refresh + role
    return {
        "pending_token": make_pending_token(account.user, step=STEP_VERIFY),
        "needs_curator_code": True,
        "needs_2fa": account.two_fa_enabled,
        "display_name": account.display_name,
        "email": account.email,
    }
```

Клиент сохраняет pending в Preferences и показывает экран `verify`:

```typescript
// lib/client/appAuth.ts
async function persistAuthPayload(data: AuthPayload) {
  if (data.skip_verify && data.access && data.refresh) {
    await saveAppSession({ access, refresh, studentId, fullName, groupId, groupName, ... });
    await clearPendingAuth();
    void issueAppSession(data.access);
    return { role: data.role || "student" };
  }
  const pending = {
    pendingToken: data.pending_token!,
    needs2fa: Boolean(data.needs_2fa),
    needsCuratorCode: data.needs_curator_code !== false,
    displayName: data.display_name,
    email: data.email,
  };
  await storageSet("app_auth_pending_v1", JSON.stringify(pending));
  return { pending };
}
```

UI + verify:

```typescript
// app/components/app/AppAuthScreen.tsx
const handleVerify = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!pending) return;

  const r = await verifyAccess({
    pendingToken: pending.pendingToken,
    curatorCode,                              // uppercase, без пробелов
    totpCode: pending.needs2fa ? totpCode : undefined,
  });

  if (!r.ok) {
    if (r.needs2fa && r.pendingToken) {
      setPending((p) => p ? { ...p, needs2fa: true, pendingToken: r.pendingToken! } : p);
    }
    setError(r.error);
    return;
  }
  goAfterAuth(r.role);
};
```

```typescript
// lib/client/appAuth.ts
export async function verifyAccess(input: {
  pendingToken: string;
  curatorCode: string;
  totpCode?: string;
}) {
  const r = await api<AuthPayload>("/api/auth/app/verify/", {
    method: "POST",
    body: JSON.stringify({
      pending_token: input.pendingToken,
      curator_code: input.curatorCode,
      totp_code: input.totpCode || "",
    }),
  });
  if (!r.ok) {
    if (r.needs2fa && r.pendingToken) {
      await savePendingAuth({ pendingToken: r.pendingToken, needs2fa: true, needsCuratorCode: true });
    }
    return { ok: false, error: r.detail, needs2fa: r.needs2fa };
  }
  const result = await persistAuthPayload({ ...r.data, skip_verify: true });
  return { ok: true, role: "role" in result ? result.role : "student" };
}
```

Сервер (студент):

```python
class AppVerifyView(APIView):
    def post(self, request):
        token = parse_pending_token(request.data.get("pending_token"))
        curator_code = (request.data.get("curator_code") or "").strip()
        totp_code = (request.data.get("totp_code") or "").strip()

        invite = _validate_invite_code(curator_code)  # CuratorInviteCode, active, not expired
        if not invite:
            return Response({"detail": "Неверный или просроченный код"}, status=403)

        if account.two_fa_enabled and not totp_code:
            return Response({
                "detail": "Требуется код 2FA",
                "needs_2fa": True,
                "pending_token": make_pending_token(user, step=STEP_VERIFY),
            }, status=428)

        invite.use_count += 1
        invite.save(...)

        account.group = invite.group
        account.group_verified_at = timezone.now()
        account.save(update_fields=["group", "group_verified_at"])
        student = ensure_student_for_account(account, invite.group)

        return Response({
            **make_full_tokens(user),
            "role": "student",
            "student_id": student.id,
            "full_name": student.full_name,
            "group_id": str(invite.group_id),
            "group_name": invite.group.name,
            "two_fa_enabled": account.two_fa_enabled,
        })
```

**Request:**
```json
POST /api/auth/app/verify/
{ "pending_token": "eyJ...", "curator_code": "ABC12345", "totp_code": "" }
```

**Response:**
```json
{
  "access": "eyJ...",
  "refresh": "eyJ...",
  "role": "student",
  "student_id": 42,
  "full_name": "Иван Иванов",
  "group_id": "3",
  "group_name": "ИС-21",
  "two_fa_enabled": false
}
```

---

## Шаг 5 — Сессия на телефоне

```typescript
// lib/client/appAuth.ts
async function saveAppSession(session: AppSession) {
  await storageSet("app_session_v1", JSON.stringify(session));
  await storageSet("student_session_v1", JSON.stringify({
    access: session.access,
    refresh: session.refresh,
    studentId: session.studentId,
    fullName: session.fullName,
    groupId: session.groupId,
    groupName: session.groupName,
    serverUrl: session.serverUrl,
  }));
}

export async function issueAppSession(accessToken?: string) {
  const token = accessToken || (await getAppSession())?.access;
  if (!token) return;

  const kind = /Android|iPhone|iPad|Capacitor/i.test(navigator.userAgent) ? "mobile" : "web";

  const res = await fetch(`${baseUrl()}/api/auth/issue-session/`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Client-Kind": kind,
    },
    body: JSON.stringify({ device_kind: kind }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok && body?.quick_login_token) {
    await storageSet("app_quick_login_token_v1", String(body.quick_login_token));
  }
}
```

Хранилище:

```typescript
// lib/client/storage.ts
export async function storageSet(key: string, value: string) {
  if (isNativeApp()) {
    await Preferences.set({ key, value });  // @capacitor/preferences
  } else {
    localStorage.setItem(key, value);
  }
}
```

Ключи в Preferences после успешной регистрации:

| Ключ | Содержимое |
|------|------------|
| `app_session_v1` | JWT + studentId + groupId + serverUrl |
| `student_session_v1` | дубль для journal API |
| `app_quick_login_token_v1` | быстрый повторный вход |
| `app_auth_pending_v1` | удаляется после verify |

---

## OAuth на телефоне (без email)

`isNativeApp()` → нативные кнопки вместо web widget.

### Google

```typescript
// lib/client/nativeSocialLogin.ts
export async function signInWithGoogleNative() {
  await ensureNativeSocialLoginInit();
  const SocialLogin = await import("@capgo/capacitor-social-login");
  await SocialLogin.initialize({ google: { webClientId, mode: "online" } });

  const res = await SocialLogin.login({
    provider: "google",
    options: { style: "bottom", autoSelectEnabled: false },
  });

  if (res.result.responseType !== "online" || !res.result.idToken) {
    return { ok: false, error: "Google не вернул id_token" };
  }
  return loginWithGoogle(res.result.idToken);
  // → POST /api/auth/app/google/ { credential: idToken }
  // → persistAuthPayload → verify или /app/journal
}
```

### Telegram

Flow: Custom Tab → `oauth.telegram.org` → `/auth/cb/telegram/app` → deep link → `loginWithTelegramOidcCode`.

```typescript
// lib/client/nativeSocialLogin.ts
export const TELEGRAM_NATIVE_CALLBACK = `${PRODUCTION_LK_ORIGIN}/auth/cb/telegram/app`;
const TELEGRAM_OIDC_DEEP_LINK = `${MOBILE_DEEP_LINK_SCHEME}://auth/telegram/oidc`;
// MOBILE_DEEP_LINK_SCHEME = "com.kbp.journal"  (lib/client/mobileDeepLink.ts)

export async function signInWithTelegramNative() {
  const { authUrl } = await buildTelegramOidcStartUrl(clientId, TELEGRAM_NATIVE_CALLBACK);

  const [{ App }, { Browser }] = await Promise.all([
    import("@capacitor/app"),
    import("@capacitor/browser"),
  ]);

  // 1. cold start с deep link
  const launch = await App.getLaunchUrl();
  if (launch?.url?.startsWith(TELEGRAM_OIDC_DEEP_LINK)) {
    return finishTelegramOidcFromDeepLink(launch.url);
  }

  // 2. appUrlOpen + browserFinished ДО Browser.open
  let authCompleted = false;

  await App.addListener("appUrlOpen", (event) => {
    if (!event.url.startsWith(TELEGRAM_OIDC_DEEP_LINK)) return;
    authCompleted = true;
    void finishTelegramOidcFromDeepLink(event.url).then(finish);
  });

  await Browser.addListener("browserFinished", () => {
    if (authCompleted) return;
    finish({ ok: false, error: "Вход через Telegram не завершён. Попробуйте ещё раз." });
  });

  await Browser.open({ url: authUrl });
  // таймаут 90с — если appUrlOpen так и не пришёл
  // → POST /api/auth/app/telegram/ { code, code_verifier, redirect_uri }
}
```

Bridge-страница в Custom Tab редиректит в приложение:

```typescript
// app/auth/cb/telegram/app/page.tsx
window.location.replace(
  `${MOBILE_DEEP_LINK_SCHEME}://auth/telegram/oidc?code=...&state=...`
);
```

#### Android: «зависание» без логов

Это не зависание, а **отсутствие фидбека**: Custom Tab закрылся, `appUrlOpen` не пришёл (свайп назад, сеть, уже залогиненный Chrome прошёл OAuth за 3с, но bridge не отработал). Без `browserFinished` UI остаётся в `loading` или молча возвращается.

**1. Гонка слушателя** — `App.addListener("appUrlOpen")` и `Browser.addListener("browserFinished")` — `await` **до** `Browser.open()`.

**2. browserFinished** — если вкладка закрылась, а `authCompleted === false`, показать ошибку и сбросить `loading`.

**3. Таймаут 90с** — запасной сброс, если `browserFinished` не сработал.

**4. Intent-filter** — кастомная схема (не https App Link, `autoVerify` не нужен). Обязательно `DEFAULT` + `BROWSABLE`:

```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="com.kbp.journal" android:host="auth" android:pathPrefix="/telegram" />
</intent-filter>
```

Без `BROWSABLE` Custom Tab не вернёт управление в приложение.

#### Cookies / «чистый» браузер

`@capacitor/browser` на Android — **Chrome Custom Tabs**: общий cookie-jar с Chrome пользователя. Incognito Custom Tabs **не поддерживается** API Chrome/Android.

Если в Chrome уже залогинен Telegram — OAuth может пройти за секунды (как в логе ~3.5с). Это не баг, а переиспользование сессии.

Варианты «чистой» сессии (не реализованы):
- форк `@capacitor/browser` с WebView + `CookieManager.removeAllCookies()` (Telegram может блокировать WebView);
- отдельный браузер без cookies (плохой UX);
- logout в Telegram перед OAuth (не контролируем).

Для большинства пользователей shared session — плюс (быстрый повторный вход).

---

## Файлы

| Файл | Роль |
|------|------|
| `app/components/app/AppAuthScreen.tsx` | UI, шаги, обработчики |
| `lib/client/appAuth.ts` | API, persistAuthPayload, сессия |
| `lib/client/storage.ts` | Preferences |
| `lib/client/nativeSocialLogin.ts` | Google/Telegram native |
| `lib/client/appQuery.ts` | parseAppQuery, verify_email |
| `server/accounts/app_auth_views.py` | register, verify-email, verify |
| `server/accounts/app_email.py` | magic link |

## API

| Метод | Путь | Когда |
|-------|------|-------|
| POST | `/api/auth/app/register/` | email + password |
| POST | `/api/auth/app/verify-email/` | token или email+code |
| POST | `/api/auth/app/verify/` | код куратора (+ 2FA) |
| POST | `/api/auth/issue-session/` | после входа, kind=mobile |
