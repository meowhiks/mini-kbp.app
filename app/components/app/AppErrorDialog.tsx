"use client";

import { useEffect, useState } from "react";
import { dismissErrorDialog, subscribeErrorDialog, type ErrorDialogPayload } from "@/lib/client/errorDialog";

export default function AppErrorDialog() {
  const [payload, setPayload] = useState<ErrorDialogPayload | null>(null);

  useEffect(() => subscribeErrorDialog(setPayload), []);

  if (!payload) return null;

  return (
    <div className="fixed inset-0 z-[520] flex items-center justify-center bg-black/45 p-4" role="alertdialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <h2 className="font-montserrat text-lg font-bold text-neutral-950">{payload.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">{payload.message}</p>
        <button
          type="button"
          className="mt-5 w-full rounded-xl bg-[var(--app-accent)] py-2.5 text-sm font-semibold text-white"
          onClick={() => dismissErrorDialog()}
        >
          Понятно
        </button>
      </div>
    </div>
  );
}
