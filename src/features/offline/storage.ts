import { decryptStoredValue, isEncryptedValue, writeEncryptedStorage } from '@/services/storage/encryptedStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { canUseOfflineFallback } from '@/utils/errors';

const CACHE_PREFIX = 'stockmaster:offline-cache:v1:';
export const OFFLINE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export async function readOfflineCache<T>(key: string, isValid?: (value: unknown) => value is T, now = Date.now()): Promise<T | null> {
  try {
    const storageKey = `${CACHE_PREFIX}${key}`;
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(await decryptStoredValue(storageKey, raw)) as { value?: unknown; savedAt?: string };
    const savedAt = typeof parsed.savedAt === 'string' ? Date.parse(parsed.savedAt) : Number.NaN;
    if (!Number.isFinite(savedAt) || now - savedAt > OFFLINE_CACHE_MAX_AGE_MS || savedAt > now + 5 * 60 * 1000) {
      await AsyncStorage.removeItem(storageKey).catch(() => undefined);
      return null;
    }
    const value = parsed.value;
    if (isValid && !isValid(value)) {
      await AsyncStorage.removeItem(`${CACHE_PREFIX}${key}`).catch(() => undefined);
      return null;
    }
    if (!isEncryptedValue(raw)) await writeEncryptedStorage(storageKey, JSON.stringify(parsed));
    return value as T;
  } catch {
    await AsyncStorage.removeItem(`${CACHE_PREFIX}${key}`).catch(() => undefined);
    return null;
  }
}

export async function clearOfflineCaches() {
  const keys = await AsyncStorage.getAllKeys();
  const cacheKeys = keys.filter((key) => key.startsWith(CACHE_PREFIX));
  if (cacheKeys.length) await AsyncStorage.multiRemove(cacheKeys);
}

export async function writeOfflineCache<T>(key: string, value: T) {
  await writeEncryptedStorage(`${CACHE_PREFIX}${key}`, JSON.stringify({ value, savedAt: new Date().toISOString() }));
}

export async function withOfflineCache<T>(key: string, load: () => Promise<T>, isValid?: (value: unknown) => value is T): Promise<T> {
  try {
    const value = await load();
    // Une panne du stockage local ne doit jamais transformer une requête réseau
    // réussie en erreur visible pour l'utilisateur.
    await writeOfflineCache(key, value).catch(() => undefined);
    return value;
  } catch (error) {
    // Cached pages must not hide revoked access or a missing server migration.
    if (!canUseOfflineFallback(error)) throw error;
    const cached = await readOfflineCache<T>(key, isValid);
    if (cached !== null) return cached;
    throw error;
  }
}
