"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ProfileQrCode from "@/app/components/app/ProfileQrCode";
import AppQrScanner from "@/app/components/app/AppQrScanner";
import {
  getAppSession,
  logoutApp,
  fetchAppSessions,
  getCachedAppSessions,
  revokeAppSession,
  type AppSessionRow,
} from "@/lib/client/appAuth";
import { themeIsDark, themeProfileInput, themeProfileInputShell, themeProfileSection, themeProfileTile, type AppTheme } from "@/lib/client/appTheme";
import { isNativeApp } from "@/lib/client/platform";
import { formatSessionIp, sessionTitle } from "@/lib/client/sessionDisplay";
import { loadStaffSession } from "@/lib/client/miniKbpServer";
import {
  composeDisplayName,
  displayNameInitial,
  displayNameLabel,
  parseDisplayName,
  type DisplayNameParts,
} from "@/lib/client/displayNameParts";
import {
  confirmEmailChange,
  deleteOwnAccount,
  disableTwoFa,
  enableTwoFa,
  fetchProfile,
  getCachedProfile,
  linkTelegramToProfile,
  requestEmailChange,
  saveProfile,
  setupTwoFa,
  type UserProfile,
} from "@/lib/client/userProfile";
import {
  isAllowedAvatarFile,
  isAllowedDisplayName,
  isAllowedInfo,
  isAllowedPhone,
} from "@/lib/client/profileFieldRules";
import StaffSecuritySettingsCard from "@/app/components/staff/StaffSecuritySettingsCard";

type AppProfilePanelProps = {
  theme: AppTheme;
  onRequireAuth?: () => void;
  onLogout?: () => void;
  onBack?: () => void;
  /** edit = ФИО/контакты; security = 2FA/сеансы; all = полный экран (legacy) */
  mode?: "edit" | "security" | "all";
  /** Скрыть заголовок «Профиль» — его рисует хаб настроек */
  embedded?: boolean;
};

