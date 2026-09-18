"use client";

import AppProfilePanel from "@/app/components/app/AppProfilePanel";
import type { AppTheme } from "@/lib/client/appTheme";

type Props = {
  theme: AppTheme;
  onRequireAuth?: () => void;
  onLogout?: () => void;
};

/** Сеансы, 2FA, выход, удаление аккаунта. */
export default function ProfileSecurityPanel({ theme, onRequireAuth, onLogout }: Props) {
  return (
    <AppProfilePanel
      theme={theme}
      onRequireAuth={onRequireAuth}
      onLogout={onLogout}
      mode="security"
      embedded
    />
  );
}
