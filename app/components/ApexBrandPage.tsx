"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { APP_RELEASES, FEATURE_WORDS } from "@/lib/client/appDownloads";
import { getLkAppUrl } from "@/lib/client/lkAppUrl";
import { getServerUrl } from "@/lib/client/serverUrl";

const HERO_WORDS = ["Мини КБиП", "Расписание", "Удобство"] as const;

function wordLetters(word: string): string[] {
  return [...word.replace(/\s+/g, "")];
}

const HERO_SLOTS = Math.max(...HERO_WORDS.map((word) => wordLetters(word).length));

function paddedLetters(word: string): string[] {
  const chars = wordLetters(word);
  const pad = HERO_SLOTS - chars.length;
  const left = Math.floor(pad / 2);
  return [...Array(left).fill(""), ...chars, ...Array(HERO_SLOTS - left - chars.length).fill("")];
}

type AccountChip = {
  name: string;
  avatarUrl: string;
};

type NavItem = {
  href: string;
  label: string;
  app?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/downloads", label: "Скачать приложение" },
  { href: "/privacy", label: "Политика конфиденциальности" },
  { href: "/terms", label: "Пользовательское соглашение" },
  { href: "/developers", label: "API для разработчиков" },
  { href: "/app", label: "Открыть приложение", app: true },
];

const iconClass = "h-10 w-10";

const APP_PERKS: { title: string; text: ReactNode; icon: ReactNode }[] = [
  {
    title: "Журнал",
    text: (
      <>
        Оценки и средний балл по предметам.
      </>
    ),
    icon: (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 0-2 2V4Z" />
        <path d="M7 8h8M7 12h8M7 16h5" />
      </svg>
    ),
  },
  {
    title: "Расписание",
    text: (
      <>
        Пары по свайпу, <strong>ближайший урок</strong> и замены — без лишней прокрутки.
      </>
    ),
    icon: (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M4 10h16M8 3v4M16 3v4" />
      </svg>
    ),
  },
  {
    title: "Офлайн",
    text: (
      <>
        Журнал и расписание <strong>остаются на телефоне</strong>, если сеть пропала.
      </>
    ),
    icon: (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M5 12a7 7 0 0 1 14 0M8 15a4 4 0 0 1 8 0M12 19h.01" />
        <path d="m4 5 16 14" />
      </svg>
    ),
  },
  {
    title: "Оценки",
    text: (
      <>
        Оценки, зачёты, н-ки, опаздания, лабора.
      </>
    ),
    icon: (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M8 17V7l8 10V7" />
      </svg>
    ),
  },
  {
    title: "Тема",
    text: (
      <>
        Светлая, тёмная и <strong>не OLED-чёрная</strong> — глаза не устают вечером.
      </>
    ),
    icon: (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18" />
      </svg>
    ),
  },
  {
    title: "История",
    text: (
      <>
        Кто поставил отметку и когда. Можно <strong>отменить правку</strong>.
      </>
    ),
    icon: (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 12a8 8 0 1 0 2-5.3M4 4v5h5" />
        <path d="M12 8v5l3 2" />
      </svg>
    ),
  },
  {
    title: "Вход",
    text: (
      <>
        Google, Telegram или быстрый вход по QR.
      </>
    ),
    icon: (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="8" r="3" />
        <path d="M5 19a7 7 0 0 1 14 0" />
      </svg>
    ),
  },
  {
    title: "Замены",
    text: (
      <>
        Быстрый просмотр замен без лишних действий.
      </>
    ),
    icon: (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M7 8h10M7 12h6M7 16h8" />
        <path d="m16 14 3 3-3 3" />
      </svg>
    ),
  },
];

