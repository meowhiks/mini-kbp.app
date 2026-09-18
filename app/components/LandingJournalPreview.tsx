"use client";

import PhoneFrame from "./PhoneFrame";

const MONTHS = [
  { label: "Сент", span: 4 },
  { label: "Окт", span: 4 },
  { label: "Ноя", span: 3 },
] as const;

const DATES = ["2", "5", "9", "12", "16", "19", "23", "26", "30"] as const;

const SUBJECTS = [
  {
    name: "Матем. анализ",
    grades: ["8", "9", "", "7", "8", "", "9", "8", ""],
    avg: "8.2",
  },
  {
    name: "Программирование",
    grades: ["9", "10", "9", "", "9", "10", "", "9", "10"],
    avg: "9.4",
    active: true,
  },
  {
    name: "Иностр. язык",
    grades: ["7", "", "8", "7", "", "8", "7", "", "8"],
    avg: "7.4",
  },
  {
    name: "Физическая культура",
    grades: ["10", "10", "", "10", "", "", "10", "", ""],
    avg: "10",
    alert: 5,
  },
] as const;

export default function LandingJournalPreview({ animate }: { animate?: boolean }) {
  return (
    <div className={`landing-device-wrap ${animate ? "landing-device-visible" : ""}`}>
      <PhoneFrame label="" variant="journal">
        <div className="flex h-full flex-col bg-[#f3f4f6]">
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-3.5 py-3">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-bold text-gray-900">Какой-то студент</div>
              <div className="text-[12px] text-gray-500">Т-XXX</div>
            </div>
            <span className="shrink-0 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-600">
              Выйти
            </span>
          </div>

          <div className="flex-1 overflow-hidden p-2.5">
            <div className="h-full overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm">
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full min-w-[480px] border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b border-gray-300 bg-gray-50">
                      <th className="sticky left-0 z-20 min-w-[104px] border-r border-gray-300 bg-gray-50 px-2.5 py-2 text-left text-[11px] font-semibold text-gray-800">
                        Предмет
                      </th>
                      {MONTHS.map((m) => (
                        <th
                          key={m.label}
                          colSpan={m.span}
                          className="border-r border-gray-300 px-1 py-2 text-center text-[10px] font-semibold text-gray-600"
                        >
                          {m.label}
                        </th>
                      ))}
                      <th className="sticky right-0 z-20 min-w-[44px] border-l-2 border-gray-400 bg-gray-50 px-1 py-2 text-center text-[11px] font-semibold text-gray-800">
                        Ср.зн
                      </th>
                    </tr>
                    <tr className="border-b border-gray-300 bg-gray-50/90">
                      <td className="sticky left-0 z-20 border-r border-gray-300 bg-gray-50/90" />
                      {DATES.map((d) => (
                        <td
                          key={d}
                          className="w-[30px] min-w-[30px] border-r border-gray-200 px-0 py-1 text-center text-[10px] font-medium text-gray-500"
                        >
                          {d}
                        </td>
                      ))}
                      <td className="sticky right-0 z-20 border-l-2 border-gray-400 bg-gray-50/90" />
                    </tr>
                  </thead>
                  <tbody>
                    {SUBJECTS.map((subject, rowIdx) => {
                      const isActive = "active" in subject && subject.active;
                      const rowBg = isActive ? "#dbeafe" : "#fefce8";
                      const stickyBg = isActive ? "#dbeafe" : "#ffffff";

                      return (
                        <tr
                          key={subject.name}
                          className="landing-journal-row border-b border-gray-300"
                          style={{ animationDelay: `${300 + rowIdx * 80}ms` }}
                        >
                          <td
                            className="sticky left-0 z-10 border-r border-gray-300 px-2.5 py-2 text-[11px] font-semibold"
                            style={{
                              backgroundColor: stickyBg,
                              color: isActive ? "#1d4ed8" : "#111827",
                            }}
                          >
                            {subject.name}
                          </td>
                          {subject.grades.map((g, i) => (
                            <td
                              key={`${subject.name}-${i}`}
                              className="h-[30px] w-[30px] min-w-[30px] border-r border-gray-200 text-center align-middle text-[11px] font-medium"
                              style={{
                                backgroundColor: rowBg,
                                color:
                                  "alert" in subject && subject.alert === i ? "#dc2626" : "#111827",
                                fontWeight:
                                  "alert" in subject && subject.alert === i ? 700 : 500,
                              }}
                            >
                              {g}
                            </td>
                          ))}
                          <td
                            className="sticky right-0 z-10 border-l-2 border-gray-400 px-1 py-2 text-center text-[12px] font-bold text-blue-700"
                            style={{ backgroundColor: isActive ? "#bfdbfe" : "#fefce8" }}
                          >
                            {subject.avg}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-400 bg-gray-50">
                      <td className="sticky left-0 z-10 border-r border-gray-300 bg-gray-50 p-0" style={{ minWidth: 120 }} />
                      {DATES.map((d) => (
                        <td key={`f-${d}`} className="border-r border-gray-200 bg-gray-50" />
                      ))}
                      <td className="sticky right-0 z-10 border-l-2 border-gray-400 bg-gray-50 px-1 py-2 text-center text-[12px] font-bold text-blue-600">
                        8.7
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="mt-2.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-600">
              <span className="font-semibold text-gray-800">Пояснение:</span> контрольная работа
            </div>
          </div>

          <div className="flex border-t border-gray-200 bg-white px-1 py-2">
            {[
              { label: "Настройки", active: false },
              { label: "Расписание", active: false },
              { label: "Журнал", active: true },
            ].map((tab) => (
              <div
                key={tab.label}
                className={`flex flex-1 flex-col items-center gap-0.5 py-1 text-[10px] font-semibold ${
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
