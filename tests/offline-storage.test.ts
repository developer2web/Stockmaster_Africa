import { beforeEach, describe, expect, it, vi } from 'vitest';

const asyncStorage = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  getAllKeys: vi.fn(),
  multiRemove: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({ default: asyncStorage }));

import { clearOfflineCaches, OFFLINE_CACHE_MAX_AGE_MS, readOfflineCache, withOfflineCache } from '../src/features/offline/storage';

describe('cache hors ligne', () => {
  beforeEach(() => {
    asyncStorage.getItem.mockReset();
    asyncStorage.setItem.mockReset();
    asyncStorage.removeItem.mockReset();
    asyncStorage.removeItem.mockResolvedValue(undefined);
    asyncStorage.getAllKeys.mockReset();
    asyncStorage.multiRemove.mockReset();
  });

  it('conserve le résultat réseau lorsque le stockage local échoue', async () => {
    asyncStorage.setItem.mockRejectedValue(new Error('stockage indisponible'));

    await expect(withOfflineCache('products', async () => [{ id: 'p1' }], Array.isArray))
      .resolves.toEqual([{ id: 'p1' }]);
  });

  it('utilise un cache valide lorsque le réseau échoue', async () => {
    asyncStorage.getItem.mockResolvedValue(JSON.stringify({ value: [{ id: 'p1' }], savedAt: new Date().toISOString() }));

    await expect(withOfflineCache('products', async () => { throw new Error('hors ligne'); }, Array.isArray))
      .resolves.toEqual([{ id: 'p1' }]);
  });

  it('supprime un ancien cache mal formé au lieu de casser un écran', async () => {
    asyncStorage.getItem.mockResolvedValue(JSON.stringify({ value: { id: 'p1' }, savedAt: new Date().toISOString() }));

    await expect(withOfflineCache('products', async () => { throw new Error('hors ligne'); }, Array.isArray))
      .rejects.toThrow('hors ligne');
    expect(asyncStorage.removeItem).toHaveBeenCalledOnce();
  });

  it('refuse un cache trop ancien', async () => {
    const now = Date.now();
    asyncStorage.getItem.mockResolvedValue(JSON.stringify({ value: [{ id: 'p1' }], savedAt: new Date(now - OFFLINE_CACHE_MAX_AGE_MS - 1).toISOString() }));

    await expect(readOfflineCache('products', Array.isArray, now)).resolves.toBeNull();
    expect(asyncStorage.removeItem).toHaveBeenCalledOnce();
  });

  it('supprime uniquement les caches fonctionnels', async () => {
    asyncStorage.getAllKeys.mockResolvedValue([
      'stockmaster:offline-cache:v1:products',
      'stockmaster:offline-queue:v1',
      'stockmaster-workspace',
    ]);

    await clearOfflineCaches();

    expect(asyncStorage.multiRemove).toHaveBeenCalledWith(['stockmaster:offline-cache:v1:products']);
  });
});
