"use client";

import { useEffect, useState } from "react";
import PhoneFrame from "./PhoneFrame";

type PreviewPair = {
  pairNumber: number;
  time: string;
  subject: string;
  teacher: string;
  room: string;
  status: "normal" | "now" | "next" | "replaced";
};

const PREVIEW_PAIRS: PreviewPair[] = [
  {
    pairNumber: 1,
    time: "8:00 - 8:45",
    subject: "Программирование",
    teacher: "Иванова А.В.",
    room: "А-204",
    status: "normal",
  },
  {
    pairNumber: 2,
    time: "8:55 - 9:40",
    subject: "Математический анализ",
    teacher: "Петров С.И.",
    room: "Б-112",
    status: "now",
  },
  {
    pairNumber: 3,
    time: "9:50 - 10:35",
    subject: "Иностранный язык",
    teacher: "Ковальчук Е.П.",
    room: "В-301",
    status: "next",
  },
  {
    pairNumber: 4,
    time: "10:45 - 11:30",
    subject: "Физическая культура",
    teacher: "Сидоров М.К.",
    room: "спортзал",
    status: "replaced",
  },
];

const DAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"] as const;

function pairStatusClass(status: PreviewPair["status"]): string {
  switch (status) {
    case "replaced":
      return "bg-yellow-50 border-yellow-300";
    default:
      return "bg-white border-gray-200";
  }
}

function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function LandingPreview({ animate }: { animate?: boolean }) {
  const [countdown, setCountdown] = useState(754);
  const activeDay = 1;

  useEffect(() => {
    const id = window.setInterval(() => {
      setCountdown((prev) => (prev <= 0 ? 754 : prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className={`landing-device-wrap ${animate ? "landing-device-visible" : ""}`}>
      <PhoneFrame label="">
        <div className="flex h-full flex-col bg-[#f9fafb] text-gray-900">
          <div className="border-b border-gray-200 bg-white px-3 py-2">
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-2 text-[11px] text-gray-400">
              Группа, преподаватель, аудитория…
            </div>
            <div className="mt-2">
              <div className="text-[14px] font-bold">Т-XXX</div>
              <div className="text-[11px] text-gray-500">группа</div>
            </div>
          </div>

          <div className="flex-1 overflow-hidden px-2 py-2">
            <div className="mb-2 flex items-center gap-1">
              {DAY_LABELS.map((label, idx) => (
                <div
                  key={label}
                  className={`flex-1 rounded-lg border py-1.5 text-center text-[10px] font-semibold ${
                    idx === activeDay
                      ? "border-[#3390ec] bg-[#3390ec] text-white"
                      : "border-gray-200 bg-white text-gray-600"
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="overflow-hidden rounded-sm border border-gray-300 ring-2 ring-blue-200">
              <div className="flex items-center justify-between bg-blue-50 px-3 py-2">
                <div>
                  <div className="text-[12px] font-semibold text-blue-900">Вторник</div>
                  <div className="text-[10px] text-blue-700/80">замен нет</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-semibold text-gray-700">8:00 - 11:30</div>
                  <span className="mt-0.5 inline-block rounded-full bg-blue-200 px-2 py-0.5 text-[9px] font-semibold text-blue-800">
                    Сегодня
                  </span>
                </div>
              </div>

              <div className="divide-y divide-gray-100 bg-white">
                {PREVIEW_PAIRS.map((pair, i) => {
                  const isNow = pair.status === "now";
                  const isNext = pair.status === "next";
                  const showSide = isNow || isNext;

                  return (
                    <div
                      key={pair.pairNumber}
                      className={`landing-pair-enter relative border-l-4 p-3 ${pairStatusClass(pair.status)} ${showSide ? "pl-10" : ""}`}
                      style={{ animationDelay: `${280 + i * 90}ms` }}
                    >
                      {isNow ? (
                        <div className="absolute bottom-0 left-0 top-0 flex w-7 items-center justify-center border-r border-orange-300 bg-orange-100">
                          <span className="text-[9px] font-bold text-orange-800" style={{ transform: "rotate(-90deg)" }}>
                            Сейчас
                          </span>
                        </div>
                      ) : null}
                      {isNext ? (
                        <div className="absolute bottom-0 left-0 top-0 flex w-7 items-center justify-center border-r border-blue-300 bg-blue-50">
                          <span className="text-[9px] font-bold text-blue-800" style={{ transform: "rotate(-90deg)" }}>
                            Ближ.
                          </span>
                        </div>
                      ) : null}

                      <div className="flex items-start gap-3">
                        <span className="w-5 shrink-0 text-center text-base font-bold text-gray-700">{pair.pairNumber}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-semibold text-gray-700">
                            {pair.time}
                            {isNow ? (
                              <span className="ml-1 tabular-nums text-orange-700">({formatCountdown(countdown)})</span>
                            ) : null}
                          </div>
                          <div className="text-[13px] font-medium leading-snug">{pair.subject}</div>
                          <div className="mt-1 text-[10px] text-gray-600">
                            {pair.teacher} · {pair.room}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex border-t border-gray-200 bg-white px-1 py-1.5">
            {[
              { label: "Настройки", active: false },
              { label: "Расписание", active: true },
              { label: "Журнал", active: false },
            ].map((tab) => (
              <div
                key={tab.label}
                className={`flex flex-1 flex-col items-center gap-0.5 py-1 text-[9px] font-semibold ${
                  tab.active ? "text-[#3390ec]" : "text-gray-400"
                }`}
              >
                <span className={`h-1 w-1 rounded-full ${tab.active ? "bg-[#3390ec]" : "bg-transparent"}`} />
                {tab.label}
              </div>
            ))}
          </div>
        </div>
      </PhoneFrame>
    </div>
  );
}
