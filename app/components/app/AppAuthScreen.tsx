"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { themeIsDark, type AppTheme } from "@/lib/client/appTheme";
import {
  getAppSession,
  getPendingAuth,
  getQuickLoginAvailable,
  quickLogin,
  getTelegramBotClientId,
  getTelegramBotUsername,
  loginWithEmail,
  loginWithGoogle,
  loginWithTelegram,
  resolveTelegramConfig,
  verifyAccess,
  verifyRegistrationEmail,
  verifyTwoFaLogin,
  requestPasswordReset,
  confirmPasswordReset,
  type AppPendingAuth,
} from "@/lib/client/appAuth";
import {
  parseAppQuery,
  persistRedirectQ,
  persistReferral,
  persistInviteCode,
  peekStoredInviteCode,
  resolvePostAuthPath,
  sanitizeRedirectPath,
  stripVerifyDoFromSearch,
  NATIVE_APP_HOME,
} from "@/lib/client/appQuery";
import { clearGuestMode, enableGuestMode, isGuestModeActive } from "@/lib/client/guestMode";
import { AppInputField } from "@/app/components/app/AppInputField";
import { loadStaffSession } from "@/lib/client/miniKbpServer";
import {
  getTelegramLoginHostname,
  getTelegramLoginOrigin,
  isTelegramWidgetHostValid,
  telegramLoginAppUrl,
} from "@/lib/client/telegramWidgetHost";
import {
  getGoogleClientId,
  loadGoogleIdentityScript,
  mountGoogleSignInOverlay,
  resolveGoogleClientId,
  type GoogleCredentialResponse,
} from "@/lib/client/googleAuth";
import { getLkAppUrl, isLkHost, isPanelHost, isLocalDevHost } from "@/lib/client/lkAppUrl";
import { navigatePostAuth } from "@/lib/client/navigatePostAuth";
import { isBundledAppShell, isDesktopBrowser, isElectronDesktop, isNativeApp } from "@/lib/client/platform";
import { handleNativeAppBackButton } from "@/lib/client/nativeBackButton";
import { getSpaHistoryDepth } from "@/lib/client/spaHistoryDepth";
import { setDesktopChromeUser } from "@/lib/client/desktopChrome";
import { startTelegramOidcRedirect } from "@/lib/client/telegramOidcRedirect";
import { consumeTelegramAuthHash } from "@/lib/client/telegramAuthHash";
import {
  installMobileAuthDeepLinkListener,
  isNativeMobileAuth,
  type MobileAuthResult,
} from "@/lib/client/mobileAuthBridge";
import {
  ensureNativeSocialLoginInit,
  signInWithSiteNative,
} from "@/lib/client/nativeSocialLogin";
import { completeMobileWebLinkWithSession, signInWithMobileWebLink, resumeMobileWebLinkPoll, cancelMobileWebLinkFlow, waitForNextPaint } from "@/lib/client/mobileWebAuthLink";
import { loadMobileWebLinkSession } from "@/lib/client/mobileWebLinkSession";
import { shouldUseExternalOAuthBridge } from "@/lib/client/oauthBridge";
import {
  clearStoredMobileLinkToken,
  resolveMobileLinkToken,
  storeMobileLinkToken,
} from "@/lib/client/mobileLinkTokenStorage";
import MobileAuthReturnPolling from "@/app/auth/cb/MobileAuthReturnPolling";
import AppQrLoginPanel from "@/app/components/app/AppQrLoginPanel";
import AppQrScanner from "@/app/components/app/AppQrScanner";
import { GlobeIcon, TelegramIcon, GoogleIcon, QrCodeIcon } from "@/lib/client/oauthIcons";
import AuthStepSlide from "@/app/components/app/AuthStepSlide";
import AuthWaitingScreen from "@/app/components/app/AuthWaitingScreen";
import { authLoginButtons } from "@/lib/client/authLoginButtons";
import { friendlyAuthError } from "@/lib/client/authErrorCopy";
import { inviteStepCopy } from "@/lib/client/inviteStepCopy";

type Step = "credentials" | "email_verify" | "verify" | "forgot" | "forgot_confirm";

const STEP_ORDER: Record<Step, number> = {
  credentials: 0,
  email_verify: 10,
  verify: 20,
  forgot: 30,
  forgot_confirm: 40,
};

const CREDENTIALS_VIEW_ORDER = { form: 0, qr_login: 1, qr_scan: 2 } as const;

type AppAuthScreenProps = {
  theme?: AppTheme;
};

