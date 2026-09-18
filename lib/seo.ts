import type { Metadata } from "next";

/** SEO в духе kbp.by (Yoast), адаптировано под Мини КБиП */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://minikbp.example.com";

export const KBP_SITE_NAME = "Колледж бизнеса и права";
export const KBP_ORG_DESCRIPTION =
  "Частное учреждение образования «Колледж бизнеса и права». В колледже обучаются по специальностям: правоведение; экономика и организация производства; бухгалтерский учёт, анализ и контроль; логистическая деятельность; программное обеспечение информационных технологий; банковское дело; планово-экономическая и аналитическая деятельность.";

export const APP_NAME = "Мини КБиП";
export const APP_TAGLINE = "Расписание и электронный журнал для студентов и преподавателей КБиП";

/** Специальности и ключевые слова с kbp.by + приложение */
export const SEO_KEYWORDS = [
  "КБиП",
  "Колледж бизнеса и права",
  "колледж бизнеса и права Минск",
  "среднее специальное образование",
  "правоведение",
  "бухгалтерский учёт анализ и контроль",
  "логистическая деятельность",
  "программное обеспечение информационных технологий",
  "банковское дело",
  "планово-экономическая деятельность",
  "расписание КБиП",
  "расписание колледжа",
  "электронный журнал КБиП",
  "журнал студента",
  "классный журнал",
  "расписание занятий",
  "Мини КБиП",
  "расписание группы",
  "оценки студента",
  "замены в расписании",
  "kbp.by",
] as const;

export const siteMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${APP_NAME} — расписание и электронный журнал ${KBP_SITE_NAME}`,
    template: `%s · ${APP_NAME}`,
  },
  description: `${APP_TAGLINE}. ${KBP_ORG_DESCRIPTION} Удобное приложение: расписание, журнал оценок, классный журнал. Локально на устройстве.`,
  keywords: [...SEO_KEYWORDS],
  authors: [{ name: APP_NAME, url: SITE_URL }],
  creator: APP_NAME,
  publisher: APP_NAME,
  category: "education",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    url: "/",
    siteName: `${APP_NAME} — ${KBP_SITE_NAME}`,
    title: `${APP_NAME} — расписание и электронный журнал`,
    description: KBP_ORG_DESCRIPTION,
    images: [
      {
        url: "/minikbp.svg",
        width: 512,
        height: 512,
        alt: `${APP_NAME} — логотип`,
        type: "image/svg+xml",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@KBiPminsk",
    title: `${APP_NAME} — расписание и журнал КБиП`,
    description: APP_TAGLINE,
    images: ["/minikbp.svg"],
  },
  other: {
    "geo.region": "BY-MI",
    "geo.placename": "Минск",
    "article:publisher": "https://www.facebook.com/kbp.by/",
  },
};

export const jsonLdWebApp = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: APP_NAME,
      description: APP_TAGLINE,
      inLanguage: "ru-RU",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "EducationalOrganization",
      "@id": `${SITE_URL}/#organization`,
      name: KBP_SITE_NAME,
      alternateName: "КБиП",
      description: KBP_ORG_DESCRIPTION,
      url: "https://kbp.by/",
      sameAs: ["https://www.facebook.com/kbp.by/", "https://twitter.com/KBiPminsk"],
      address: {
        "@type": "PostalAddress",
        addressLocality: "Минск",
        addressCountry: "BY",
      },
    },
    {
      "@type": "WebApplication",
      name: APP_NAME,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web, Android",
      offers: { "@type": "Offer", price: "0", priceCurrency: "BYN" },
      description: APP_TAGLINE,
      inLanguage: "ru-RU",
      browserRequirements: "Requires JavaScript",
      url: `${SITE_URL}/app`,
    },
  ],
};
