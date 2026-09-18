import { Capacitor } from "@capacitor/core";

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Мобильный браузер (не нативное приложение и не установленный PWA). */
export function isMobileBrowser(): boolean {
  if (typeof window === "undefined") return false;
  if (isNativeApp() || isStandalonePwa()) return false;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const narrow = window.matchMedia("(max-width: 767px)").matches;
  const mobileUa = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
  return narrow || (coarse && mobileUa) || isIos();
}

export function isDesktopBrowser(): boolean {
  if (typeof window === "undefined") return false;
  return !isNativeApp() && !isMobileBrowser();
}

export function isElectronDesktop(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as Window & { minikbpDesktop?: unknown }).minikbpDesktop);
}

/** Capacitor или Electron: локальный UI, prod API, гостевой режим. */
export function isBundledAppShell(): boolean {
  return isNativeApp() || isElectronDesktop();
}

const PC_TIMETABLE_MIN_WIDTH_PX = 1024;

/** Недельная таблица расписания — только полноценный ПК (не телефон, не планшет, не PWA, не приложение). */
export function isPcTimetableView(): boolean {
  if (typeof window === "undefined") return false;
  if (isNativeApp() || isStandalonePwa()) return false;
  if (window.innerWidth < PC_TIMETABLE_MIN_WIDTH_PX) return false;

  const ua = navigator.userAgent;
  if (/android|iphone|ipad|ipod|mobile|tablet/i.test(ua)) return false;

  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const canHover = window.matchMedia("(hover: hover)").matches;
  return finePointer && canHover;
}

export function subscribePcTimetableView(onChange: (value: boolean) => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const notify = () => onChange(isPcTimetableView());
  notify();

  const mqWidth = window.matchMedia(`(min-width: ${PC_TIMETABLE_MIN_WIDTH_PX}px)`);
  const mqPointer = window.matchMedia("(pointer: fine)");
  const mqHover = window.matchMedia("(hover: hover)");

  const onMq = () => notify();
  mqWidth.addEventListener("change", onMq);
  mqPointer.addEventListener("change", onMq);
  mqHover.addEventListener("change", onMq);
  window.addEventListener("resize", onMq);

  return () => {
    mqWidth.removeEventListener("change", onMq);
    mqPointer.removeEventListener("change", onMq);
    mqHover.removeEventListener("change", onMq);
    window.removeEventListener("resize", onMq);
  };
}
