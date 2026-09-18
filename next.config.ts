import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.MOBILE_BUILD === "1" ? { output: "export" as const } : {}),
  serverExternalPackages: [
    "@capgo/capacitor-social-login",
    "@capacitor/app",
    "@capacitor/browser",
    "@capacitor/core",
  ],
  env: {
    NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "",
    NEXT_PUBLIC_TELEGRAM_BOT_CLIENT_ID: process.env.NEXT_PUBLIC_TELEGRAM_BOT_CLIENT_ID || "",
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "",
    NEXT_PUBLIC_MINIKBP_SERVER_URL: process.env.NEXT_PUBLIC_MINIKBP_SERVER_URL || "",
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
    ];
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/app/:path*",
        headers: [{ key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" }],
      },
      {
        source: "/auth/cb/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
        ],
      },
      {
        source: "/auth/:path*",
        headers: [{ key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" }],
      },
      {
        source: "/downloads/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=300, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
