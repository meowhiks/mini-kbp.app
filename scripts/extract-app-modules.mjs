import fs from "fs";

const appShellPath = new URL("../app/app/modules/AppShell.tsx", import.meta.url);
const lines = fs.readFileSync(appShellPath, "utf8").split(/\r?\n/);

const studentHeader = `"use client";

import { useState } from "react";
import { themeIsDark, type AppTheme } from "@/lib/client/appTheme";
import JournalGrid from "@/app/components/journal/JournalGrid";
import {
  JOURNAL_SCALE_DEFAULT,
  clampJournalScalePercent,
  scaleJournalPx,
  findTodayIndexStudent,
  STUDENT_MARK_CELL_DENSE_H,
  STUDENT_MARK_CELL_DENSE_W,
  STUDENT_MARK_CELL_H,
  STUDENT_MARK_CELL_W,
  STUDENT_SUBJECT_COL_PX,
  STUDENT_SUBJECT_GAP_PX,
} from "@/lib/client/journalGridData";
import {
  calcSubjectAverageFromMarks,
  formatComputedAverage,
} from "@/lib/client/journalAverage";

export type JournalEntry = {
  id: string;
  surname: string;
  groupId: string;
  groupName: string;
  data: any;
  latenessData?: any | null;
  savedAt?: number;
  offline?: boolean;
};

`;

let studentBody = lines.slice(1340, 1789).join("\n");
studentBody = studentBody.replace(/^function JournalEntryCard/, "export function JournalEntryCard");
studentBody = studentBody.replace(/^function JournalView/, "export function JournalView");
studentBody = studentBody.replace(/^function LatenessView/, "export function LatenessView");

const studentOut = new URL("../app/app/modules/studentJournal.tsx", import.meta.url);
fs.writeFileSync(studentOut, studentHeader + studentBody);

const settingsHeader = `"use client";

import { themeIsDark, type AppTheme } from "@/lib/client/appTheme";
import {
  JOURNAL_SCALE_DEFAULT,
  JOURNAL_SCALE_MAX,
  JOURNAL_SCALE_MIN,
  clampJournalScalePercent,
} from "@/lib/client/journalGridData";

export type SettingsViewProps = {
  theme: AppTheme;
  webMode?: boolean;
  onThemeChange: (t: AppTheme) => void;
  notificationsEnabled: boolean;
  onNotificationsEnabledChange: (v: boolean) => void;
  notifyJournal: boolean;
  onNotifyJournalChange: (v: boolean) => void;
  notifyTimetable: boolean;
  onNotifyTimetableChange: (v: boolean) => void;
  pushBackendUrl: string;
  onPushBackendUrlChange: (v: string) => void;
  countdownToLesson: boolean;
  onCountdownToLessonChange: (v: boolean) => void;
  showReplacementsByDefault: boolean;
  onShowReplacementsByDefaultChange: (v: boolean) => void;
  timetableDensity: "normal" | "compact" | "small";
  onTimetableDensityChange: (v: "normal" | "compact" | "small") => void;
  journalShowAverage: boolean;
  onJournalShowAverageChange: (v: boolean) => void;
  journalDenseCells: boolean;
  onJournalDenseCellsChange: (v: boolean) => void;
  journalScalePercent: number;
  onJournalScalePercentChange: (v: number) => void;
  journalColumnsCustom: boolean;
  onResetJournalColumns: () => void;
  journalShowHundredths: boolean;
  onJournalShowHundredthsChange: (v: boolean) => void;
  journalShowTotal: boolean;
  onJournalShowTotalChange: (v: boolean) => void;
  timetableHideTeacherRoom: boolean;
  onTimetableHideTeacherRoomChange: (v: boolean) => void;
  timetableHidePairNumbers: boolean;
  onTimetableHidePairNumbersChange: (v: boolean) => void;
  timetableDayStrip: boolean;
  onTimetableDayStripChange: (v: boolean) => void;
  onClearAppData: (opts: {
    clearCache: boolean;
    clearLoginHistory: boolean;
    clearTimetables: boolean;
  }) => void;
};

`;

let settingsBody = lines.slice(1790, 2310).join("\n");
settingsBody = settingsBody.replace(
  /^\/\* SettingsView[\s\S]*?\*\/\nfunction SettingsView\(props: \{[\s\S]*?onClearAppData: \(opts: \{ clearCache: boolean; clearLoginHistory: boolean; clearTimetables: boolean \}\) => void;\n\}\) \{/,
  "export default function SettingsView(props: SettingsViewProps) {"
);

const settingsOut = new URL("../app/app/modules/SettingsView.tsx", import.meta.url);
fs.writeFileSync(settingsOut, settingsHeader + settingsBody);

// Trim AppShell: keep lines 1-1339, close with nothing after MainPage closing brace
const shellLines = lines.slice(0, 1339);
shellLines[176] = "export default function AppShell() {";
fs.writeFileSync(appShellPath, shellLines.join("\n") + "\n");

console.log("Done: studentJournal, SettingsView, trimmed AppShell");
