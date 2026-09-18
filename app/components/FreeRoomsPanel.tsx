"use client";

import { useEffect, useState } from "react";
import {
  FREE_ROOMS_LESSON_MAX,
  FREE_ROOMS_LESSON_MIN,
  findFreeRooms,
  type FreeRoomHit,
  type FreeRoomsFilter,
  type FreeRoomsWhen,
} from "@/lib/client/freeRooms";
import type { SearchResult } from "@/lib/client/searchApi";
import { themeIsDark, type AppTheme } from "@/lib/client/appTheme";

type FreeRoomsPanelProps = {
  theme: AppTheme;
  open: boolean;
  onClose: () => void;
  onSelectPlace: (result: SearchResult, timetableData: unknown) => void;
};

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function FreeRoomsPanel({ theme, open, onClose, onSelectPlace }: FreeRoomsPanelProps) {
  const isDark = themeIsDark(theme);
  const [when, setWhen] = useState<FreeRoomsWhen>("now");
  const [dateIso, setDateIso] = useState(todayIso);
  const [lessonNumber, setLessonNumber] = useState<number | "auto">("auto");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [hits, setHits] = useState<FreeRoomHit[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    setLoading(true);
    setError("");
    setHits([]);
    setProgress({ done: 0, total: 0 });

    const filter: FreeRoomsFilter = {
      when,
      dateIso: when === "date" ? dateIso : undefined,
      lessonNumber: lessonNumber === "auto" ? null : lessonNumber,
    };

    void findFreeRooms(filter, {
      signal: ac.signal,
      onProgress: (done, total, partial) => {
        setProgress({ done, total });
        setHits(partial);
      },
    })
      .then((result) => {
        if (!ac.signal.aborted) {
          setHits(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ac.signal.aborted) {
          setError(String(err?.message || err || "Ошибка поиска"));
          setLoading(false);
        }
      });

    return () => ac.abort();
  }, [open, when, dateIso, lessonNumber]);

  if (!open) return null;

  const card = isDark
    ? "bg-[var(--app-bg)] text-zinc-100"
    : "bg-gray-50 text-gray-900";
  const chipIdle = isDark ? "bg-[var(--app-elevated)] text-zinc-300" : "bg-white text-gray-700 border border-gray-200";
  const field = isDark
    ? "border-[var(--app-border)] bg-[var(--app-elevated)]"
    : "border-gray-200 bg-white";

  return (
    <div className="fixed inset-0 z-[80] flex flex-col">
      <div className={`flex h-full min-h-0 w-full flex-col ${card}`} role="dialog" aria-modal="true" aria-label="Свободные аудитории">
        <div
          className={`safe-top flex items-center gap-3 border-b px-4 py-3 ${
            isDark ? "border-[var(--app-border)] bg-[var(--app-surface)]" : "border-gray-200 bg-white"
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
              isDark ? "bg-[var(--app-elevated)] text-zinc-300" : "bg-gray-100 text-gray-700"
            }`}
            aria-label="Назад"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold">Свободные аудитории</div>
            <div className={`truncate text-[11px] ${isDark ? "text-zinc-400" : "text-gray-500"}`}>
              {loading
                ? `Сканируем ${progress.done}/${progress.total || "…"}`
                : `Найдено: ${hits.length}`}
            </div>
          </div>
        </div>

        <div
          className={`flex flex-wrap gap-1.5 border-b px-3 py-2.5 ${
            isDark ? "border-[var(--app-border)] bg-[var(--app-surface)]" : "border-gray-200 bg-white"
          }`}
        >
          {(
            [
              { id: "now" as const, label: "Сейчас" },
              { id: "tomorrow" as const, label: "Завтра" },
              { id: "date" as const, label: "Дата" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setWhen(opt.id)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                when === opt.id ? "bg-[var(--app-accent)] text-white" : chipIdle
              }`}
            >
              {opt.label}
            </button>
          ))}
          {when === "date" ? (
            <input
              type="date"
              value={dateIso}
              onChange={(e) => setDateIso(e.target.value)}
              className={`rounded-lg border px-2 py-1 text-[11px] ${field}`}
            />
          ) : null}
          <select
            value={lessonNumber === "auto" ? "auto" : String(lessonNumber)}
            onChange={(e) => {
              const v = e.target.value;
              setLessonNumber(v === "auto" ? "auto" : Number(v));
            }}
            className={`rounded-lg border px-2 py-1 text-[11px] ${field}`}
          >
            <option value="auto">{when === "now" ? "Текущий/ближ. урок" : "Любая занятость"}</option>
            {Array.from(
              { length: FREE_ROOMS_LESSON_MAX - FREE_ROOMS_LESSON_MIN + 1 },
              (_, i) => FREE_ROOMS_LESSON_MIN + i
            ).map((n) => (
              <option key={n} value={n}>
                {n} урок
              </option>
            ))}
          </select>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-safe">
          {error ? (
            <div className="px-4 py-4 text-sm text-rose-500">{error}</div>
          ) : hits.length === 0 && !loading ? (
            <div className={`px-4 py-10 text-center text-sm ${isDark ? "text-zinc-400" : "text-gray-500"}`}>
              Свободных аудиторий не найдено
            </div>
          ) : (
            <ul className={isDark ? "divide-y divide-[var(--app-border)]" : "divide-y divide-gray-100"}>
              {hits.map((hit) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium transition active:opacity-80 ${
                      isDark ? "hover:bg-[var(--app-surface)]" : "bg-white hover:bg-gray-50"
                    }`}
                    onClick={async () => {
                      const { fetchTimetableByCategory } = await import("@/lib/client/searchApi");
                      const res = await fetchTimetableByCategory("place", hit.id);
                      if (res.success && res.data) {
                        onSelectPlace(
                          { id: hit.id, name: hit.name, type: "place", typeLabel: "Аудитория" },
                          res.data
                        );
                        onClose();
                      }
                    }}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        isDark ? "bg-[var(--app-elevated)] text-zinc-300" : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1 truncate">ауд. {hit.name}</span>
                    <svg
                      className={`h-4 w-4 shrink-0 ${isDark ? "text-zinc-500" : "text-gray-400"}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      aria-hidden
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {loading ? (
            <div className={`px-4 py-3 text-center text-[11px] ${isDark ? "text-zinc-500" : "text-gray-400"}`}>
              Ищем дальше…
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
