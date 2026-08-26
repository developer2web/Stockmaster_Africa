import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'stockmaster:offline-cache:v1:';

export async function readOfflineCache<T>(key: string, isValid?: (value: unknown) => value is T): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const value = (JSON.parse(raw) as { value?: unknown }).value;
    if (isValid && !isValid(value)) {
      await AsyncStorage.removeItem(`${CACHE_PREFIX}${key}`).catch(() => undefined);
      return null;
    }
    return value as T;
  } catch {
    await AsyncStorage.removeItem(`${CACHE_PREFIX}${key}`).catch(() => undefined);
    return null;
  }
}

export async function writeOfflineCache<T>(key: string, value: T) {
  await AsyncStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify({ value, savedAt: new Date().toISOString() }));
}

export async function withOfflineCache<T>(key: string, load: () => Promise<T>, isValid?: (value: unknown) => value is T): Promise<T> {
  try {
    const value = await load();
    // Une panne du stockage local ne doit jamais transformer une requête réseau
    // réussie en erreur visible pour l'utilisateur.
    await writeOfflineCache(key, value).catch(() => undefined);
    return value;
  } catch (error) {
    const cached = await readOfflineCache<T>(key, isValid);
    if (cached !== null) return cached;
    throw error;
  }
}