export default function AppAuthScreen({ theme = "light" }: AppAuthScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDark = themeIsDark(theme);
  const googleOverlayRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [curatorCode, setCuratorCode] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [emailVerifyCode, setEmailVerifyCode] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [devCodeHint, setDevCodeHint] = useState("");
  const [pending, setPending] = useState<AppPendingAuth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  const [botUsername, setBotUsername] = useState<string | null>(() => getTelegramBotUsername());
  const [botClientId, setBotClientId] = useState<string | null>(() => getTelegramBotClientId());
  const [googleClientId, setGoogleClientId] = useState<string | null>(() => getGoogleClientId());
  const [tgHostValid, setTgHostValid] = useState(true);
  const [tgLoginHost, setTgLoginHost] = useState("lk.mini-kbp.site");
  const [currentHostname, setCurrentHostname] = useState("");
  const [panelHost, setPanelHost] = useState(false);
  const [clientReady, setClientReady] = useState(false);
  const [googleMountFailed, setGoogleMountFailed] = useState(false);
  const [nativeMobileAuth, setNativeMobileAuth] = useState(false);
  const [oauthBridge, setOauthBridge] = useState(false);
  const [oauthWaiting, setOauthWaiting] = useState(false);
  const oauthAbortRef = useRef<AbortController | null>(null);
  const [mobileLinkDone, setMobileLinkDone] = useState(false);
  const [credentialsView, setCredentialsView] = useState<"form" | "qr_login" | "qr_scan">("form");
  const [qrScanOk, setQrScanOk] = useState("");
  const [slideDir, setSlideDir] = useState<1 | -1>(1);
  const nativeAuthSlide = isNativeApp();
  const shellGuest = isBundledAppShell();
  const loginButtons = authLoginButtons({
    native: isNativeApp(),
    electron: isElectronDesktop(),
    desktopBrowser: isDesktopBrowser(),
  });
  const authBootstrapped = useRef(false);
  const verifyQueryApplied = useRef(false);

  const goToStep = useCallback(
    (next: Step) => {
      if (nativeAuthSlide) {
        setSlideDir(STEP_ORDER[next] >= STEP_ORDER[step] ? 1 : -1);
      }
      setStep(next);
    },
    [nativeAuthSlide, step]
  );

  const goCredentialsView = useCallback(
    (next: "form" | "qr_login" | "qr_scan") => {
      if (nativeAuthSlide) {
        setSlideDir(CREDENTIALS_VIEW_ORDER[next] >= CREDENTIALS_VIEW_ORDER[credentialsView] ? 1 : -1);
      }
      setCredentialsView(next);
    },
    [nativeAuthSlide, credentialsView]
  );

  const handleAuthBack = useCallback(() => {
    goToStep("credentials");
    setError("");
    setDevCodeHint("");
    setCuratorCode("");
    setTotpCode("");
    setEmailVerifyCode("");
    const stripped = stripVerifyDoFromSearch(searchParams.toString());
    const current = searchParams.toString();
    const currentQ = current ? `?${current}` : "";
    if (stripped !== currentQ) {
      router.replace(`${window.location.pathname}${stripped}`);
    }
  }, [goToStep, router, searchParams]);

  const mobileLinkToken = resolveMobileLinkToken(searchParams.get("link_token") || "");
  const isMobileLinkFlow = Boolean(mobileLinkToken);

  useEffect(() => {
    if (mobileLinkToken) storeMobileLinkToken(mobileLinkToken);
  }, [mobileLinkToken]);

  useEffect(() => {
    if (!isNativeApp()) return;
    let cancelled = false;
    let remove: (() => void) | undefined;
    void import("@capacitor/app").then(({ App }) => {
      if (cancelled) return;
      return App.addListener("backButton", ({ canGoBack }) => {
        handleNativeAppBackButton(
          { canGoBack },
          {
            isNative: true,
            hasSpaHistory: () => getSpaHistoryDepth() > 0,
            historyBack: () => window.history.back(),
            minimizeApp: () => {
              void App.minimizeApp();
            },
          }
        );
      }).then((handle) => {
        if (cancelled) {
          void handle.remove();
          return;
        }
        remove = () => {
          void handle.remove();
        };
      });
    });
    return () => {
      cancelled = true;
      remove?.();
    };
  }, []);

  const finishMobileLinkFlow = useCallback(async () => {
    if (mobileLinkToken) {
      const session = await getAppSession();
      const staff = await loadStaffSession();
      if (session?.access || staff?.access) {
        await completeMobileWebLinkWithSession(mobileLinkToken);
      }
    }
    clearStoredMobileLinkToken();
    setMobileLinkDone(true);
  }, [mobileLinkToken]);

  useEffect(() => {
    setClientReady(true);
    setCurrentHostname(window.location.hostname);
    setPanelHost(isPanelHost(window.location.hostname));
    if (isElectronDesktop()) {
      setDesktopChromeUser({ guest: true, name: "Гость" });
    }
    setTgHostValid(isTelegramWidgetHostValid());
    setNativeMobileAuth(isNativeMobileAuth());
    setOauthBridge(
      shouldUseExternalOAuthBridge({ native: isNativeApp(), electron: isElectronDesktop() })
    );

    if (isNativeMobileAuth()) {
      void ensureNativeSocialLoginInit().catch(() => {});
    }

    if (!isNativeMobileAuth() && !isLkHost(window.location.hostname) && !isPanelHost(window.location.hostname) && !isLocalDevHost(window.location.hostname)) {
      const target = getLkAppUrl(`/app${window.location.search}`);
      if (target !== window.location.href.split("#")[0]) {
        window.location.replace(target);
      }
      return;
    }
    void resolveTelegramConfig().then((cfg) => {
      if (cfg.username) setBotUsername(cfg.username);
      if (cfg.clientId) setBotClientId(cfg.clientId);
      if (cfg.loginHost) setTgLoginHost(cfg.loginHost);
      else setTgLoginHost(getTelegramLoginHostname());
    });
    void resolveGoogleClientId().then((id) => {
      if (id) setGoogleClientId(id);
    });
    try {
      const flash = sessionStorage.getItem("minikbp_auth_flash");
      if (flash) {
        sessionStorage.removeItem("minikbp_auth_flash");
        setError(friendlyAuthError(flash));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const q = parseAppQuery(searchParams.toString());
    // Registration removed in mini-kbp-timetable fork: ?do=register / invite stay on login.
    if (q.do === "verify" && !verifyQueryApplied.current) {
      verifyQueryApplied.current = true;
      goToStep("verify");
    }
    if (q.ref) void persistReferral(q.ref);
    if (q.q) void persistRedirectQ(q.q);
    if (q.invite) {
      setCuratorCode(q.invite);
      void persistInviteCode(q.invite);
    }
  }, [searchParams]);

  const goAfterAuth = useCallback(
    (role: "student" | "teacher" | "admin") => {
      void clearGuestMode();
      if (isMobileLinkFlow) {
        void finishMobileLinkFlow();
        return;
      }
      const q = parseAppQuery(searchParams.toString()).q;
      const path = resolvePostAuthPath(role, q);
      navigatePostAuth(router, path);
    },
    [router, searchParams, isMobileLinkFlow, finishMobileLinkFlow]
  );

  const finishPending = useCallback(
    (p: AppPendingAuth) => {
      const storedInvite = peekStoredInviteCode();
      if (storedInvite) setCuratorCode(storedInvite);
      setPending(p);
      if (p.needs2fa && p.needsCuratorCode === false) {
        goToStep("verify");
        setTotpCode("");
        setCuratorCode("");
        return;
      }
      goToStep("verify");
    },
    [goToStep],
  );

  const handleContinueAsGuest = useCallback(() => {
    void enableGuestMode().then(() => {
      router.replace(NATIVE_APP_HOME);
    });
  }, [router]);

  const applyAuthSuccess = useCallback(
    (r: { role?: "student" | "teacher" | "admin"; pending?: AppPendingAuth; linkComplete?: true }) => {
      if ("linkComplete" in r && r.linkComplete) {
        void finishMobileLinkFlow();
        setChecking(false);
        return;
      }
      if ("role" in r && r.role) {
        goAfterAuth(r.role);
        return;
      }
      if ("pending" in r && r.pending) {
        finishPending(r.pending);
        setChecking(false);
      }
    },
    [goAfterAuth, finishPending, finishMobileLinkFlow]
  );

  const applyMobileAuthResult = useCallback(
    (result: MobileAuthResult) => {
      if (!result.ok) {
        if (result.error) setError(result.error);
        return;
      }
      oauthAbortRef.current?.abort();
      oauthAbortRef.current = null;
      void cancelMobileWebLinkFlow();
      setOauthWaiting(false);
      setLoading(false);
      setChecking(false);
      if ("role" in result) {
        goAfterAuth(result.role);
        return;
      }
      finishPending(result.pending);
    },
    [goAfterAuth, finishPending]
  );

  useEffect(() => {
    if (!nativeMobileAuth) return;
    return installMobileAuthDeepLinkListener(applyMobileAuthResult);
  }, [nativeMobileAuth, applyMobileAuthResult]);

  useEffect(() => {
    const payload = consumeTelegramAuthHash();
    if (!payload) return;

    setChecking(true);
    setError("");
    void (async () => {
      const r = await loginWithTelegram(payload, mobileLinkToken || undefined);
      if (!r.ok) {
        setError(r.error);
        setChecking(false);
        return;
      }
      applyAuthSuccess(r);
    })();
  }, [goAfterAuth, finishPending, applyAuthSuccess, mobileLinkToken]);

  useEffect(() => {
    (async () => {
      const q = parseAppQuery(searchParams.toString());
      if (q.verifyEmail) {
        setChecking(true);
        setError("");
        const r = await verifyRegistrationEmail({ token: q.verifyEmail, linkToken: mobileLinkToken || undefined });
        if (!r.ok) {
          setError(r.error);
          goToStep("email_verify");
          setChecking(false);
          return;
        }
        applyAuthSuccess(r);
        return;
      }

      if (isMobileLinkFlow && isNativeApp() && !(await getAppSession()) && (await getQuickLoginAvailable())) {
        await quickLogin();
      }

      const staff = await loadStaffSession();
      if (isMobileLinkFlow && (staff || (await getAppSession()))) {
        await finishMobileLinkFlow();
        setChecking(false);
        return;
      }
      if (isMobileLinkFlow) {
        setChecking(false);
        return;
      }
      if (isBundledAppShell() && (await isGuestModeActive()) && !staff && !(await getAppSession())) {
        router.replace(sanitizeRedirectPath(q.q) || NATIVE_APP_HOME);
        return;
      }
      if (authBootstrapped.current) return;
      authBootstrapped.current = true;
      const storedInvite = peekStoredInviteCode();
      if (storedInvite) setCuratorCode(storedInvite);
      if (staff) {
        const fallback = isBundledAppShell()
          ? NATIVE_APP_HOME
          : getLkAppUrl("/app?page=settings&sc=profile");
        const target = sanitizeRedirectPath(q.q) || fallback;
        router.replace(target);
        return;
      }
      const session = await getAppSession();
      if (session) {
        router.replace(
          sanitizeRedirectPath(q.q) ||
            (isBundledAppShell() ? NATIVE_APP_HOME : getLkAppUrl("/app?page=timetable"))
        );
        return;
      }
      if (isNativeApp() && (await getQuickLoginAvailable())) {
        const r = await quickLogin();
        if (r.ok) {
          router.replace(sanitizeRedirectPath(q.q) || NATIVE_APP_HOME);
          return;
        }
      }
      const p = await getPendingAuth();
      if (p) {
        setPending(p);
        goToStep("verify");
      }
      setChecking(false);
    })();
  }, [router, searchParams, goAfterAuth, finishPending, isMobileLinkFlow, mobileLinkToken, applyAuthSuccess, finishMobileLinkFlow]);

  const applyExternalOAuthResult = useCallback(
    (result: Awaited<ReturnType<typeof signInWithMobileWebLink>>) => {
      if (!result.ok) {
        if (!result.cancelled) setError(result.error);
        return;
      }
      if ("role" in result) {
        goAfterAuth(result.role);
        return;
      }
      finishPending(result.pending);
    },
    [goAfterAuth, finishPending]
  );

  const cancelOauthWaiting = useCallback(() => {
    oauthAbortRef.current?.abort();
    oauthAbortRef.current = null;
    void cancelMobileWebLinkFlow();
    setOauthWaiting(false);
    setLoading(false);
  }, []);

  const beginExternalOAuth = useCallback(
    async (kind: "google" | "telegram" | "site") => {
      if (loading || oauthWaiting) return;
      setError("");
      oauthAbortRef.current?.abort();
      const ac = new AbortController();
      oauthAbortRef.current = ac;
      setOauthWaiting(true);
      setLoading(true);
      // Paint spinner before Custom Tab / external browser covers the WebView.
      await waitForNextPaint();
      if (ac.signal.aborted) {
        setOauthWaiting(false);
        setLoading(false);
        return;
      }
      try {
        const result =
          kind === "site"
            ? await signInWithSiteNative(ac.signal)
            : await signInWithMobileWebLink(kind, ac.signal);
        applyExternalOAuthResult(result);
      } finally {
        if (oauthAbortRef.current === ac) oauthAbortRef.current = null;
        setOauthWaiting(false);
        setLoading(false);
      }
    },
    [applyExternalOAuthResult, loading, oauthWaiting]
  );

  const handleExternalOAuth = (kind: "google" | "telegram") => {
    void beginExternalOAuth(kind);
  };

  // Resume poll after remount (e.g. deep link brought app to foreground / process restart).
  const resumeStartedRef = useRef(false);
  useEffect(() => {
    if (!oauthBridge || checking || resumeStartedRef.current) return;
    let cancelled = false;
    void (async () => {
      const session = await loadMobileWebLinkSession();
      if (!session || cancelled) return;
      resumeStartedRef.current = true;
      const ac = new AbortController();
      oauthAbortRef.current = ac;
      setOauthWaiting(true);
      setLoading(true);
      const result = await resumeMobileWebLinkPoll(ac.signal);
      if (cancelled) return;
      if (result) applyExternalOAuthResult(result);
      if (oauthAbortRef.current === ac) oauthAbortRef.current = null;
      setOauthWaiting(false);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [oauthBridge, checking, applyExternalOAuthResult]);

  const handleTelegramClick = () => {
    if (oauthBridge) {
      handleExternalOAuth("telegram");
      return;
    }
    if (!botClientId || loading || !tgHostValid) return;
    setError("");
    void startTelegramOidcRedirect(botClientId).catch(() => {
      setError("Не удалось открыть вход через Telegram");
    });
  };

  const handleGoogleAuth = useCallback(
    async (response: GoogleCredentialResponse) => {
      if (!response.credential) {
        setError("Google не вернул credential");
        return;
      }
      setError("");
      setLoading(true);
      const r = await loginWithGoogle(response.credential, mobileLinkToken || undefined);
      setLoading(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if ("linkComplete" in r && r.linkComplete) {
        setMobileLinkDone(true);
        return;
      }
      if ("role" in r) {
        goAfterAuth(r.role);
        return;
      }
      if ("pending" in r) finishPending(r.pending);
    },
    [goAfterAuth, finishPending, mobileLinkToken]
  );

  useEffect(() => {
    if (!clientReady) return;
    void loadGoogleIdentityScript().catch(() => {});
  }, [clientReady]);

  const oauthBtnClass = `google-auth-button flex w-full items-center justify-center gap-3${
    isDark ? " google-auth-button--dark" : ""
  }`;

  useEffect(() => {
    if (oauthBridge || nativeMobileAuth || !clientReady || checking || !googleClientId || step !== "credentials") {
      return;
    }
    let cancelled = false;
    setGoogleMountFailed(false);
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled || !googleOverlayRef.current) return;
        void mountGoogleSignInOverlay(googleOverlayRef.current, googleClientId, (response) => {
          if (!cancelled) void handleGoogleAuth(response);
        }).catch(() => {
          if (!cancelled) setGoogleMountFailed(true);
        });
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [googleClientId, step, checking, handleGoogleAuth, clientReady, nativeMobileAuth, oauthBridge]);

  const handleSiteNativeClick = () => {
    void beginExternalOAuth("site");
  };

  const handleDevTelegram = async () => {
    setError("");
    setLoading(true);
    const r = await loginWithTelegram({
      id: Date.now(),
      first_name: "Dev",
      last_name: "User",
      username: "devuser",
      auth_date: Math.floor(Date.now() / 1000),
      hash: "dev",
    });
    setLoading(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    if ("role" in r) {
      goAfterAuth(r.role);
      return;
    }
    if ("pending" in r) finishPending(r.pending);
  };

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const r = await loginWithEmail({ email, password, linkToken: mobileLinkToken || undefined });
    setLoading(false);
    if (!r.ok) {
      if (r.needsEmailVerify) {
        setDevCodeHint(r.devCode || "");
        goToStep("email_verify");
      }
      setError(r.error);
      return;
    }
    if ("linkComplete" in r && r.linkComplete) {
      void finishMobileLinkFlow();
      return;
    }
    if ("needsEmailVerify" in r && r.needsEmailVerify) {
      const hint = "devCode" in r && typeof r.devCode === "string" ? r.devCode : "";
      setDevCodeHint(hint);
      goToStep("email_verify");
      setError("");
      return;
    }
    if ("role" in r) {
      goAfterAuth(r.role);
      return;
    }
    if ("pending" in r) finishPending(r.pending);
  };

  const handleEmailVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const r = await verifyRegistrationEmail({
      email,
      code: emailVerifyCode.trim(),
      linkToken: mobileLinkToken || undefined,
    });
    setLoading(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    if ("linkComplete" in r && r.linkComplete) {
      void finishMobileLinkFlow();
      return;
    }
    if ("role" in r) {
      goAfterAuth(r.role);
      return;
    }
    if ("pending" in r) finishPending(r.pending);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pending) return;
    setError("");
    setLoading(true);

    if (pending.needs2fa && pending.needsCuratorCode === false) {
      const r = await verifyTwoFaLogin({
        pendingToken: pending.pendingToken,
        totpCode,
        linkToken: mobileLinkToken || undefined,
      });
      setLoading(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if ("linkComplete" in r && r.linkComplete) {
        void finishMobileLinkFlow();
        return;
      }
      if ("role" in r) goAfterAuth(r.role);
      return;
    }

    const r = await verifyAccess({
      pendingToken: pending.pendingToken,
      curatorCode,
      totpCode: pending.needs2fa ? totpCode : undefined,
      linkToken: mobileLinkToken || undefined,
    });
    setLoading(false);
    if (!r.ok) {
      if (r.needs2fa && r.pendingToken) {
        setPending((p) =>
          p ? { ...p, needs2fa: true, pendingToken: r.pendingToken!, needsCuratorCode: true } : p
        );
      }
      setError(r.error);
      return;
    }
    if ("linkComplete" in r && r.linkComplete) {
      void finishMobileLinkFlow();
      return;
    }
    if ("role" in r) goAfterAuth(r.role);
  };

  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const r = await requestPasswordReset(email);
    setLoading(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    goToStep("forgot_confirm");
  };

  const handleForgotConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const r = await confirmPasswordReset({
      email,
      code: resetCode.trim(),
      password: newPassword,
      passwordConfirm: newPasswordConfirm,
    });
    setLoading(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    goToStep("credentials");
    setPassword(newPassword);
    setNewPassword("");
    setNewPasswordConfirm("");
    setResetCode("");
    setDevCodeHint("");
    setError("");
  };

  const isTwoFaOnly = Boolean(pending?.needs2fa && pending?.needsCuratorCode === false);

  const inputClass = `w-full min-w-0 overflow-hidden text-ellipsis rounded-xl border-0 py-3.5 pl-11 pr-4 text-[15px] outline-none transition focus:ring-2 focus:ring-[#3390ec]/30 ${
    isDark
      ? "bg-zinc-800 text-zinc-100 placeholder:text-zinc-500"
      : "bg-[#f0f0f0] text-gray-900 placeholder:text-gray-400"
  }`;

  const codeInputClass = `w-full min-w-0 overflow-hidden text-ellipsis rounded-xl border-0 py-3.5 pl-11 pr-4 text-[15px] font-normal tracking-normal outline-none transition focus:ring-2 focus:ring-[#3390ec]/30 ${
    isDark
      ? "bg-zinc-800 text-zinc-100 placeholder:text-zinc-500"
      : "bg-[#f0f0f0] text-gray-900 placeholder:text-gray-400"
  }`;

  const btnPrimary =
    "rounded-xl bg-[#3390ec] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#2d7fd6] disabled:opacity-50";

  if (mobileLinkDone) {
    return <MobileAuthReturnPolling kind="site" />;
  }

  if (checking) {
    return (
      <div className={`safe-top flex min-h-dvh items-center justify-center ${isDark ? "bg-zinc-950" : "bg-white"}`}>
        <div className={`text-sm ${isDark ? "text-zinc-400" : "text-gray-500"}`}>Загрузка…</div>
      </div>
    );
  }

  if (oauthWaiting) {
    return <AuthWaitingScreen theme={theme} onBack={cancelOauthWaiting} />;
  }

  const authStepKey = step === "credentials" ? `credentials:${credentialsView}` : step;

  const authStepBody = (
    <>
        {step === "credentials" && credentialsView === "qr_login" ? (
          <AppQrLoginPanel
            isDark={isDark}
            onBack={() => {
              goCredentialsView("form");
              setError("");
            }}
            onSuccess={(r) => {
              goCredentialsView("form");
              if ("role" in r) applyAuthSuccess({ role: r.role });
              else applyAuthSuccess({ pending: r.pending });
            }}
            onError={(msg) => setError(msg)}
          />
        ) : step === "credentials" ? (
          <>
            <div className="mb-8">
              <h1 className="text-3xl font-bold tracking-tight">
                {panelHost ? "Вход в панель" : "Вход"}
              </h1>
              {isMobileLinkFlow ? (
                <p className={`mt-3 rounded-xl px-4 py-3 text-sm ${isDark ? "bg-zinc-900 text-zinc-300" : "bg-blue-50 text-blue-800"}`}>
                  Вы входите в приложение MiniKBP. После входа вернитесь в приложение.
                </p>
              ) : null}
              {panelHost ? (
                <p className={`mt-2 text-sm ${isDark ? "text-zinc-400" : "text-gray-500"}`}>
                  Только для администраторов и преподавателей.
                </p>
              ) : (
                <p className={`mt-2 text-sm ${isDark ? "text-zinc-400" : "text-gray-500"}`}>
                  Войдите в существующий аккаунт.
                </p>
              )}
            </div>

            <form onSubmit={handleCredentials} className="space-y-3">
              <InputField icon={<MailIcon isDark={isDark} />}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Электронная почта"
                  className={inputClass}
                  required
                  autoComplete="email"
                  autoFocus
                />
              </InputField>
              <InputField icon={<LockIcon isDark={isDark} />}>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Пароль"
                  className={inputClass}
                  required
                  autoComplete="current-password"
                />
              </InputField>

              {error ? (
                <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{friendlyAuthError(error)}</p>
              ) : null}
              {qrScanOk ? (
                <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{qrScanOk}</p>
              ) : null}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    goToStep("forgot");
                    setError("");
                    setResetCode("");
                    setNewPassword("");
                    setNewPasswordConfirm("");
                  }}
                  className={`text-sm ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-gray-400 hover:text-gray-600"}`}
                >
                  Забыли пароль?
                </button>
                <button type="submit" disabled={loading} className={btnPrimary}>
                  {loading ? <SpinnerIcon /> : "Войти"}
                </button>
              </div>
            </form>

              {shellGuest && credentialsView === "form" ? (
                <button
                  type="button"
                  onClick={handleContinueAsGuest}
                  disabled={loading}
                  className={`mt-4 w-full rounded-2xl px-4 py-3.5 text-base font-semibold transition ${
                    isDark
                      ? "bg-zinc-100 text-zinc-900 hover:bg-white"
                      : "bg-[#3390ec] text-white hover:bg-[#2b7fd4]"
                  }`}
                >
                  Открыть расписание без входа
                </button>
              ) : null}

            <div className="my-8 flex items-center gap-4">
              <div className={`h-px flex-1 ${isDark ? "bg-zinc-800" : "bg-gray-200"}`} />
              <span className={`text-sm ${isDark ? "text-zinc-500" : "text-gray-400"}`}>или</span>
              <div className={`h-px flex-1 ${isDark ? "bg-zinc-800" : "bg-gray-200"}`} />
            </div>

            <div className="flex flex-col gap-4">
              {clientReady && loginButtons.qrLogin ? (
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    goCredentialsView("qr_login");
                  }}
                  disabled={loading}
                  className={oauthBtnClass}
                >
                  <QrCodeIcon />
                  Войти по QR-коду
                </button>
              ) : null}

              {clientReady && loginButtons.qrScan ? (
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setQrScanOk("");
                    goCredentialsView("qr_scan");
                  }}
                  disabled={loading}
                  className={oauthBtnClass}
                >
                  <QrCodeIcon />
                  Сканировать QR-код
                </button>
              ) : null}

              {clientReady && loginButtons.telegram && oauthBridge && botClientId ? (
                <button
                  type="button"
                  onClick={() => handleExternalOAuth("telegram")}
                  disabled={loading}
                  className={oauthBtnClass}
                >
                  <TelegramIcon />
                  Войти через Telegram
                </button>
              ) : clientReady && loginButtons.telegram && botClientId && !tgHostValid ? (
                <div
                  className={`rounded-2xl border px-4 py-4 text-center ${
                    isDark ? "border-zinc-800 bg-zinc-900" : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <p className={`text-sm ${isDark ? "text-zinc-300" : "text-gray-700"}`}>
                    Вход через Telegram работает только на{" "}
                    <span className="font-medium">{tgLoginHost}</span>
                    {currentHostname ? ` (сейчас: ${currentHostname})` : ""}
                  </p>
                  <a
                    href={telegramLoginAppUrl("/app")}
                    className={`${oauthBtnClass} mt-3`}
                  >
                    <TelegramIcon />
                    Открыть {tgLoginHost}
                  </a>
                </div>
              ) : clientReady && loginButtons.telegram && botClientId && tgHostValid ? (
                <button
                  type="button"
                  onClick={handleTelegramClick}
                  disabled={loading}
                  className={oauthBtnClass}
                >
                  <TelegramIcon />
                  Войти через Telegram
                </button>
              ) : clientReady && loginButtons.telegram && botClientId ? (
                <button
                  type="button"
                  onClick={handleTelegramClick}
                  disabled={loading}
                  className={oauthBtnClass}
                >
                  <TelegramIcon />
                  Войти через Telegram
                </button>
              ) : clientReady &&
                loginButtons.telegram &&
                (process.env.NODE_ENV !== "production" ||
                  process.env.NEXT_PUBLIC_APP_AUTH_ALLOW_DEV_TELEGRAM === "1" ||
                  process.env.APP_AUTH_ALLOW_DEV_TELEGRAM === "1") ? (
                <button
                  type="button"
                  onClick={handleDevTelegram}
                  disabled={loading}
                  className={oauthBtnClass}
                >
                  <TelegramIcon />
                  Войти через Telegram (dev)
                </button>
              ) : null}

              {clientReady && loginButtons.google && oauthBridge && googleClientId ? (
                <button
                  type="button"
                  onClick={() => handleExternalOAuth("google")}
                  disabled={loading}
                  className={oauthBtnClass}
                >
                  <GoogleIcon />
                  Войти через Google
                </button>
              ) : clientReady && loginButtons.google && googleClientId && !nativeMobileAuth ? (
                <>
                  <div className={`google-auth-overlay${isDark ? " google-auth-overlay--dark" : ""}`}>
                    <div className="google-auth-button google-auth-button--visual" aria-hidden="true">
                      <GoogleIcon />
                      Войти через Google
                    </div>
                    <div ref={googleOverlayRef} className="google-auth-overlay__hit" />
                  </div>
                  {googleMountFailed ? (
                    <p className={`text-center text-xs ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                      Не удалось загрузить кнопку Google. Обновите страницу.
                    </p>
                  ) : null}
                </>
              ) : null}

              {clientReady && loginButtons.siteNative ? (
                <button
                  type="button"
                  onClick={handleSiteNativeClick}
                  disabled={loading}
                  className={oauthBtnClass}
                >
                  <GlobeIcon />
                  Войти используя сайт
                </button>
              ) : null}

            </div>
          </>
        ) : step === "forgot" || step === "forgot_confirm" ? (
          <>
            <div className="mb-8">
              <button
                type="button"
                onClick={handleAuthBack}
                className={`relative z-20 mb-4 inline-flex items-center gap-1.5 text-sm ${
                  isDark ? "text-zinc-400 hover:text-zinc-200" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <ChevronLeftIcon />
                Назад
              </button>
              <h1 className="text-3xl font-bold tracking-tight">
                {step === "forgot" ? "Сброс пароля" : "Новый пароль"}
              </h1>
            </div>
            <form
              onSubmit={step === "forgot" ? handleForgotRequest : handleForgotConfirm}
              className="space-y-3"
            >
              {step === "forgot" ? (
                <InputField icon={<MailIcon isDark={isDark} />}>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Электронная почта"
                    className={inputClass}
                    required
                    autoFocus
                  />
                </InputField>
              ) : (
                <>
                  <InputField icon={<MailIcon isDark={isDark} />}>
                    <input
                      type="text"
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="Код из письма"
                      className={codeInputClass}
                      required
                      autoFocus
                      maxLength={6}
                      inputMode="numeric"
                    />
                  </InputField>
                  <InputField icon={<LockIcon isDark={isDark} />}>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Новый пароль"
                      className={inputClass}
                      required
                    />
                  </InputField>
                  <InputField icon={<LockIcon isDark={isDark} />}>
                    <input
                      type="password"
                      value={newPasswordConfirm}
                      onChange={(e) => setNewPasswordConfirm(e.target.value)}
                      placeholder="Повторите пароль"
                      className={inputClass}
                      required
                    />
                  </InputField>
                </>
              )}
              {error ? (
                <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{friendlyAuthError(error)}</p>
              ) : null}
              <button type="submit" disabled={loading} className={`${btnPrimary} mt-4 w-full`}>
                {loading ? "…" : step === "forgot" ? "Отправить код" : "Сохранить пароль"}
              </button>
            </form>
          </>
        ) : step === "email_verify" ? (
          <>
            <div className="mb-8">
              <button
                type="button"
                onClick={handleAuthBack}
                className={`relative z-20 mb-4 inline-flex items-center gap-1.5 text-sm ${
                  isDark ? "text-zinc-400 hover:text-zinc-200" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <ChevronLeftIcon />
                Назад
              </button>
              <h1 className="text-3xl font-bold tracking-tight">Подтвердите почту</h1>
              <p className={`mt-2 text-sm ${isDark ? "text-zinc-400" : "text-gray-500"}`}>
                Мы отправили письмо на <span className="font-medium">{email}</span>. Нажмите кнопку в письме или
                введите код ниже.
              </p>
              {devCodeHint ? (
                <p className={`mt-2 text-xs ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                  Dev-код: {devCodeHint}
                </p>
              ) : null}
            </div>

            <form onSubmit={handleEmailVerify} className="space-y-3">
              <InputField icon={<MailIcon isDark={isDark} />}>
                <input
                  type="text"
                  value={emailVerifyCode}
                  onChange={(e) => setEmailVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="Код из письма"
                  className={codeInputClass}
                  required
                  autoFocus
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
              </InputField>

              {error ? (
                <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{friendlyAuthError(error)}</p>
              ) : null}

              <button
                type="submit"
                disabled={loading || emailVerifyCode.length < 6}
                className={`${btnPrimary} mt-4 flex w-full items-center justify-center gap-2`}
              >
                {loading ? <SpinnerIcon /> : null}
                {loading ? "Проверяем…" : "Подтвердить"}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="mb-8">
              <button
                type="button"
                onClick={handleAuthBack}
                className={`relative z-20 mb-4 inline-flex items-center gap-1.5 text-sm ${
                  isDark ? "text-zinc-400 hover:text-zinc-200" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <ChevronLeftIcon />
                Назад
              </button>
              <h1 className="text-3xl font-bold tracking-tight">
                {isTwoFaOnly ? "Двухфакторная аутентификация" : inviteStepCopy().title}
              </h1>
              {isTwoFaOnly ? (
                <p className={`mt-2 text-sm ${isDark ? "text-zinc-400" : "text-gray-500"}`}>
                  Введите 6-значный код из приложения-аутентификатора.
                </p>
              ) : (
                <p className={`mt-2 text-sm ${isDark ? "text-zinc-400" : "text-gray-500"}`}>
                  {inviteStepCopy().body}
                </p>
              )}
            </div>

            <form onSubmit={handleVerify} className="space-y-3">
              {!isTwoFaOnly ? (
                <InputField icon={<KeyIcon isDark={isDark} />}>
                  <input
                    type="text"
                    value={curatorCode}
                    onChange={(e) => setCuratorCode(e.target.value.replace(/\s/g, "").toUpperCase())}
                    placeholder={inviteStepCopy().placeholder}
                    className={codeInputClass}
                    required
                    autoFocus
                    maxLength={8}
                    inputMode="text"
                    autoComplete="off"
                    spellCheck={false}
                    autoCapitalize="characters"
                  />
                </InputField>
              ) : null}

              {pending?.needs2fa ? (
                <InputField icon={<ShieldIcon isDark={isDark} />}>
                  <input
                    type="text"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="Код аутентификатора"
                    className={codeInputClass}
                    required
                    autoFocus={isTwoFaOnly}
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                </InputField>
              ) : null}

              {error ? (
                <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{friendlyAuthError(error)}</p>
              ) : null}

              <button
                type="submit"
                disabled={loading || (isTwoFaOnly ? totpCode.length < 6 : !curatorCode)}
                className={`${btnPrimary} mt-4 flex w-full items-center justify-center gap-2`}
              >
                {loading ? <SpinnerIcon /> : null}
                {loading ? "Проверяем…" : "Подтвердить"}
              </button>
            </form>
          </>
        )}
    </>
  );

  return (
    <div
      className={`safe-top safe-px flex min-h-dvh flex-col ${isDark ? "bg-zinc-950 text-zinc-100" : "bg-white text-gray-900"}`}
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-10">
        {nativeAuthSlide ? (
          <AuthStepSlide stepKey={authStepKey} direction={slideDir}>
            {authStepBody}
          </AuthStepSlide>
        ) : (
          authStepBody
        )}
      </div>

      {step === "credentials" && credentialsView === "qr_scan" ? (
        <AppQrScanner
          isDark={isDark}
          fullscreen
          onBack={() => {
            goCredentialsView("form");
            setError("");
            setQrScanOk("");
          }}
          onSuccess={() => {
            setQrScanOk("Вход на другом устройстве подтверждён");
            goCredentialsView("form");
          }}
          onError={(msg) => setError(msg)}
        />
      ) : null}
    </div>
  );
}

function InputField({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <AppInputField icon={icon}>{children}</AppInputField>;
}

function MailIcon({ isDark }: { isDark: boolean }) {
  return (
    <svg className={`h-5 w-5 ${isDark ? "text-zinc-500" : "text-gray-400"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function LockIcon({ isDark }: { isDark: boolean }) {
  return (
    <svg className={`h-5 w-5 ${isDark ? "text-zinc-500" : "text-gray-400"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}

function KeyIcon({ isDark }: { isDark: boolean }) {
  return (
    <svg className={`h-5 w-5 ${isDark ? "text-zinc-500" : "text-gray-400"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  );
}

function ShieldIcon({ isDark }: { isDark: boolean }) {
  return (
    <svg className={`h-5 w-5 ${isDark ? "text-zinc-500" : "text-gray-400"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}
