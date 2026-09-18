"use client";

import { useCallback, useEffect, useState } from "react";

const SLOGANS = ["Мини КБиП", "Расписание", "Замены", "Офлайн", "Удобство"] as const;
/** Time for one slogan enter→hold→exit */
const CYCLE_MS = 900;
const FADE_MS = 480;

type Props = {
  /** Timetable shell reported ready (cache or network). */
  contentReady?: boolean;
  onDone?: () => void;
};

/**
 * White splash: 5 slogans slide L→R with fast–slow–fast motion.
 * Auto-dismiss as soon as contentReady; tap/keyboard skip once ready.
 */
export default function AppBootSplash({ contentReady = false, onDone }: Props) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"run" | "fade" | "gone">("run");
  const [cyclesDone, setCyclesDone] = useState(false);

  const beginFade = useCallback(() => {
    setPhase((p) => {
      if (p !== "run") return p;
      return "fade";
    });
  }, []);

  useEffect(() => {
    if (phase !== "fade") return;
    const t = window.setTimeout(() => {
      setPhase("gone");
      onDone?.();
    }, FADE_MS);
    return () => window.clearTimeout(t);
  }, [phase, onDone]);

  useEffect(() => {
    if (phase !== "run") return;
    let i = 0;
    const tick = () => {
      i += 1;
      if (i >= SLOGANS.length) {
        setCyclesDone(true);
        setIndex(SLOGANS.length - 1);
        return;
      }
      setIndex(i);
    };
    const id = window.setInterval(tick, CYCLE_MS);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "run") return;
    if (!contentReady) return;
    beginFade();
  }, [contentReady, phase, beginFade]);

  if (phase === "gone") return null;

  const slogan = SLOGANS[index] ?? SLOGANS[0];
  const waiting = cyclesDone && !contentReady;
  const skippable = contentReady && phase === "run";

  return (
    <div
      className={`app-boot-splash ${phase === "fade" ? "app-boot-splash--out" : ""} ${
        skippable ? "app-boot-splash--skippable" : ""
      }`}
      aria-hidden={phase === "fade"}
      role={skippable ? "button" : undefined}
      tabIndex={skippable ? 0 : undefined}
      aria-label={skippable ? "Пропустить" : undefined}
      onClick={skippable ? () => beginFade() : undefined}
      onKeyDown={
        skippable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                beginFade();
              }
            }
          : undefined
      }
    >
      <div key={`${index}-${waiting ? "wait" : "go"}`} className="app-boot-splash__track">
        <p className={`app-boot-splash__slogan ${waiting ? "app-boot-splash__slogan--pulse" : ""}`}>
          {slogan}
        </p>
      </div>
    </div>
  );
}