async function loadApexAccount(): Promise<AccountChip | null> {
  const base = getServerUrl().replace(/\/$/, "");
  if (!base) return null;
  try {
    const profile = await fetch(`${base}/v0/app/profile/`, { credentials: "include" });
    if (profile.ok) {
      const data = (await profile.json()) as { display_name?: string; nickname?: string; avatar_url?: string };
      const name = (data.display_name || data.nickname || "").trim();
      const avatarUrl = (data.avatar_url || "").trim();
      if (name || avatarUrl) return { name: name || "Аккаунт", avatarUrl };
    }
  } catch {
    /* continue */
  }
  try {
    const resp = await fetch(`${base}/v0/auth/passport/`, { credentials: "include" });
    if (!resp.ok) return null;
    const body = (await resp.json()) as {
      passport?: { display_name?: string; avatar_url?: string };
    };
    const name = body.passport?.display_name?.trim() || "";
    const avatarUrl = body.passport?.avatar_url?.trim() || "";
    if (!name && !avatarUrl) return null;
    return { name: name || "Аккаунт", avatarUrl };
  } catch {
    return null;
  }
}

function NavLinks({
  appUrl,
  onNavigate,
}: {
  appUrl: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.label}
          href={item.app ? appUrl : item.href}
          className="apex-brand__tab text-xl font-semibold"
          onClick={onNavigate}
        >
          {item.label}
        </Link>
      ))}
    </>
  );
}

