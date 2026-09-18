"use client";

import AppProfilePanel from "@/app/components/app/AppProfilePanel";
import type { AppTheme } from "@/lib/client/appTheme";

type Props = {
  theme: AppTheme;
  onRequireAuth?: () => void;
  onLogout?: () => void;
};

/** ФИО, контакты, email, Telegram, аватар. */
export default function ProfileEditPanel({ theme, onRequireAuth, onLogout }: Props) {
  return (
    <AppProfilePanel
      theme={theme}
      onRequireAuth={onRequireAuth}
      onLogout={onLogout}
      mode="edit"
      embedded
    />
  );
}
