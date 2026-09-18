import { isNativeApp } from "@/lib/client/platform";
import { nativeRequestText, type NativeHttpResponse } from "@/lib/client/nativeHttp";
import { getServerUrl } from "@/lib/client/serverUrl";
import { platformFetch } from "@/lib/client/platformFetch";

export type KbpRequestOptions = {
  url: string;
  method: "GET" | "POST";
  headers?: Record<string, string>;
  data?: string;
};

/** HTTP к kbp.by — в браузере через Django /v0/kbp/proxy/, в Capacitor напрямую. */
export async function kbpRequestText(opts: KbpRequestOptions): Promise<NativeHttpResponse> {
  if (isNativeApp()) {
    return nativeRequestText(opts);
  }

  const base = getServerUrl();
  if (!base) {
    throw new Error("Server URL not configured (NEXT_PUBLIC_MINIKBP_SERVER_URL)");
  }

  const res = await platformFetch(`${base.replace(/\/+$/, "")}/v0/kbp/proxy/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: opts.url,
      method: opts.method,
      headers: opts.headers ?? {},
      data: opts.data,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof body?.detail === "string" ? body.detail : `Proxy error ${res.status}`);
  }
  return {
    status: typeof body.status === "number" ? body.status : 0,
    headers: (body.headers as Record<string, string>) ?? {},
    data: typeof body.data === "string" ? body.data : "",
  };
}

export { extractCookiePairs } from "@/lib/client/nativeHttp";
