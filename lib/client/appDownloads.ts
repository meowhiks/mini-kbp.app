export type AppRelease = {
  version: string;
  title: string;
  date: string;
  channel: "current" | "release" | "hotfix";
  apkHref: string | null;
  /** Portable Windows zip */
  winHref?: string | null;
  /** Linux AppImage */
  linuxAppImageHref?: string | null;
  /** Linux .deb */
  linuxDebHref?: string | null;
  notes: string[];
};

/** Каталог сборок: актуальная + архив из канала @mini_kbp. */
export const APP_RELEASES: AppRelease[] = [
  {
    version: "0.3.12",
    title: "Актуальная",
    date: "2026-09",
    channel: "current",
    apkHref: "/downloads/mini-kbp-0.3.12.apk",
    winHref: "/downloads/mini-kbp-0.3.12-win-x64.zip",
    linuxAppImageHref: "/downloads/mini-kbp-0.3.12-linux-x64.AppImage",
    linuxDebHref: "/downloads/mini-kbp-0.3.12-linux-amd64.deb",
    notes: [
      "Splash со слоганами",
      "Акцент и настройки Wallet",
      "Архив прошлых недель",
      "Только расписание (fork)",
    ],
  },
  {
    version: "0.2.172",
    title: "Release",
    date: "2026-09",
    channel: "release",
    apkHref: "/downloads/mini-kbp-0.2.172.apk",
    winHref: "/downloads/mini-kbp-0.2.172-win-x64.zip",
    linuxAppImageHref: "/downloads/mini-kbp-0.2.172-linux-x64.AppImage",
    linuxDebHref: "/downloads/mini-kbp-0.2.172-linux-amd64.deb",
    notes: ["Веб-кабинет и панель преподавателя", "Журнал v2", "Вход через Google и Telegram", "Desktop Windows/Linux"],
  },
  {
    version: "0.1.71",
    title: "Release",
    date: "2026-05-26",
    channel: "release",
    apkHref: "/downloads/mini-kbp-0.1.71.apk",
    notes: ["Тема не OLED", "Сотые в балле", "Панель дней", "Подсветка ячейки"],
  },
  {
    version: "0.1.49",
    title: "Release",
    date: "2026-05-07",
    channel: "release",
    apkHref: "/downloads/mini-kbp-0.1.49.apk",
    notes: ["Тёмная тема", "Поиск расписания", "Красные н-ки", "Общий балл"],
  },
  {
    version: "0.1.29",
    title: "HotFix",
    date: "2026-04-28",
    channel: "hotfix",
    apkHref: "/downloads/mini-kbp-0.1.29.apk",
    notes: ["Свайп расписания", "Ближайший урок", "Замены", "Время пар"],
  },
];

export const FEATURE_WORDS = [
  "Журнал",
  "Расписание",
  "История",
  "Тема",
  "Ближайший",
  "Донат",
  "Свайп",
  "Замены",
  "Время",
  "Поиск",
  "Уведомления",
  "Н-ки",
  "Балл",
  "OLED",
  "Настройки",
  "Сотые",
  "Дни",
  "Ячейки",
  "Google",
  "Telegram",
  "Коды",
  "Оценки",
  "Опоздания",
  "Зачёты",
  "Лабы",
  "Офлайн",
  "Отмена",
  "iOS",
] as const;

export function currentDesktopDownloads(release: AppRelease | undefined = APP_RELEASES[0]) {
  return {
    win: release?.winHref || "/downloads/mini-kbp-0.3.12-win-x64.zip",
    linuxAppImage: release?.linuxAppImageHref || "/downloads/mini-kbp-0.3.12-linux-x64.AppImage",
    linuxDeb: release?.linuxDebHref || "/downloads/mini-kbp-0.3.12-linux-amd64.deb",
  };
}
