"use client";

import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { textFitScale } from "@/lib/client/textFitScale";
import { buildTimetableEntityHref, type TimetableEntityType } from "@/lib/client/timetableQuery";

type TimetableEntityLinkProps = {
  label: string;
  href?: string;
  align?: "left" | "right" | "center";
  className?: string;
  variant?: "text" | "pill";
  entity?: {
    type: TimetableEntityType;
    id?: string;
  };
};

function queryNameForEntity(type: TimetableEntityType, label: string): string {
  if (type === "place") return label.replace(/^ауд\.\s*/i, "").trim() || label;
  return label;
}

function FitOneLine({
  text,
  className = "",
}: {
  text: string;
  className?: string;
  align?: "left" | "right" | "center";
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const parent = el.parentElement;
    const measure = () => {
      el.style.fontSize = "";
      const max = parent?.clientWidth ?? el.clientWidth;
      const need = el.scrollWidth;
      const scale = textFitScale(need, max);
      const base = Number.parseFloat(getComputedStyle(el).fontSize) || 13;
      el.style.fontSize = scale < 1 ? `${base * scale}px` : "";
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (ro && parent) ro.observe(parent);
    return () => ro?.disconnect();
  }, [text]);

  return (
    <span ref={ref} title={text} className={`inline-block max-w-full whitespace-nowrap ${className}`}>
      {text}
    </span>
  );
}

/** Ссылка на сущность расписания: href с tt_* query, имя в одну строку. */
export default function TimetableEntityLink({
  label,
  href: providedHref,
  align = "left",
  className = "",
  variant = "text",
  entity,
}: TimetableEntityLinkProps) {
  const pathname = usePathname() || "";
  const trimmed = (label || "").trim();
  if (!trimmed) return null;

  const fromEntity = entity
    ? buildTimetableEntityHref(
        {
          type: entity.type,
          id: entity.id?.trim() || undefined,
          name: queryNameForEntity(entity.type, trimmed),
        },
        pathname
      )
    : null;
  const fromProvided =
    providedHref && providedHref !== "?" && !providedHref.endsWith("?")
      ? providedHref.startsWith("?")
        ? `${pathname}${providedHref}`
        : providedHref.startsWith("/")
          ? providedHref
          : `?${providedHref}`
      : null;
  const finalHref = fromEntity || fromProvided;

  const alignClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const content = <FitOneLine text={trimmed} className={className} align={align} />;

  if (!finalHref) {
    return variant === "pill" ? (
      <span className={`tt-entity-link block max-w-full overflow-hidden rounded bg-slate-900 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white no-underline ${className}`}>
        {content}
      </span>
    ) : (
      <span className={`tt-entity-link block w-full min-w-0 overflow-hidden no-underline ${alignClass} ${className}`}>
        {content}
      </span>
    );
  }

  if (variant === "pill") {
    return (
      <Link
        href={finalHref}
        scroll={false}
        className={`tt-entity-link block max-w-full overflow-hidden rounded bg-slate-900 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white no-underline ${className}`}
      >
        {content}
      </Link>
    );
  }

  return (
    <Link
      href={finalHref}
      scroll={false}
      className={`tt-entity-link block w-full min-w-0 overflow-hidden no-underline ${alignClass} ${className}`}
    >
      {content}
    </Link>
  );
}
