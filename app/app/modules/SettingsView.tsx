"use client";

import { useEffect, useRef, useState } from "react";
import { TELEGRAM_PLANE_PATH } from "@/lib/client/oauthIcons";
import { themeIsDark, type AppTheme } from "@/lib/client/appTheme";
import { isDesktopBrowser, isElectronDesktop } from "@/lib/client/platform";
import AppVersionBadge from "@/app/components/app/AppVersionBadge";
import {
  ACCENT_PRESETS,
  type AccentId,
} from "@/lib/client/accentColor";
import {
  type AppSettingsScreen,
  consumeAppSettingsScreen,
} from "@/lib/client/appTabs";
import {
  anyClearOptionSelected,
  formatStorageBytes,
  measureClearCategorySizes,
  type ClearAppDataOptions,
  type ClearCategoryId,
  type ClearCategorySizes,
} from "@/lib/client/appClearData";

export type SettingsViewProps = {
  theme: AppTheme;
  onThemeChange: (t: AppTheme) => void;
  accentColor: AccentId;
  onAccentColorChange: (v: AccentId) => void;
  notificationsEnabled: boolean;
  onNotificationsEnabledChange: (v: boolean) => void;
  notifyTimetable: boolean;
  onNotifyTimetableChange: (v: boolean) => void;
  pushBackendUrl: string;
  onPushBackendUrlChange: (v: string) => void;
  countdownToLesson: boolean;
  onCountdownToLessonChange: (v: boolean) => void;
  showReplacementsByDefault: boolean;
  onShowReplacementsByDefaultChange: (v: boolean) => void;
  timetableDensity: "normal" | "compact" | "small";
  onTimetableDensityChange: (v: "normal" | "compact" | "small") => void;
  timetableShowGroup: boolean;
  onTimetableShowGroupChange: (v: boolean) => void;
  timetableShowTeacher: boolean;
  onTimetableShowTeacherChange: (v: boolean) => void;
  timetableShowRoom: boolean;
  onTimetableShowRoomChange: (v: boolean) => void;
  allowRotation: boolean;
  onAllowRotationChange: (v: boolean) => void;
  timetableHidePairNumbers: boolean;
  onTimetableHidePairNumbersChange: (v: boolean) => void;
  timetableDayStrip: boolean;
  onTimetableDayStripChange: (v: boolean) => void;
  timetablePcSidePad: boolean;
  onTimetablePcSidePadChange: (v: boolean) => void;
  timetableShowGrades: boolean;
  onTimetableShowGradesChange: (v: boolean) => void;
  onClearAppData: (opts: ClearAppDataOptions) => void | Promise<void>;
  guestMode?: boolean;
  onGuestLogin?: () => void;
  onRequireAuth?: () => void;
  onLogout?: () => void;
  screen?: AppSettingsScreen;
  onScreenChange?: (screen: AppSettingsScreen) => void;
};

const SCREEN_TITLES: Record<Exclude<AppSettingsScreen, "hub">, string> = {
  profile: "Изменение профиля",
  security: "Безопасность",
  notifications: "Уведомления",
  appearance: "Оформление",
  clear: "Очистка",
};

