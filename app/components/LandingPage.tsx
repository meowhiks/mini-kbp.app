"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getLkAppUrl } from "@/lib/client/lkAppUrl";
import LandingPreview from "./LandingPreview";
import LandingJournalPreview from "./LandingJournalPreview";

const LK_APP_URL = getLkAppUrl();

const CAPABILITIES = [
  {
    title: "Расписание",
    text: "Поиск по группе, преподавателю или аудитории. Замены, полоска дней, отсчёт до следующей пары.",
  },
  {
    title: "Журнал студента",
    text: "Оценки, средний балл, пояснения к отметкам.",
  },
  {
    title: "Классный журнал",
    text: "Посещаемость, опоздания и пропуски — таблица по группе.",
  },
  {
    title: "Локально на устройстве",
    text: "Кэш и настройки хранятся у вас — без облачного сохранения лишних данных.",
  },
  {
    title: "Уведомления и темы",
    text: "Изменения в расписании и журнале. Светлая, тёмная или OLED-тема.",
  },
] as const;

const FOR_WHO = [
  {
    role: "Студентам",
    points: [
      "Электронный журнал и средний балл",
      "Расписание своей группы",
      "Уведомления об изменениях",
    ],
  },
  {
    role: "Преподавателям",
    points: [
      "Расписание по преподавателю",
      "Классный журнал и отметки",
      "Расширенные настройки отображения",
    ],
  },
] as const;

