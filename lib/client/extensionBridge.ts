import type { KbpRequestOptions } from "@/lib/client/kbpRequest";
import type { NativeHttpResponse } from "@/lib/client/nativeHttp";

declare global {
  interface Window {
    __MINIKBP_RELAY__?: { version: string };
  }
}

const EXTENSION_TIMEOUT_MS = 30_000;

export function isExtensionAvailable(): boolean {
  return typeof window !== "undefined" && Boolean(window.__MINIKBP_RELAY__);
}

export async function extensionRequestText(opts: KbpRequestOptions): Promise<NativeHttpResponse> {
  if (!isExtensionAvailable()) {
    throw new Error("EXTENSION_NOT_AVAILABLE");
  }

  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();

    const handler = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.type !== "minikbp-relay-response" || data.id !== id) return;

      window.removeEventListener("message", handler);
      clearTimeout(timer);

      if (data.error) reject(new Error(String(data.error)));
      else resolve(data.result as NativeHttpResponse);
    };

    const timer = window.setTimeout(() => {
      window.removeEventListener("message", handler);
      reject(new Error("EXTENSION_TIMEOUT"));
    }, EXTENSION_TIMEOUT_MS);

    window.addEventListener("message", handler);
    try {
      window.postMessage({ type: "minikbp-relay-request", id, opts }, "*");
    } catch (error) {
      window.removeEventListener("message", handler);
      clearTimeout(timer);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