export default function ApexBrandPage() {
  const [account, setAccount] = useState<AccountChip | null>(null);
  const [wordIndex, setWordIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const appUrl = getLkAppUrl();
  const word = HERO_WORDS[wordIndex] ?? HERO_WORDS[0];
  const letters = useMemo(() => paddedLetters(word), [word]);
  const mid = (HERO_SLOTS - 1) / 2;
  const marquee = [...FEATURE_WORDS, ...FEATURE_WORDS];

  useEffect(() => {
    let cancelled = false;
    void loadApexAccount().then((chip) => {
      if (!cancelled) setAccount(chip);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cycleMs = 5000;
    const hiddenAt = cycleMs * 0.45;
    let intervalId = 0;
    const first = window.setTimeout(() => {
      setWordIndex((i) => (i + 1) % HERO_WORDS.length);
      intervalId = window.setInterval(() => {
        setWordIndex((i) => (i + 1) % HERO_WORDS.length);
      }, cycleMs);
    }, hiddenAt);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const initial = (account?.name || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="bg-white">
      <section className="apex-brand relative flex min-h-dvh items-center justify-center overflow-hidden bg-white">
        <button
          type="button"
          className="absolute left-4 top-4 z-40 flex h-11 w-11 items-center justify-center rounded-full text-neutral-900 md:left-6 md:top-6 lg:hidden"
          aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? (
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          ) : (
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            </svg>
          )}
        </button>

        <a
          href={appUrl}
          className="apex-brand__account absolute right-4 top-4 z-30 flex max-w-[min(calc(100%-4.5rem),18rem)] items-center gap-2 text-sm sm:right-8 sm:top-7"
        >
          {account?.avatarUrl ? (
            <img src={account.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
          ) : account ? (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#3390ec] text-xs font-semibold text-white">
              {initial}
            </span>
          ) : null}
          <span className="truncate font-medium">{account?.name || "Войти в аккаунт"}</span>
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </a>

        <div className="apex-brand__bg pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <div className="apex-brand__letters">
            {letters.map((letter, i) => (
              <span
                key={i}
                className="apex-brand__letter select-none"
                style={{ ["--i" as string]: i - mid }}
              >
                {letter}
              </span>
            ))}
          </div>
        </div>

        <h1 className="apex-brand__title relative z-10 px-6 text-center text-neutral-950">Мини КБиП</h1>

        {menuOpen ? null : (
        <button
          type="button"
          className="apex-brand__scroll-hint"
          onClick={() =>
            document.getElementById("apex-more")?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        )}

        <nav className="absolute inset-x-0 bottom-0 z-30 hidden flex-wrap items-center justify-center gap-x-3 gap-y-2 px-5 py-5 sm:px-8 sm:py-7 lg:flex">
          {NAV_ITEMS.map((item, i) => (
            <span key={item.label} className="flex items-center gap-3">
              {i > 0 ? (
                <span className="text-neutral-300" aria-hidden="true">
                  |
                </span>
              ) : null}
              <Link href={item.app ? appUrl : item.href} className="apex-brand__tab">
                {item.label}
              </Link>
            </span>
          ))}
        </nav>

        {menuOpen ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-white px-8 lg:hidden">
            <nav className="flex flex-col items-center gap-6 text-center">
              <NavLinks appUrl={appUrl} onNavigate={() => setMenuOpen(false)} />
            </nav>
          </div>
        ) : null}
      </section>

      <section id="apex-more" className="apex-marquee-section" aria-label="Возможности">
        <div className="apex-feature-track">
          {marquee.map((wordChip, i) => (
            <span key={`${wordChip}-${i}`} className="apex-feature-word">
              {wordChip}
            </span>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-16 sm:py-20" aria-label="Скачать">
        <div className="text-center">
          <h2 className="font-montserrat text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            Скачивайте, где удобно
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-neutral-500">
            Один аккаунт, три платформы. Обновления выходят часто.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <a
            href={APP_RELEASES[0]?.apkHref || "/downloads"}
            className="group relative flex min-h-[260px] flex-col justify-between overflow-hidden rounded-[24px] border border-emerald-100 bg-emerald-50/60 p-6 no-underline transition-colors hover:bg-emerald-50"
          >
            <div className="relative z-10">
              <p className="text-xl font-semibold text-neutral-900">Android</p>
              <p className="mt-1 text-sm text-neutral-500">APK-файл, установка в один клик</p>
            </div>
            <div className="relative z-10 mt-6 flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-400">{APP_RELEASES[0]?.version}</span>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                Скачать
                <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </div>
            <svg className="pointer-events-none absolute -bottom-6 -right-6 h-32 w-32 text-emerald-600/[0.07] transition-transform duration-300 group-hover:scale-110" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.6 9.5 19 8.1a.7.7 0 0 0 0-1L18 6a.7.7 0 0 0-1 0l-1.5 1.5A7.4 7.4 0 0 0 8.5 7.5L7 6a.7.7 0 0 0-1 0L5 7.1a.7.7 0 0 0 0 1L6.4 9.5A5.8 5.8 0 0 0 6 12v.5h12V12c0-.9-.1-1.7-.4-2.5ZM9 11a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6Zm6 0a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6ZM7 13.5v5c0 .8.7 1.5 1.5 1.5H9v2.2a.8.8 0 0 0 1.6 0V20h2.8v2.2a.8.8 0 0 0 1.6 0V20h.5c.8 0 1.5-.7 1.5-1.5v-5H7Z" />
            </svg>
          </a>

          <a
            href="https://github.com/meowhiks/mini-kbp"
            className="group relative flex min-h-[260px] flex-col justify-between overflow-hidden rounded-[24px] border border-neutral-200 bg-neutral-50 p-6 no-underline transition-colors hover:bg-neutral-100"
          >
            <div className="relative z-10">
              <p className="text-xl font-semibold text-neutral-900">Desktop</p>
              <p className="mt-1 text-sm text-neutral-500">Windows и Linux, сборка на GitHub</p>
            </div>
            <div className="relative z-10 mt-6 flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-400">{APP_RELEASES[0]?.version}</span>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-neutral-700">
                Открыть
                <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </div>
            <svg className="pointer-events-none absolute -bottom-6 -right-6 h-32 w-32 text-neutral-900/[0.05] transition-transform duration-300 group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
              <rect x="3" y="4" width="18" height="12" rx="2" />
              <path d="M8 20h8M12 16v4" />
            </svg>
          </a>

          <Link
            href={appUrl}
            className="group relative flex min-h-[260px] flex-col justify-between overflow-hidden rounded-[24px] bg-neutral-950 p-6 no-underline transition-colors hover:bg-neutral-900"
          >
            <div className="relative z-10">
              <p className="text-xl font-semibold text-white">Web</p>
              <p className="mt-1 text-sm text-neutral-400">Без установки, прямо в браузере</p>
            </div>
            <div className="relative z-10 mt-6 flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-500">{APP_RELEASES[0]?.version}</span>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
                Перейти
                <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </div>
            <svg className="pointer-events-none absolute -bottom-6 -right-6 h-32 w-32 text-white/5 transition-transform duration-300 group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
            </svg>
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-20 sm:pb-24" aria-label="Плюсы Мини КБиПа">
        <h2 className="mb-10 text-center font-montserrat text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          Плюсы Мини КБиПа
        </h2>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {APP_PERKS.map((perk) => (
            <article key={perk.title} className="min-w-0 text-center">
              <div className="mb-4 flex justify-center text-neutral-400">{perk.icon}</div>
              <p className="text-lg font-semibold text-neutral-900">{perk.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{perk.text}</p>
            </article>
          ))}
        </div>
      </section>

      <ApexSiteFooter appUrl={appUrl} />
    </div>
  );
}

function ApexSiteFooter({ appUrl }: { appUrl: string }) {
  return (
    <footer className="bg-white px-4 pb-10 pt-2 sm:px-6">
      <div className="relative overflow-hidden rounded-[28px] border border-neutral-200 bg-neutral-50 px-6 py-10 text-neutral-900 sm:px-10 sm:py-12">
        <div className="grid gap-10 lg:grid-cols-[1.35fr_0.7fr_0.7fr_1.05fr] lg:items-start">
          <div>
            <div className="flex items-center gap-3">
              <img src="/minikbp.svg" alt="" className="h-9 w-9 rounded-lg bg-white object-contain p-0.5" />
              <p className="text-lg font-bold tracking-wide">МИНИ КБИП</p>
            </div>
            <p className="mt-5 max-w-md text-xs leading-relaxed text-neutral-500 sm:text-sm">
              «Мини КБиП» — независимый сервис, не связанный с Колледжем бизнеса и права. Мы предоставляем
              удобные электронные таблицы, наглядное расписание, уведомления для учеников и инструменты,
              упрощающие работу учителям. Конфиденциальность данных пользователей — наш приоритет.
            </p>
            <p className="mt-6 text-xs text-neutral-400">© Мини КБиП 2026</p>
          </div>

          <div>
            <p className="text-sm font-semibold text-neutral-900">Навигация</p>
            <ul className="mt-4 space-y-2.5 text-sm text-neutral-500">
              <li>
                <Link href="/downloads" className="hover:text-[#3390ec]">
                  Скачать приложение
                </Link>
              </li>
              <li>
                <Link href={appUrl} className="hover:text-[#3390ec]">
                  Личный кабинет
                </Link>
              </li>
              <li>
                <Link href="/developers" className="hover:text-[#3390ec]">
                  API для разработчиков
                </Link>
              </li>
              <li>
                <a href="https://github.com/meowhiks/mini-kbp" className="hover:text-[#3390ec]">
                  GitHub
                </a>
              </li>
              <li>
                <a href="https://t.me/mini_kbp" className="hover:text-[#3390ec]">
                  Канал в Telegram
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-neutral-900">Документы</p>
            <ul className="mt-4 space-y-2.5 text-sm text-neutral-500">
              <li>
                <Link href="/terms" className="hover:text-[#3390ec]">
                  Пользовательское соглашение
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-[#3390ec]">
                  Политика конфиденциальности
                </Link>
              </li>
            </ul>
          </div>

          <a
            href="https://t.me/meowhiks"
            className="relative overflow-hidden rounded-2xl bg-[#229ED9] p-5 text-white no-underline"
          >
            <svg
              className="pointer-events-none absolute -bottom-6 -right-4 h-36 w-36 text-white/15"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M21.5 3.4 18.7 20c-.2 1-1.2 1.3-2 .8l-5.1-3.8-2.5 2.4c-.3.3-.7.4-1.1.2l.4-6.1 10-9.1c.4-.4-.1-.7-.6-.4L5.4 11.3 1.7 10c-1-.3-1-1.2.2-1.7L20.3 2c.9-.3 1.6.2 1.2 1.4z" />
            </svg>
            <div className="relative z-10">
              <p className="text-base font-semibold">Связаться в Telegram</p>
              <p className="mt-2 text-sm leading-relaxed text-white/90">
                Вопросы, идеи и баги — напрямую разработчику. Канал с обновлениями: @mini_kbp.
              </p>
              <span className="mt-5 inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#229ED9]">
                Написать →
              </span>
            </div>
          </a>
        </div>
      </div>
    </footer>
  );
}
