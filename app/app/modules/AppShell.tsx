"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { isNativeApp } from "@/lib/client/platform";
import { getAppSession } from "@/lib/client/appAuth";
import { themeAppShell, themeIsDark, themePageBg, applyAppThemeToDocument, type AppTheme } from "@/lib/client/appTheme";
import {
  getGroups,
  fetchTimetable,
  clearStudentSession,
  getStudentSession,
  type Group,
} from "@/lib/client/kbpApi";
import {
  loadTimetableArchive,
  upsertTimetableArchive,
  timetableArchiveId,
} from "@/lib/client/offlineArchive";
import { getWeekArchiveById } from "@/lib/client/weekArchive";
import { setNativeAllowRotation } from "@/lib/client/appOrientation";
import {
  accentHex,
  applyAccentToDocument,
  DEFAULT_ACCENT,
  isAccentId,
  type AccentId,
} from "@/lib/client/accentColor";
import { normalizeTimetableData } from "@/lib/client/timetableDisplay";
import { mergeTimetableWithOverlay } from "@/lib/client/timetableOverlay";
import {
  TIMETABLE_QUERY_STORAGE_KEY,
  buildTimetableSearchParams,
  cachedTimetableMatchesQuery,
  isTimetableQueryNavigable,
  matchTimetableEntityId,
  parseTimetableQuery,
  preferTimetableQuery,
  timetableQueryKey,
  type TimetableQuery,
  type TimetableEntityType,
} from "@/lib/client/timetableQuery";
import { fetchTimetableByCategory, listTimetableEntities, type SearchResult } from "@/lib/client/searchApi";
import { storageGet, storageGetObject, storageRemove, storageSet, storageSetObject } from "@/lib/client/storage";
import {
  getKbpGroupId,
  setKbpGroupId,
  KBP_LOGIN_DATA_KEY,
  KBP_GROUP_ID_KEY,
} from "@/lib/client/kbpStorageKeys";
import { requestNotificationPermissions, scheduleQuickSyncOnClose } from "@/lib/client/notifications";
import { getPushBackendUrl } from "@/lib/client/pushBackend";
import { deactivatePushOnBackend, ensurePushRegisteredOnServer, setupRemotePushNotifications, syncPushSubscriptionSettings } from "@/lib/client/pushRegister";
import { performBackgroundSync, setupBackgroundSync, shouldPerformSync } from "@/lib/client/backgroundSync";
import { probeServerReachable } from "@/lib/client/serverReachability";
import { getServerUrl } from "@/lib/client/serverUrl";
import { getPanelAppUrl, getLkAppUrl } from "@/lib/client/lkAppUrl";
import AppNav from "@/app/components/app/AppNav";
import AppOfflineBanner from "@/app/components/app/AppOfflineBanner";
import {
  APP_TAB_PROFILE,
  APP_TAB_SETTINGS,
  APP_TAB_STORAGE_KEY,
  APP_TAB_TIMETABLE,
  isAppTabId,
  type AppSettingsScreen,
} from "@/lib/client/appTabs";
import {
  appPageFromTab,
  appRouteHref,
  buildAppRouteSearchParams,
  parseAppPage,
  parseSettingsCategory,
  tabFromAppPage,
} from "@/lib/client/appRouteQuery";
import { handleNativeAppBackButton } from "@/lib/client/nativeBackButton";
import { getSpaHistoryDepth, noteSpaHistoryPop, noteSpaHistoryPush } from "@/lib/client/spaHistoryDepth";
import { loadStaffSession, type StaffSession } from "@/lib/client/miniKbpServer";
import { beginLoading, endLoading } from "@/lib/client/loadingOrchestrator";
import type { SettingsViewProps } from "./SettingsView";

const SettingsTab = dynamic(() => import("./tabs/SettingsTab"));
const TimetableTab = dynamic(() => import("./tabs/TimetableTab"));


function normalizeEntityName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[.,_()\-]/g, "")
    .trim();
}

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

