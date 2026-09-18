import type { Metadata } from "next";
import LegalBackLink from "@/app/components/LegalBackLink";

export const metadata: Metadata = {
  title: "API для разработчиков",
};

export default function DevelopersPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12 text-neutral-800 sm:px-8">
      <LegalBackLink />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">API для разработчиков</h1>
      <p className="mt-6 text-sm leading-relaxed text-neutral-600">
        Документация появится позже. Пока публичный API не открыт.
      </p>
    </main>
  );
}
