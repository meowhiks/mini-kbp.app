import type { Metadata } from "next";
import AuthCallbackShell from "./AuthCallbackShell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthCallbackLayout({ children }: { children: React.ReactNode }) {
  return <AuthCallbackShell>{children}</AuthCallbackShell>;
}
