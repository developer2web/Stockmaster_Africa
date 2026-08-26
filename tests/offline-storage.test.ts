import { beforeEach, describe, expect, it, vi } from 'vitest';

const asyncStorage = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({ default: asyncStorage }));

import { withOfflineCache } from '../src/features/offline/storage';

describe('cache hors ligne', () => {
  beforeEach(() => {
    asyncStorage.getItem.mockReset();
    asyncStorage.setItem.mockReset();
    asyncStorage.removeItem.mockReset();
    asyncStorage.removeItem.mockResolvedValue(undefined);
  });

  it('conserve le résultat réseau lorsque le stockage local échoue', async () => {
    asyncStorage.setItem.mockRejectedValue(new Error('stockage indisponible'));

    await expect(withOfflineCache('products', async () => [{ id: 'p1' }], Array.isArray))
      .resolves.toEqual([{ id: 'p1' }]);
  });

  it('utilise un cache valide lorsque le réseau échoue', async () => {
    asyncStorage.getItem.mockResolvedValue(JSON.stringify({ value: [{ id: 'p1' }] }));

    await expect(withOfflineCache('products', async () => { throw new Error('hors ligne'); }, Array.isArray))
      .resolves.toEqual([{ id: 'p1' }]);
  });

  it('supprime un ancien cache mal formé au lieu de casser un écran', async () => {
    asyncStorage.getItem.mockResolvedValue(JSON.stringify({ value: { id: 'p1' } }));

    await expect(withOfflineCache('products', async () => { throw new Error('hors ligne'); }, Array.isArray))
      .rejects.toThrow('hors ligne');
    expect(asyncStorage.removeItem).toHaveBeenCalledOnce();
  });
});
