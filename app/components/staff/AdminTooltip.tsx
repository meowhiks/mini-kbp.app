"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { adminInput } from "./AdminShell";

type TooltipSide = "top" | "bottom";
type TooltipAlign = "center" | "start" | "end";

function computeTooltipStyle(rect: DOMRect, side: TooltipSide, align: TooltipAlign): CSSProperties {
  const gap = 6;
  if (side === "top") {
    if (align === "start") {
      return { position: "fixed", top: rect.top - gap, left: rect.left, transform: "translateY(-100%)", zIndex: 9999 };
    }
    if (align === "end") {
      return { position: "fixed", top: rect.top - gap, left: rect.right, transform: "translate(-100%, -100%)", zIndex: 9999 };
    }
    return {
      position: "fixed",
      top: rect.top - gap,
      left: rect.left + rect.width / 2,
      transform: "translate(-50%, -100%)",
      zIndex: 9999,
    };
  }

  if (align === "start") {
    return { position: "fixed", top: rect.bottom + gap, left: rect.left, zIndex: 9999 };
  }
  if (align === "end") {
    return { position: "fixed", top: rect.bottom + gap, left: rect.right, transform: "translateX(-100%)", zIndex: 9999 };
  }
  return {
    position: "fixed",
    top: rect.bottom + gap,
    left: rect.left + rect.width / 2,
    transform: "translateX(-50%)",
    zIndex: 9999,
  };
}

export function AdminTooltip({
  label,
  children,
  side = "top",
  align = "center",
}: {
  label: string;
  children: React.ReactNode;
  side?: TooltipSide;
  align?: TooltipAlign;
}) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const ref = useRef<HTMLSpanElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const show = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setStyle(computeTooltipStyle(el.getBoundingClientRect(), side, align));
    setOpen(true);
  }, [side, align]);

  const hide = useCallback(() => setOpen(false), []);

  if (!label.trim()) return <>{children}</>;

  return (
    <>
      <span
        ref={ref}
        className="inline-flex max-w-full align-middle"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {mounted && open
        ? createPortal(
            <span
              role="tooltip"
              style={style}
              className="pointer-events-none max-w-[min(20rem,calc(100vw-2rem))] whitespace-normal rounded-md bg-gray-900 px-2 py-1 text-center text-[11px] font-normal leading-snug text-white shadow-lg"
            >
              {label}
            </span>,
            document.body
          )
        : null}
    </>
  );
}

export function AdminHintIcon({ label }: { label: string }) {
  return (
    <AdminTooltip label={label}>
      <span
        tabIndex={0}
        className="inline-flex h-5 w-5 shrink-0 cursor-default items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500 outline-none ring-gray-300 focus-visible:ring-2"
        aria-label={label}
      >
        i
      </span>
    </AdminTooltip>
  );
}

export function AdminIconBadge({
  label,
  children,
  tone = "gray",
}: {
  label: string;
  children: React.ReactNode;
  tone?: "gray" | "blue" | "sky" | "green";
}) {
  const tones = {
    gray: "bg-gray-100 text-gray-600",
    blue: "bg-blue-50 text-blue-700",
    sky: "bg-sky-50 text-sky-700",
    green: "bg-emerald-50 text-emerald-700",
  };
  return (
    <AdminTooltip label={label}>
      <span
        tabIndex={0}
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${tones[tone]} outline-none ring-gray-300 focus-visible:ring-2`}
        aria-label={label}
      >
        {children}
      </span>
    </AdminTooltip>
  );
}

type CompactOption = { value: string; label: string; hint?: string };

export function AdminCompactSelect({
  value,
  onChange,
  options,
  hint,
  className = "",
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: CompactOption[];
  hint?: string;
  className?: string;
  placeholder?: string;
}) {
  const selected = options.find((o) => o.value === value);
  const tooltip = hint ?? selected?.hint ?? selected?.label ?? "";
  const showHint = Boolean(tooltip && (tooltip.length > 14 || tooltip !== selected?.label));

  return (
    <div className="flex min-w-0 items-center gap-1">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${adminInput} min-w-0 max-w-[6.5rem] truncate py-1 text-xs ${className}`}
        title={tooltip}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value} title={o.hint ?? o.label}>
            {o.label}
          </option>
        ))}
      </select>
      {showHint ? <AdminHintIcon label={tooltip} /> : null}
    </div>
  );
}
