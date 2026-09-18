import { describe, expect, it } from "vitest";
import {
  isPassthroughPath,
  routeRequest,
  staffNavHref,
  staffPathMatches,
  toInternalLkPath,
  toInternalStaffPath,
  toPublicLkPath,
  toPublicStaffPath,
} from "@/lib/client/hostRouting";

describe("prefix stripping", () => {
  it("maps staff internal paths to public panel URLs", () => {
    expect(toPublicStaffPath("/staff")).toBe("/");
    expect(toPublicStaffPath("/staff/")).toBe("/");
    expect(toPublicStaffPath("/staff/groups")).toBe("/groups");
    expect(toPublicStaffPath("/staff/groups/abc")).toBe("/groups/abc");
    expect(toPublicStaffPath("/groups")).toBe("/groups");
  });

  it("maps public panel URLs to staff internal paths", () => {
    expect(toInternalStaffPath("/")).toBe("/staff");
    expect(toInternalStaffPath("/groups")).toBe("/staff/groups");
    expect(toInternalStaffPath("/staff/groups")).toBe("/staff/groups");
  });

  it("maps lk internal paths to public URLs", () => {
    expect(toPublicLkPath("/app")).toBe("/");
    expect(toPublicLkPath("/app/")).toBe("/");
    expect(toPublicLkPath("/app/journal")).toBe("/journal");
    expect(toPublicLkPath("/app/profile")).toBe("/profile");
    expect(toPublicLkPath("/journal")).toBe("/journal");
  });

  it("maps public lk URLs to /app internal paths", () => {
    expect(toInternalLkPath("/")).toBe("/app");
    expect(toInternalLkPath("/journal")).toBe("/app/journal");
    expect(toInternalLkPath("/app/journal")).toBe("/app/journal");
  });
});

describe("passthrough", () => {
  it("never rewrites Next/runtime/API/static paths", () => {
    expect(isPassthroughPath("/_next/static/chunks/foo.js")).toBe(true);
    expect(isPassthroughPath("/__nextjs_original-stack-frames")).toBe(true);
    expect(isPassthroughPath("/__turbopack_hmr")).toBe(true);
    expect(isPassthroughPath("/v0/auth/cookie-session/")).toBe(true);
    expect(isPassthroughPath("/errors/403.html")).toBe(true);
    expect(isPassthroughPath("/auth/cb")).toBe(true);
    expect(isPassthroughPath("/auth/cb/google")).toBe(true);
    expect(isPassthroughPath("/privacy")).toBe(true);
    expect(isPassthroughPath("/developers")).toBe(true);
    expect(isPassthroughPath("/favicon.ico")).toBe(true);
    expect(isPassthroughPath("/manifest.json")).toBe(true);
    expect(isPassthroughPath("/groups")).toBe(false);
    expect(isPassthroughPath("/journal")).toBe(false);
  });
});

describe("routeRequest panel.mini-kbp.site", () => {
  const host = "panel.mini-kbp.site";

  it("rewrites prefix-free pages onto /staff", () => {
    expect(routeRequest(host, "/")).toEqual({ type: "rewrite", pathname: "/staff" });
    expect(routeRequest(host, "/groups")).toEqual({ type: "rewrite", pathname: "/staff/groups" });
    expect(routeRequest(host, "/settings")).toEqual({ type: "rewrite", pathname: "/staff/settings" });
  });

  it("redirects leftover /staff URLs to prefix-free paths", () => {
    expect(routeRequest(host, "/staff")).toEqual({ type: "redirect", pathname: "/", status: 301 });
    expect(routeRequest(host, "/staff/groups")).toEqual({
      type: "redirect",
      pathname: "/groups",
      status: 301,
    });
  });

  it("forbids the student cabinet on the panel host", () => {
    expect(routeRequest(host, "/app")).toEqual({ type: "forbidden" });
    expect(routeRequest(host, "/app/journal")).toEqual({ type: "forbidden" });
  });

  it("leaves chunks and HMR alone", () => {
    expect(routeRequest(host, "/_next/static/chunks/_abc.js")).toEqual({ type: "next" });
  });
});

