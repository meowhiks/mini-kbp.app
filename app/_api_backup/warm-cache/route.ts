import { NextResponse } from "next/server";
import { fetchKbpUpstream } from "@/lib/server/kbpUpstream";
import { KBP_WARM_URLS, fetchPublicKbpPersistent } from "@/lib/server/kbpPersistentCache";

export const runtime = "nodejs";
export const maxDuration = 60;
export const preferredRegion = ["fra1", "cdg1", "arn1"];

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Array<{ url: string; ok: boolean; status?: number; error?: string }> = [];

  for (const url of KBP_WARM_URLS) {
    try {
      const result = await fetchPublicKbpPersistent(url);
      results.push({ url, ok: true, status: result.status });
    } catch (error) {
      try {
        const fallback = await fetchKbpUpstream(url, { method: "GET" });
        results.push({ url, ok: true, status: fallback.status, error: "persistent-cache-miss" });
      } catch (fallbackError) {
        results.push({
          url,
          ok: false,
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        });
      }
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return NextResponse.json(
    { warmed: okCount, total: results.length, results },
    { status: okCount > 0 ? 200 : 503 }
  );
}