export default function AppShell({ onBootReady }: { onBootReady?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ttUrlSkipRef = useRef<string | null>(null);
  const skipTtNetworkRef = useRef<string | null>(null);
  const selectedResultRef = useRef<SearchResult | null>(null);
  const ttPreferredQueryRef = useRef<TimetableQuery | null>(null);
  const [bootTimetableQuery, setBootTimetableQuery] = useState<TimetableQuery | null>(null);
  const [currentPage, setCurrentPage] = useState(APP_TAB_TIMETABLE);
  const [settingsScreen, setSettingsScreen] = useState<AppSettingsScreen>("hub");
  const [mountedTabs, setMountedTabs] = useState(() => new Set<number>([APP_TAB_TIMETABLE]));
  const routeWriteRef = useRef(false);

  useEffect(() => {
    setMountedTabs((prev) => {
      if (prev.has(currentPage)) return prev;
      const next = new Set(prev);
      next.add(currentPage);
      return next;
    });
  }, [currentPage]);

  const writeAppRoute = useCallback(
    (
      patch: Parameters<typeof buildAppRouteSearchParams>[1],
      opts?: { replace?: boolean }
    ) => {
      const href = appRouteHref(pathname, searchParams, patch);
      const current = searchParams.toString()
        ? `${pathname}?${searchParams.toString()}`
        : pathname;
      if (href === current) return;
      routeWriteRef.current = true;
      if (opts?.replace) {
        router.replace(href, { scroll: false });
      } else {
        noteSpaHistoryPush();
        router.push(href, { scroll: false });
      }
    },
    [pathname, router, searchParams]
  );

  const navigateAppTab = useCallback(
    (tab: number, opts?: { replace?: boolean }) => {
      const page = appPageFromTab(tab);
      if (!page) return;
      setCurrentPage(tab);
      setSettingsScreen("hub");
      writeAppRoute({ page, sc: null }, opts);
    },
    [writeAppRoute]
  );

  const navigateSettingsScreen = useCallback(
    (screen: AppSettingsScreen) => {
      // Sub-screen "Назад" → hub via replace (predictable; no wrong history.back).
      if (screen === "hub" && settingsScreen !== "hub") {
        setCurrentPage(APP_TAB_SETTINGS);
        setSettingsScreen("hub");
        writeAppRoute({ page: "settings", sc: null }, { replace: true });
        return;
      }
      setCurrentPage(APP_TAB_SETTINGS);
      setSettingsScreen(screen);
      writeAppRoute({ page: "settings", sc: screen === "hub" ? null : screen });
    },
    [settingsScreen, writeAppRoute]
  );

  useEffect(() => {
    try {
      const search = typeof window !== "undefined" ? window.location.search : "";
      const page = parseAppPage(search);
      if (page) {
        setCurrentPage(tabFromAppPage(page));
        setSettingsScreen(page === "settings" ? parseSettingsCategory(search) ?? "hub" : "hub");
        sessionStorage.removeItem(APP_TAB_STORAGE_KEY);
        return;
      }
      const fromUrl = parseTimetableQuery(search);
      if (isTimetableQueryNavigable(fromUrl)) {
        setCurrentPage(APP_TAB_TIMETABLE);
        sessionStorage.removeItem(APP_TAB_STORAGE_KEY);
        return;
      }
      const savedTab = sessionStorage.getItem(APP_TAB_STORAGE_KEY);
      if (savedTab !== null) {
        const n = Number(savedTab);
        if (n === APP_TAB_PROFILE) setCurrentPage(APP_TAB_SETTINGS);
        else if (isAppTabId(n)) setCurrentPage(n);
        sessionStorage.removeItem(APP_TAB_STORAGE_KEY);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!isNativeApp()) return;
    let cancelled = false;
    let remove: (() => void) | undefined;
    const onPopState = () => noteSpaHistoryPop();
    window.addEventListener("popstate", onPopState);
    void import("@capacitor/app").then(({ App }) => {
      if (cancelled) return;
      return App.addListener("backButton", ({ canGoBack }) => {
        handleNativeAppBackButton(
          { canGoBack },
          {
            isNative: true,
            tryInAppBack: () => {
              if (currentPage === APP_TAB_SETTINGS && settingsScreen !== "hub") {
                setSettingsScreen("hub");
                writeAppRoute({ page: "settings", sc: null }, { replace: true });
                return true;
              }
              return false;
            },
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
      window.removeEventListener("popstate", onPopState);
      remove?.();
    };
  }, [currentPage, settingsScreen, writeAppRoute]);

  // App settings
  const [theme, setTheme] = useState<AppTheme>("light");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notifyTimetable, setNotifyTimetable] = useState(true);
  const [pushBackendUrl, setPushBackendUrl] = useState("");
  const [countdownToLesson, setCountdownToLesson] = useState(false);
  const [showReplacementsByDefault, setShowReplacementsByDefault] = useState(true);
  const [timetableDensity, setTimetableDensity] = useState<"normal" | "compact" | "small">("normal");
  const [timetableHideTeacherRoom, setTimetableHideTeacherRoom] = useState(false);
  const [timetableShowGroup, setTimetableShowGroup] = useState(true);
  const [timetableShowTeacher, setTimetableShowTeacher] = useState(true);
  const [timetableShowRoom, setTimetableShowRoom] = useState(true);
  const [allowRotation, setAllowRotation] = useState(false);
  const [timetableHidePairNumbers, setTimetableHidePairNumbers] = useState(false);
  const [timetableDayStrip, setTimetableDayStrip] = useState(true);
  const [timetablePcSidePad, setTimetablePcSidePad] = useState(true);
  const [timetableShowGrades, setTimetableShowGrades] = useState(false);
  const [accentColor, setAccentColor] = useState<AccentId>(DEFAULT_ACCENT);
  const [archiveViewLabel, setArchiveViewLabel] = useState<string | null>(null);
  const [archiveWeekPage, setArchiveWeekPage] = useState<0 | 1 | null>(null);
  const [settingsHydrated, setSettingsHydrated] = useState(false);

  const isDark = themeIsDark(theme);

  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [groupsNotice, setGroupsNotice] = useState("");
  const [error, setError] = useState("");
  const [kbpNotice, setKbpNotice] = useState("");
  const [serverOffline, setServerOffline] = useState(false);
  const [checkingSavedData, setCheckingSavedData] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Timetable states
  const [selectedTimetable, setSelectedTimetable] = useState<any>(null);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  selectedResultRef.current = selectedResult;

  const applyTimetableData = useCallback((data: any, result?: SearchResult | null) => {
    const base = normalizeTimetableData(data);
    setSelectedTimetable(base);
    const ent = result ?? selectedResultRef.current;
    void mergeTimetableWithOverlay(
      base,
      ent
        ? {
            type: ent.type as "group" | "teacher" | "place" | "subject",
            id: String(ent.id),
            name: ent.name,
          }
        : null
    ).then((merged) => {
      if (merged) setSelectedTimetable(merged);
    });
  }, []);
  const [isRefreshingTimetable, setIsRefreshingTimetable] = useState(false);
  // false until an actual timetable fetch starts — true by default left the tab
  // stuck on skeleton when nothing was selected yet (guest / no cache / no group).
  const [timetableAwaitingFetch, setTimetableAwaitingFetch] = useState(false);
  const [staffSession, setStaffSession] = useState<StaffSession | null>(null);

  const nativeShell = isNativeApp();
  const isStaff = Boolean(staffSession && (staffSession.role === "teacher" || staffSession.role === "admin"));

  useEffect(() => {
    try {
      const url = getServerUrl();
      if (url) setPushBackendUrl(url.replace(/\/$/, ""));
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      const staff = await loadStaffSession();
      setStaffSession(staff);
      // Timetable fork: no login gate — open shell for everyone.
    })();
  }, []);



  // Check saved login data
  useEffect(() => {
    const checkSavedData = async () => {
      if (Capacitor.isNativePlatform()) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      try {
        const [
          savedTimetable,
          savedSelectedResult,
          savedGroupId,
          savedSettings,
        ] = await Promise.all([
          storageGet("cached_timetable_data"),
          storageGet("cached_selected_timetable_result"),
          getKbpGroupId(),
          storageGet("app_settings_v1"),
        ]);

        if (savedSettings) {
          try {
            const s = JSON.parse(savedSettings);
            if (s?.theme === "light" || s?.theme === "dark" || s?.theme === "oled") setTheme(s.theme);
            else if (s?.isDark) setTheme("dark");
            if (typeof s?.notificationsEnabled === "boolean") setNotificationsEnabled(s.notificationsEnabled);
            if (typeof s?.notifyTimetable === "boolean") setNotifyTimetable(s.notifyTimetable);
            if (typeof s?.countdownToLesson === "boolean") setCountdownToLesson(s.countdownToLesson);
            if (typeof s?.showReplacementsByDefault === "boolean") setShowReplacementsByDefault(s.showReplacementsByDefault);
            if (s?.timetableDensity === "normal" || s?.timetableDensity === "compact" || s?.timetableDensity === "small") {
              setTimetableDensity(s.timetableDensity);
            }
            if (typeof s?.timetableHideTeacherRoom === "boolean") setTimetableHideTeacherRoom(s.timetableHideTeacherRoom);
            if (typeof s?.timetableShowGroup === "boolean") setTimetableShowGroup(s.timetableShowGroup);
            if (typeof s?.timetableShowTeacher === "boolean") setTimetableShowTeacher(s.timetableShowTeacher);
            else if (s?.timetableHideTeacherRoom === true) setTimetableShowTeacher(false);
            if (typeof s?.timetableShowRoom === "boolean") setTimetableShowRoom(s.timetableShowRoom);
            else if (s?.timetableHideTeacherRoom === true) setTimetableShowRoom(false);
            if (typeof s?.allowRotation === "boolean") setAllowRotation(s.allowRotation);
            if (typeof s?.timetableHidePairNumbers === "boolean") setTimetableHidePairNumbers(s.timetableHidePairNumbers);
            if (typeof s?.timetableDayStrip === "boolean") setTimetableDayStrip(s.timetableDayStrip);
            if (typeof s?.timetablePcSidePad === "boolean") setTimetablePcSidePad(s.timetablePcSidePad);
            if (typeof s?.timetableShowGrades === "boolean") setTimetableShowGrades(s.timetableShowGrades);
            if (typeof s?.accentColor === "string" && isAccentId(s.accentColor)) {
              setAccentColor(s.accentColor);
              applyAccentToDocument(accentHex(s.accentColor));
            }
            if (typeof s?.pushBackendUrl === "string") setPushBackendUrl(s.pushBackendUrl);
            else if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_PUSH_BACKEND_URL) {
              setPushBackendUrl(String(process.env.NEXT_PUBLIC_PUSH_BACKEND_URL).trim());
            }
          } catch {}
        }

        const fromUrl = parseTimetableQuery(typeof window !== "undefined" ? window.location.search : "");
        const storedQuery = await storageGetObject<TimetableQuery>(TIMETABLE_QUERY_STORAGE_KEY);
        const preferred = preferTimetableQuery(fromUrl, storedQuery);
        ttPreferredQueryRef.current = isTimetableQueryNavigable(preferred) ? preferred : null;
        if (isTimetableQueryNavigable(preferred)) {
          setBootTimetableQuery(preferred);
          if (!parseAppPage(typeof window !== "undefined" ? window.location.search : "")) {
            setCurrentPage(APP_TAB_TIMETABLE);
          }
        }

        if (savedTimetable && savedSelectedResult) {
          try {
            const parsedTt = JSON.parse(savedTimetable);
            const cachedSelected = JSON.parse(savedSelectedResult) as SearchResult;

            if (cachedTimetableMatchesQuery(cachedSelected, preferred)) {
              applyTimetableData(parsedTt);
              setSelectedResult(cachedSelected);
            }
          } catch {}
        } else if (savedTimetable) {
          try {
            const parsedTt = JSON.parse(savedTimetable);
            const cachedSelected = JSON.parse(savedSelectedResult || "null") as SearchResult | null;

            if (cachedSelected && cachedTimetableMatchesQuery(cachedSelected, preferred)) {
              applyTimetableData(parsedTt);
              setSelectedResult(cachedSelected);
            }
          } catch {}
        }
        const timetableArchive = await loadTimetableArchive();
        const preferredTt = ttPreferredQueryRef.current;
        if (timetableArchive.length > 0 && !savedTimetable && !savedSelectedResult && !preferredTt) {
          const latest = timetableArchive[0];
          applyTimetableData(latest.data);
          setSelectedResult(latest.result);
        }

        const appSession = await getAppSession();
        const session = await getStudentSession();
        if (appSession || session) {
          setIsLoggedIn(true);

          const timetableGroupId = savedGroupId || session?.groupId || appSession?.groupId;
          const preferredNavigable = isTimetableQueryNavigable(ttPreferredQueryRef.current ?? {});
          const needsTimetableFetch =
            !savedTimetable && Boolean(timetableGroupId) && !preferredNavigable;

          if (needsTimetableFetch) {
            setTimetableAwaitingFetch(true);
          } else {
            setTimetableAwaitingFetch(false);
          }

          if (needsTimetableFetch && timetableGroupId) {
            void (async () => {
              try {
                const tr = await fetchTimetable(String(timetableGroupId));
                if (tr.success && tr.data) {
                  applyTimetableData(tr.data);
                  if (tr.fromCache && !(await probeServerReachable())) {
                    setServerOffline(true);
                  }
                }
              } catch (err) {
                console.warn("Timetable preload skipped:", err);
              } finally {
                setTimetableAwaitingFetch(false);
              }
            })();
          }

          setSettingsHydrated(true);
          setCheckingSavedData(false);
        } else {
          setTimetableAwaitingFetch(false);
          setSettingsHydrated(true);
          setCheckingSavedData(false);
        }
      } catch (err) {
        console.error("Error checking saved data:", err);
        setTimetableAwaitingFetch(false);
        setSettingsHydrated(true);
        setCheckingSavedData(false);
      }
    };

    checkSavedData();
  }, []);


  useEffect(() => {
    applyAppThemeToDocument(theme);
    applyAccentToDocument(accentHex(accentColor));
    if (settingsHydrated) {
      storageSet(
        "app_settings_v1",
        JSON.stringify({
          theme,
          accentColor,
          notificationsEnabled,
          notifyTimetable,
          countdownToLesson,
          showReplacementsByDefault,
          timetableDensity,
          timetableHideTeacherRoom,
          timetableShowGroup,
          timetableShowTeacher,
          timetableShowRoom,
          allowRotation,
          timetableHidePairNumbers,
          timetableDayStrip,
          timetablePcSidePad,
          timetableShowGrades,
          pushBackendUrl,
        })
      );
      try {
        window.dispatchEvent(new Event("minikbp-settings-changed"));
      } catch {}
    }
  }, [
    theme,
    accentColor,
    notificationsEnabled,
    notifyTimetable,
    pushBackendUrl,
    countdownToLesson,
    showReplacementsByDefault,
    timetableDensity,
    timetableHideTeacherRoom,
    timetableShowGroup,
    timetableShowTeacher,
    timetableShowRoom,
    allowRotation,
    timetableHidePairNumbers,
    timetableDayStrip,
    timetablePcSidePad,
    timetableShowGrades,
    settingsHydrated,
  ]);

  useEffect(() => {
    if (checkingSavedData) return;
    if (timetableAwaitingFetch) return;
    onBootReady?.();
  }, [checkingSavedData, timetableAwaitingFetch, onBootReady]);






  // Fetch groups
  useEffect(() => {
    const fetchGroupsData = async () => {
      try {
        const list = await getGroups();
        setGroups(list || []);
        // Пустой список нормален без JWT (/v0/public/groups/ требует auth) — не считаем degraded.
        setGroupsNotice("");
      } catch (err) {
        console.error("Error fetching groups:", err);
        const message = String(err);
        if (message.includes("KBP_403")) {
          setGroupsNotice("Ошибка со стороны kbp.by (403). Используем локальные данные, если они есть.");
          setKbpNotice("Ошибка со стороны kbp.by (403). Показаны локальные данные.");
        } else {
          setGroupsNotice("Не удалось получить группы. Используем локальные данные, если они есть.");
        }
      } finally {
        setLoadingGroups(false);
      }
    };
    fetchGroupsData();
  }, []);


  const persistTimetableSnapshot = async (result: SearchResult, data: any) => {
    const normalized = normalizeTimetableData(data);
    await upsertTimetableArchive({
      id: timetableArchiveId(result.type, result.id),
      result,
      data: normalized,
      savedAt: Date.now(),
    });
  };

  const persistTimetableQuery = useCallback(async (query: TimetableQuery) => {
    if (!isTimetableQueryNavigable(query)) return;
    await storageSetObject(TIMETABLE_QUERY_STORAGE_KEY, {
      type: query.type,
      id: query.id,
      name: query.name,
    });
  }, []);

  const pushTimetableQuery = useCallback(
    (result: SearchResult) => {
      if (!result.type || !result.id) return;
      const key = timetableQueryKey(result.type, result.id);
      ttUrlSkipRef.current = key;
      const query = {
        type: result.type as TimetableEntityType,
        id: result.id,
        name: result.name,
      };
      void persistTimetableQuery(query);
      const next = buildTimetableSearchParams(searchParams, query);
      noteSpaHistoryPush();
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, persistTimetableQuery, router, searchParams]
  );

  const clearTimetableQuery = useCallback(() => {
    ttUrlSkipRef.current = "__cleared__";
    const next = buildTimetableSearchParams(searchParams, {});
    const qs = next.toString();
    noteSpaHistoryPush();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const lastRequestIdRef = useRef<number>(0);

  const applyTimetableFromQuery = useCallback(
    async (type: TimetableEntityType, id: string, name?: string) => {
      const requestId = ++lastRequestIdRef.current;

      // Skeleton immediately — before any await — so the previous timetable does not linger.
      setSelectedTimetable(null);
      setTimetableAwaitingFetch(true);
      setSelectedResult({
        id: id || "",
        name: name || "",
        type,
        typeLabel: "",
      });
      const timer = delay(300);

      let resolvedId = id;
      try {
        if (!resolvedId && name) {
          const items = await listTimetableEntities();
          if (requestId !== lastRequestIdRef.current) return false;
          resolvedId = matchTimetableEntityId(items, type, name) || "";
        }
        if (!resolvedId) {
          setKbpNotice("Не удалось найти расписание");
          return false;
        }

        const result: SearchResult = {
          id: resolvedId,
          name: name || "",
          type,
          typeLabel: "",
        };
        setSelectedResult(result);

        const archive = await loadTimetableArchive();
        if (requestId !== lastRequestIdRef.current) return false;
        const archived = archive.find(
          (e) => e.result?.type === type && String(e.result?.id) === String(resolvedId)
        );
        if (archived?.result?.name && !result.name) {
          setSelectedResult({ ...result, name: archived.result.name });
        }
        // Do not paint archived pairs here — that skipped the skeleton and looked like
        // "page did not load". Archive is only a fallback after a failed network fetch.

        const timetableResult = await fetchTimetableByCategory(type, resolvedId);

        if (requestId !== lastRequestIdRef.current) return false;

        if (!timetableResult.success || !timetableResult.data) {
          const emptyResult = {
            ...result,
            name: result.name || archived?.result?.name || "",
          };
          setSelectedResult(emptyResult);
          await upsertTimetableArchive({
            id: timetableArchiveId(type, resolvedId),
            result: emptyResult,
            data: null,
          });

          if (archived?.data) {
            applyTimetableData(archived.data);
            setKbpNotice(timetableResult.error || "Показано сохранённое расписание (сеть недоступна)");
          } else {
            setSelectedTimetable(null);
            setKbpNotice(timetableResult.error || "Не удалось загрузить расписание");
          }

          await persistTimetableQuery({
            type,
            id: resolvedId,
            name: result.name || archived?.result?.name || "",
          });
          skipTtNetworkRef.current = timetableQueryKey(type, resolvedId);
          return true;
        }

        const liveName = name || result.name || archived?.result?.name || "";
        const liveResult: SearchResult = { ...result, name: liveName };
        setSelectedResult(liveResult);
        applyTimetableData(timetableResult.data);
        setKbpNotice("");
        await storageSet("cached_timetable_data", JSON.stringify(normalizeTimetableData(timetableResult.data)));
        await storageSet("cached_selected_timetable_result", JSON.stringify(liveResult));
        await persistTimetableSnapshot(liveResult, timetableResult.data);
        await persistTimetableQuery({ type, id: resolvedId, name: liveName });
        skipTtNetworkRef.current = timetableQueryKey(type, resolvedId);
        void import("@/lib/client/pushRegister").then((m) => m.syncPushSubscriptionSettings());
        return true;
      } finally {
        if (requestId === lastRequestIdRef.current) {
          await timer;
          setTimetableAwaitingFetch(false);
        }
      }
    },
    [persistTimetableQuery]
  );

  useEffect(() => {
    const archiveId = (searchParams.get("archive") || "").trim();
    if (!archiveId) {
      setArchiveViewLabel(null);
      setArchiveWeekPage(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const entry = await getWeekArchiveById(archiveId);
      if (cancelled) return;
      if (!entry) {
        setArchiveViewLabel(null);
        setArchiveWeekPage(null);
        return;
      }
      setArchiveViewLabel(entry.label);
      setArchiveWeekPage(entry.weekPage === 1 ? 1 : 0);
      setCurrentPage(APP_TAB_TIMETABLE);
      applyTimetableData(entry.data, entry.result);
      setSelectedResult(entry.result);
      setTimetableAwaitingFetch(false);
      setIsRefreshingTimetable(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, applyTimetableData]);

  useEffect(() => {
    const archiveId = (searchParams.get("archive") || "").trim();
    if (archiveId) return;

    const page = parseAppPage(searchParams);
    const sc = parseSettingsCategory(searchParams);

    if (routeWriteRef.current) {
      routeWriteRef.current = false;
    }

    if (page) {
      const tab = tabFromAppPage(page);
      setCurrentPage(tab);
      setSettingsScreen(page === "settings" ? sc ?? "hub" : "hub");
    }

    const parsed = parseTimetableQuery(searchParams);
    // Only react to tt_* in the URL — never re-force timetable from stored/boot on every param change
    // (that made Back jump back to расписание).
    if (!isTimetableQueryNavigable(parsed) || !parsed.type) {
      if (!page && bootTimetableQuery && isTimetableQueryNavigable(bootTimetableQuery) && bootTimetableQuery.type) {
        const bootType = bootTimetableQuery.type;
        const bootId = bootTimetableQuery.id ?? "";
        const bootName = bootTimetableQuery.name;
        setBootTimetableQuery(null);
        setCurrentPage(APP_TAB_TIMETABLE);
        void applyTimetableFromQuery(bootType, bootId, bootName);
      }
      return;
    }

    const focusTimetable = !page || page === "timetable";

    const key = parsed.id
      ? timetableQueryKey(parsed.type, parsed.id)
      : `name:${parsed.type}:${parsed.name ?? ""}`;
    if (ttUrlSkipRef.current === "__cleared__" && !isTimetableQueryNavigable(parsed)) {
      return;
    }
    if (ttUrlSkipRef.current === "__cleared__" && isTimetableQueryNavigable(parsed)) {
      ttUrlSkipRef.current = null;
    }
    if (ttUrlSkipRef.current === key) {
      ttUrlSkipRef.current = null;
      return;
    }
    // Use ref, not state: selectedResult is updated before router.push commits new
    // searchParams. Depending on selectedResult in this effect re-ran with the *old*
    // URL and called applyTimetableFromQuery for the previous entity, aborting the
    // in-flight fetch for the entity the user just picked (URL changed, UI did not).
    const current = selectedResultRef.current;
    if (
      current?.type === parsed.type &&
      ((parsed.id && current?.id === parsed.id) ||
        (!parsed.id && current?.name === parsed.name))
    ) {
      return;
    }

    // Keep tt_* while on journal/settings — don't steal the tab or refetch under them.
    if (!focusTimetable) return;

    setCurrentPage(APP_TAB_TIMETABLE);
    void applyTimetableFromQuery(parsed.type, parsed.id ?? "", parsed.name);
  }, [searchParams, applyTimetableFromQuery, bootTimetableQuery]);

  // Ensure `page=` is present so Back/forward keep the open tab.
  useEffect(() => {
    if (checkingSavedData) return;
    if (parseAppPage(searchParams)) return;
    const page = appPageFromTab(currentPage);
    if (!page) return;
    writeAppRoute(
      {
        page,
        sc: page === "settings" && settingsScreen !== "hub" ? settingsScreen : null,
      },
      { replace: true }
    );
  }, [checkingSavedData, currentPage, searchParams, settingsScreen, writeAppRoute]);

  const handleLogout = async () => {
    await deactivatePushOnBackend();
    await clearStudentSession();
    await Promise.all([
      storageRemove(KBP_LOGIN_DATA_KEY),
      storageRemove(KBP_GROUP_ID_KEY),
      storageRemove("ej_login_data"),
      storageRemove("ej_group_id"),
      storageRemove("ej_cookies"),
      storageRemove("cached_journal_data"),
      storageRemove("cached_lateness_data"),
      storageRemove("cached_student_fio"),
    ]);
    setIsLoggedIn(false);
  };

  const handleClearAppData = async (opts: {
    clearCache: boolean;
    clearTimetables: boolean;
  }) => {
    try {
      const { clearAppDataCategories } = await import("@/lib/client/appClearData");
      await clearAppDataCategories(opts);
    } finally {
      if (opts.clearCache) {
        setIsLoggedIn(false);
      }
      if (opts.clearTimetables) {
        setSelectedTimetable(null);
        setSelectedResult(null);
        setKbpNotice("");
        setArchiveViewLabel(null);
        setArchiveWeekPage(null);
        clearTimetableQuery();
      }
    }
  };


  const handleTimetableSelect = (result: SearchResult, _data: any) => {
    setCurrentPage(APP_TAB_TIMETABLE);
    setArchiveViewLabel(null);
    setArchiveWeekPage(null);
    // Show skeleton immediately on click (don't wait for async applyTimetableFromQuery).
    setSelectedResult(result);
    setSelectedTimetable(null);
    setTimetableAwaitingFetch(true);
    if (result.type && result.id) {
      ttUrlSkipRef.current = timetableQueryKey(result.type, result.id);
    }
    const next = buildTimetableSearchParams(searchParams, {
      type: result.type as TimetableEntityType,
      id: result.id,
      name: result.name,
    });
    next.set("page", "timetable");
    next.delete("archive");
    noteSpaHistoryPush();
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
    void persistTimetableQuery({
      type: result.type as TimetableEntityType,
      id: result.id,
      name: result.name,
    });
    if (result.type && (result.id || result.name)) {
      void applyTimetableFromQuery(result.type, result.id, result.name);
    }
  };

  const handleTimetableEntityNavigate = async (
    type: "group" | "teacher" | "place" | "subject",
    id: string,
    name: string
  ) => {
    setSelectedResult({
      id: id || "",
      name: (name || "").trim(),
      type,
      typeLabel: "",
    });
    setSelectedTimetable(null);
    setTimetableAwaitingFetch(true);
    const timer = delay(300);
    try {
      let resolvedId = id;
      const resolvedName = (name || "").trim();
      if (!resolvedId && resolvedName) {
        const items = await listTimetableEntities();
        const target = normalizeEntityName(resolvedName);
        const exact = items.find((it) => it.type === type && normalizeEntityName(it.name) === target);
        const starts = !exact
          ? items.find((it) => it.type === type && normalizeEntityName(it.name).startsWith(target))
          : null;
        resolvedId = (exact || starts)?.id || "";
      }
      if (!resolvedId) {
        setKbpNotice("Не удалось найти расписание");
        return;
      }

      const result: SearchResult = {
        id: resolvedId,
        name: resolvedName,
        type,
        typeLabel: "",
      };
      setSelectedResult(result);

      const archive = await loadTimetableArchive();
      const archived = archive.find(
        (e) => e.result?.type === type && String(e.result?.id) === String(resolvedId)
      );

      const timetableResult = await fetchTimetableByCategory(type, resolvedId);
      if (timetableResult.success && timetableResult.data) {
        skipTtNetworkRef.current = timetableQueryKey(type, resolvedId);
        setSelectedResult(result);
        applyTimetableData(timetableResult.data);
        setKbpNotice("");
        await storageSet("cached_timetable_data", JSON.stringify(timetableResult.data));
        await storageSet("cached_selected_timetable_result", JSON.stringify(result));
        await persistTimetableSnapshot(result, timetableResult.data);
        setCurrentPage(APP_TAB_TIMETABLE);
        pushTimetableQuery(result);
        void import("@/lib/client/pushRegister").then((m) => m.syncPushSubscriptionSettings());
      } else {
        const emptyResult = { ...result, name: result.name || archived?.result?.name || "" };
        await upsertTimetableArchive({
          id: timetableArchiveId(type, resolvedId),
          result: emptyResult,
          data: null,
        });
        if (archived?.data) {
          applyTimetableData(archived.data);
          setKbpNotice(timetableResult.error || "Показано сохранённое расписание (сеть недоступна)");
        } else {
          setSelectedTimetable(null);
          setKbpNotice(timetableResult.error || "Не удалось загрузить расписание");
        }
      }
    } finally {
      await timer;
      setTimetableAwaitingFetch(false);
    }
  };

  // Timetable refresh on startup/interval for last selected entity
  useEffect(() => {
    let cancelled = false;

    const refreshTimetable = async () => {
      try {
        setIsRefreshingTimetable(true);
        let timetableResult: { success: boolean; data?: any; error?: string } = { success: false };
        if (selectedResult?.id && selectedResult?.type) {
          timetableResult = await fetchTimetableByCategory(selectedResult.type, selectedResult.id);
        } else {
          const savedGroupId = await getKbpGroupId();
          if (savedGroupId) timetableResult = await fetchTimetable(savedGroupId);
        }

        if (cancelled) return;

        if (timetableResult.success && timetableResult.data) {
          applyTimetableData(timetableResult.data);
          await storageSet("cached_timetable_data", JSON.stringify(normalizeTimetableData(timetableResult.data)));
          if (selectedResult) {
            await persistTimetableSnapshot(selectedResult, timetableResult.data);
          }
          setKbpNotice("");
        } else if (String(timetableResult.error || "").includes("KBP_403")) {
          setKbpNotice("Ошибка со стороны kbp.by (403). Показаны локальные данные.");
        }
      } catch (err) {
        console.error("Background refresh error:", err);
      } finally {
        if (!cancelled) setIsRefreshingTimetable(false);
      }
    };

    const key =
      selectedResult?.id && selectedResult?.type
        ? timetableQueryKey(selectedResult.type, selectedResult.id)
        : "";
    if (!(key && skipTtNetworkRef.current === key)) {
      void refreshTimetable();
    }
    const interval = setInterval(refreshTimetable, 60 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedResult?.id, selectedResult?.type]);


  // Refresh timetable + journal when app becomes visible again after long background
  useEffect(() => {
    if (!isLoggedIn) return;

    let lastHiddenAt = Date.now();
    let cancelled = false;

    const refreshNow = async () => {
      try {
        setIsRefreshingTimetable(true);

        // Timetable
        let timetableResult: { success: boolean; data?: any; error?: string } = { success: false };
        if (selectedResultRef.current?.id && selectedResultRef.current?.type) {
          timetableResult = await fetchTimetableByCategory(
            selectedResultRef.current.type,
            selectedResultRef.current.id
          );
        } else {
          const savedGroupId = await getKbpGroupId();
          if (savedGroupId) timetableResult = await fetchTimetable(savedGroupId);
        }

        if (cancelled) return;
        if (timetableResult.success && timetableResult.data) {
          applyTimetableData(timetableResult.data);
          await storageSet("cached_timetable_data", JSON.stringify(normalizeTimetableData(timetableResult.data)));
          if (selectedResultRef.current) {
            await persistTimetableSnapshot(selectedResultRef.current, timetableResult.data);
          }
          setKbpNotice("");
        }

      } catch (err) {
        console.error("Refresh on visibility error:", err);
      } finally {
        if (!cancelled) {
          setIsRefreshingTimetable(false);
        }
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        lastHiddenAt = Date.now();
        return;
      }

      const deltaMs = Date.now() - lastHiddenAt;
      if (deltaMs >= 30 * 60 * 1000) {
        refreshNow();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    // Refresh right away on app open/return
    refreshNow();
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!settingsHydrated || checkingSavedData) return;

    if (!notificationsEnabled) {
      void deactivatePushOnBackend();
      return;
    }
    let cancelled = false;
    (async () => {
      const granted = await requestNotificationPermissions();
      if (!granted || cancelled) return;
      if (isLoggedIn) {
        await ensurePushRegisteredOnServer();
      }
      await setupBackgroundSync();
      if (await shouldPerformSync()) {
        await performBackgroundSync();
      }
    })();

    const onVisible = async () => {
      if (document.visibilityState === "hidden") {
        if (Capacitor.isNativePlatform() && notificationsEnabled) {
          await scheduleQuickSyncOnClose(15);
        }
        return;
      }
      if (document.visibilityState !== "visible") return;
      const granted = await requestNotificationPermissions();
      if (!granted || cancelled) return;
      if (isLoggedIn) {
        await syncPushSubscriptionSettings();
      }
      if (await shouldPerformSync()) {
        await performBackgroundSync();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [
    notificationsEnabled,
    notifyTimetable,
    isLoggedIn,
    pushBackendUrl,
    settingsHydrated,
    checkingSavedData,
  ]);

  useEffect(() => {
    if (!settingsHydrated || !notificationsEnabled || !isLoggedIn) return;
    void ensurePushRegisteredOnServer();
  }, [settingsHydrated, notificationsEnabled, isLoggedIn, notifyTimetable]);

  const timetableLoading = timetableAwaitingFetch || (!selectedTimetable && isRefreshingTimetable);

  useEffect(() => {
    if (timetableAwaitingFetch || isRefreshingTimetable) {
      beginLoading("refresh");
      return () => endLoading("refresh");
    }
    return undefined;
  }, [timetableAwaitingFetch, isRefreshingTimetable]);

  useEffect(() => {
    if (!settingsHydrated) return;
    void setNativeAllowRotation(allowRotation);
  }, [settingsHydrated, allowRotation]);

  const settingsTabProps: SettingsViewProps = {
    theme,
    onThemeChange: setTheme,
    accentColor,
    onAccentColorChange: setAccentColor,
    notificationsEnabled,
    onNotificationsEnabledChange: (v: boolean) => {
      setNotificationsEnabled(v);
      if (v) void ensurePushRegisteredOnServer();
    },
    notifyTimetable,
    onNotifyTimetableChange: setNotifyTimetable,
    pushBackendUrl,
    onPushBackendUrlChange: setPushBackendUrl,
    countdownToLesson,
    onCountdownToLessonChange: setCountdownToLesson,
    showReplacementsByDefault,
    onShowReplacementsByDefaultChange: setShowReplacementsByDefault,
    timetableDensity,
    onTimetableDensityChange: setTimetableDensity,
    timetableShowGroup,
    onTimetableShowGroupChange: setTimetableShowGroup,
    timetableShowTeacher,
    onTimetableShowTeacherChange: setTimetableShowTeacher,
    timetableShowRoom,
    onTimetableShowRoomChange: setTimetableShowRoom,
    allowRotation,
    onAllowRotationChange: setAllowRotation,
    timetableHidePairNumbers,
    onTimetableHidePairNumbersChange: setTimetableHidePairNumbers,
    timetableDayStrip,
    onTimetableDayStripChange: setTimetableDayStrip,
    timetablePcSidePad,
    onTimetablePcSidePadChange: setTimetablePcSidePad,
    timetableShowGrades,
    onTimetableShowGradesChange: setTimetableShowGrades,
    onClearAppData: handleClearAppData,
    screen: settingsScreen,
    onScreenChange: navigateSettingsScreen,
  };

  return (
    <div className={`safe-top flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden overscroll-x-none ${themeAppShell(theme)}`}>
      <AppOfflineBanner theme={theme} visible={serverOffline && isLoggedIn && !isStaff} message="Вы вне сети" />
      {archiveViewLabel ? (
        <div
          className={`flex items-center justify-between gap-3 border-b px-4 py-2 text-sm ${
            isDark ? "border-[var(--app-border)] bg-[var(--app-surface)] text-zinc-200" : "border-gray-200 bg-white text-gray-800"
          }`}
        >
          <span>
            Архив: <strong>{archiveViewLabel}</strong>
          </span>
          <button
            type="button"
            className="font-medium text-[var(--app-accent)]"
            onClick={() => {
              setArchiveViewLabel(null);
              setArchiveWeekPage(null);
              const next = new URLSearchParams(searchParams.toString());
              next.delete("archive");
              next.set("page", "timetable");
              noteSpaHistoryPush();
              router.push(`${pathname}?${next.toString()}`, { scroll: false });
            }}
          >
            К текущему
          </button>
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-[calc(3.25rem+env(safe-area-inset-bottom))]">
        <div className="relative isolate min-h-0 min-w-0 flex-1 overflow-hidden overscroll-x-none">
          <div
            className={`absolute inset-0 min-w-0 overflow-hidden overscroll-x-none ${themePageBg(theme)} ${
              currentPage === APP_TAB_SETTINGS ? "visible z-10" : "invisible pointer-events-none z-0"
            }`}
            aria-hidden={currentPage !== APP_TAB_SETTINGS}
          >
            {mountedTabs.has(APP_TAB_SETTINGS) ? <SettingsTab {...settingsTabProps} /> : null}
          </div>

          <div
            className={`absolute inset-0 min-w-0 overflow-hidden overscroll-x-none ${themePageBg(theme)} ${
              currentPage === APP_TAB_TIMETABLE ? "visible z-10" : "invisible pointer-events-none z-0"
            }`}
            aria-hidden={currentPage !== APP_TAB_TIMETABLE}
          >
            {mountedTabs.has(APP_TAB_TIMETABLE) ? (
              <TimetableTab
                theme={theme}
                selectedTimetable={selectedTimetable}
                selectedResult={selectedResult}
                kbpNotice={kbpNotice}
                countdownToLesson={countdownToLesson}
                showReplacementsByDefault={showReplacementsByDefault}
                timetableDensity={timetableDensity}
                timetableHideTeacherRoom={timetableHideTeacherRoom}
                timetableShowGroup={timetableShowGroup}
                timetableShowTeacher={timetableShowTeacher}
                timetableShowRoom={timetableShowRoom}
                timetableHidePairNumbers={timetableHidePairNumbers}
                timetableDayStrip={timetableDayStrip}
                timetablePcSidePad={timetablePcSidePad}
                timetableShowGrades={timetableShowGrades}
                onSelectResult={handleTimetableSelect}
                onNavigateEntity={handleTimetableEntityNavigate}
                timetableLoading={timetableLoading}
                searchParams={searchParams}
                initialWeekPage={archiveWeekPage}
              />
            ) : null}
          </div>
        </div>
      </div>

      <AppNav
        currentPage={currentPage}
        onNavigate={(id) => {
          navigateAppTab(id);
        }}
        theme={theme}
        staffRole={staffSession?.role ?? null}
        onOpenAdminPanel={() => {
          window.location.assign(getPanelAppUrl("/staff/dashboard"));
        }}
      />
    </div>
  );
}