export default function AppProfilePanel({
  theme,
  onRequireAuth,
  onLogout,
  onBack,
  mode = "all",
  embedded = false,
}: AppProfilePanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [form, setForm] = useState<UserProfile | null>(null);
  const [fio, setFio] = useState<DisplayNameParts>({ lastName: "", firstName: "", patronymic: "" });

  const [emailDraft, setEmailDraft] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailPending, setEmailPending] = useState("");
  const [emailStep, setEmailStep] = useState<"idle" | "code">("idle");
  const [emailBusy, setEmailBusy] = useState(false);

  const [twoFaOtpAuthUrl, setTwoFaOtpAuthUrl] = useState("");
  const [twoFaCode, setTwoFaCode] = useState("");
  const [twoFaBusy, setTwoFaBusy] = useState(false);
  const [twoFaMode, setTwoFaMode] = useState<"idle" | "setup" | "disable">("idle");
  const [sessionsList, setSessionsList] = useState<AppSessionRow[]>([]);
  const [sessionTtl, setSessionTtl] = useState(30);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [sessionDetailsId, setSessionDetailsId] = useState<number | null>(null);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [isStaffUser, setIsStaffUser] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState("");
  const [deleteName, setDeleteName] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteTotp, setDeleteTotp] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [tgBusy, setTgBusy] = useState(false);

  const isDark = themeIsDark(theme);
  const onNative = isNativeApp();

  useEffect(() => {
    (async () => {
      const staff = await loadStaffSession();
      const app = await getAppSession();
      setIsStaffUser(Boolean(staff));
      if (!staff && !app) {
        onRequireAuth?.();
        setLoading(false);
        return;
      }

      const cachedProfile = await getCachedProfile();
      if (cachedProfile) {
        setForm(cachedProfile);
        setFio(parseDisplayName(cachedProfile.display_name || cachedProfile.nickname || ""));
        setEmailDraft(cachedProfile.email);
        if (typeof cachedProfile.session_ttl_days === "number") setSessionTtl(cachedProfile.session_ttl_days);
        setLoading(false);
      }

      const cachedSessions = await getCachedAppSessions();
      if (cachedSessions) {
        setSessionsList(cachedSessions.sessions);
        setSessionTtl(cachedSessions.session_ttl_days);
      }

      const r = await fetchProfile();
      if (r.ok) {
        setForm(r.data);
        setFio(parseDisplayName(r.data.display_name || r.data.nickname || ""));
        setEmailDraft(r.data.email);
        if (typeof r.data.session_ttl_days === "number") setSessionTtl(r.data.session_ttl_days);
        setError("");
      } else if (!cachedProfile) {
        setError(r.error);
      }

      const sess = await fetchAppSessions();
      if (sess.ok) {
        setSessionsList(sess.sessions);
        setSessionTtl(sess.session_ttl_days);
      }
      setLoading(false);
    })();
  }, [onRequireAuth]);

  const handleAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !form) return;
    if (!isAllowedAvatarFile(file)) {
      setError("Фото: только JPEG, PNG, GIF или WebP");
      e.target.value = "";
      return;
    }
    if (file.size > 400_000) {
      setError("Фото до 400 КБ");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm({ ...form, avatar_url: String(reader.result || "") });
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const displayName = composeDisplayName(fio);
    if (!isAllowedDisplayName(displayName)) {
      setError("Имя: только буквы, пробел, дефис и апостроф");
      return;
    }
    if (!isAllowedPhone(form.phone)) {
      setError("Укажите телефон в формате +375…");
      return;
    }
    if (!isAllowedInfo(form.info)) {
      setError("В поле «о себе» нельзя вставлять HTML");
      return;
    }
    setSaving(true);
    setError("");
    setOk("");
    const r = await saveProfile({
      display_name: composeDisplayName(fio),
      phone: form.phone,
      gender: form.gender,
      info: form.info,
      show_group: form.show_group,
      avatar_url: form.avatar_url,
    });
    setSaving(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setForm(r.data);
    setFio(parseDisplayName(r.data.display_name || ""));
    setOk("Сохранено");
  };

  const handleRequestEmailCode = async () => {
    setEmailBusy(true);
    setError("");
    setOk("");
    const r = await requestEmailChange(emailDraft.trim());
    setEmailBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setEmailPending(r.email);
    setEmailStep("code");
    if (r.devCode) setEmailCode(r.devCode);
    setOk(`Код отправлен на ${r.email}`);
  };

  const handleConfirmEmail = async () => {
    setEmailBusy(true);
    setError("");
    const r = await confirmEmailChange(emailCode.trim());
    setEmailBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setForm(r.data);
    setEmailDraft(r.data.email);
    setEmailStep("idle");
    setEmailPending("");
    setEmailCode("");
    setOk("Email обновлён");
  };

  const handleLinkTelegram = async () => {
    setTgBusy(true);
    setError("");
    setOk("");
    const r = await linkTelegramToProfile();
    setTgBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    const refreshed = await fetchProfile();
    if (refreshed.ok) setForm(refreshed.data);
    setOk(r.username ? `Telegram @${r.username} привязан` : "Telegram привязан");
  };

  const handleStartTwoFa = async () => {
    setTwoFaBusy(true);
    setError("");
    const r = await setupTwoFa();
    setTwoFaBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setTwoFaOtpAuthUrl(r.data.otpauth_url);
    setTwoFaMode("setup");
    setTwoFaCode("");
  };

  const handleEnableTwoFa = async () => {
    setTwoFaBusy(true);
    setError("");
    const r = await enableTwoFa(twoFaCode.trim());
    setTwoFaBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setForm(r.data);
    setTwoFaMode("idle");
    setTwoFaOtpAuthUrl("");
    setTwoFaCode("");
    setOk("Двухфакторная аутентификация включена");
  };

  const handleDisableTwoFa = async () => {
    setTwoFaBusy(true);
    setError("");
    const r = await disableTwoFa(twoFaCode.trim());
    setTwoFaBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setForm(r.data);
    setTwoFaMode("idle");
    setTwoFaCode("");
    setOk("Двухфакторная аутентификация отключена");
  };

  if (loading) {
    return (
      <div className={`flex min-h-[40vh] items-center justify-center px-4 text-sm ${isDark ? "text-zinc-500" : "text-gray-500"}`}>
        Загрузка…
      </div>
    );
  }

  if (!form) {
    return (
      <div className={`flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4 ${isDark ? "text-zinc-300" : "text-gray-700"}`}>
        <p className="text-sm text-red-500">{error || "Профиль недоступен"}</p>
      </div>
    );
  }

  const initials = displayNameInitial(form.display_name, form.email);
  const shownName = displayNameLabel(composeDisplayName(fio) || form.display_name);
  const detailSession = sessionsList.find((s) => s.id === sessionDetailsId) ?? null;
  const sectionCls = themeProfileSection(theme);
  const tileCls = themeProfileTile(theme);
  const inputShellCls = themeProfileInputShell(theme);
  const muted = isDark ? "text-zinc-500" : "text-gray-500";
  const textPrimary = isDark ? "text-zinc-100" : "text-gray-900";
  const inputCls = themeProfileInput(theme);
  const borderSubtle = isDark ? "border-zinc-700" : "border-gray-300";
  const avatarRing = isDark ? "ring-4 ring-white/10" : "ring-4 ring-[#3390ec]/10";

  const showEdit = mode === "edit" || mode === "all";
  const showSecurity = mode === "security" || mode === "all";
  const singleColumn = mode !== "all";

  return (
    <div
      className={`mx-auto w-full min-w-0 max-w-5xl pb-8 ${
        embedded ? "px-0 py-0" : "px-3 py-2 safe-px sm:px-4 md:px-6 md:py-4"
      }`}
    >
      {!embedded ? (
        <div className="mb-4 md:mb-5">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-[#3390ec] hover:opacity-80"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Настройки
            </button>
          ) : null}
          <h1 className={`text-2xl font-semibold tracking-tight ${textPrimary}`}>
            {mode === "security" ? "Безопасность" : mode === "edit" ? "Изменение профиля" : "Профиль"}
          </h1>
          <p className={`mt-1 text-sm ${muted}`}>
            {mode === "security"
              ? "Сеансы, 2FA и выход"
              : mode === "edit"
                ? "Личные данные и контакты"
                : "Личные данные и безопасность аккаунта"}
          </p>
        </div>
      ) : null}

      <form onSubmit={handleSave} className="min-w-0 space-y-5 md:space-y-6">
        <div
          className={`grid min-w-0 gap-5 ${
            singleColumn ? "" : "md:grid-cols-[270px_minmax(0,1fr)] md:gap-8 md:items-start"
          }`}
        >
          <div className="min-w-0 space-y-5">
            {showEdit ? (
            <section className={sectionCls}>
              <div className="flex flex-col items-center text-center">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className={`relative mb-3 h-24 w-24 overflow-hidden rounded-full bg-[#3390ec]/15 ${avatarRing}`}
                >
                  {form.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-3xl font-semibold text-[#3390ec]">
                      {initials}
                    </span>
                  )}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp"
                  className="hidden"
                  onChange={handleAvatar}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="text-sm font-medium text-[#3390ec] hover:underline"
                >
                  Сменить фото
                </button>
                <p className={`mt-3 text-sm font-medium ${textPrimary}`}>{shownName}</p>
                {form.has_group && form.show_group ? (
                  <p className={`mt-0.5 text-xs ${muted}`}>{form.group_name}</p>
                ) : null}
                {form.telegram_username || form.has_telegram ? (
                  <p className={`mt-1 text-xs ${muted}`}>
                    {form.telegram_username ? `@${form.telegram_username}` : "Telegram привязан"}
                  </p>
                ) : null}
              </div>
            </section>
            ) : null}

            {showSecurity ? (
            <section className={sectionCls}>
              <h2 className={`mb-4 text-sm font-semibold ${textPrimary}`}>Безопасность и сеансы</h2>
              {form.profile_locked ? (
                <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                  Профиль заблокирован преподавателем.
                </p>
              ) : null}
              <div className="mb-4 space-y-3">
                <Field label="Срок действия сессии" muted={muted}>
                  <select
                    value={sessionTtl}
                    onChange={async (e) => {
                      const days = Number(e.target.value);
                      setSessionTtl(days);
                      await saveProfile({ session_ttl_days: days } as Partial<UserProfile>);
                    }}
                    className={inputCls}
                  >
                    <option value={7}>7 дней</option>
                    <option value={14}>14 дней</option>
                    <option value={30}>30 дней</option>
                    <option value={90}>90 дней</option>
                    <option value={180}>180 дней</option>
                    <option value={365}>365 дней</option>
                  </select>
                </Field>
                {isStaffUser ? <StaffSecuritySettingsCard variant={isDark ? "dark" : "light"} /> : null}
                <div className="flex w-full flex-col gap-2">
                  {onNative ? (
                    <button
                      type="button"
                      disabled={securityBusy}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setError("");
                        setOk("");
                        setShowQrScanner(true);
                      }}
                      className="w-full rounded-xl border border-[#3390ec]/40 bg-[#3390ec]/10 px-4 py-2.5 text-sm font-semibold text-[#3390ec] disabled:opacity-40"
                    >
                      Сканировать QR для входа на ПК
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={securityBusy}
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSecurityBusy(true);
                      await logoutApp();
                      onLogout?.();
                    }}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors duration-200 ${borderSubtle} ${
                      isDark ? "text-zinc-200 hover:bg-white/[0.04]" : "text-gray-800 hover:bg-gray-50"
                    }`}
                  >
                    Выйти
                  </button>
                </div>
              </div>
              <ul className="max-h-56 space-y-2 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {sessionsList.length === 0 ? (
                  <li className={`text-xs ${muted}`}>Нет активных сеансов</li>
                ) : (
                  sessionsList.map((s) => (
                    <li
                      key={s.id}
                      className={`flex items-start gap-2 px-2.5 py-2.5 ${tileCls}`}
                    >
                      <SessionDeviceIcon kind={s.device_kind} isDark={isDark} />
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm font-medium leading-tight ${textPrimary}`}>
                          {sessionTitle(s)}
                          {s.is_current ? (
                            <span className={`ml-1 text-xs font-normal ${muted}`}>· сейчас</span>
                          ) : null}
                        </div>
                        <div className={`mt-0.5 truncate text-xs tabular-nums ${muted}`} title={s.ip_address || undefined}>
                          {formatSessionIp(s.ip_address)}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          title="Подробнее"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSessionDetailsId(s.id);
                          }}
                          className={`rounded-lg p-2 transition-colors duration-200 ${
                            isDark ? "hover:bg-white/[0.06]" : "hover:bg-black/5"
                          }`}
                        >
                          <MoreIcon />
                        </button>
                        {!s.is_current ? (
                          <button
                            type="button"
                            title="Завершить сеанс"
                            className={`rounded-lg p-2 text-red-500 transition-colors duration-200 ${
                              isDark ? "hover:bg-white/[0.06]" : "hover:bg-red-500/10"
                            }`}
                            onClick={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const r = await revokeAppSession(s.id);
                              if (r.ok) {
                                setSessionsList((prev) => prev.filter((x) => x.id !== s.id));
                                if (sessionDetailsId === s.id) setSessionDetailsId(null);
                              }
                            }}
                          >
                            <CloseIcon />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </section>
            ) : null}
          </div>

          {showEdit ? (
          <div className="min-w-0 space-y-5">
            <section className={`md:p-6 ${sectionCls}`}>
              <h2 className={`mb-4 text-sm font-semibold ${textPrimary}`}>Основное</h2>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Фамилия" muted={muted}>
                  <input
                    type="text"
                    value={fio.lastName}
                    onChange={(e) => setFio({ ...fio, lastName: e.target.value })}
                    placeholder="Иванов"
                    className={inputCls}
                    maxLength={80}
                  />
                </Field>
                <Field label="Имя" muted={muted}>
                  <input
                    type="text"
                    value={fio.firstName}
                    onChange={(e) => setFio({ ...fio, firstName: e.target.value })}
                    placeholder="Иван"
                    className={inputCls}
                    maxLength={80}
                  />
                </Field>
                <Field label="Отчество" muted={muted}>
                  <input
                    type="text"
                    value={fio.patronymic}
                    onChange={(e) => setFio({ ...fio, patronymic: e.target.value })}
                    placeholder="Иванович"
                    className={inputCls}
                    maxLength={80}
                  />
                </Field>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="Телефон" muted={muted}>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+375 …"
                    className={inputCls}
                  />
                </Field>
                <Field label="Пол" muted={muted}>
                  <select
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value as UserProfile["gender"] })}
                    className={inputCls}
                  >
                    <option value="">Не указан</option>
                    <option value="male">Мужской</option>
                    <option value="female">Женский</option>
                    <option value="other">Другой</option>
                  </select>
                </Field>
                {form.has_group ? (
                  <Field label="Группа" muted={muted}>
                    <div className={`flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 transition-colors duration-200 ${tileCls}`}>
                      <span className={`text-sm ${textPrimary}`}>{form.group_name}</span>
                      <label className={`flex items-center gap-2 text-xs ${muted}`}>
                        <input
                          type="checkbox"
                          checked={form.show_group}
                          onChange={(e) => setForm({ ...form, show_group: e.target.checked })}
                          className="rounded"
                        />
                        Показывать
                      </label>
                    </div>
                  </Field>
                ) : null}
              </div>
              <div className="mt-4">
                <Field label="О себе" muted={muted}>
                  <textarea
                    value={form.info}
                    onChange={(e) => setForm({ ...form, info: e.target.value })}
                    rows={3}
                    placeholder="Коротко о себе…"
                    className={`${inputCls} resize-none`}
                    maxLength={2000}
                  />
                </Field>
              </div>
            </section>

            <section className={`md:p-6 ${sectionCls}`}>
              <h2 className={`mb-3 text-sm font-semibold ${textPrimary}`}>
                Email
                {emailStep === "idle" ? (
                  <span className={`ml-2 font-normal ${muted}`}>{form.email || "не указан"}</span>
                ) : null}
              </h2>

              {emailStep === "idle" ? (
                <InputActionGroup
                  isDark={isDark}
                  shellClass={inputShellCls}
                  type="email"
                  value={emailDraft}
                  onChange={setEmailDraft}
                  autoComplete="email"
                  buttonLabel={emailBusy ? "…" : "Отправить код"}
                  buttonDisabled={emailBusy || !emailDraft.trim() || emailDraft.trim() === form.email}
                  onAction={handleRequestEmailCode}
                />
              ) : (
                <div className="space-y-2">
                  <p className={`text-xs ${muted}`}>Код на {emailPending}</p>
                  <InputActionGroup
                    isDark={isDark}
                    shellClass={inputShellCls}
                    value={emailCode}
                    onChange={(v) => setEmailCode(v.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    placeholder="000000"
                    buttonLabel="Подтвердить"
                    buttonDisabled={emailBusy || emailCode.length < 6}
                    onAction={handleConfirmEmail}
                    inputClassName="tracking-[0.25em]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setEmailStep("idle");
                      setEmailCode("");
                      setEmailPending("");
                    }}
                    className={`text-xs font-medium ${muted} hover:opacity-80`}
                  >
                    Отмена
                  </button>
                </div>
              )}
            </section>

            <section className={`md:p-6 ${sectionCls}`}>
              <h2 className={`mb-3 text-sm font-semibold ${textPrimary}`}>Telegram</h2>
              {form.has_telegram || form.telegram_username ? (
                <p className={`text-sm ${textPrimary}`}>
                  Привязан{form.telegram_username ? `: @${form.telegram_username}` : ""}
                </p>
              ) : (
                <button
                    type="button"
                    disabled={tgBusy || form.profile_locked}
                    onClick={handleLinkTelegram}
                    className="rounded-xl bg-[#229ED9] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1b8fc4] disabled:opacity-40"
                  >
                    {tgBusy ? "Ждём подтверждение в Telegram…" : "Привязать Telegram"}
                  </button>
              )}
            </section>
          </div>
          ) : null}

          {showSecurity ? (
          <div className="min-w-0 space-y-5">
            <section className={`md:p-6 ${sectionCls}`}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className={`text-sm font-semibold ${textPrimary}`}>Двухфакторная аутентификация</h2>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    form.two_fa_enabled
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : isDark
                        ? "bg-zinc-800 text-zinc-400"
                        : "bg-black/[0.05] text-gray-500"
                  }`}
                >
                  {form.two_fa_enabled ? "Вкл." : "Выкл."}
                </span>
              </div>

              {!form.two_fa_enabled && twoFaMode === "idle" ? (
                <button
                  type="button"
                  disabled={twoFaBusy}
                  onClick={handleStartTwoFa}
                  className="rounded-xl bg-[#3390ec] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#2d7fd6] disabled:opacity-40"
                >
                  {twoFaBusy ? "…" : "Включить"}
                </button>
              ) : null}

              {!form.two_fa_enabled && twoFaMode === "setup" ? (
                <div className="space-y-3">
                  {twoFaOtpAuthUrl ? (
                    <div className="mx-auto aspect-square w-[min(calc(100vw-2rem),32rem)]">
                      <ProfileQrCode value={twoFaOtpAuthUrl} fill className="h-full w-full" />
                    </div>
                  ) : null}
                  <InputActionGroup
                    isDark={isDark}
                    shellClass={inputShellCls}
                    value={twoFaCode}
                    onChange={(v) => setTwoFaCode(v.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    placeholder="Код из приложения"
                    buttonLabel="Подтвердить"
                    buttonDisabled={twoFaBusy || twoFaCode.length < 6}
                    onAction={handleEnableTwoFa}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setTwoFaMode("idle");
                      setTwoFaOtpAuthUrl("");
                      setTwoFaCode("");
                    }}
                    className={`text-xs font-medium ${muted} hover:opacity-80`}
                  >
                    Отмена
                  </button>
                </div>
              ) : null}

              {form.two_fa_enabled ? (
                <div className="space-y-2">
                  {twoFaMode !== "disable" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setTwoFaMode("disable");
                        setTwoFaCode("");
                      }}
                      className="rounded-xl bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-500/15 dark:text-rose-400"
                    >
                      Отключить
                    </button>
                  ) : (
                    <>
                      <InputActionGroup
                        isDark={isDark}
                        shellClass={inputShellCls}
                        value={twoFaCode}
                        onChange={(v) => setTwoFaCode(v.replace(/\D/g, "").slice(0, 6))}
                        inputMode="numeric"
                        placeholder="Код из приложения"
                        buttonLabel="Отключить"
                        buttonDisabled={twoFaBusy || twoFaCode.length < 6}
                        onAction={handleDisableTwoFa}
                        tone="danger"
                      />
                      <button
                        type="button"
                        onClick={() => setTwoFaMode("idle")}
                        className={`text-xs font-medium ${muted} hover:opacity-80`}
                      >
                        Отмена
                      </button>
                    </>
                  )}
                </div>
              ) : null}
            </section>
          </div>
          ) : null}
        </div>

        {error && showEdit ? (
          <p className="rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>
        ) : null}

        {showEdit ? (
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
            {ok ? (
              <span className="inline-flex items-center justify-center gap-1.5 self-center rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 sm:self-auto">
                <CheckIcon />
                {ok}
              </span>
            ) : null}
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-2xl bg-[#3390ec] py-3.5 text-sm font-semibold text-white transition hover:bg-[#2d7fd6] disabled:opacity-50 sm:max-w-xs"
            >
              {saving ? "Сохраняем…" : "Сохранить изменения"}
            </button>
        </div>
        ) : null}
      </form>

      {showSecurity ? (
      <section className={`mt-6 ${sectionCls}`}>
          <h2 className={`mb-2 text-sm font-semibold ${textPrimary}`}>Удаление аккаунта</h2>
          <p className={`mb-3 text-xs ${muted}`}>
            Журнал и оценки останутся у колледжа. Будут удалены вход, сеансы и личные данные профиля.
          </p>
          {!deleteOpen ? (
            <button
              type="button"
              onClick={() => {
                setDeleteOpen(true);
                setError("");
              }}
              className="rounded-xl bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-500/15 dark:text-rose-400"
            >
              Удалить аккаунт
            </button>
          ) : (
            <div className="space-y-3">
              {form.email ? (
                <Field label="Введите email для подтверждения" muted={muted}>
                  <input
                    type="email"
                    autoComplete="off"
                    value={deleteEmail}
                    onChange={(e) => setDeleteEmail(e.target.value)}
                    className={inputCls}
                    placeholder={form.email}
                  />
                </Field>
              ) : (
                <Field label="Введите имя для подтверждения" muted={muted}>
                  <input
                    type="text"
                    autoComplete="off"
                    value={deleteName}
                    onChange={(e) => setDeleteName(e.target.value)}
                    className={inputCls}
                    placeholder={form.display_name}
                  />
                </Field>
              )}
              <Field label="Пароль" muted={muted}>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className={inputCls}
                />
              </Field>
              {form.two_fa_enabled ? (
                <Field label="Код 2FA" muted={muted}>
                  <input
                    inputMode="numeric"
                    value={deleteTotp}
                    onChange={(e) => setDeleteTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className={inputCls}
                    placeholder="000000"
                  />
                </Field>
              ) : null}
              {error ? (
                <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={deleteBusy}
                  onClick={async () => {
                    setDeleteBusy(true);
                    setError("");
                    const r = await deleteOwnAccount({
                      confirm_email: form.email ? deleteEmail : undefined,
                      confirm_name: form.email ? undefined : deleteName,
                      password: deletePassword,
                      totp_code: form.two_fa_enabled ? deleteTotp : undefined,
                    });
                    setDeleteBusy(false);
                    if (!r.ok) {
                      setError(r.error);
                      return;
                    }
                    await logoutApp();
                    onLogout?.();
                  }}
                  className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
                >
                  {deleteBusy ? "Удаляем…" : "Удалить безвозвратно"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteOpen(false);
                    setDeletePassword("");
                    setDeleteTotp("");
                  }}
                  className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${borderSubtle} ${textPrimary}`}
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {detailSession ? (
        <SessionDetailsModal
          session={detailSession}
          isDark={isDark}
          muted={muted}
          textPrimary={textPrimary}
          onClose={() => setSessionDetailsId(null)}
          onRevoke={async () => {
            const r = await revokeAppSession(detailSession.id);
            if (r.ok) {
              setSessionsList((prev) => prev.filter((x) => x.id !== detailSession.id));
              setSessionDetailsId(null);
            }
          }}
        />
      ) : null}

      {showQrScanner ? (
        <AppQrScanner
          isDark={isDark}
          fullscreen
          onBack={() => setShowQrScanner(false)}
          onSuccess={() => {
            setShowQrScanner(false);
            setOk("Вход на компьютере подтверждён");
          }}
          onError={(msg) => setError(msg)}
        />
      ) : null}
    </div>
  );
}

