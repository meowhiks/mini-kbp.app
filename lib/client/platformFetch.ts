import { isNativeApp } from "@/lib/client/platform";

/** В WebView Capacitor `fetch` на api.mini-kbp.site часто падает (CORS). На native — CapacitorHttp. */
export async function platformFetch(input: string, init?: RequestInit): Promise<Response> {
  if (isNativeApp()) {
    const { nativeFetch } = await import("@/lib/client/nativeHttp");
    return nativeFetch(input, init ?? {});
  }
  return fetch(input, init);
}
