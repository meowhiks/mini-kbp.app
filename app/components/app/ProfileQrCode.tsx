"use client";

import { useEffect, useRef, useState } from "react";
import QRCodeStyling from "qr-code-styling";

type ProfileQrCodeProps = {
  value: string;
  /** Фиксированный размер в px; игнорируется при fill */
  size?: number;
  /** Заполнить родительский контейнер (квадрат по min(width, height)) */
  fill?: boolean;
  /** Без белой подложки — только модули QR (для входа на ПК) */
  bare?: boolean;
  isDark?: boolean;
  className?: string;
};

function buildQrStyle(bare: boolean, isDark: boolean) {
  const dotColor = bare && isDark ? "#f4f4f5" : "#111827";
  return {
    type: "svg" as const,
    margin: 0,
    qrOptions: { errorCorrectionLevel: "L" as const },
    dotsOptions: {
      type: "classy-rounded" as const,
      color: dotColor,
    },
    cornersSquareOptions: {
      type: "classy-rounded" as const,
      color: dotColor,
    },
    cornersDotOptions: {
      type: "dot" as const,
      color: dotColor,
    },
    backgroundOptions: {
      color: bare ? "transparent" : "#ffffff",
    },
  };
}

/** Fluid QR: модули сливаются без зазоров между «квадратиками». */
export default function ProfileQrCode({
  value,
  size = 176,
  fill = false,
  bare = false,
  isDark = false,
  className = "",
}: ProfileQrCodeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [fillSize, setFillSize] = useState(size);

  useEffect(() => {
    if (!fill) return;
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const next = Math.floor(Math.min(rect.width, rect.height));
      if (next > 0) setFillSize(next);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fill]);

  const renderSize = fill ? fillSize : size;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || renderSize <= 0) return;

    el.innerHTML = "";
    const qr = new QRCodeStyling({
      ...buildQrStyle(bare, isDark),
      width: renderSize,
      height: renderSize,
      data: value,
    });
    qr.append(el);

    const svg = el.querySelector("svg");
    if (svg) {
      svg.style.display = "block";
      svg.style.margin = "0";
      svg.style.padding = "0";
      svg.style.width = "100%";
      svg.style.height = "100%";
      if (bare) {
        svg.querySelectorAll("rect").forEach((rect) => {
          rect.setAttribute("fill", "transparent");
        });
      }
    }

    return () => {
      el.innerHTML = "";
    };
  }, [value, renderSize, bare, isDark]);

  if (fill) {
    return (
      <div
        ref={containerRef}
        className={`flex h-full w-full items-center justify-center ${className}`}
        aria-hidden
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: size, height: size, lineHeight: 0 }}
      aria-hidden
    />
  );
}
