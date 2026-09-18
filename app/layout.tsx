import type { Metadata, Viewport } from "next";
import { Comfortaa, Manrope, Montserrat } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import AppLoadingBar from "@/app/components/app/AppLoadingBar";
import AppSavedToast from "@/app/components/app/AppSavedToast";
import AppErrorDialog from "@/app/components/app/AppErrorDialog";
import SessionLockOverlay from "@/app/components/app/SessionLockOverlay";
import { jsonLdWebApp, siteMetadata } from "@/lib/seo";
import "./globals.css";

const comfortaa = Comfortaa({
  variable: "--font-comfortaa",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin", "cyrillic"],
  weight: ["600", "700", "800", "900"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700", "800"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export const metadata: Metadata = {
  ...siteMetadata,
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/minikbp.svg", type: "image/svg+xml" },
    ],
    shortcut: "/minikbp.svg",
    apple: "/minikbp.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Мини КБиП",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${comfortaa.variable} ${manrope.variable} ${montserrat.variable} font-manrope antialiased overflow-x-hidden`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdWebApp) }}
        />
        <AppLoadingBar />
        <AppSavedToast />
        <AppErrorDialog />
        <SessionLockOverlay />
        {children}
        {process.env.NEXT_PUBLIC_VERCEL_ANALYTICS === "1" ? <Analytics /> : null}
      </body>
    </html>
  );
}
