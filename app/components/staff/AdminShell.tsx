"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { clearStaffSession, type StaffSession } from "@/lib/client/miniKbpServer";
import { fetchProfile } from "@/lib/client/userProfile";
import { getLkAppUrl, getLkLoginUrl } from "@/lib/client/lkAppUrl";
import { staffNavHref, staffPathMatches } from "@/lib/client/hostRouting";
import { AdminNavIcon } from "./adminIcons";

const ADMIN_NAV = [
  { href: "/staff/dashboard", label: "Аналитика", icon: "dashboard" as const },
  { href: "/staff/groups", label: "Группы", icon: "groups" as const },
  { href: "/staff/students", label: "Студенты", icon: "students" as const },
  { href: "/staff/teachers", label: "Преподаватели", icon: "teachers" as const },
  { href: "/staff/invite-codes", label: "Коды входа", icon: "codes" as const },
  { href: "/staff/replacements", label: "Замены", icon: "journal" as const },
  { href: "/staff/curators", label: "Кураторы", icon: "curators" as const },
  { href: "/staff/subjects", label: "Предметы", icon: "subjects" as const },
  { href: "/staff/enrollments", label: "Зачисления", icon: "enrollments" as const },
  { href: "/staff/assignments", label: "Назначения", icon: "assignments" as const },
  { href: "/staff/backups", label: "Бэкапы", icon: "journal" as const },
  { href: "/staff/app-accounts", label: "Аккаунты", icon: "accounts" as const },
  { href: "/staff/settings", label: "Настройки", icon: "settings" as const },
] as const;

type AdminShellProps = {
  session: StaffSession;
  children: React.ReactNode;
};

export default function AdminShell({ session, children }: AdminShellProps) {
  const pathname = usePathname();
  const [avatarUrl, setAvatarUrl] = useState("");

  const displayName = session.fullName || session.username || "Администратор";

  useEffect(() => {
    void fetchProfile().then((r) => {
      if (r.ok && r.data.avatar_url?.trim()) setAvatarUrl(r.data.avatar_url.trim());
    });
  }, []);

  const handleLogout = async () => {
    await clearStaffSession();
    window.location.replace(getLkLoginUrl());
  };

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <aside className="hidden h-screen w-[240px] shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white md:flex">
        <div className="flex shrink-0 items-center gap-3 border-b border-gray-100 px-5 py-4">
          <Image src="/minikbp.svg" alt="" width={36} height={36} className="h-9 w-9 shrink-0 object-contain" unoptimized />
          <div>
            <p className="text-sm font-semibold text-gray-900">Мини КБиП</p>
            <p className="text-[11px] text-gray-500">Панель</p>
          </div>
        </div>

        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-3">
          {ADMIN_NAV.map((item) => {
            const href = staffNavHref(item.href, pathname);
            const active = staffPathMatches(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <AdminNavIcon name={item.icon} active={active} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-gray-100 p-3">
          <div className="mb-2 flex items-center gap-3 px-2 py-1">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
            ) : (
              <Image src="/minikbp.svg" alt="" width={32} height={32} className="h-8 w-8 shrink-0 object-contain" unoptimized />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">{displayName}</p>
              <p className="text-[11px] text-gray-500">Администратор</p>
            </div>
          </div>
          <Link
            href={getLkAppUrl("/app?page=timetable")}
            className="mb-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <AdminNavIcon name="external" active={false} />
            Личный кабинет
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50"
          >
            <AdminNavIcon name="logout" active={false} />
            Выйти
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-gray-200 bg-white md:hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <Image src="/minikbp.svg" alt="" width={28} height={28} className="h-7 w-7 object-contain" unoptimized />
            <div>
              <p className="text-sm font-semibold text-gray-900">Мини КБиП</p>
              <p className="text-[11px] text-gray-500">Панель</p>
            </div>
          </div>
          <div className="flex gap-1 overflow-x-auto px-2 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {ADMIN_NAV.map((item) => {
              const href = staffNavHref(item.href, pathname);
              const active = staffPathMatches(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={href}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${
                    active ? "bg-gray-100 text-gray-900" : "text-gray-600"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto bg-white p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

export function AdminPageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function AdminCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`overflow-hidden rounded-lg border border-gray-200 bg-white ${className}`}>{children}</div>;
}

export function AdminTableWrap({
  children,
  testId,
}: {
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="mobile-scroll-x overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm" data-testid={testId}>
        {children}
      </table>
    </div>
  );
}

export const adminInput =
  "w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-gray-400";

export const adminBtnPrimary =
  "inline-flex items-center justify-center rounded border border-gray-800 bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50";

export const adminBtnOutline =
  "inline-flex items-center justify-center rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50";

export const adminBtnDanger =
  "inline-flex items-center justify-center rounded border border-red-300 bg-white px-3 py-1.5 text-sm text-red-600 hover:bg-red-50";

export function AdminAlert({ error, success }: { error?: string; success?: string }) {
  if (error) return <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  if (success) return <p className="mb-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{success}</p>;
  return null;
}
