"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminAlert,
  AdminCard,
  AdminPageHeader,
  AdminTableWrap,
  adminBtnOutline,
  adminInput,
} from "@/app/components/staff/AdminShell";
import { AdminTablePager } from "@/app/components/staff/AdminTableTools";
import { useStaffSession } from "@/app/components/staff/useStaffSession";
import {
  fetchAdminAnalytics,
  type AdminAnalyticsData,
  type StaffSession,
} from "@/lib/client/miniKbpServer";
import { useAdminTable } from "@/lib/client/adminTable";

type PeriodKey = "today" | "week" | "month" | "2months" | "custom";

function Delta({ value }: { value: number | null | undefined }) {
  if (value == null) return null;
  const sign = value > 0 ? "+" : "";
  const tone = value > 0 ? "text-emerald-600" : value < 0 ? "text-red-600" : "text-gray-500";
  return <span className={`text-xs ${tone}`}>{sign}{value}% к пред. периоду</span>;
}

function MetricCard({
  label,
  value,
  delta,
  sub,
  icon,
}: {
  label: string;
  value: string | number;
  delta?: number | null;
  sub?: string;
  icon?: React.ReactNode;
}) {
  return (
    <AdminCard className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{value}</p>
          {sub ? <p className="mt-0.5 text-xs text-gray-400">{sub}</p> : null}
          {delta != null ? (
            <div className="mt-1">
              <Delta value={delta} />
            </div>
          ) : null}
        </div>
        {icon ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
            {icon}
          </div>
        ) : null}
      </div>
    </AdminCard>
  );
}

