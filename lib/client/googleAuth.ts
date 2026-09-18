import { getServerUrl } from "@/lib/client/serverUrl";
import { platformFetch } from "@/lib/client/platformFetch";

export type GoogleCredentialResponse = {
  credential: string;
  select_by?: string;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
            locale?: string;
            use_fedcm_for_prompt?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: Record<string, string | number | boolean>
          ) => void;
        };
      };
    };
  }
}

const GSI_SCRIPT = "https://accounts.google.com/gsi/client";

let gsiLoading: Promise<void> | null = null;
let activeCallback: ((response: GoogleCredentialResponse) => void) | null = null;

export function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiLoading) return gsiLoading;

  gsiLoading = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GSI_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google GSI load failed")), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.src = GSI_SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google GSI load failed"));
    document.head.appendChild(script);
  });
  return gsiLoading;
}

export function getGoogleClientId(): string | null {
  const v = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  return v || null;
}

let googleClientIdCache: string | null | undefined;

export async function resolveGoogleClientId(): Promise<string | null> {
  const fromEnv = getGoogleClientId();
  if (fromEnv) return fromEnv;
  if (googleClientIdCache !== undefined) return googleClientIdCache;
  try {
    const res = await platformFetch(`${getServerUrl()}/v0/public/app-config/`);
    const body = await res.json().catch(() => ({}));
    const id = typeof body?.google_client_id === "string" ? body.google_client_id.trim() : "";
    googleClientIdCache = id || null;
    return googleClientIdCache ?? null;
  } catch {
    googleClientIdCache = null;
    return null;
  }
}

/** Прозрачная GIS-кнопка поверх своей — клик пользователя напрямую. */
export async function mountGoogleSignInOverlay(
  container: HTMLElement,
  clientId: string,
  onCredential: (response: GoogleCredentialResponse) => void
): Promise<void> {
  await loadGoogleIdentityScript();
  if (!window.google?.accounts?.id) {
    throw new Error("Google Identity Services недоступен");
  }

  activeCallback = onCredential;
  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => activeCallback?.(response),
    auto_select: false,
    cancel_on_tap_outside: true,
    locale: "ru",
    use_fedcm_for_prompt: false,
  });

  const width = Math.min(
    Math.max(
      container.offsetWidth ||
        container.parentElement?.offsetWidth ||
        (typeof window !== "undefined" ? window.innerWidth - 48 : 320),
      280
    ),
    480
  );

  container.innerHTML = "";
  window.google.accounts.id.renderButton(container, {
    type: "standard",
    theme: "outline",
    size: "large",
    text: "signin_with",
    shape: "pill",
    logo_alignment: "left",
    width,
  });
}

/** Видимая кнопка GIS (WebView / мост в системном браузере). */
export async function mountGoogleSignInVisible(
  container: HTMLElement,
  clientId: string,
  onCredential: (response: GoogleCredentialResponse) => void
): Promise<void> {
  await mountGoogleSignInOverlay(container, clientId, onCredential);
  container.style.opacity = "1";
  const iframe = container.querySelector("iframe");
  if (iframe) iframe.style.opacity = "1";
}
