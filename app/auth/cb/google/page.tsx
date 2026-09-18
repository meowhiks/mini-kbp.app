"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthRedirectSpinner from "@/app/components/app/AuthRedirectSpinner";

/** @deprecated Используйте /auth/cb */
function GoogleCbRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const q = searchParams.toString();
    router.replace(q ? `/auth/cb?${q}` : "/auth/cb");
  }, [router, searchParams]);

  return <AuthRedirectSpinner />;
}

export default function GoogleCbPage() {
  return (
    <Suspense fallback={<AuthRedirectSpinner />}>
      <GoogleCbRedirect />
    </Suspense>
  );
}
