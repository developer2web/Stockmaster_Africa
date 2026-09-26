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
  // Journées de l'ENTREPRISE (Conakry, UTC+0), plus celles de l'appareil — voir
  // tests/business-time.test.ts et le retour testeur du 26/09 (vente de 02:59).
  it('includes all of the business day with an exclusive next midnight', () => {
    const bounds = salesDateBounds({ ...emptySalesFilters, period: 'today' }, new Date('2026-09-09T23:50:00Z'));
    expect(bounds).toEqual({ after: '2026-09-09T00:00:00.000Z', before: '2026-09-10T00:00:00.000Z' });
  });
  it('counts seven business days including today, across a month boundary', () => {
    expect(salesDateBounds({ ...emptySalesFilters, period: '7' }, new Date('2026-09-02T15:00:00Z'))).toEqual({
      after: '2026-08-27T00:00:00.000Z', before: '2026-09-03T00:00:00.000Z',
    });
  });
  it('ignores the device time zone (and its DST) for a custom day', () => {
    const previous = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      const bounds = salesDateBounds({ ...emptySalesFilters, period: 'custom', startDate: '2026-03-08', endDate: '2026-03-08' });
      expect(bounds).toEqual({ after: '2026-03-08T00:00:00.000Z', before: '2026-03-09T00:00:00.000Z' });
    } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  });
  it('rejects invalid or reversed dates before requesting history', () => {
    for (const [startDate, endDate] of [['2026-02-30', '2026-03-01'], ['', ''], ['2026-09-10', '2026-09-09']]) {
      expect(() => salesDateBounds({ ...emptySalesFilters, period: 'custom', startDate, endDate })).toThrow();
    }
  });
  const CURSOR = { createdAt: '2026-09-10T12:00:00.000Z', id: 'sale-42' };
  it('keeps existing unfiltered history available without the new server function', async () => {
    getSales.mockResolvedValue([{ id: 'existing' }]);
    expect(await getFilteredSales('company', 'store', CURSOR, { search: '', after: null, before: null, payment: null, status: 'all' })).toEqual([{ id: 'existing' }]);
    expect(getSales).toHaveBeenCalledWith('company', 'store', CURSOR, false);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('sends all filters to the server before pagination and separates offline scopes', async () => {
    const criteria = { search: 'Diallo %_', after: '2026-09-01T00:00:00Z', before: '2026-09-10T00:00:00Z', payment: 'cash', status: 'due' };
    rpc.mockResolvedValue({ data: [{ id: 'older-sale' }], error: null });
    expect(await getFilteredSales('company', 'store', CURSOR, criteria)).toEqual([{ id: 'older-sale' }]);
    expect(rpc).toHaveBeenCalledWith('get_filtered_sales_history', {
      p_company_id: 'company', p_store_id: 'store', p_cursor_created_at: CURSOR.createdAt, p_cursor_id: CURSOR.id, p_limit: 30,
      p_search: criteria.search, p_after: criteria.after, p_before: criteria.before, p_payment: 'cash', p_status: 'due',
    });
    await getFilteredSales('company', 'another-store', CURSOR, criteria);
    await getFilteredSales('company', 'store', CURSOR, { ...criteria, search: 'Other' });
    expect(new Set(cache.mock.calls.map(call => call[0])).size).toBe(3);
  });
  it('keeps permission denials visible and explains a missing server migration', async () => {
    const criteria = { search: 'test', after: null, before: null, payment: null, status: 'all' };
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Accès refusé' } });
    await expect(getFilteredSales('company', 'store', null, criteria)).rejects.toThrow('Accès refusé');
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'missing RPC' } });
    await expect(getFilteredSales('company', 'store', null, criteria)).rejects.toThrow('mise à jour du serveur');
  });
});
