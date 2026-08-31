import { beforeEach, describe, expect, it, vi } from 'vitest';

const asyncStorage = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({ default: asyncStorage }));

import { loadOfflineAccessSnapshot, OFFLINE_ACCESS_MAX_AGE_MS, saveOfflineAccessSnapshot, type OfflineAccessSnapshot } from '../src/features/auth/offlineAccess';

const now = Date.parse('2026-08-30T12:00:00.000Z');
const snapshot: OfflineAccessSnapshot = {
  userId: 'user-1',
  verifiedAt: new Date(now).toISOString(),
  membership: {
    membershipId: 'membership-1', companyId: 'company-1', companyName: 'Diaguissa',
    storeId: 'store-1', storeName: 'Sonfonia', role: 'company_admin', roleName: 'Administrateur',
    permissions: [], subscriptionStatus: 'active', countryCode: 'GN', countryName: 'Guinée',
    defaultCurrencyCode: 'GNF', secondaryCurrencyCode: null, currencyLockedAt: null,
  },
  businesses: [],
  stores: [{ storeId: 'store-1', storeName: 'Sonfonia', address: null }],
};

describe('accès hors ligne vérifié', () => {
  beforeEach(() => {
    asyncStorage.getItem.mockReset();
    asyncStorage.setItem.mockReset();
    asyncStorage.removeItem.mockReset();
    asyncStorage.removeItem.mockResolvedValue(undefined);
  });

  it('restaure le dernier contexte du même utilisateur pendant 24 heures', async () => {
    asyncStorage.getItem.mockResolvedValue(JSON.stringify(snapshot));
    await expect(loadOfflineAccessSnapshot('user-1', now + 60_000)).resolves.toEqual(snapshot);
  });

  it('refuse un contexte expiré', async () => {
    asyncStorage.getItem.mockResolvedValue(JSON.stringify(snapshot));
    await expect(loadOfflineAccessSnapshot('user-1', now + OFFLINE_ACCESS_MAX_AGE_MS + 1)).resolves.toBeNull();
    expect(asyncStorage.removeItem).toHaveBeenCalledOnce();
  });

  it('refuse le contexte d’un autre utilisateur', async () => {
    asyncStorage.getItem.mockResolvedValue(JSON.stringify(snapshot));
    await expect(loadOfflineAccessSnapshot('user-2', now)).resolves.toBeNull();
  });

  it('enregistre la date de vérification sans la prolonger', async () => {
    await saveOfflineAccessSnapshot(snapshot);
    expect(asyncStorage.setItem).toHaveBeenCalledWith(
      'stockmaster:verified-access:v1:user-1',
      JSON.stringify(snapshot),
    );
  });
});
