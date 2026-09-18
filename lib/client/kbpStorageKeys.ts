/**
 * Ключи хранилища для данных kbp.by / MiniKBP.
 * Старые ключи ej_* читаются один раз как fallback при миграции.
 */
import { storageGet, storageSet } from "@/lib/client/storage";

export const KBP_LOGIN_DATA_KEY = "kbp_login_data_v1";
export const KBP_GROUP_ID_KEY = "kbp_group_id_v1";
export const KBP_GROUPS_CACHE_KEY = "cached_kbp_groups_v1";

const LEGACY_LOGIN = "ej_login_data";
const LEGACY_GROUP = "ej_group_id";
const LEGACY_GROUPS = "cached_ej_groups";

/** Читает новый ключ; если пусто — legacy, и мигрирует в новый. */
export async function getMigratedStorage(
  newKey: string,
  legacyKey: string
): Promise<string | null> {
  const current = await storageGet(newKey);
  if (current) return current;
  const legacy = await storageGet(legacyKey);
  if (legacy) {
    await storageSet(newKey, legacy);
    return legacy;
  }
  return null;
}

export async function getKbpLoginData(): Promise<string | null> {
  return getMigratedStorage(KBP_LOGIN_DATA_KEY, LEGACY_LOGIN);
}

export async function getKbpGroupId(): Promise<string | null> {
  return getMigratedStorage(KBP_GROUP_ID_KEY, LEGACY_GROUP);
}

export async function getKbpGroupsCache(): Promise<string | null> {
  return getMigratedStorage(KBP_GROUPS_CACHE_KEY, LEGACY_GROUPS);
}

export async function setKbpLoginData(value: string): Promise<void> {
  await storageSet(KBP_LOGIN_DATA_KEY, value);
}

export async function setKbpGroupId(value: string): Promise<void> {
  await storageSet(KBP_GROUP_ID_KEY, value);
}
