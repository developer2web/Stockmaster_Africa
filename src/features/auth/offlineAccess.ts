import AsyncStorage from '@react-native-async-storage/async-storage';

import type { BusinessAccess, MembershipContext, StoreAccess } from '@/types/database';

const ACCESS_PREFIX = 'stockmaster:verified-access:v1:';
export const OFFLINE_ACCESS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type OfflineAccessSnapshot = {
  userId: string;
  verifiedAt: string;
  membership: MembershipContext;
  businesses: BusinessAccess[];
  stores: StoreAccess[];
};

const keyFor = (userId: string) => `${ACCESS_PREFIX}${userId}`;

function isSnapshot(value: unknown): value is OfflineAccessSnapshot {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<OfflineAccessSnapshot>;
  return typeof row.userId === 'string'
    && typeof row.verifiedAt === 'string'
    && !!row.membership
    && typeof row.membership === 'object'
    && Array.isArray(row.businesses)
    && Array.isArray(row.stores);
}

export async function saveOfflineAccessSnapshot(snapshot: OfflineAccessSnapshot) {
  await AsyncStorage.setItem(keyFor(snapshot.userId), JSON.stringify(snapshot));
}

export async function loadOfflineAccessSnapshot(userId: string, now = Date.now()): Promise<OfflineAccessSnapshot | null> {
  const key = keyFor(userId);
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isSnapshot(parsed) || parsed.userId !== userId) {
      await AsyncStorage.removeItem(key).catch(() => undefined);
      return null;
    }
    const verifiedAt = Date.parse(parsed.verifiedAt);
    if (!Number.isFinite(verifiedAt) || now - verifiedAt > OFFLINE_ACCESS_MAX_AGE_MS || verifiedAt > now + 5 * 60 * 1000) {
      await AsyncStorage.removeItem(key).catch(() => undefined);
      return null;
    }
    if (!parsed.membership.companyId || !parsed.membership.storeId || parsed.membership.role === 'super_admin') {
      await AsyncStorage.removeItem(key).catch(() => undefined);
      return null;
    }
    return parsed;
  } catch {
    await AsyncStorage.removeItem(key).catch(() => undefined);
    return null;
  }
}

export async function clearOfflineAccessSnapshot(userId: string) {
  await AsyncStorage.removeItem(keyFor(userId));
}
