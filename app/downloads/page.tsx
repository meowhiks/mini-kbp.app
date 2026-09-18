import type { Metadata } from "next";
import Link from "next/link";
import LegalBackLink from "@/app/components/LegalBackLink";
import { APP_RELEASES, currentDesktopDownloads } from "@/lib/client/appDownloads";
import { getLkAppUrl } from "@/lib/client/lkAppUrl";
import { APP_NAME, APP_TAGLINE, SITE_URL } from "@/lib/seo";

const PAGE_TITLE = "Скачать приложение";
const PAGE_DESCRIPTION =
  "Скачайте Мини КБиП на Android, Windows и Linux или откройте веб-кабинет в браузере. Журнал, расписание и оценки — бесплатно.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  keywords: [
    "скачать Мини КБиП",
    "APK КБиП",
    "приложение колледж",
    "расписание КБиП Android",
    "журнал КБиП скачать",
    "Мини КБиП Windows",
    "Мини КБиП Linux",
  ],
  alternates: { canonical: "/downloads" },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    url: "/downloads",
    title: `${PAGE_TITLE} · ${APP_NAME}`,
    description: PAGE_DESCRIPTION,
    siteName: APP_NAME,
  },
  twitter: {
    card: "summary_large_image",
    title: `${PAGE_TITLE} · ${APP_NAME}`,
    description: PAGE_DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

const CHANNEL_LABEL = {
  current: "Актуальная",
  release: null,
  hotfix: "Hotfix",
} as const;

export default function DownloadsPage() {
  const appUrl = getLkAppUrl();
  const current = APP_RELEASES.find((r) => r.channel === "current") ?? APP_RELEASES[0];
  const history = APP_RELEASES.filter((r) => r.version !== current?.version);
  const version = current?.version ?? APP_RELEASES[0]?.version;
  const apkHref = current?.apkHref || "/downloads/mini-kbp-latest.apk";
  const desktop = currentDesktopDownloads(current);

  const jsonLdDownloads = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: APP_NAME,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Android, Windows, Linux, Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: "BYN" },
    description: `${APP_TAGLINE}. ${PAGE_DESCRIPTION}`,
    url: `${SITE_URL}/downloads`,
    downloadUrl: `${SITE_URL}${apkHref}`,
    softwareVersion: version,
    inLanguage: "ru-RU",
  };

  return (
    <main className="mx-auto max-w-6xl px-5 py-12 text-neutral-800 sm:px-8 lg:px-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdDownloads) }}
      />
      <LegalBackLink />

      <h1 className="mt-8 font-montserrat text-4xl font-extrabold tracking-tight text-neutral-950 sm:text-5xl">
        Скачать приложение
      </h1>

      <section className="mt-12 grid gap-5 md:grid-cols-3" aria-label="Платформы">
        <a
          href={apkHref}
          className="group relative flex min-h-[320px] flex-col justify-between overflow-hidden rounded-[28px] border border-emerald-100 bg-emerald-50/70 p-8 no-underline transition-colors hover:bg-emerald-50"
        >
          <div className="relative z-10">
            <p className="font-montserrat text-2xl font-bold tracking-tight text-neutral-950">Телефон</p>
            <p className="mt-2 max-w-[16rem] text-sm leading-relaxed text-neutral-500">
              Android APK. Журнал и расписание остаются на устройстве, если сеть пропала.
            </p>
          </div>
          <div className="relative z-10 mt-8 flex items-end justify-between gap-3">
            <span className="text-xs font-medium text-neutral-400">{version}</span>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
              Скачать APK
              <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
          <svg className="pointer-events-none absolute -bottom-8 -right-6 h-44 w-44 text-emerald-600/[0.08] transition-transform duration-300 group-hover:scale-110" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M17.6 9.5 19 8.1a.7.7 0 0 0 0-1L18 6a.7.7 0 0 0-1 0l-1.5 1.5A7.4 7.4 0 0 0 8.5 7.5L7 6a.7.7 0 0 0-1 0L5 7.1a.7.7 0 0 0 0 1L6.4 9.5A5.8 5.8 0 0 0 6 12v.5h12V12c0-.9-.1-1.7-.4-2.5ZM9 11a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6Zm6 0a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6ZM7 13.5v5c0 .8.7 1.5 1.5 1.5H9v2.2a.8.8 0 0 0 1.6 0V20h2.8v2.2a.8.8 0 0 0 1.6 0V20h.5c.8 0 1.5-.7 1.5-1.5v-5H7Z" />
          </svg>
        </a>

        <div className="group relative flex min-h-[320px] flex-col justify-between overflow-hidden rounded-[28px] border border-neutral-200 bg-neutral-50 p-8">
          <div className="relative z-10">
            <p className="font-montserrat text-2xl font-bold tracking-tight text-neutral-950">Десктоп</p>
            <p className="mt-2 max-w-[16rem] text-sm leading-relaxed text-neutral-500">
              Windows (zip) и Linux (AppImage / deb).
            </p>
          </div>
          <div className="relative z-10 mt-8 flex flex-col gap-2">
            <span className="text-xs font-medium text-neutral-400">{version}</span>
            <a
              href={desktop.win}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-800 no-underline hover:underline"
            >
              Windows · ZIP
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="M12 3v13M7 11l5 5 5-5M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <a
              href={desktop.linuxAppImage}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-800 no-underline hover:underline"
            >
              Linux · AppImage
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="M12 3v13M7 11l5 5 5-5M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <a
              href={desktop.linuxDeb}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-800 no-underline hover:underline"
            >
              Linux · deb
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="M12 3v13M7 11l5 5 5-5M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </div>
          <svg className="pointer-events-none absolute -bottom-6 -right-4 h-44 w-44 text-neutral-900/[0.05] transition-transform duration-300 group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.15" aria-hidden="true">
            <rect x="3" y="4" width="18" height="12" rx="2" />
            <path d="M8 20h8M12 16v4" />
          </svg>
        </div>

        <Link
          href={appUrl}
          className="group relative flex min-h-[320px] flex-col justify-between overflow-hidden rounded-[28px] bg-neutral-950 p-8 no-underline transition-colors hover:bg-neutral-900"
        >
          <div className="relative z-10">
            <p className="font-montserrat text-2xl font-bold tracking-tight text-white">Веб</p>
            <p className="mt-2 max-w-[16rem] text-sm leading-relaxed text-neutral-400">
              Личный кабинет без установки. Работает в любом современном браузере.
            </p>
          </div>
          <div className="relative z-10 mt-8 flex items-end justify-between gap-3">
            <span className="text-xs font-medium text-neutral-500">{version}</span>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
              Открыть кабинет
              <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
          <svg className="pointer-events-none absolute -bottom-8 -right-6 h-44 w-44 text-white/[0.06] transition-transform duration-300 group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.15" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
          </svg>
        </Link>
      </section>

      {history.length > 0 ? (
        <section className="mt-20" aria-labelledby="downloads-history">
          <h2
            id="downloads-history"
            className="font-montserrat text-2xl font-bold tracking-tight text-neutral-950"
          >
            История версий
          </h2>
          <p className="mt-2 max-w-xl text-sm text-neutral-500">
            Предыдущие Android-сборки. Для учёбы лучше ставить актуальную.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {history.map((release) => {
              const tag = CHANNEL_LABEL[release.channel];
              return (
                <article
                  key={release.version}
                  className="flex flex-col rounded-[22px] border border-neutral-200 bg-white p-6"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-montserrat text-lg font-bold text-neutral-950">
                      {release.version}
                    </h3>
                    {tag ? <span className="text-xs font-medium text-amber-600">{tag}</span> : null}
                  </div>
                  <p className="mt-1 text-xs text-neutral-400">{release.date}</p>
                  {release.notes.length > 0 ? (
                    <ul className="mt-4 flex-1 space-y-1.5">
                      {release.notes.map((note) => (
                        <li key={note} className="text-sm leading-relaxed text-neutral-500">
                          {note}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {release.apkHref ? (
                    <a
                      href={release.apkHref}
                      className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#3390ec] no-underline hover:underline"
                    >
                      Скачать APK
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                        <path d="M12 3v13M7 11l5 5 5-5M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </a>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <p className="mt-16 text-sm text-neutral-500">
        Исходный код:{" "}
        <a href="https://github.com/meowhiks/mini-kbp" className="text-[#3390ec] hover:underline">
          github.com/meowhiks/mini-kbp
        </a>
      </p>
    </main>
  );
}