function LineChart({ series }: { series: { label: string; count: number }[] }) {
  if (!series.length) return <p className="text-sm text-gray-400">Нет данных</p>;
  const w = 320;
  const h = 120;
  const pad = 4;
  const max = Math.max(1, ...series.map((s) => s.count));
  const points = series
    .map((s, i) => {
      const x = pad + (series.length === 1 ? 0 : (i / (series.length - 1)) * (w - pad * 2));
      const y = h - pad - (s.count / max) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-36 w-full" preserveAspectRatio="none" aria-hidden>
        <polyline fill="none" stroke="#374151" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={points} />
      </svg>
      <div className="mt-1 flex justify-between gap-1 text-[10px] text-gray-400">
        {series.map((s) => (
          <span key={s.label} className="truncate" title={`${s.label}: ${s.count}`}>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function BarChart({ series, valueKey }: { series: { label: string; count: number }[]; valueKey?: "count" }) {
  void valueKey;
  const max = Math.max(1, ...series.map((s) => s.count));
  if (!series.length) return <p className="text-sm text-gray-400">Нет данных</p>;
  return (
    <div className="flex h-36 items-end gap-1 border-b border-gray-100 pb-1">
      {series.map((s) => (
        <div key={s.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div
            className="w-full max-w-[28px] rounded-t bg-gray-800"
            style={{ height: `${Math.max(4, (s.count / max) * 100)}%` }}
            title={`${s.label}: ${s.count}`}
          />
          <span className="truncate text-[10px] text-gray-400">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function StaffAnalyticsPage() {
  const { session, loading: authLoading } = useStaffSession(true, true);
  const [data, setData] = useState<AdminAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [period, setPeriod] = useState<PeriodKey>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [groupSearch, setGroupSearch] = useState("");
  const [sortCol, setSortCol] = useState<"name" | "student_count" | "grades_count" | "average">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const load = useCallback(
    async (s: StaffSession) => {
      setLoading(true);
      setLoadError("");
      const r = await fetchAdminAnalytics(s, {
        period,
        from: period === "custom" ? customFrom : undefined,
        to: period === "custom" ? customTo : undefined,
        group_id: selectedGroupId ?? undefined,
      });
      if (r.ok) setData(r.data);
      else setLoadError(r.detail || "Не удалось загрузить аналитику");
      setLoading(false);
    },
    [period, customFrom, customTo, selectedGroupId]
  );

  useEffect(() => {
    if (session?.role !== "admin") return;
    void load(session);
  }, [session, load]);

  const sortedGroups = useMemo(() => {
    if (!data) return [];
    let list = data.groups;
    const q = groupSearch.trim().toLowerCase();
    if (q) list = list.filter((g) => g.name.toLowerCase().includes(q));
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "ru") * dir;
    });
  }, [data, groupSearch, sortCol, sortDir]);

  const {
    paged: groupsPaged,
    page: groupsPage,
    setPage: setGroupsPage,
    pageCount: groupsPageCount,
    total: groupsTotal,
  } = useAdminTable(sortedGroups, { pageSize: 15 });

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortCol(col);
      setSortDir(col === "name" ? "asc" : "desc");
    }
  };

  if (authLoading || !session) {
    return <div className="text-sm text-gray-500">Загрузка…</div>;
  }

  return (
    <div data-testid="admin-analytics-page">
      <AdminPageHeader title="Аналитика" />

      <AdminAlert error={loadError} />

      <AdminCard className="mb-4 p-3">
        <div className="flex flex-wrap items-end gap-2">
          {(
            [
              ["today", "Сегодня"],
              ["week", "Неделя"],
              ["month", "Месяц"],
              ["2months", "2 месяца"],
              ["custom", "Период"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={period === key ? "rounded border border-gray-800 bg-gray-900 px-3 py-1.5 text-sm text-white" : adminBtnOutline}
              onClick={() => setPeriod(key)}
            >
              {label}
            </button>
          ))}
          {period === "custom" ? (
            <>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className={adminInput} />
              <span className="text-gray-400">—</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className={adminInput} />
              <button type="button" className={adminBtnOutline} onClick={() => void load(session)}>
                Применить
              </button>
            </>
          ) : null}
        </div>
      </AdminCard>

      {loading || !data ? (
        <div className="text-sm text-gray-500">Загрузка данных…</div>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="admin-analytics-metrics">
            <MetricCard
              label="Пользователи"
              value={data.users.total}
              sub={`студ. ${data.users.students} · учит. ${data.users.teachers}`}
              icon={
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
            />
            <MetricCard
              label="Регистрации"
              value={data.users.registrations_week}
              sub={`сегодня ${data.users.registrations_today} · месяц ${data.users.registrations_month}`}
              icon={
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              }
            />
            <MetricCard
              label="Группы"
              value={data.groups_count}
              icon={
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              }
            />
            <MetricCard
              label="Активные"
              value={data.users.active_week}
              sub={`сегодня ${data.users.active_today}`}
              icon={
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              }
            />
          </div>

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <AdminCard className="p-4">
              <h2 className="mb-3 text-sm font-semibold text-gray-900">Оценки за период</h2>
              <div className="mb-3 flex gap-6 text-sm">
                <span>
                  Выставлено: <strong>{data.grades.count}</strong>
                  <Delta value={data.grades.count_delta_pct} />
                </span>
                <span>
                  Средний: <strong>{data.grades.average ?? "—"}</strong>
                  <Delta value={data.grades.average_delta_pct} />
                </span>
              </div>
              <LineChart series={data.grades.series} />
            </AdminCard>
            <AdminCard className="p-4">
              <h2 className="mb-3 text-sm font-semibold text-gray-900">Регистрации</h2>
              <BarChart series={data.registrations_series} />
            </AdminCard>
          </div>

          <AdminCard className="mb-4 p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Сегодня</h2>
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Оценок сегодня" value={data.today.grades_count} />
              <MetricCard label="Входов сегодня" value={data.today.logins_count} />
              <MetricCard
                label="Топ группа"
                value={data.today.top_groups[0]?.name ?? "—"}
                sub={data.today.top_groups[0] ? `${data.today.top_groups[0].grades_count} оценок` : undefined}
              />
              <MetricCard
                label="Топ учитель"
                value={data.today.top_teachers[0]?.name ?? "—"}
                sub={data.today.top_teachers[0] ? `${data.today.top_teachers[0].grades_count} оценок` : undefined}
              />
            </div>
            <p className="mb-2 text-xs font-medium text-gray-500">Последние оценки</p>
            <div className="max-h-48 overflow-y-auto text-sm">
              {data.today.recent_grades.length === 0 ? (
                <p className="text-gray-400">Пока пусто</p>
              ) : (
                <ul className="space-y-1">
                  {data.today.recent_grades.map((e, i) => (
                    <li key={i} className="text-gray-700">
                      <span className="text-gray-400">{new Date(e.at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>
                      {" · "}
                      {e.teacher} → {e.student}: <strong>{e.value || "—"}</strong> ({e.subject}, {e.group})
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </AdminCard>

          <AdminCard className="mb-4 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-gray-900">Группы</h2>
              <input
                type="search"
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                placeholder="Поиск группы…"
                className={`${adminInput} max-w-xs`}
              />
            </div>
            <AdminTableWrap>
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                  <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("name")}>
                    Группа
                  </th>
                  <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("student_count")}>
                    Студентов
                  </th>
                  <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("grades_count")}>
                    Оценок
                  </th>
                  <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("average")}>
                    Средний
                  </th>
                  <th className="px-3 py-2">Учителя</th>
                </tr>
              </thead>
              <tbody>
                {groupsTotal === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-400">
                      Группы не найдены
                    </td>
                  </tr>
                ) : (
                  groupsPaged.map((g) => (
                  <tr
                    key={g.id}
                    className={`cursor-pointer border-b border-gray-100 hover:bg-gray-50 ${selectedGroupId === g.id ? "bg-gray-50" : ""}`}
                    onClick={() => setSelectedGroupId(g.id === selectedGroupId ? null : g.id)}
                  >
                    <td className="px-3 py-2 font-medium">{g.name}</td>
                    <td className="px-3 py-2">{g.student_count}</td>
                    <td className="px-3 py-2">{g.grades_count}</td>
                    <td className="px-3 py-2">{g.average ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{g.teachers.join(", ") || "—"}</td>
                  </tr>
                  ))
                )}
              </tbody>
            </AdminTableWrap>
            <AdminTablePager
              page={groupsPage}
              pageCount={groupsPageCount}
              total={groupsTotal}
              pageSize={15}
              onPageChange={setGroupsPage}
            />
          </AdminCard>

          {data.group_detail ? (
            <AdminCard className="p-4">
              <h2 className="mb-3 text-sm font-semibold text-gray-900">Группа: {data.group_detail.name}</h2>
              <div className="mb-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs text-gray-500">Динамика оценок</p>
                  <LineChart series={data.group_detail.grades_series} />
                </div>
                <div>
                  <p className="mb-2 text-xs text-gray-500">По предметам</p>
                  <ul className="space-y-1 text-sm">
                    {data.group_detail.subjects.map((s) => (
                      <li key={s.name}>
                        {s.name}: {s.average ?? "—"} ({s.grades_count})
                      </li>
                    ))}
                  </ul>
                  <p className="mb-2 mt-3 text-xs text-gray-500">Активность учителей</p>
                  <ul className="space-y-1 text-sm">
                    {data.group_detail.teachers_activity.map((t) => (
                      <li key={t.name}>
                        {t.name}: {t.grades_count}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </AdminCard>
          ) : null}
        </>
      )}
    </div>
  );
}
