"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ApexBrandPage from "./components/ApexBrandPage";
import { isApexHost } from "@/lib/client/lkAppUrl";
import { isNativeApp } from "@/lib/client/platform";

export default function HomePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash.includes("tgAuthResult")) {
      router.replace(`/app${window.location.hash}`);
      return;
    }
    if (isNativeApp()) {
      router.replace("/app/journal?page=timetable");
      return;
    }
    const host = window.location.hostname;
    setReady(isApexHost(host));
  }, [router]);

  if (!ready) return null;
  return <ApexBrandPage />;
}
