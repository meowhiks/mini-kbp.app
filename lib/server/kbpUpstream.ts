import { request as httpsRequestRaw } from "node:https";
import { setDefaultResultOrder } from "node:dns";

setDefaultResultOrder("ipv4first");

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const CONNECT_TIMEOUT_MS = 30_000;
const RESPONSE_TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS = 4;

export type KbpUpstreamResult = {
  status: number;
  headers: Record<string, string>;
  data: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildHeaders(url: string, extra: Record<string, string> = {}): Record<string, string> {
  const host = new URL(url).hostname;
  const headers: Record<string, string> = {
    "User-Agent": DEFAULT_UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Connection: "keep-alive",
    ...extra,
  };

  if (host === "kbp.by") {
    headers.Referer = "https://kbp.by/";
  }

  return headers;
}

function formatFetchError(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? error.cause.message : undefined;
    return cause ? `${error.message} (${cause})` : error.message;
  }
  return String(error);
}

function isRetryableUpstreamError(error: unknown): boolean {
  const msg = formatFetchError(error).toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("fetch failed") ||
    msg.includes("socket hang up") ||
    msg.includes("network")
  );
}

function httpsRequest(
  url: string,
  init: { method: "GET" | "POST"; headers: Record<string, string>; body?: string }
): Promise<KbpUpstreamResult> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    let settled = false;

    const req = httpsRequestRaw(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method: init.method,
        headers: init.headers,
        family: 4,
        timeout: CONNECT_TIMEOUT_MS,
        rejectUnauthorized: true,
      },
      (res) => {
        const chunks: Buffer[] = [];
        const responseTimer = setTimeout(() => {
          if (!settled) {
            settled = true;
            req.destroy(new Error("Upstream response timeout"));
          }
        }, RESPONSE_TIMEOUT_MS);

        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          clearTimeout(responseTimer);
          if (settled) return;
          settled = true;

          const outHeaders: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (typeof value === "string") outHeaders[key.toLowerCase()] = value;
          }

          resolve({
            status: res.statusCode || 0,
            headers: outHeaders,
            data: Buffer.concat(chunks).toString("utf8"),
          });
        });
        res.on("error", (err) => {
          clearTimeout(responseTimer);
          if (!settled) {
            settled = true;
            reject(err);
          }
        });
      }
    );

    req.on("error", (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
    req.on("timeout", () => {
      if (!settled) {
        settled = true;
        req.destroy(new Error(`Upstream connect timeout (${CONNECT_TIMEOUT_MS}ms)`));
      }
    });

    if (init.method === "POST" && init.body) {
      req.write(init.body);
    }
    req.end();
  });
}

async function fetchOnce(
  url: string,
  init?: { method?: "GET" | "POST"; body?: string; headers?: Record<string, string> }
): Promise<KbpUpstreamResult> {
  const method = init?.method === "POST" ? "POST" : "GET";
  const headers = buildHeaders(url, init?.headers);

  try {
    return await httpsRequest(url, { method, headers, body: init?.body });
  } catch (httpsError) {
    try {
      const upstream = await fetch(url, {
        method,
        headers,
        body: method === "POST" ? init?.body : undefined,
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(RESPONSE_TIMEOUT_MS),
      });

      return {
        status: upstream.status,
        headers: Object.fromEntries(upstream.headers.entries()),
        data: await upstream.text(),
      };
    } catch (fetchError) {
      throw new Error(
        `https: ${formatFetchError(httpsError)}; fetch: ${formatFetchError(fetchError)}`
      );
    }
  }
}

export async function fetchKbpUpstream(
  url: string,
  init?: { method?: "GET" | "POST"; body?: string; headers?: Record<string, string> }
): Promise<KbpUpstreamResult> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await fetchOnce(url, init);
    } catch (error) {
      lastError = error;
      const retryable = isRetryableUpstreamError(error);
      if (!retryable || attempt >= MAX_ATTEMPTS - 1) break;
      await sleep(600 * (attempt + 1) + Math.floor(Math.random() * 400));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
