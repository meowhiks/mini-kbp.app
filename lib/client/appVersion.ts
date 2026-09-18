/** Отображаемая версия клиента (синхронизируй с Android versionName при релизе). */
export const APP_VERSION = "0.3.22";
export const APP_VERSION_STAGE = "Release";

export function formatAppVersionLabel(): string {
  return `${APP_VERSION} ${APP_VERSION_STAGE}`;
}
