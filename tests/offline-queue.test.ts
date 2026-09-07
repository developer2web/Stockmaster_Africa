import { beforeEach, describe, expect, it, vi } from 'vitest';

let storedQueue: string | null = null;
const asyncStorage = vi.hoisted(() => ({
  getItem: vi.fn(async () => storedQueue),
  setItem: vi.fn(async (_key: string, value: string) => { storedQueue = value; }),
  removeItem: vi.fn(async () => { storedQueue = null; }),
}));
const supabaseMock = vi.hoisted(() => ({
  getSession: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({ default: asyncStorage }));
vi.mock('@/services/supabase/client', () => ({
  supabase: { auth: { getSession: supabaseMock.getSession }, rpc: supabaseMock.rpc },
}));

import { enqueueOfflineOperation, getOfflineQueue, synchronizeOfflineQueue } from '../src/features/offline/queue';

const operation = (id: string, type: 'sale' | 'expense' | 'cash', userId = 'user-1') => ({
  id, type, userId, payload: { p_operation_id: id }, createdAt: '2026-08-30T12:00:00.000Z',
  deviceId: 'device-12345678', attempts: 0,
});

describe('file de synchronisation hors ligne', () => {
  beforeEach(() => {
    storedQueue = null;
    asyncStorage.getItem.mockClear();
    asyncStorage.setItem.mockClear();
    asyncStorage.removeItem.mockClear();
    supabaseMock.getSession.mockReset();
    supabaseMock.rpc.mockReset();
    supabaseMock.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
  });

  it('n’ajoute jamais deux fois le même identifiant', async () => {
    const input = { id: 'op-1', type: 'sale' as const, payload: {}, createdAt: '2026-08-30T12:00:00.000Z', deviceId: 'device-12345678' };
    await enqueueOfflineOperation(input);
    await enqueueOfflineOperation(input);
    await expect(getOfflineQueue()).resolves.toHaveLength(1);
  });

  it('synchronise seulement le compte connecté et conserve les conflits', async () => {
    storedQueue = JSON.stringify([
      operation('sale-1', 'sale'),
      operation('cash-1', 'cash'),
      operation('expense-other', 'expense', 'user-2'),
    ]);
    supabaseMock.rpc
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: 'permission denied' } });

    const result = await synchronizeOfflineQueue();

    expect(result.synced).toBe(1);
    expect(result.remaining).toHaveLength(2);
    expect(result.remaining.find((row) => row.id === 'cash-1')).toMatchObject({ attempts: 1, lastError: 'permission denied' });
    expect(result.remaining.find((row) => row.id === 'expense-other')).toMatchObject({ attempts: 0 });
    expect(supabaseMock.rpc).toHaveBeenNthCalledWith(1, 'create_sale_v3', { p_operation_id: 'sale-1' });
    expect(supabaseMock.rpc).toHaveBeenNthCalledWith(2, 'record_cash_transaction', { p_operation_id: 'cash-1' });
  });

  it('conserve les données corrompues sans autoriser leur écrasement', async () => {
    for (const raw of ['{invalid', '{}', JSON.stringify([operation('sale-1', 'sale'), { id: 'broken' }])]) {
      storedQueue = raw;
      await expect(getOfflineQueue()).rejects.toThrow('récupération');
      await expect(enqueueOfflineOperation(operation('new-sale', 'sale'))).rejects.toThrow('récupération');
      expect(storedQueue).toBe(raw);
    }
    expect(asyncStorage.removeItem).not.toHaveBeenCalled();
    expect(asyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('conserve les ventes après une panne de lecture et permet une reprise', async () => {
    storedQueue = JSON.stringify([operation('sale-1', 'sale')]);
    const original = storedQueue;
    asyncStorage.getItem.mockRejectedValueOnce(new Error('Stockage indisponible'));
    await expect(synchronizeOfflineQueue()).rejects.toThrow('Stockage indisponible');
    expect(storedQueue).toBe(original);
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
    expect(asyncStorage.removeItem).not.toHaveBeenCalled();
    supabaseMock.rpc.mockResolvedValue({ error: null });
    await expect(synchronizeOfflineQueue()).resolves.toMatchObject({ synced: 1, remaining: [] });
  });

  it('conserve une vente si la sauvegarde après envoi échoue et rejoue le même identifiant', async () => {
    storedQueue = JSON.stringify([operation('sale-1', 'sale')]);
    const original = storedQueue;
    supabaseMock.rpc.mockResolvedValue({ error: null });
    asyncStorage.setItem.mockRejectedValueOnce(new Error('Écriture impossible'));
    await expect(synchronizeOfflineQueue()).rejects.toThrow('Écriture impossible');
    expect(storedQueue).toBe(original);
    await expect(synchronizeOfflineQueue()).resolves.toMatchObject({ synced: 1 });
    expect(supabaseMock.rpc).toHaveBeenNthCalledWith(2, 'create_sale_v3', { p_operation_id: 'sale-1' });
  });
});
