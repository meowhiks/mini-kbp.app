"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { NATIVE_APP_HOME } from "@/lib/client/appQuery";

/** Auth removed in timetable fork — go straight to the shell. */
export default function AppEntryRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(NATIVE_APP_HOME);
  }, [router]);
  return (
    <div className="fixed inset-0 z-[9999] bg-white" aria-hidden />
  );
}
