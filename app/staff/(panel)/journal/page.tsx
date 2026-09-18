"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getLkAppUrl } from "@/lib/client/lkAppUrl";

/** Staff journal UI removed in timetable fork — redirect home. */
export default function StaffJournalPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/staff/settings");
  }, [router]);
  return null;
}