const HIGHLIGHTS = [
  "Студентам — оценки, средний балл, расписание группы",
  "Преподавателям — своё расписание, журналы и отметки",
  "Локально на устройстве — без облачного сохранения",
  "Работает в браузере и как Android-приложение",
] as const;

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, visible };
}

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  const features = useInView();

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="landing-page relative min-h-screen overflow-x-hidden bg-[#f4f7fc] text-gray-900">
      <div className="landing-blob landing-blob-1" aria-hidden="true" />
      <div className="landing-blob landing-blob-2" aria-hidden="true" />
      <div className="landing-blob landing-blob-3" aria-hidden="true" />
      <div className="landing-grid-light pointer-events-none absolute inset-0" aria-hidden="true" />

      <Link
        href={LK_APP_URL}
        className="fixed bottom-5 left-5 z-20 text-[11px] text-gray-400/80 transition hover:text-gray-600"
      >
        Преподавателям и администраторам
      </Link>

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <div className="flex items-center gap-3">
          <Image src="/minikbp.svg" alt="" width={40} height={40} className="h-10 w-10" priority />
          <span className="font-comfortaa text-lg font-bold tracking-tight text-gray-900 sm:text-xl">
            Мини КБиП
          </span>
        </div>
        <nav className="hidden items-center gap-6 text-sm text-gray-500 sm:flex">
          <a href="#features" className="transition-colors hover:text-gray-900">
            Возможности
          </a>
          <a href="#about" className="transition-colors hover:text-gray-900">
            О проекте
          </a>
        </nav>
        <Link
          href={LK_APP_URL}
          className="rounded-full bg-[#3390ec] px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(51,144,236,0.28)] transition-all hover:bg-[#2d7fd6] hover:shadow-[0_12px_32px_rgba(51,144,236,0.35)] active:scale-[0.98]"
        >
          Открыть
        </Link>
      </header>

      <main className="relative z-10">
        <section className="mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-8 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:pb-28 lg:pt-14">
          <div className={`landing-reveal ${mounted ? "landing-reveal-visible" : ""}`}>
            

            <h1 className="font-comfortaa text-[clamp(2.6rem,8vw,4.5rem)] font-bold leading-[1.05] tracking-tight text-gray-900">
              Мини КБиП
            </h1>

            <p className="mt-5 max-w-xl text-lg leading-relaxed text-gray-600 sm:text-xl">
              Расписание, журнал оценок и классный журнал с отметками — в одном приложении. Студентам и
              учителям, локально на устройстве, без лишнего шума.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                href={LK_APP_URL}
                className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-[#3390ec] px-7 py-4 text-base font-semibold text-white shadow-[0_12px_40px_rgba(51,144,236,0.28)] transition-all hover:bg-[#2d7fd6] hover:shadow-[0_16px_48px_rgba(51,144,236,0.35)] active:scale-[0.98]"
              >
                Перейти в приложение
                <svg
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
              <a
                href="/downloads/mini-kbp-0.1.71.apk"
                download="Мини-КБиП-0.1.71.apk"
                className="group inline-flex items-center justify-center gap-2.5 rounded-2xl bg-emerald-500 px-7 py-4 text-base font-semibold text-white shadow-[0_12px_40px_rgba(16,185,129,0.28)] transition-all hover:bg-emerald-600 hover:shadow-[0_16px_48px_rgba(16,185,129,0.35)] active:scale-[0.98]"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M17.523 15.341a1.04 1.04 0 1 1 0-2.08 1.04 1.04 0 0 1 0 2.08m-11.046 0a1.04 1.04 0 1 1 0-2.08 1.04 1.04 0 0 1 0 2.08m11.42-6.02 1.84-3.19a.43.43 0 0 0-.156-.59.43.43 0 0 0-.59.157l-1.86 3.23a13.13 13.13 0 0 0-4.94-.93c-1.74 0-3.41.32-4.94.93L4.34 5.7a.43.43 0 0 0-.59-.157.43.43 0 0 0-.156.59l1.84 3.19C2.34 11.13.5 14.04.5 17.41h22.92c0-3.37-1.84-6.28-5.54-8.09" />
                </svg>
                <span>Скачать APK</span>
                <span className="hidden text-emerald-50/85 sm:inline">·</span>
                <span className="text-sm font-medium text-emerald-50/90">0.1.71 · 4.6 МБ</span>
              </a>
              <a
                href="https://t.me/meowhiks"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-7 py-4 text-base font-medium text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:shadow-md"
              >
                Telegram разработчика
              </a>
            </div>

            <ul className="mt-10 grid gap-2 sm:grid-cols-2">
              {HIGHLIGHTS.map((item, i) => (
                <li
                  key={item}
                  className={`landing-highlight flex items-start gap-2.5 text-sm text-gray-500 ${mounted ? "landing-highlight-visible" : ""}`}
                  style={{ animationDelay: `${400 + i * 70}ms` }}
                >
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                    <svg viewBox="0 0 12 12" fill="currentColor" className="h-2.5 w-2.5">
                      <path d="M4.5 8.5 2 6l.7-.7 1.8 1.8 4.8-4.8.7.7z" />
                    </svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <LandingPreview animate={mounted} />
        </section>

        <section className="border-t border-gray-200/80 bg-white/60 py-16 sm:py-20">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 sm:px-8 lg:grid-cols-[1fr_0.9fr] lg:gap-16">
            <div className={`landing-reveal order-2 lg:order-1 ${mounted ? "landing-reveal-visible" : ""}`}>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-600">Журнал</p>
              <h2 className="mt-2 font-comfortaa text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                Оценки как в электронном журнале
              </h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-gray-500">
                Таблица предметов, даты, средний балл и красные отметки — всё как в приложении. Удобно
                смотреть с телефона, без лишних экранов.
              </p>
              <ul className="mt-6 space-y-2.5 text-sm text-gray-600">
                {[
                  "Средний балл по предмету и общий",
                  "Пояснения к отметкам по нажатию",
                  "Классный журнал с посещаемостью",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2.5">
                    <span className="h-px w-4 shrink-0 bg-emerald-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="order-1 flex justify-center lg:order-2">
              <LandingJournalPreview animate={mounted} />
            </div>
          </div>
        </section>

        <section id="features" ref={features.ref} className="relative border-t border-gray-200/80 bg-white py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className={`landing-reveal max-w-xl ${features.visible ? "landing-reveal-visible" : ""}`}>
              <h2 className="font-comfortaa text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                Возможности
              </h2>
              <p className="mt-3 text-base leading-relaxed text-gray-500">
                Расписание, журнал и классный журнал — отдельно для студентов и преподавателей, без лишних экранов.
              </p>
            </div>

            <div
              className={`feature-spec mt-12 ${features.visible ? "landing-card-visible" : ""}`}
            >
              <div className="feature-spec__who">
                {FOR_WHO.map((block) => (
                  <div key={block.role} className="feature-spec__who-col">
                    <h3 className="feature-spec__who-title">{block.role}</h3>
                    <ul className="feature-spec__who-list">
                      {block.points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="feature-spec__divider" aria-hidden="true" />

              <dl className="feature-spec__list">
                {CAPABILITIES.map((item, i) => (
                  <div
                    key={item.title}
                    className={`feature-spec__row ${features.visible ? "landing-card-visible" : ""}`}
                    style={{ animationDelay: `${120 + i * 60}ms` }}
                  >
                    <dt className="feature-spec__term">{item.title}</dt>
                    <dd className="feature-spec__desc">{item.text}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        <section id="about" className="py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="landing-cta rounded-[2rem] border border-blue-100 bg-gradient-to-br from-white via-blue-50/40 to-sky-50/60 p-8 shadow-[0_20px_60px_rgba(51,144,236,0.1)] sm:p-12">
              <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <h2 className="font-comfortaa text-3xl font-bold text-gray-900 sm:text-4xl">
                    Готовы попробовать?
                  </h2>
                  <p className="mt-4 max-w-lg text-base leading-relaxed text-gray-500">
                    Откройте веб-версию или установите Android-сборку. Студентам — журнал и расписание,
                    преподавателям — классный журнал, отметки и расширенный функционал. Всё локально, без
                    рекламы и лишних экранов.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                  <a
                    href="/downloads/mini-kbp-0.1.71.apk"
                    download="Мини-КБиП-0.1.71.apk"
                    className="group inline-flex items-center justify-center gap-2.5 rounded-2xl bg-emerald-500 px-8 py-4 text-base font-bold text-white shadow-lg shadow-emerald-500/25 transition-all hover:bg-emerald-600 active:scale-[0.98]"
                  >
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M17.523 15.341a1.04 1.04 0 1 1 0-2.08 1.04 1.04 0 0 1 0 2.08m-11.046 0a1.04 1.04 0 1 1 0-2.08 1.04 1.04 0 0 1 0 2.08m11.42-6.02 1.84-3.19a.43.43 0 0 0-.156-.59.43.43 0 0 0-.59.157l-1.86 3.23a13.13 13.13 0 0 0-4.94-.93c-1.74 0-3.41.32-4.94.93L4.34 5.7a.43.43 0 0 0-.59-.157.43.43 0 0 0-.156.59l1.84 3.19C2.34 11.13.5 14.04.5 17.41h22.92c0-3.37-1.84-6.28-5.54-8.09" />
                    </svg>
                    <span>Скачать APK</span>
                    <span className="hidden text-emerald-50/85 sm:inline">·</span>
                    <span className="text-sm font-medium text-emerald-50/90">0.1.71 · 4.6 МБ</span>
                  </a>
                  <Link
                    href={LK_APP_URL}
                    className="inline-flex items-center justify-center rounded-2xl bg-[#3390ec] px-8 py-4 text-base font-bold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-[#2d7fd6] active:scale-[0.98]"
                  >
                    Запустить приложение
                  </Link>
                  <a
                    href="https://www.donationalerts.com/r/meowhiks_off"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-2xl border border-pink-200 bg-pink-50 px-8 py-4 text-base font-semibold text-pink-600 transition-all hover:bg-pink-100"
                  >
                    Поддержать проект
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-gray-200 bg-white/80 py-10 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 text-sm text-gray-500 sm:flex-row sm:px-8">
          <p>
            <span className="font-comfortaa font-bold text-gray-800">Мини КБиП</span>
            <span className="mx-2 text-gray-300">·</span>
            Неофициальный проект
          </p>
          <div className="flex items-center gap-5">
            <Link href={LK_APP_URL} className="text-gray-400 hover:text-gray-600">
              Вход
            </Link>
            <a href="https://t.me/meowhiks" target="_blank" rel="noreferrer" className="hover:text-gray-800">
              Telegram
            </a>
            <a href="https://github.com/meowhiks" target="_blank" rel="noreferrer" className="hover:text-gray-800">
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
