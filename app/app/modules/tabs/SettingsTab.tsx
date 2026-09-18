"use client";

import SettingsView, { type SettingsViewProps } from "../SettingsView";
import { themePageBg } from "@/lib/client/appTheme";

export type { SettingsViewProps };

export default function SettingsTab(props: SettingsViewProps) {
  return (
    <div
      className={`h-full overflow-x-hidden overflow-y-auto overscroll-x-none app-scroll ${themePageBg(props.theme)}`}
      style={{ touchAction: "pan-y" }}
    >
      <SettingsView {...props} />
    </div>
  );
}
