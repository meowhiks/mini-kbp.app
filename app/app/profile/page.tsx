"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { APP_TAB_SETTINGS, storeAppSettingsScreen, storeAppTab } from "@/lib/client/appTabs";
import { getLkAppUrl } from "@/lib/client/lkAppUrl";

/** Старый URL профиля — открывает настройки (кабинет = /journal shell). */
export default function ProfilePage() {
  const router = useRouter();

  useEffect(() => {
    storeAppTab(APP_TAB_SETTINGS);
    storeAppSettingsScreen("profile");
    router.replace(getLkAppUrl("/app?page=settings&sc=profile"));
  }, [router]);

  return null;
}