export default function SettingsView(props: SettingsViewProps) {
  const {
    theme,
    onThemeChange,
    accentColor,
    onAccentColorChange,
    notificationsEnabled,
    onNotificationsEnabledChange,
    notifyTimetable,
    onNotifyTimetableChange,
    countdownToLesson,
    onCountdownToLessonChange,
    showReplacementsByDefault,
    onShowReplacementsByDefaultChange,
    timetableDensity,
    onTimetableDensityChange,
    timetableShowGroup,
    onTimetableShowGroupChange,
    timetableShowTeacher,
    onTimetableShowTeacherChange,
    timetableShowRoom,
    onTimetableShowRoomChange,
    allowRotation,
    onAllowRotationChange,
    timetableHidePairNumbers,
    onTimetableHidePairNumbersChange,
    timetableDayStrip,
    onTimetableDayStripChange,
    timetablePcSidePad,
    onTimetablePcSidePadChange,
    timetableShowGrades,
    onTimetableShowGradesChange,
    onClearAppData,
    screen: screenProp,
    onScreenChange,
  } = props;

  const isDark = themeIsDark(theme);

  const [screenInternal, setScreenInternal] = useState<AppSettingsScreen>("hub");
  const screen = screenProp ?? screenInternal;
  const setScreen = (next: AppSettingsScreen) => {
    if (onScreenChange) onScreenChange(next);
    else setScreenInternal(next);
  };
  const [clearCache, setClearCache] = useState(false);
  const [clearTimetables, setClearTimetables] = useState(false);
  const [clearSizes, setClearSizes] = useState<ClearCategorySizes>({
    cache: 0,
    timetables: 0,
  });
  const [displaySizes, setDisplaySizes] = useState<ClearCategorySizes>({
    cache: 0,
    timetables: 0,
  });
  const [clearing, setClearing] = useState(false);
  const [drainingIds, setDrainingIds] = useState<ClearCategoryId[]>([]);
  const drainRafRef = useRef<number | null>(null);

  const refreshClearSizes = async () => {
    const sizes = await measureClearCategorySizes();
    setClearSizes(sizes);
    setDisplaySizes(sizes);
  };

  useEffect(() => {
    if (screenProp !== undefined) return;
    const initial = consumeAppSettingsScreen();
    if (initial && initial !== "hub" && initial !== "profile" && initial !== "security") {
      setScreenInternal(initial);
    }
  }, [screenProp]);

  useEffect(() => {
    if (screen !== "clear") return;
    void refreshClearSizes();
  }, [screen]);

  useEffect(() => {
    return () => {
      if (drainRafRef.current != null) cancelAnimationFrame(drainRafRef.current);
    };
  }, []);

  const runClearWithDrain = async () => {
    const opts: ClearAppDataOptions = {
      clearCache,
      clearTimetables,
    };
    if (!anyClearOptionSelected(opts) || clearing) return;

    const targets: ClearCategoryId[] = [];
    if (opts.clearCache) targets.push("cache");
    if (opts.clearTimetables) targets.push("timetables");

    setClearing(true);
    setDrainingIds(targets);

    const start = { ...displaySizes };
    const durationMs = 780;
    const t0 = performance.now();

    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / durationMs);
        const eased = 1 - Math.pow(1 - t, 3);
        const next = { ...start };
        for (const id of targets) {
          next[id] = Math.round(start[id] * (1 - eased));
        }
        setDisplaySizes(next);
        if (t < 1) {
          drainRafRef.current = requestAnimationFrame(tick);
        } else {
          drainRafRef.current = null;
          resolve();
        }
      };
      drainRafRef.current = requestAnimationFrame(tick);
    });

    try {
      await Promise.resolve(onClearAppData(opts));
    } finally {
      setClearCache(false);
      setClearTimetables(false);
      setDrainingIds([]);
      setClearing(false);
      await refreshClearSizes();
    }
  };

  const sectionCard = `overflow-hidden rounded-2xl ${
    isDark
      ? "border border-[var(--app-border)] bg-[var(--app-surface)]"
      : "bg-white shadow-sm shadow-black/[0.03]"
  }`;
  const divider = isDark ? "border-[var(--app-border)]" : "border-black/[0.06]";
  const rowBase = "flex w-full items-center justify-between gap-3 px-4 py-3.5 min-h-[52px]";
  const labelPrimary = `text-[17px] leading-snug ${isDark ? "text-zinc-100" : "text-gray-900"}`;
  const labelSecondary = `text-[13px] leading-snug ${isDark ? "text-[var(--app-muted)]" : "text-gray-500"}`;
  const sectionHeader = `px-4 pt-6 pb-2 text-[13px] font-semibold uppercase tracking-wide ${
    isDark ? "text-[var(--app-muted)]" : "text-gray-400"
  }`;
  const linkAccent = "text-[var(--app-accent)]";

  const goHub = () => setScreen("hub");

  if (screen === "profile" || screen === "security") {
    if (onScreenChange) onScreenChange("hub");
    else setScreenInternal("hub");
  }

  if (screen !== "hub") {
    return (
      <div className={`mx-auto w-full max-w-4xl pb-24 md:px-4 md:pb-6`}>
        <div className="px-4 pt-2 pb-3 md:px-0">
          <button
            type="button"
            onClick={goHub}
            className={`mb-1 inline-flex min-h-[44px] items-center gap-1 text-[17px] font-medium ${linkAccent} hover:opacity-80`}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Настройки
          </button>
          <h2 className={`text-[28px] font-bold tracking-tight ${isDark ? "text-zinc-100" : "text-gray-900"}`}>
            {SCREEN_TITLES[screen]}
          </h2>
        </div>

        <div className="space-y-4 px-4 md:px-0">
          {screen === "notifications" ? (
            <div className={sectionCard}>
              <label className={rowBase}>
                <span className={labelPrimary}>Уведомления</span>
                <ToggleSwitch checked={notificationsEnabled} onChange={onNotificationsEnabledChange} isDark={isDark} />
              </label>
              <div
                className={`overflow-hidden transition-all duration-300 ease-out ${
                  notificationsEnabled ? "max-h-[28rem] opacity-100" : "max-h-0 opacity-0"
                }`}
              >
                <label className={`${rowBase} border-t ${divider}`}>
                  <div className="min-w-0 flex-1 text-left">
                    <div className={labelPrimary}>Замены</div>
                    <div className={labelSecondary}>Когда меняется расписание</div>
                  </div>
                  <ToggleSwitch checked={notifyTimetable} onChange={onNotifyTimetableChange} isDark={isDark} />
                </label>
              </div>
            </div>
          ) : null}

          {screen === "appearance" ? (
            <div className="space-y-4">
              <div className={sectionHeader}>Тема</div>
              <div className={sectionCard}>
                <div className="px-4 py-3.5">
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        {
                          id: "light" as AppTheme,
                          label: "Светлая",
                          preview: "border border-gray-200 bg-white",
                        },
                        {
                          id: "dark" as AppTheme,
                          label: "Тёмная",
                          preview: "border border-white/15 bg-[#141414]",
                        },
                        {
                          id: "oled" as AppTheme,
                          label: "OLED",
                          preview: "border border-zinc-800 bg-black",
                        },
                      ] as const
                    ).map((opt) => {
                      const active = theme === opt.id;
                      const isLightOpt = opt.id === "light";
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onThemeChange(opt.id)}
                          className={`min-h-[72px] w-full rounded-xl p-2.5 text-left transition-all ${
                            active
                              ? isLightOpt
                                ? "ring-2 ring-[var(--app-accent)] bg-white"
                                : "ring-2 ring-[var(--app-accent)] bg-[color-mix(in_srgb,var(--app-accent)_12%,transparent)]"
                              : isLightOpt
                                ? "bg-white ring-1 ring-black/10"
                                : isDark
                                  ? "bg-[var(--app-elevated)] ring-1 ring-[var(--app-border)]"
                                  : "bg-gray-50 ring-1 ring-gray-200"
                          }`}
                        >
                          <div className={`h-9 rounded-lg ${opt.preview}`} />
                          <div
                            className={`mt-2 truncate text-xs font-medium ${
                              active
                                ? "text-[var(--app-accent)]"
                                : isLightOpt
                                  ? "text-gray-700"
                                  : isDark
                                    ? "text-zinc-300"
                                    : "text-gray-700"
                            }`}
                          >
                            {opt.label}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className={sectionHeader}>Акцент</div>
              <div className={sectionCard}>
                <div className="flex flex-wrap gap-3 px-4 py-4">
                  {ACCENT_PRESETS.map((p) => {
                    const active = accentColor === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        title={p.label}
                        aria-label={p.label}
                        aria-pressed={active}
                        onClick={() => onAccentColorChange(p.id)}
                        className={`h-11 w-11 rounded-full transition ring-offset-2 ${
                          isDark ? "ring-offset-[var(--app-surface)]" : "ring-offset-white"
                        } ${active ? "ring-2 ring-[var(--app-accent)] scale-105" : "ring-1 ring-black/10"}`}
                        style={{ backgroundColor: p.hex }}
                      />
                    );
                  })}
                </div>
              </div>

              <div className={sectionHeader}>Расписание</div>
              <div className={sectionCard}>
                <label className={rowBase}>
                  <span className={labelPrimary}>Показывать замены по умолчанию</span>
                  <ToggleSwitch
                    checked={showReplacementsByDefault}
                    onChange={onShowReplacementsByDefaultChange}
                    isDark={isDark}
                  />
                </label>
                <label className={`${rowBase} border-t ${divider}`}>
                  <span className={labelPrimary}>Показывать группу</span>
                  <ToggleSwitch checked={timetableShowGroup} onChange={onTimetableShowGroupChange} isDark={isDark} />
                </label>
                <label className={`${rowBase} border-t ${divider}`}>
                  <span className={labelPrimary}>Показывать преподавателя</span>
                  <ToggleSwitch checked={timetableShowTeacher} onChange={onTimetableShowTeacherChange} isDark={isDark} />
                </label>
                <label className={`${rowBase} border-t ${divider}`}>
                  <span className={labelPrimary}>Показывать аудиторию</span>
                  <ToggleSwitch checked={timetableShowRoom} onChange={onTimetableShowRoomChange} isDark={isDark} />
                </label>
                <label className={`${rowBase} border-t ${divider}`}>
                  <div>
                    <div className={labelPrimary}>Разрешить поворот экрана</div>
                    <div className={labelSecondary}>Снять блокировку портретной ориентации</div>
                  </div>
                  <ToggleSwitch checked={allowRotation} onChange={onAllowRotationChange} isDark={isDark} />
                </label>
                <label className={`${rowBase} border-t ${divider}`}>
                  <span className={labelPrimary}>Скрыть номер пары слева</span>
                  <ToggleSwitch
                    checked={timetableHidePairNumbers}
                    onChange={onTimetableHidePairNumbersChange}
                    isDark={isDark}
                  />
                </label>
                <label className={`${rowBase} border-t ${divider}`}>
                  <div>
                    <div className={labelPrimary}>Оценки в расписании</div>
                    <div className={labelSecondary}>Показывать отметки под группой на паре</div>
                  </div>
                  <ToggleSwitch
                    checked={timetableShowGrades}
                    onChange={onTimetableShowGradesChange}
                    isDark={isDark}
                  />
                </label>
                <label className={`${rowBase} border-t ${divider}`}>
                  <span className={labelPrimary}>Панель дней (Пн–Сб)</span>
                  <ToggleSwitch checked={timetableDayStrip} onChange={onTimetableDayStripChange} isDark={isDark} />
                </label>
                {isDesktopBrowser() || isElectronDesktop() ? (
                  <label className={`${rowBase} border-t ${divider}`}>
                    <div>
                      <div className={labelPrimary}>Шире поля по бокам (только ПК)</div>
                      <div className={labelSecondary}>Расписание не растягивается на весь экран</div>
                    </div>
                    <ToggleSwitch checked={timetablePcSidePad} onChange={onTimetablePcSidePadChange} isDark={isDark} />
                  </label>
                ) : null}
                <div className={`border-t px-4 py-3.5 ${divider}`}>
                  <div className={`mb-3 text-sm font-medium ${isDark ? "text-zinc-100" : "text-gray-900"}`}>
                    Плотность расписания
                  </div>
                  <div
                    className={`flex overflow-hidden rounded-xl border ${isDark ? "border-zinc-700" : "border-gray-200"}`}
                  >
                    {(
                      [
                        { id: "normal" as const, label: "Обычная" },
                        { id: "compact" as const, label: "Компакт." },
                        { id: "small" as const, label: "Мини" },
                      ] as const
                    ).map((opt, i, arr) => {
                      const active = timetableDensity === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onTimetableDensityChange(opt.id)}
                          className={`flex-1 py-2 text-xs font-semibold transition-all ${
                            i < arr.length - 1 ? `border-r ${isDark ? "border-zinc-700" : "border-gray-200"}` : ""
                          } ${
                            active
                              ? "bg-[var(--app-accent)] text-white"
                              : isDark
                                ? "bg-transparent text-zinc-400 hover:text-zinc-200"
                                : "bg-transparent text-gray-500 hover:text-gray-700"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <label className={`${rowBase} border-t ${divider}`}>
                  <div>
                    <div className={labelPrimary}>Отсчёт до урока</div>
                    <div className={labelSecondary}>Показывать таймер в расписании</div>
                  </div>
                  <ToggleSwitch checked={countdownToLesson} onChange={onCountdownToLessonChange} isDark={isDark} />
                </label>
              </div>
            </div>
          ) : null}


          {screen === "clear" ? (
            <div className={sectionCard}>
              {(
                [
                  {
                    id: "cache" as const,
                    label: "Кэш приложения",
                    hint: "Журнал, профиль, сессии",
                    checked: clearCache,
                    onChange: setClearCache,
                  },
                  {
                    id: "timetables" as const,
                    label: "Кэш расписаний",
                    hint: "До 10 последних загруженных",
                    checked: clearTimetables,
                    onChange: setClearTimetables,
                  },
                ] as const
              ).map((row, i) => {
                const bytes = displaySizes[row.id];
                const baseBytes = Math.max(clearSizes[row.id], 1);
                const fill = Math.max(0, Math.min(1, bytes / baseBytes));
                const draining = drainingIds.includes(row.id);
                const empty = clearSizes[row.id] === 0 && !draining;
                return (
                  <label
                    key={row.id}
                    className={`${rowBase} ${i > 0 ? `border-t ${divider}` : ""} ${
                      clearing ? "pointer-events-none opacity-90" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1 text-left">
                      <span className={`${labelPrimary} block`}>{row.label}</span>
                      <span className={`${labelSecondary} mt-0.5 block`}>{row.hint}</span>
                      <span
                        className={`mt-2 block overflow-hidden rounded-full ${
                          isDark ? "bg-[var(--app-elevated)]" : "bg-gray-100"
                        }`}
                        style={{ height: 4 }}
                        aria-hidden
                      >
                        <span
                          className={`block h-full rounded-full origin-left ${
                            draining
                              ? "bg-rose-500 clear-size-drain"
                              : empty
                                ? isDark
                                  ? "bg-zinc-600"
                                  : "bg-gray-300"
                                : "bg-[var(--app-accent)]"
                          }`}
                          style={{
                            width: `${
                              empty ? 0 : Math.max(fill > 0 ? 4 : 0, fill * 100)
                            }%`,
                            transition: draining
                              ? "width 80ms linear"
                              : "width 320ms cubic-bezier(0.22, 1, 0.36, 1)",
                          }}
                        />
                      </span>
                      <span
                        className={`mt-1.5 inline-flex items-center gap-1.5 text-[12px] tabular-nums ${
                          draining
                            ? "text-rose-500 clear-size-fade"
                            : empty
                              ? isDark
                                ? "text-zinc-500"
                                : "text-gray-400"
                              : isDark
                                ? "text-zinc-300"
                                : "text-gray-600"
                        }`}
                      >
                        {formatStorageBytes(bytes)}
                        {draining ? <span className="clear-size-sweep" aria-hidden /> : null}
                      </span>
                    </span>
                    <ToggleSwitch
                      checked={row.checked}
                      onChange={row.onChange}
                      isDark={isDark}
                    />
                  </label>
                );
              })}
              <div className={`border-t px-4 py-3.5 ${divider}`}>
                <button
                  type="button"
                  onClick={() => void runClearWithDrain()}
                  disabled={
                    clearing ||
                    !anyClearOptionSelected({
                      clearCache,
                      clearTimetables,
                    })
                  }
                  className={`relative w-full overflow-hidden rounded-xl px-4 py-3.5 text-[15px] font-semibold transition-all ${
                    clearing
                      ? "bg-rose-500 text-white"
                      : anyClearOptionSelected({
                            clearCache,
                            clearTimetables,
                          })
                        ? "bg-rose-500 text-white active:scale-[0.99]"
                        : isDark
                          ? "cursor-not-allowed bg-[var(--app-elevated)] text-[var(--app-muted)]"
                          : "cursor-not-allowed bg-gray-100 text-gray-400"
                  }`}
                >
                  {clearing ? (
                    <>
                      <span className="relative z-10">Очищаем…</span>
                      <span className="clear-button-sweep" aria-hidden />
                    </>
                  ) : (
                    "Очистить выбранное"
                  )}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const menuItems: {
    id: Exclude<AppSettingsScreen, "hub" | "profile" | "security">;
    title: string;
    subtitle: string;
  }[] = [
    { id: "appearance", title: "Оформление", subtitle: "Тема, акцент, расписание" },
    { id: "notifications", title: "Уведомления", subtitle: "Замены в расписании" },
    { id: "clear", title: "Очистка", subtitle: "Кэш приложения и расписаний" },
  ];

  return (
    <div className={`mx-auto w-full max-w-4xl pb-24 md:px-4 md:pb-6 md:pt-0`}>
      <div className="px-4 pt-4 pb-3 md:pt-2">
        <h2 className={`text-[34px] font-bold tracking-tight ${isDark ? "text-zinc-100" : "text-gray-900"}`}>
          Настройки
        </h2>
      </div>

      <div className="space-y-4 px-4 md:px-0">
        <div className={sectionCard}>
          {menuItems.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setScreen(item.id)}
              className={`${rowBase} text-left transition active:opacity-80 ${
                i > 0 ? `border-t ${divider}` : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className={`text-[17px] font-medium ${isDark ? "text-zinc-100" : "text-gray-900"}`}>
                  {item.title}
                </div>
                <div className={labelSecondary}>{item.subtitle}</div>
              </div>
              <svg
                className={`h-5 w-5 shrink-0 ${isDark ? "text-zinc-500" : "text-gray-400"}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                aria-hidden
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          ))}
        </div>

        <div className={sectionCard}>
          <div className={`${rowBase} border-b ${divider}`}>
            <span className={`text-[15px] font-medium ${isDark ? "text-zinc-100" : "text-gray-900"}`}>
              О приложении
            </span>
            <AppVersionBadge theme={theme} />
          </div>
          {(
            [
              {
                href: "https://t.me/meowhiks",
                label: "Есть идеи? @meowhiks",
                sub: "t.me/meowhiks",
                color: "text-[#229ED9]",
                bg: "bg-[#229ED9]/10",
                icon: (
                  <svg className="h-4 w-4" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
                    <path d={TELEGRAM_PLANE_PATH} />
                  </svg>
                ),
              },
              {
                href: "https://www.donationalerts.com/r/meowhiks_off",
                label: "Пожертвуйте на разработку",
                sub: ".../r/meowhiks",
                color: "text-[#ff5dc5]",
                bg: "bg-[#ff5dc5]/10",
                icon: (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2 9.5 6H5.2l2.6 3.1L6.6 14l5.4-2.6L17.4 14l-1.2-4.9L18.8 6H14.5L12 2Zm-7 14h14v2H5v-2Zm1 4h12v2H6v-2Z" />
                  </svg>
                ),
              },
              {
                href: "https://github.com/meowhiks",
                label: "Открытый исходный код",
                sub: "github.com/meowhiks",
                color: isDark ? "text-zinc-200" : "text-gray-800",
                bg: isDark ? "bg-[var(--app-elevated)]" : "bg-gray-200",
                icon: (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.1.82-.26.82-.58v-2.2c-3.34.73-4.05-1.61-4.05-1.61-.55-1.4-1.34-1.77-1.34-1.77-1.1-.76.08-.74.08-.74 1.21.09 1.85 1.24 1.85 1.24 1.08 1.86 2.84 1.32 3.53 1 .11-.79.42-1.32.76-1.62-2.67-.3-5.48-1.34-5.48-5.95 0-1.32.47-2.4 1.24-3.25-.12-.3-.54-1.53.12-3.18 0 0 1.01-.32 3.3 1.24a11.5 11.5 0 0 1 6 0c2.29-1.56 3.3-1.24 3.3-1.24.66 1.65.24 2.88.12 3.18.77.85 1.24 1.93 1.24 3.25 0 4.62-2.81 5.64-5.49 5.94.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.82.58A12 12 0 0 0 12 .5Z" />
                  </svg>
                ),
              },
            ] as const
          ).map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className={`${rowBase} group border-t ${divider} no-underline`}
            >
              <div className="min-w-0 flex-1 text-left">
                <div className={`truncate text-[15px] font-medium ${isDark ? "text-zinc-100" : "text-gray-900"}`}>
                  {link.label}
                </div>
                <div className={`mt-0.5 truncate text-[12px] ${isDark ? "text-zinc-500" : "text-gray-400"}`}>
                  {link.sub}
                </div>
              </div>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${link.bg} ${link.color}`}>
                {link.icon}
              </span>
            </a>
          ))}
        </div>
      </div>

      <div className="h-4" />
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  isDark,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  isDark?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[28px] w-[50px] shrink-0 items-center rounded-full border transition-colors duration-200 ${
        checked
          ? "border-transparent bg-[var(--app-accent)]"
          : isDark
            ? "border-white/25 bg-white/20"
            : "border-transparent bg-gray-200"
      }`}
      aria-pressed={checked}
    >
      <span
        className={`inline-block h-[22px] w-[22px] transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? "translate-x-[24px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}
