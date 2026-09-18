"use client";

/** Минимальный экран ожидания редиректа OAuth (без текста). */
export default function AuthRedirectSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f0f4fa]">
      <div
        className="h-11 w-11 animate-spin rounded-full border-[3px] border-gray-200"
        style={{ borderTopColor: "var(--app-accent)" }}
        aria-hidden
      />
    </div>
  );
}
