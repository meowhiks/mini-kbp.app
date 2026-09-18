import { NextRequest, NextResponse } from "next/server";
import { addCorsHeaders, handleOptionsRequest } from "@/lib/cors";
import {
  getFreshCachedResult,
  getStaleCachedResult,
  shouldUseKbpCache,
  writeKbpCache,
} from "@/lib/server/kbpCache";
import { fetchKbpUpstream } from "@/lib/server/kbpUpstream";
import { fetchPublicKbpPersistent, isPersistentCacheable } from "@/lib/server/kbpPersistentCache";
import { createRelayJob, waitForRelayJob } from "@/lib/server/relayQueue";

const ALLOWED_URL = /^https:\/\/(ej\.kbp\.by|kbp\.by)\//;
const RELAY_WAIT_MS = 18_000;

export const runtime = "nodejs";
export const maxDuration = 60;
export const preferredRegion = ["fra1", "cdg1", "arn1"];

export async function OPTIONS(request: NextRequest) {
  return handleOptionsRequest(request.headers.get("origin") || undefined);
}

async function fetchUpstream(
  url: string,
  method: "GET" | "POST",
  data: string | undefined,
  headersIn: Record<string, string>
) {
  if (isPersistentCacheable(url, method, headersIn)) {
    return fetchPublicKbpPersistent(url);
  }

  return fetchKbpUpstream(url, {
    method,
    body: data,
    headers: headersIn,
  });
}

async function tryRelayFetch(
  url: string,
  method: "GET" | "POST",
  data: string | undefined,
  headersIn: Record<string, string>
) {
  const jobId = createRelayJob({ url, method, headers: headersIn, body: data });
  const job = await waitForRelayJob(jobId, RELAY_WAIT_MS);
  if (!job?.done || !job.result) return null;
  return job.result;
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin") || undefined;

  try {
    const body = await request.json();
    const url = String(body?.url || "");
    const method = body?.method === "POST" ? "POST" : "GET";
    const data = typeof body?.data === "string" ? body.data : undefined;
    const headersIn = (body?.headers && typeof body.headers === "object" ? body.headers : {}) as Record<
      string,
      string
    >;

    if (!ALLOWED_URL.test(url)) {
      const response = NextResponse.json({ error: "URL not allowed" }, { status: 400 });
      return addCorsHeaders(response, origin);
    }

    const cacheable = shouldUseKbpCache(url, method, headersIn);
    if (cacheable) {
      const fresh = getFreshCachedResult(url);
      if (fresh) {
        const response = NextResponse.json(fresh);
        response.headers.set("x-minikbp-cache", "memory-hit");
        return addCorsHeaders(response, origin);
      }
    }

    try {
      const result = await fetchUpstream(url, method, data, headersIn);

      if (cacheable) {
        writeKbpCache(url, result);
      }

      const response = NextResponse.json(result);
      response.headers.set("x-minikbp-cache", "miss");
      return addCorsHeaders(response, origin);
    } catch (upstreamError) {
      if (cacheable) {
        const stale = getStaleCachedResult(url);
        if (stale) {
          console.warn("[api/proxy] upstream failed, serving memory stale:", url, upstreamError);
          const response = NextResponse.json(stale);
          response.headers.set("x-minikbp-cache", "memory-stale");
          return addCorsHeaders(response, origin);
        }
      }

      console.warn("[api/proxy] trying relay network…", url);
      const relayResult = await tryRelayFetch(url, method, data, headersIn);
      if (relayResult) {
        if (cacheable) writeKbpCache(url, relayResult);
        const response = NextResponse.json(relayResult);
        response.headers.set("x-minikbp-cache", "relay");
        return addCorsHeaders(response, origin);
      }

      throw upstreamError;
    }
  } catch (error) {
    console.error("[api/proxy]", error);
    const message = error instanceof Error ? error.message : "Proxy error";
    const response = NextResponse.json({ error: message, retryable: true }, { status: 503 });
    return addCorsHeaders(response, origin);
  }
}
