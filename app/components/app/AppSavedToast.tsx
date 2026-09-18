"use client";

import { useEffect, useState } from "react";
import { subscribeSavedToast, type SavedToastPayload } from "@/lib/client/savedToast";

export default function AppSavedToast() {
  const [payload, setPayload] = useState<SavedToastPayload | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    return subscribeSavedToast((next) => {
      if (!next) return;
      setPayload(next);
      setVisible(true);
    });
  }, []);

  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => setVisible(false), 1800);
    return () => window.clearTimeout(t);
  }, [visible, payload?.at]);

  if (!payload || !visible) return null;

  const time = new Date(payload.at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-1/2 z-[390] -translate-x-1/2 rounded-xl bg-[var(--app-accent)] px-4 py-2 text-sm font-medium text-white shadow-lg"
      role="status"
    >
      {payload.message} · {time}
    </div>
  );
}
