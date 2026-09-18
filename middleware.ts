import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { routeRequest } from "@/lib/client/hostRouting";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase() || "";
  const path = request.nextUrl.pathname;
  const action = routeRequest(host, path);
  const search = request.nextUrl.search;

  if (action.type === "rewrite") {
    const url = request.nextUrl.clone();
    url.pathname = action.pathname;
    return NextResponse.rewrite(url);
  }

  if (action.type === "redirect") {
    if ("url" in action && action.url) {
      return NextResponse.redirect(new URL(search, action.url), action.status);
    }
    if ("pathname" in action && action.pathname) {
      const dest = request.nextUrl.clone();
      dest.pathname = action.pathname;
      if ("search" in action && action.search !== undefined) {
        dest.search = action.search
          ? action.search.startsWith("?")
            ? action.search
            : `?${action.search}`
          : "";
      }
      return NextResponse.redirect(dest, action.status);
    }
  }

  if (action.type === "forbidden") {
    return NextResponse.redirect(new URL("/errors/403.html", request.url), 303);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|__nextjs|__turbopack|favicon.ico|errors/).*)"],
};
