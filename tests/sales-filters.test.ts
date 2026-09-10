import { describe, expect, it, vi, beforeEach } from 'vitest';
import { emptySalesFilters, salesDateBounds } from '@/features/sales/filters';

const { rpc, getSales, cache } = vi.hoisted(() => ({ rpc: vi.fn(), getSales: vi.fn(), cache: vi.fn() }));
vi.mock('@/services/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('@/features/sales/api', () => ({ getSales, SALE_PAGE_SIZE: 30 }));
vi.mock('@/features/offline/storage', () => ({ withOfflineCache: cache }));
import { getFilteredSales } from '@/features/sales/filteredHistory';

beforeEach(() => {
  vi.clearAllMocks();
  cache.mockImplementation((_key: string, fetch: () => Promise<unknown>) => fetch());
});
describe('sales filtering', () => {
  it('includes all of the selected local day with an exclusive next midnight', () => {
    const bounds = salesDateBounds({ ...emptySalesFilters, period: 'today' }, new Date(2026, 8, 9, 23, 50));
    expect(bounds).toEqual({ after: new Date(2026, 8, 9).toISOString(), before: new Date(2026, 8, 10).toISOString() });
  });
  it('counts seven calendar days including today, across a month boundary', () => {
    expect(salesDateBounds({ ...emptySalesFilters, period: '7' }, new Date(2026, 8, 2, 15))).toEqual({
      after: new Date(2026, 7, 27).toISOString(), before: new Date(2026, 8, 3).toISOString(),
    });
  });
  it('handles DST and includes the entire last custom day', () => {
    const previous = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      const bounds = salesDateBounds({ ...emptySalesFilters, period: 'custom', startDate: '2026-03-08', endDate: '2026-03-08' });
      expect(bounds).toEqual({ after: '2026-03-08T05:00:00.000Z', before: '2026-03-09T04:00:00.000Z' });
    } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  });
  it('rejects invalid or reversed dates before requesting history', () => {
    for (const [startDate, endDate] of [['2026-02-30', '2026-03-01'], ['', ''], ['2026-09-10', '2026-09-09']]) {
      expect(() => salesDateBounds({ ...emptySalesFilters, period: 'custom', startDate, endDate })).toThrow();
    }
  });
  it('keeps existing unfiltered history available without the new server function', async () => {
    getSales.mockResolvedValue([{ id: 'existing' }]);
    expect(await getFilteredSales('company', 'store', 1, { search: '', after: null, before: null, payment: null, status: 'all' })).toEqual([{ id: 'existing' }]);
    expect(getSales).toHaveBeenCalledWith('company', 'store', 1, false);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('sends all filters to the server before pagination and separates offline scopes', async () => {
    const criteria = { search: 'Diallo %_', after: '2026-09-01T00:00:00Z', before: '2026-09-10T00:00:00Z', payment: 'cash', status: 'due' };
    rpc.mockResolvedValue({ data: [{ id: 'older-sale' }], error: null });
    expect(await getFilteredSales('company', 'store', 1, criteria)).toEqual([{ id: 'older-sale' }]);
    expect(rpc).toHaveBeenCalledWith('get_filtered_sales_history', {
      p_company_id: 'company', p_store_id: 'store', p_offset: 30, p_limit: 30,
      p_search: criteria.search, p_after: criteria.after, p_before: criteria.before, p_payment: 'cash', p_status: 'due',
    });
    await getFilteredSales('company', 'another-store', 1, criteria);
    await getFilteredSales('company', 'store', 1, { ...criteria, search: 'Other' });
    expect(new Set(cache.mock.calls.map(call => call[0])).size).toBe(3);
  });
  it('keeps permission denials visible and explains a missing server migration', async () => {
    const criteria = { search: 'test', after: null, before: null, payment: null, status: 'all' };
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Accès refusé' } });
    await expect(getFilteredSales('company', 'store', 0, criteria)).rejects.toThrow('Accès refusé');
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'missing RPC' } });
    await expect(getFilteredSales('company', 'store', 0, criteria)).rejects.toThrow('mise à jour du serveur');
  });
});