describe("routeRequest lk.mini-kbp.site", () => {
  const host = "lk.mini-kbp.site";

  it("rewrites prefix-free pages onto /app", () => {
    expect(routeRequest(host, "/")).toEqual({ type: "rewrite", pathname: "/app" });
    expect(routeRequest(host, "/journal")).toEqual({ type: "rewrite", pathname: "/app/journal" });
  });

  it("redirects legacy /profile into journal settings query (no bounce)", () => {
    expect(routeRequest(host, "/profile")).toEqual({
      type: "redirect",
      pathname: "/journal",
      search: "?page=settings&sc=profile",
      status: 301,
    });
    expect(routeRequest(host, "/app/profile")).toEqual({
      type: "redirect",
      pathname: "/journal",
      search: "?page=settings&sc=profile",
      status: 301,
    });
  });

  it("redirects leftover /app URLs to prefix-free paths", () => {
    expect(routeRequest(host, "/app")).toEqual({ type: "redirect", pathname: "/", status: 301 });
    expect(routeRequest(host, "/app/journal")).toEqual({
      type: "redirect",
      pathname: "/journal",
      status: 301,
    });
  });

  it("sends /staff to the panel without the prefix", () => {
    expect(routeRequest(host, "/staff")).toEqual({
      type: "redirect",
      url: "https://panel.mini-kbp.site/",
      status: 301,
    });
    expect(routeRequest(host, "/staff/groups")).toEqual({
      type: "redirect",
      url: "https://panel.mini-kbp.site/groups",
      status: 301,
    });
  });
});

describe("routeRequest localhost", () => {
  it("keeps /app and /staff for local e2e", () => {
    expect(routeRequest("localhost", "/staff/groups")).toEqual({ type: "next" });
    expect(routeRequest("127.0.0.1", "/app/journal")).toEqual({ type: "next" });
    expect(routeRequest("localhost", "/")).toEqual({ type: "next" });
  });

  it("redirects legacy profile into /app/journal settings query", () => {
    expect(routeRequest("localhost", "/app/profile")).toEqual({
      type: "redirect",
      pathname: "/app/journal",
      search: "?page=settings&sc=profile",
      status: 301,
    });
  });
});

describe("routeRequest public hosts", () => {
  it("keeps apex marketing pages on Next", () => {
    expect(routeRequest("mini-kbp.site", "/")).toEqual({ type: "next" });
    expect(routeRequest("www.mini-kbp.site", "/privacy")).toEqual({ type: "next" });
    expect(routeRequest("mini-kbp.site", "/downloads")).toEqual({ type: "next" });
  });

  it("sends cabinet paths from apex to lk", () => {
    expect(routeRequest("mini-kbp.site", "/journal")).toEqual({
      type: "redirect",
      url: "https://lk.mini-kbp.site/journal",
      status: 301,
    });
  });

  it("sends unknown hosts to lk", () => {
    expect(routeRequest("other.example", "/journal")).toEqual({
      type: "redirect",
      url: "https://lk.mini-kbp.site/journal",
      status: 301,
    });
  });
});

describe("staffPathMatches", () => {
  it("treats public and internal staff paths as the same page", () => {
    expect(staffPathMatches("/groups", "/staff/groups")).toBe(true);
    expect(staffPathMatches("/staff/groups", "/staff/groups")).toBe(true);
    expect(staffPathMatches("/journal", "/staff/journal")).toBe(true);
    expect(staffPathMatches("/staff/groups", "/staff/journal")).toBe(false);
  });

  it("builds nav hrefs from the current pathname", () => {
    expect(staffNavHref("/staff/groups", "/staff/groups")).toBe("/staff/groups");
    expect(staffNavHref("/staff/groups", "/groups")).toBe("/groups");
  });
});
