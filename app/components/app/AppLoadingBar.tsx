"use client";

import { useEffect, useState } from "react";
import { subscribeLoading, type LoadingState } from "@/lib/client/loadingOrchestrator";

export default function AppLoadingBar() {
  const [state, setState] = useState<LoadingState>({ active: "idle", counts: { boot: 0, refresh: 0, action: 0 } });

  useEffect(() => subscribeLoading(setState), []);

  if (state.active === "idle") return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[400]" role="progressbar" aria-label="Загрузка">
      <div className="relative h-[2px] overflow-hidden bg-transparent">
        <div className="absolute inset-y-0 w-[40%] animate-[refreshGlow_1.35s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-transparent via-[var(--app-accent)] to-transparent" />
      </div>
    </div>
  );
}
