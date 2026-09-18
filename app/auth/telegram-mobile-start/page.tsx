"use client";

import { useEffect } from "react";
import AuthRedirectSpinner from "@/app/components/app/AuthRedirectSpinner";

/** @deprecated Используйте /auth/cb */
export default function TelegramMobileStartPage() {
  useEffect(() => {
    window.location.replace("/auth/cb");
  }, []);
  return <AuthRedirectSpinner />;
}
