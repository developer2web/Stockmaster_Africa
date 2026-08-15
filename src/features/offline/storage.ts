import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'stockmaster:offline-cache:v1:';

export async function readOfflineCache<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${key}`);
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as { value: T }).value;
  } catch {
    await AsyncStorage.removeItem(`${CACHE_PREFIX}${key}`);
    return null;
  }
}

export async function writeOfflineCache<T>(key: string, value: T) {
  await AsyncStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify({ value, savedAt: new Date().toISOString() }));
}

export async function withOfflineCache<T>(key: string, load: () => Promise<T>): Promise<T> {
  try {
    const value = await load();
    await writeOfflineCache(key, value);
    return value;
  } catch (error) {
    const cached = await readOfflineCache<T>(key);
    if (cached !== null) return cached;
    throw error;
  }
}
