import { beforeEach, describe, expect, it, vi } from 'vitest';

let storedProfile: string | null = null;
let deviceId = 'device-authorized-123';
const secureStore = vi.hoisted(() => ({
  getItemAsync: vi.fn(async () => storedProfile),
  setItemAsync: vi.fn(async (_key: string, value: string) => { storedProfile = value; }),
  deleteItemAsync: vi.fn(async () => { storedProfile = null; }),
}));
const asyncStorage = vi.hoisted(() => {
  const values = new Map<string,string>();
  return {
    values,
    getItem: vi.fn(async (key:string) => values.get(key) ?? null),
    setItem: vi.fn(async (key:string,value:string) => { values.set(key,value); }),
    removeItem: vi.fn(async (key:string) => { values.delete(key); }),
    getAllKeys: vi.fn(async () => [...values.keys()]),
    multiRemove: vi.fn(async (keys:string[]) => { keys.forEach(key=>values.delete(key)); }),
  };
});
const cryptoMock = vi.hoisted(() => ({
  digestStringAsync: vi.fn(async (_algorithm: string, value: string) => `hash-${value.length}-${value.charCodeAt(value.length - 1)}`),
  randomUUID: vi.fn(() => 'salt-1234'),
  getRandomBytesAsync: vi.fn(async () => new Uint8Array([0, 0, 0, 42])),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-secure-store', () => secureStore);
vi.mock('expo-crypto', () => cryptoMock);
vi.mock('@react-native-async-storage/async-storage',()=>({default:asyncStorage}));
vi.mock('@/features/offline/device', () => ({ getOfflineDeviceId: vi.fn(async () => deviceId) }));

import {
  enableOfflineAccess,
  getOfflineAccessSummary,
  loadOfflineAccessProfile,
  OFFLINE_ACCESS_MAX_AGE_MS,
  OFFLINE_PIN_MAX_ATTEMPTS,
  prepareOfflineAccessId,
  refreshOfflineAccessIfEnabled,
  unlockOfflineAccess,
  validateOfflinePin,
} from '../src/features/auth/offlineAccess';

const membership = {
  membershipId: 'membership-1', companyId: 'company-1', companyName: 'Diaguissa',
  storeId: 'store-1', storeName: 'Sonfonia', role: 'employee' as const, roleName: 'Caissier',
  permissions: ['sales.read', 'sales.write'], subscriptionStatus: 'active' as const,
  countryCode: 'GN', countryName: 'Guinée', defaultCurrencyCode: 'GNF',
  secondaryCurrencyCode: null, currencyLockedAt: null,
};
const input = {
  userId: 'user-1', email: 'employee@example.com', fullName: 'Employé Test', pin: '246802',
  membership,
  businesses: [{
    companyId: 'company-1', companyName: 'Diaguissa', membershipId: 'membership-1',
    role: 'employee' as const, roleName: 'Caissier', subscriptionStatus: 'active' as const,
    countryCode: 'GN', countryName: 'Guinée', defaultCurrencyCode: 'GNF',
    secondaryCurrencyCode: null, currencyLockedAt: null,
  }],
  stores: [{ storeId: 'store-1', storeName: 'Sonfonia', address: null }],
};

describe('accès hors ligne V1 sécurisé', () => {
  beforeEach(() => {
    storedProfile = null;
    asyncStorage.values.clear();
    deviceId = 'device-authorized-123';
    secureStore.getItemAsync.mockClear();
    secureStore.setItemAsync.mockClear();
    secureStore.deleteItemAsync.mockClear();
    cryptoMock.digestStringAsync.mockClear();
  });

  it('accepte tout PIN de six chiffres et refuse les longueurs incorrectes', () => {
    expect(validateOfflinePin('123456')).toBeNull();
    expect(validateOfflinePin('111111')).toBeNull();
    expect(validateOfflinePin('12345')).toBeTruthy();
    expect(validateOfflinePin('246802')).toBeNull();
  });

  it('prépare immédiatement un ID court avant la saisie du PIN', async () => {
    await expect(prepareOfflineAccessId('user-1')).resolves.toMatch(/^SM-\d{5}$/);
  });

  it('active seulement le profil, la boutique et les permissions choisis sans stocker le PIN en clair', async () => {
    const profile = await enableOfflineAccess(input);
    expect(profile.offlineId).toMatch(/^SM-\d{5}$/);
    expect(profile.deviceBindingId).toBe(deviceId);
    expect(profile.membership.permissions).toEqual(['sales.read', 'sales.write']);
    expect(storedProfile).not.toContain(input.pin);
  });

  it('déverrouille le même appareil avec le bon ID et le bon PIN', async () => {
    const profile = await enableOfflineAccess(input);
    const result = await unlockOfflineAccess(profile.offlineId, input.pin);
    expect(result.ok).toBe(true);
  });

  it('verrouille pendant quinze minutes après cinq PIN incorrects', async () => {
    const profile = await enableOfflineAccess(input);
    let result = await unlockOfflineAccess(profile.offlineId, '975310');
    for (let attempt = 1; attempt < OFFLINE_PIN_MAX_ATTEMPTS; attempt += 1) {
      result = await unlockOfflineAccess(profile.offlineId, '975310');
    }
    expect(result).toMatchObject({ ok: false, reason: 'locked' });
    const lockedAgain = await unlockOfflineAccess(profile.offlineId, input.pin);
    expect(lockedAgain).toMatchObject({ ok: false, reason: 'locked' });
  });

  it('refuse le profil après 24 heures sans validation du serveur', async () => {
    const profile = await enableOfflineAccess(input);
    const verifiedAt = Date.parse(profile.lastServerValidationAt);
    const result = await unlockOfflineAccess(profile.offlineId, input.pin, verifiedAt + OFFLINE_ACCESS_MAX_AGE_MS + 1);
    expect(result).toMatchObject({ ok: false, reason: 'expired' });
  });

  it('refuse un profil copié sur un autre appareil', async () => {
    await enableOfflineAccess(input);
    deviceId = 'different-device-999';
    await expect(loadOfflineAccessProfile('user-1')).resolves.toBeNull();
  });

  it('n’active jamais le mode hors ligne pour le Super Admin', async () => {
    await expect(enableOfflineAccess({ ...input, membership: { ...membership, role: 'super_admin', roleName: 'Super Administrateur' } }))
      .rejects.toThrow('Super Administrateur');
  });

  it('ne crée jamais une autorisation automatiquement lors d’une simple synchronisation', async () => {
    await expect(refreshOfflineAccessIfEnabled(input)).resolves.toBeNull();
    await expect(getOfflineAccessSummary()).resolves.toBeNull();
  });

  it('actualise les permissions seulement après une nouvelle validation serveur', async () => {
    const profile = await enableOfflineAccess(input);
    const refreshed = await refreshOfflineAccessIfEnabled({
      ...input,
      membership: { ...membership, permissions: ['sales.write'] },
    });
    expect(refreshed?.offlineId).toBe(profile.offlineId);
    expect(refreshed?.membership.permissions).toEqual(['sales.write']);
  });

  it('supprime l’accès hors ligne si l’autorisation de vendre est retirée', async () => {
    await enableOfflineAccess(input);
    await expect(refreshOfflineAccessIfEnabled({
      ...input,
      membership: { ...membership, permissions: ['sales.read'] },
    })).resolves.toBeNull();
    await expect(getOfflineAccessSummary()).resolves.toBeNull();
  });
});
