/** URL Python API: на *.mini-kbp.site — тот же origin (/v0/ проксирует Apache). */
import { PRODUCTION_LK_ORIGIN } from "@/lib/client/lkAppUrl";
import { isBundledAppShell } from "@/lib/client/platform";

function isIpv4Host(hostname: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** Capacitor + Electron: never use dead api.* or loopback — lk proxies /v0/. */
function bundledShellApiOrigin(env: string): string {
  const fromEnv = env.trim() ? normalizeUrl(env) : "";
  if (fromEnv && !fromEnv.includes("localhost") && !fromEnv.includes("127.0.0.1")) {
    return fromEnv;
  }
  return PRODUCTION_LK_ORIGIN;
}

export function getServerUrl(): string {
  const env =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_MINIKBP_SERVER_URL) || "";

  if (typeof window !== "undefined") {
    if (isBundledAppShell()) {
      return bundledShellApiOrigin(env);
    }

    const { hostname, protocol, host, port } = window.location;
    if (hostname.endsWith("mini-kbp.site")) {
      return normalizeUrl(`${protocol}//${host}`);
    }
    if (isIpv4Host(hostname)) {
      if (!port || port === "80" || port === "443") {
        return `${protocol}//${hostname}:8000`;
      }
      if (port === "3000") {
        return `${protocol}//${hostname}:8000`;
      }
      return `${protocol}//${host}`;
    }
  }

  if (env.trim()) return normalizeUrl(env);
  return "";
}
