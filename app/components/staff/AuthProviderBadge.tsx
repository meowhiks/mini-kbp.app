"use client";

import { AdminTooltip } from "@/app/components/staff/AdminTooltip";
import type { AppAccountRecord } from "@/lib/client/miniKbpServer";

const PROVIDER_META: Record<
  AppAccountRecord["auth_provider"],
  { label: string; short: string; className: string }
> = {
  telegram: { label: "Telegram", short: "TG", className: "bg-sky-50 text-sky-700" },
  email: { label: "Почта", short: "@", className: "bg-violet-50 text-violet-700" },
  google: { label: "Google", short: "G", className: "bg-amber-50 text-amber-700" },
  unknown: { label: "Неизвестно", short: "?", className: "bg-gray-100 text-gray-500" },
};

function ProviderIcon({ provider }: { provider: AppAccountRecord["auth_provider"] }) {
  if (provider === "telegram") {
    return (
      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.02-1.96 1.25-5.54 3.67-.52.36-1 .53-1.42.52-.47-.01-1.37-.26-2.03-.48-.82-.27-1.47-.42-1.42-.88.03-.24.37-.49 1.03-.74 4.04-1.76 6.74-2.92 8.1-3.49 3.85-1.61 4.65-1.89 5.17-1.9.11 0 .37.03.53.17.14.12.18.28.2.45-.01.06.01.24 0 .38z" />
      </svg>
    );
  }
  if (provider === "email") {
    return (
      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    );
  }
  if (provider === "google") {
    return (
      <svg className="h-3 w-3" viewBox="0 0 24 24" aria-hidden>
        <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.2-1.6 3.5-5.4 3.5-3.3 0-5.9-2.7-5.9-6s2.6-6 5.9-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C17.5 2.7 15 1.5 12 1.5 6.8 1.5 2.5 5.8 2.5 11s4.3 9.5 9.5 9.5c5.5 0 9.1-3.9 9.1-9.3 0-.6-.1-1.1-.2-1.5H12z" />
      </svg>
    );
  }
  return <span className="text-[10px] font-bold">?</span>;
}

export function AuthProviderBadge({
  provider,
  telegramUsername,
}: {
  provider: AppAccountRecord["auth_provider"];
  telegramUsername?: string;
}) {
  const meta = PROVIDER_META[provider];
  const tip =
    provider === "telegram" && telegramUsername
      ? `Telegram · @${telegramUsername}`
      : meta.label;
  return (
    <AdminTooltip label={tip}>
      <span
        tabIndex={0}
        className={`inline-flex h-6 min-w-[1.5rem] items-center justify-center gap-0.5 rounded-md px-1 text-[10px] font-semibold ${meta.className}`}
        aria-label={tip}
      >
        <ProviderIcon provider={provider} />
        <span>{meta.short}</span>
      </span>
    </AdminTooltip>
  );
}

export function authProviderFilterLabel(provider: AppAccountRecord["auth_provider"]): string {
  return PROVIDER_META[provider].label.toLowerCase();
}
