"use client";

import { Suspense, useCallback, useState } from "react";
import dynamic from "next/dynamic";
import AppBootSplash from "@/app/components/app/AppBootSplash";

const AppShell = dynamic(() => import("../modules/AppShell"), {
  loading: () => <div className="fixed inset-0 bg-white" aria-hidden />,
});

/** Главный экран приложения — сразу оболочка (без входа). */
export default function AppShellPage() {
  const [splashDone, setSplashDone] = useState(false);
  const [contentReady, setContentReady] = useState(false);
  const onBootReady = useCallback(() => setContentReady(true), []);

  return (
    <>
      <AppBootSplash contentReady={contentReady} onDone={() => setSplashDone(true)} />
      <Suspense fallback={<div className="fixed inset-0 bg-white" aria-hidden />}>
        <div className={splashDone ? undefined : undefined} aria-busy={!splashDone}>
          <AppShell onBootReady={onBootReady} />
        </div>
      </Suspense>
    </>
  );
}
