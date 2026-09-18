"use client";

import AppProfilePanel from "@/app/components/app/AppProfilePanel";
import { themePageBg, type AppTheme } from "@/lib/client/appTheme";

export type ProfileTabProps = {
  theme: AppTheme;
  onRequireAuth: () => void;
  onLogout: () => void;
  onBack?: () => void;
};

export default function ProfileTab({
  theme,
  onRequireAuth,
  onLogout,
  onBack,
}: ProfileTabProps) {
  return (
    <div className={`h-full overflow-y-auto app-scroll ${themePageBg(theme)}`}>
      <AppProfilePanel
        theme={theme}
        onRequireAuth={onRequireAuth}
        onLogout={onLogout}
        onBack={onBack}
      />
    </div>
  );
}
