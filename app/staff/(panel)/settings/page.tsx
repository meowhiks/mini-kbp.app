"use client";

import {
  AdminPageHeader,
} from "@/app/components/staff/AdminShell";
import StaffSecuritySettingsCard from "@/app/components/staff/StaffSecuritySettingsCard";
import { useStaffSession } from "@/app/components/staff/useStaffSession";

export default function StaffSettingsPage() {
  const { session, loading } = useStaffSession(true);

  if (loading || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-gray-500">
        Загрузка…
      </div>
    );
  }

  return (
    <div className="max-w-lg">
      <AdminPageHeader
        title="Настройки"
        subtitle="Блокировка сеанса на этом устройстве"
      />
      <StaffSecuritySettingsCard />
    </div>
  );
}