function SessionDetailsModal({
  session,
  isDark,
  muted,
  textPrimary,
  onClose,
  onRevoke,
}: {
  session: AppSessionRow;
  isDark: boolean;
  muted: string;
  textPrimary: string;
  onClose: () => void;
  onRevoke: () => void | Promise<void>;
}) {
  const [revoking, setRevoking] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const panel = isDark
    ? "border border-zinc-700 bg-zinc-900 text-zinc-100"
    : "border border-gray-200 bg-white text-gray-900";

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`w-full max-w-sm rounded-2xl p-5 shadow-xl ${panel}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <SessionDeviceIcon kind={session.device_kind} isDark={isDark} />
            <div className="min-w-0">
              <h3 className={`text-base font-semibold ${textPrimary}`}>
                {sessionTitle(session)}
                {session.is_current ? <span className={`ml-1 text-xs font-normal ${muted}`}>· сейчас</span> : null}
              </h3>
              <p className={`truncate text-xs tabular-nums ${muted}`}>{formatSessionIp(session.ip_address)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`shrink-0 rounded-lg p-2 ${isDark ? "hover:bg-zinc-800" : "hover:bg-gray-100"}`}
            aria-label="Закрыть"
          >
            <CloseIcon />
          </button>
        </div>
        <dl className={`space-y-2 text-sm ${muted}`}>
          <div className="flex justify-between gap-3">
            <dt>Создан</dt>
            <dd className={`text-right ${textPrimary}`}>{new Date(session.created_at).toLocaleString("ru-RU")}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Активность</dt>
            <dd className={`text-right ${textPrimary}`}>{new Date(session.last_seen).toLocaleString("ru-RU")}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Истекает</dt>
            <dd className={`text-right ${textPrimary}`}>{new Date(session.expires_at).toLocaleString("ru-RU")}</dd>
          </div>
        </dl>
        <p className={`mt-3 break-all text-xs ${muted}`}>{session.user_agent}</p>
        {!session.is_current ? (
          <button
            type="button"
            disabled={revoking}
            onClick={async () => {
              setRevoking(true);
              await onRevoke();
              setRevoking(false);
            }}
            className="mt-5 w-full rounded-xl bg-rose-500/10 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-500/15 disabled:opacity-50 dark:text-rose-400"
          >
            {revoking ? "Завершаем…" : "Завершить сеанс"}
          </button>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

function SessionDeviceIcon({ kind, isDark }: { kind: string; isDark: boolean }) {
  const stroke = isDark ? "#a1a1aa" : "#6b7280";
  if (kind === "mobile") {
    return (
      <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" aria-hidden>
        <rect x="7" y="2" width="10" height="20" rx="2" />
        <path d="M11 18h2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" aria-hidden>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 20h8" strokeLinecap="round" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function Field({ label, muted, children }: { label: string; muted: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={`mb-1.5 block text-xs font-medium ${muted}`}>{label}</span>
      {children}
    </label>
  );
}

function InputActionGroup({
  isDark,
  shellClass,
  value,
  onChange,
  buttonLabel,
  buttonDisabled,
  onAction,
  type = "text",
  inputMode,
  placeholder,
  autoComplete,
  inputClassName = "",
  tone = "primary",
}: {
  isDark: boolean;
  shellClass: string;
  value: string;
  onChange: (v: string) => void;
  buttonLabel: string;
  buttonDisabled?: boolean;
  onAction: () => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
  autoComplete?: string;
  inputClassName?: string;
  tone?: "primary" | "danger";
}) {
  const btn = tone === "danger" ? "bg-rose-500 hover:bg-rose-600" : "bg-[#3390ec] hover:bg-[#2d7fd6]";

  return (
    <div className={`flex min-h-0 w-full flex-col overflow-hidden rounded-xl transition-colors duration-200 sm:flex-row ${shellClass}`}>
      <input
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`min-w-0 w-full flex-1 border-0 bg-transparent px-3.5 py-2.5 text-[15px] outline-none transition-colors duration-200 ${
          isDark ? "text-zinc-100 placeholder:text-zinc-600" : "text-gray-900 placeholder:text-gray-400"
        } ${inputClassName}`}
      />
      <button
        type="button"
        disabled={buttonDisabled}
        onClick={onAction}
        className={`w-full shrink-0 border-t px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 disabled:opacity-40 sm:w-auto sm:border-t-0 sm:border-l ${
          isDark ? "border-white/10" : "border-black/[0.08]"
        } ${btn}`}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}