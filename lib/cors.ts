import { NextResponse } from "next/server";

function isPrivateLanHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(hostname)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(hostname)) return true;
  return false;
}

function isAllowedCorsHost(hostname: string): boolean {
  return isPrivateLanHost(hostname) || /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
}

function resolveAllowedOrigin(origin?: string): string {
  if (!origin) return "*";
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol === "http:" || protocol === "https:") {
      if (isAllowedCorsHost(hostname)) return origin;
    }
  } catch {}
  return "*";
}

export function addCorsHeaders(response: NextResponse, origin?: string): NextResponse {
  const allowOrigin = resolveAllowedOrigin(origin);

  response.headers.set("Access-Control-Allow-Origin", allowOrigin);
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-minikbp-worker");
  response.headers.set("Access-Control-Allow-Credentials", "true");

  return response;
}

export function handleOptionsRequest(origin?: string): NextResponse {
  const response = new NextResponse(null, { status: 204 });
  return addCorsHeaders(response, origin);
}
