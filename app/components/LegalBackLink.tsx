import Link from "next/link";

export default function LegalBackLink() {
  return (
    <p className="text-sm text-neutral-500">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-neutral-600 no-underline hover:text-[#3390ec]"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <path d="M19 12H5M11 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Назад
      </Link>
    </p>
  );
}
