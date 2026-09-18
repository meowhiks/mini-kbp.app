"use client";

import AdminShell from "@/app/components/staff/AdminShell";
import StaffShell from "@/app/components/staff/StaffShell";
import { useStaffSession } from "@/app/components/staff/useStaffSession";

export default function StaffPanelLayout({ children }: { children: React.ReactNode }) {
  const { session, loading } = useStaffSession(true);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-sm text-gray-500">
        Загрузка…
      </div>
    );
  }

  if (session.role === "admin") {
    return <AdminShell session={session}>{children}</AdminShell>;
  }

  return <StaffShell session={session}>{children}</StaffShell>;
}
