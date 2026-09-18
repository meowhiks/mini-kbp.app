import { storageGetObject, storageSetObject } from "@/lib/client/storage";

export const OFFLINE_CACHE_KEYS = {
  USER_PROFILE: "cached_user_profile_v1",
  APP_SESSIONS: "cached_app_sessions_v1",
  STAFF_JOURNAL_ACCESS: "cached_staff_journal_access_v1",
  STAFF_BUNDLES: "cached_staff_bundles_v1",
} as const;

type CacheEnvelope<T> = { data: T; savedAt: number };

export async function readOfflineCache<T>(key: string): Promise<T | null> {
  const envelope = await storageGetObject<CacheEnvelope<T>>(key);
  return envelope?.data ?? null;
}

export async function writeOfflineCache<T>(key: string, data: T): Promise<void> {
  await storageSetObject<CacheEnvelope<T>>(key, { data, savedAt: Date.now() });
}

export async function readOfflineCacheEnvelope<T>(key: string): Promise<CacheEnvelope<T> | null> {
  return storageGetObject<CacheEnvelope<T>>(key);
}
