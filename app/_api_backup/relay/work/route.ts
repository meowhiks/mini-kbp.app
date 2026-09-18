import { NextRequest, NextResponse } from "next/server";
import { addCorsHeaders, handleOptionsRequest } from "@/lib/cors";
import { claimRelayJob, completeRelayJob } from "@/lib/server/relayQueue";

export const runtime = "nodejs";
export const maxDuration = 30;

const ALLOWED_URL = /^https:\/\/(ej\.kbp\.by|kbp\.by)\//;

export async function OPTIONS(request: NextRequest) {
  return handleOptionsRequest(request.headers.get("origin") || undefined);
}

/** Worker polls for next job (browser extension with user consent). */
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin") || undefined;
  const workerId = request.headers.get("x-minikbp-worker") || request.nextUrl.searchParams.get("workerId");

  if (!workerId) {
    return addCorsHeaders(NextResponse.json({ error: "workerId required" }, { status: 400 }), origin);
  }

  const job = claimRelayJob(workerId);
  if (!job) {
    return addCorsHeaders(new NextResponse(null, { status: 204 }), origin);
  }

  return addCorsHeaders(
    NextResponse.json({
      id: job.id,
      url: job.url,
      method: job.method,
      headers: job.headers,
      data: job.body,
    }),
    origin
  );
}

/** Worker submits fetch result. */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin") || undefined;
  const workerId = request.headers.get("x-minikbp-worker") || "";

  try {
    const body = await request.json();
    const id = String(body?.id || "");
    const url = String(body?.url || "");

    if (!workerId || !id) {
      return addCorsHeaders(NextResponse.json({ error: "workerId and id required" }, { status: 400 }), origin);
    }

    if (url && !ALLOWED_URL.test(url)) {
      return addCorsHeaders(NextResponse.json({ error: "URL not allowed" }, { status: 400 }), origin);
    }

    if (body?.error) {
      completeRelayJob(id, workerId, { ok: false, error: String(body.error) });
      return addCorsHeaders(NextResponse.json({ ok: true }), origin);
    }

    const status = Number(body?.status || 0);
    const data = typeof body?.data === "string" ? body.data : "";
    const headersIn = (body?.headers && typeof body.headers === "object" ? body.headers : {}) as Record<
      string,
      string
    >;

    completeRelayJob(id, workerId, {
      ok: true,
      result: { status, headers: headersIn, data },
    });

    return addCorsHeaders(NextResponse.json({ ok: true }), origin);
  } catch (error) {
    return addCorsHeaders(
      NextResponse.json({ error: error instanceof Error ? error.message : "relay error" }, { status: 500 }),
      origin
    );
  }
}
