"use client";

import { useEffect, type ReactNode } from "react";
import { isolateAuthCallbackContext } from "@/lib/client/authCallbackIsolation";

export default function AuthCallbackShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    isolateAuthCallbackContext();
  }, []);

  return (
    <div className="min-h-dvh bg-[#f0f4fa]" data-auth-callback="1">
      {children}
    </div>
  );
}
