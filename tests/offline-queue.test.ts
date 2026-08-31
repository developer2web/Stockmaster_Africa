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

  it('retire les entrées locales corrompues', async () => {
    storedQueue = JSON.stringify([operation('sale-1', 'sale'), { id: 'broken' }]);
    await expect(getOfflineQueue()).resolves.toHaveLength(1);
    expect(JSON.parse(storedQueue ?? '[]')).toHaveLength(1);
  });
});
