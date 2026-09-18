"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clearStaffSession, type StaffSession } from "@/lib/client/miniKbpServer";
import { getLkAppUrl, getLkLoginUrl } from "@/lib/client/lkAppUrl";
import { getServerUrl } from "@/lib/client/serverUrl";
import { staffNavHref, staffPathMatches } from "@/lib/client/hostRouting";

const TEACHER_NAV = [
  { href: "/staff/invite-codes", label: "Коды входа" },
  { href: "/staff/settings", label: "Настройки" },
] as const;

const ADMIN_NAV = [
  { href: "/staff/groups", label: "Группы" },
  { href: "/staff/invite-codes", label: "Коды входа" },
  { href: "/staff/replacements", label: "Замены" },
  { href: "/staff/students", label: "Студенты" },
  { href: "/staff/teachers", label: "Преподаватели" },
  { href: "/staff/curators", label: "Кураторы" },
  { href: "/staff/subjects", label: "Предметы" },
  { href: "/staff/enrollments", label: "Зачисления" },
  { href: "/staff/assignments", label: "Назначения" },
] as const;

type StaffShellProps = {
  session: StaffSession;
  children: React.ReactNode;
};

export default function StaffShell({ session, children }: StaffShellProps) {
  const pathname = usePathname();
  const nav = session.role === "admin" ? ADMIN_NAV : TEACHER_NAV;

  const handleLock = async () => {
    const url = getServerUrl();
    if (!url) return;
    await fetch(`${url.replace(/\/$/, "")}/v0/staff-security/lock/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access}`,
      },
      credentials: "include",
      body: "{}",
    }).catch(() => {});
    window.dispatchEvent(new Event("minikbp-staff-lock"));
  };

  const handleLogout = async () => {
    await clearStaffSession();
    window.location.replace(getLkLoginUrl());
  };

  const displayName =
    session.role === "admin"
      ? `Админ · ${session.username}`
      : session.fullName ?? session.username;

  return (
    <div className="flex min-h-screen bg-[#f7f8fa]">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-gray-200 bg-white md:flex">
        <div className="border-b border-gray-100 px-5 py-5">
          <p className="text-base font-semibold text-gray-900">Мини КБиП</p>
          <p className="mt-0.5 text-xs text-gray-500">Панель персонала</p>
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {nav.map((item) => {
            const href = staffNavHref(item.href, pathname);
            const active = staffPathMatches(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={href}
                className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-[#3390ec]/10 text-[#3390ec]"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-gray-100 p-3">
          <Link
            href={getLkAppUrl("/app?page=timetable")}
            className="mb-2 block rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-800"
          >
            ← Студентам
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-800"
          >
            Выйти
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 md:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">{displayName}</p>
            <p className="text-xs text-gray-400">
              {session.role === "admin" ? "Администратор" : "Преподаватель"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleLock()}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              Заблокировать
            </button>
            <div className="flex items-center gap-2 md:hidden">
              <Link href={getLkAppUrl("/app?page=settings&sc=profile")} className="text-xs text-[#3390ec]">
                Кабинет
              </Link>
              <Link href={getLkAppUrl("/app?page=timetable")} className="text-xs text-gray-500">
                App
              </Link>
              <button type="button" onClick={handleLogout} className="text-xs text-gray-500">
                Выйти
              </button>
            </div>
          </div>
        </header>

        <div className="border-b border-gray-200 bg-white md:hidden">
          <div className="flex gap-1 overflow-x-auto px-2 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {nav.map((item) => {
              const href = staffNavHref(item.href, pathname);
              const active = staffPathMatches(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={href}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${
                    active ? "bg-[#3390ec]/10 text-[#3390ec]" : "text-gray-600"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
