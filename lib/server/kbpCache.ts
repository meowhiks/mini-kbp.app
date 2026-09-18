import type { KbpUpstreamResult } from "@/lib/server/kbpUpstream";

type CacheEntry = {
  savedAt: number;
  result: KbpUpstreamResult;
};

const cache = new Map<string, CacheEntry>();

const FRESH_TTL_MS = 6 * 60 * 60 * 1000;
const STALE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function isPublicKbpGet(url: string, method: string, headers: Record<string, string>): boolean {
  if (method !== "GET") return false;
  if (!/^https:\/\/kbp\.by\//.test(url)) return false;
  const cookie = headers.cookie || headers.Cookie;
  return !cookie;
}

function cacheKey(url: string): string {
  return url;
}

export function readKbpCache(url: string): CacheEntry | undefined {
  const entry = cache.get(cacheKey(url));
  if (!entry) return undefined;
  if (Date.now() - entry.savedAt > STALE_TTL_MS) {
    cache.delete(cacheKey(url));
    return undefined;
  }
  return entry;
}

export function writeKbpCache(url: string, result: KbpUpstreamResult): void {
  if (result.status < 200 || result.status >= 300) return;
  if (!result.data) return;
  cache.set(cacheKey(url), { savedAt: Date.now(), result });
}

export function shouldUseKbpCache(
  url: string,
  method: string,
  headers: Record<string, string>
): boolean {
  return isPublicKbpGet(url, method, headers);
}

export function getFreshCachedResult(url: string): KbpUpstreamResult | undefined {
  const entry = readKbpCache(url);
  if (!entry) return undefined;
  if (Date.now() - entry.savedAt > FRESH_TTL_MS) return undefined;
  return entry.result;
}

export function getStaleCachedResult(url: string): KbpUpstreamResult | undefined {
  const entry = readKbpCache(url);
  return entry?.result;
}
