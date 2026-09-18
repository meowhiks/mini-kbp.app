import { unstable_cache } from "next/cache";
import { fetchKbpUpstream, type KbpUpstreamResult } from "@/lib/server/kbpUpstream";

const PUBLIC_KBP_GET = /^https:\/\/kbp\.by\//;

export function isPersistentCacheable(url: string, method: string, headers: Record<string, string>): boolean {
  if (method !== "GET") return false;
  if (!PUBLIC_KBP_GET.test(url)) return false;
  return !(headers.cookie || headers.Cookie);
}

async function fetchPublicKbp(url: string): Promise<KbpUpstreamResult> {
  return fetchKbpUpstream(url, { method: "GET" });
}

export async function fetchPublicKbpPersistent(url: string): Promise<KbpUpstreamResult> {
  const cachedFetch = unstable_cache(() => fetchPublicKbp(url), ["kbp-public-v1", url], {
    revalidate: 6 * 60 * 60,
    tags: [`kbp-public:${url}`],
  });

  return cachedFetch();
}

export const KBP_WARM_URLS = [
  "https://kbp.by/rasp/timetable/view_beta_kbp/?q=",
  "https://kbp.by/rasp/timetable/view_beta_kbp/",
] as const;
