"use client";

import { useEffect, useRef } from "react";

/** Тема: #3390ec → rgb(51, 144, 236) */
const THEME = { r: 51, g: 144, b: 236 };

/**
 * Путь линии: сначала вниз, потом вверх через центр, затем плавно вправо по прямой.
 * t ∈ [0,1], возвращает нормализованные координаты.
 */
function pathPoint(t: number, ox: number, oy: number, phase: number, time: number): { x: number; y: number } {
  const sway = 0.01 * Math.sin(time * 0.6 + phase);
  // ключевые точки формы
  const p0 = { x: -0.06 + ox * 0.15, y: 0.52 + oy }; // старт слева
  const p1 = { x: 0.18 + ox * 0.2, y: 0.12 + oy + sway }; // вниз
  const p2 = { x: 0.42 + ox * 0.1, y: 0.78 + oy - sway * 0.5 }; // вверх через центр
  const p3 = { x: 0.68, y: 0.48 + oy * 0.3 }; // выравнивание
  const p4 = { x: 1.08, y: 0.48 + oy * 0.15 }; // прямо вправо

  // два кубических сегмента: вниз→вверх, затем сглаживание вправо
  if (t < 0.55) {
    const u = t / 0.55;
    return cubic(p0, p1, { x: (p1.x + p2.x) * 0.5, y: p2.y }, p2, u);
  }
  const u = (t - 0.55) / 0.45;
  return cubic(p2, p3, { x: (p3.x + p4.x) * 0.5, y: p4.y }, p4, u);
}

function cubic(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
  t: number
) {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  return {
    x: uu * u * a.x + 3 * uu * t * b.x + 3 * u * tt * c.x + tt * t * d.x,
    y: uu * u * a.y + 3 * uu * t * b.y + 3 * u * tt * c.y + tt * t * d.y,
  };
}

function themeColor(alpha: number, shimmer: number): string {
  // лёгкий перелив вокруг #3390ec
  const r = Math.round(THEME.r + 28 * shimmer);
  const g = Math.round(THEME.g + 18 * (1 - shimmer));
  const b = Math.round(THEME.b + 12 * shimmer);
  return `rgba(${r},${g},${b},${alpha})`;
}

const LINE_COUNT = 30;

export default function AuthFlowShader() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let alive = true;
    const start = performance.now();
    let last = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      return { w, h, dpr };
    };

    const draw = (now: number) => {
      if (!alive) return;
      // ~30 fps — не лагом вход
      if (!reduced && now - last < 33) {
        raf = requestAnimationFrame(draw);
        return;
      }
      last = now;

      const { w, h } = resize();
      const t = reduced ? 0 : (now - start) * 0.001;

      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#f0f4fa");
      g.addColorStop(1, "#f9fafc");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (let i = 0; i < LINE_COUNT; i++) {
        const u = i / (LINE_COUNT - 1);
        const ox = (u - 0.5) * 0.22;
        const oy = (u - 0.5) * 0.55;
        const phase = u * Math.PI * 2;
        const width = (0.9 + (i % 3) * 0.25) * (w / 900);
        const shimmer = 0.5 + 0.5 * Math.sin(t * 1.4 + phase + u * 3);
        const alpha = 0.28 + 0.45 * (0.55 + 0.45 * Math.sin(t * 1.8 + phase));

        ctx.beginPath();
        const steps = 48;
        for (let s = 0; s <= steps; s++) {
          const pt = pathPoint(s / steps, ox, oy, phase, t);
          const x = pt.x * w;
          const y = pt.y * h;
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = themeColor(alpha, shimmer);
        ctx.lineWidth = Math.max(1.1, width);
        ctx.stroke();
      }

      if (!reduced) raf = requestAnimationFrame(draw);
    };

    if (reduced) draw(performance.now());
    else raf = requestAnimationFrame(draw);

    const onResize = () => {
      last = 0;
    };
    window.addEventListener("resize", onResize);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 h-full w-full"
    />
  );
}
