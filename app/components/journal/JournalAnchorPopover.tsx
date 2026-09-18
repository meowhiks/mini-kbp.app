"use client";

import { useLayoutEffect, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { placeJournalPopover, type RectLike } from "@/lib/client/journalPopoverPosition";
import type { JournalMenuBackdrop } from "@/lib/client/journalMenuBackdrop";

type JournalAnchorPopoverProps = {
  anchor?: DOMRect | RectLike | null;
  onClose: () => void;
  children: React.ReactNode;
  menuWidth?: number;
  className?: string;
  highlightRect?: RectLike | null;
  /** Границы таблицы — крест строки/столбца только внутри неё */
  tableBounds?: RectLike | null;
  /** Подсветить строку и столбец внутри таблицы, ячейку обвести синим */
  crossHighlight?: boolean;
  backdropMode?: JournalMenuBackdrop;
  spotlight?: {
    backgroundColor: string;
    children?: React.ReactNode;
  };
  progress?: "idle" | "indeterminate" | "error";
  errorText?: string;
};

function initialPos(
  anchor: DOMRect | RectLike | null | undefined,
  menuWidth: number
): { top: number; left: number } | null {
  if (!anchor || typeof window === "undefined") return null;
  return placeJournalPopover(anchor, {
    menuWidth,
    menuHeight: 280,
    viewport: { width: window.innerWidth, height: window.innerHeight },
  });
}

function veilClass(mode: Exclude<JournalMenuBackdrop, "off">): string {
  if (mode === "dim") return "absolute bg-black/45";
  return "absolute bg-white/25 backdrop-blur-[8px] dark:bg-black/35";
}

function toBox(r: RectLike) {
  return {
    top: r.top,
    left: r.left,
    right: r.left + r.width,
    bottom: r.top + r.height,
    width: Math.max(r.width, 1),
    height: Math.max(r.height, 1),
  };
}

export default function JournalAnchorPopover({
  anchor,
  onClose,
  children,
  menuWidth = 280,
  className = "",
  highlightRect,
  tableBounds,
  crossHighlight = true,
  backdropMode = "blur",
  spotlight,
  progress = "idle",
  errorText,
}: JournalAnchorPopoverProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(() =>
    initialPos(anchor, menuWidth)
  );
  const [viewport, setViewport] = useState(() =>
    typeof window !== "undefined"
      ? { w: window.innerWidth, h: window.innerHeight }
      : { w: 0, h: 0 }
  );

  const cellRect = highlightRect ?? (anchor
    ? {
        top: anchor.top,
        left: anchor.left,
        width: anchor.width,
        height: anchor.height,
      }
    : null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useLayoutEffect(() => {
    if (!anchor || typeof window === "undefined") {
      setPos(null);
      return;
    }
    const menuHeight = boxRef.current?.offsetHeight || 280;
    setPos(
      placeJournalPopover(anchor, {
        menuWidth,
        menuHeight,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      })
    );
  }, [anchor, menuWidth, progress, errorText]);

  if (typeof document === "undefined") return null;

  const anchored = Boolean(anchor && pos);
  const showVeil = backdropMode !== "off";
  const useCross = Boolean(crossHighlight && cellRect && showVeil);
  const veil = showVeil ? veilClass(backdropMode) : "";

  const cell = cellRect ? toBox(cellRect) : null;
  const table = tableBounds ? toBox(tableBounds) : null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[200] ${anchored ? "" : "flex items-center justify-center p-4"}`}
      role="presentation"
    >
      {showVeil && !useCross ? <div className={`inset-0 ${veil}`} aria-hidden /> : null}

      {showVeil && useCross && cell ? (
        <>
          {table ? (
            <>
              {/* Вне таблицы — полный veil */}
              <div className={veil} style={{ top: 0, left: 0, width: viewport.w, height: table.top }} aria-hidden />
              <div
                className={veil}
                style={{
                  top: table.bottom,
                  left: 0,
                  width: viewport.w,
                  height: Math.max(0, viewport.h - table.bottom),
                }}
                aria-hidden
              />
              <div
                className={veil}
                style={{ top: table.top, left: 0, width: table.left, height: table.height }}
                aria-hidden
              />
              <div
                className={veil}
                style={{
                  top: table.top,
                  left: table.right,
                  width: Math.max(0, viewport.w - table.right),
                  height: table.height,
                }}
                aria-hidden
              />
              {/* Внутри таблицы — только углы, крест прозрачный */}
              <div
                className={veil}
                style={{
                  top: table.top,
                  left: table.left,
                  width: Math.max(0, cell.left - table.left),
                  height: Math.max(0, cell.top - table.top),
                }}
                aria-hidden
              />
              <div
                className={veil}
                style={{
                  top: table.top,
                  left: cell.right,
                  width: Math.max(0, table.right - cell.right),
                  height: Math.max(0, cell.top - table.top),
                }}
                aria-hidden
              />
              <div
                className={veil}
                style={{
                  top: cell.bottom,
                  left: table.left,
                  width: Math.max(0, cell.left - table.left),
                  height: Math.max(0, table.bottom - cell.bottom),
                }}
                aria-hidden
              />
              <div
                className={veil}
                style={{
                  top: cell.bottom,
                  left: cell.right,
                  width: Math.max(0, table.right - cell.right),
                  height: Math.max(0, table.bottom - cell.bottom),
                }}
                aria-hidden
              />
            </>
          ) : (
            <>
              <div className={veil} style={{ top: 0, left: 0, width: cell.left, height: cell.top }} aria-hidden />
              <div
                className={veil}
                style={{ top: 0, left: cell.right, width: Math.max(0, viewport.w - cell.right), height: cell.top }}
                aria-hidden
              />
              <div
                className={veil}
                style={{
                  top: cell.bottom,
                  left: 0,
                  width: cell.left,
                  height: Math.max(0, viewport.h - cell.bottom),
                }}
                aria-hidden
              />
              <div
                className={veil}
                style={{
                  top: cell.bottom,
                  left: cell.right,
                  width: Math.max(0, viewport.w - cell.right),
                  height: Math.max(0, viewport.h - cell.bottom),
                }}
                aria-hidden
              />
            </>
          )}
        </>
      ) : null}

      <button
        type="button"
        className="absolute inset-0 z-[1] cursor-default bg-transparent"
        aria-label="Закрыть"
        onClick={onClose}
      />

      {cell ? (
        <div
          className="pointer-events-none absolute z-[2] overflow-hidden rounded-[3px] ring-2 ring-[#3390ec]"
          style={{
            top: cell.top,
            left: cell.left,
            width: cell.width,
            height: cell.height,
            backgroundColor: spotlight?.backgroundColor ?? "var(--app-journal-cell, #fff)",
          }}
          aria-hidden
        >
          {spotlight?.children ? (
            <div className="flex h-full w-full items-center justify-center overflow-hidden text-center">
              {spotlight.children}
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        className={`relative z-[3] max-h-[min(70vh,520px)] overflow-y-auto rounded-xl border border-gray-200/90 bg-white shadow-xl ${className}`}
        style={
          anchored && pos
            ? {
                position: "fixed",
                top: pos.top,
                left: pos.left,
                width: menuWidth,
                maxWidth: "calc(100vw - 1rem)",
              }
            : { width: menuWidth, maxWidth: "calc(100vw - 2rem)" }
        }
        onClick={(e) => e.stopPropagation()}
      >
        {children}
        {progress !== "idle" || errorText ? (
          <div className="border-t border-gray-100 px-3 pb-2 pt-1">
            {errorText ? <p className="mb-1 text-[11px] text-red-600">{errorText}</p> : null}
            <div
              className={`relative h-[2px] overflow-hidden rounded-full ${
                progress === "error" ? "bg-red-100" : "bg-gray-200"
              }`}
            >
              {progress === "indeterminate" ? (
                <div className="absolute inset-y-0 w-[40%] animate-[refreshGlow_1.35s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-transparent via-[#3390ec] to-transparent" />
              ) : null}
              {progress === "error" ? <div className="absolute inset-0 bg-red-500" /> : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
