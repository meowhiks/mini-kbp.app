/** Синхронизация titlebar Electron: аватар / Гость. */

export type DesktopChromeUser = {
  guest: boolean;
  name?: string;
  avatarUrl?: string | null;
};

type DesktopBridge = {
  setChromeUser?: (user: DesktopChromeUser) => void;
  navigatePath?: (pathname: string) => void;
  platform?: string;
  customTitlebar?: boolean;
  openExternal?: (url: string) => void;
};

function desktopApi(): DesktopBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { minikbpDesktop?: DesktopBridge }).minikbpDesktop;
}

export function setDesktopChromeUser(user: DesktopChromeUser): void {
  desktopApi()?.setChromeUser?.(user);
}

export function navigateDesktopPath(pathname: string): void {
  if (!pathname.startsWith("/")) return;
  const api = desktopApi();
  if (api?.navigatePath) {
    api.navigatePath(pathname);
    return;
  }
  if (typeof window !== "undefined") {
    window.location.assign(pathname);
  }
}
