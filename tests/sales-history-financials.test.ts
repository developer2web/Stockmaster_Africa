import { beforeEach, describe, expect, it, vi } from 'vitest';

const from = vi.hoisted(() => vi.fn());
vi.mock('@/services/supabase/client', () => ({ supabase: { from } }));
import { getHistoryFinancials } from '@/features/sales/historyFinancials';

beforeEach(() => { from.mockReset(); });

describe('independent sales history financials', () => {
  it('does not request financial data for an empty history', async () => {
    expect(await getHistoryFinancials('company', 'store', [])).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it('keeps company and store scope across batches and server page caps', async () => {
    const batches: string[][] = [];
    from.mockImplementation(table => {
      expect(table).toBe('sale_financials');
      let ids: string[] = [];
      const scope: Record<string, string> = {};
      const builder = {
        select: () => builder,
        eq: (key: string, value: string) => { scope[key] = value; return builder; },
        in: (_: string, values: string[]) => { ids = values; batches.push(values); return builder; },
        order: () => builder,
        range: (offset: number) => {
          expect(scope).toEqual({ company_id: 'company', store_id: 'store' });
          expect(ids.length).toBeLessThanOrEqual(100);
          return Promise.resolve({ data: ids.slice(offset, offset + 20).map(sale_id => ({ sale_id, cost_total: 6, gross_profit: 4 })), error: null });
        },
      };
      return builder;
    });
    const ids = Array.from({ length: 205 }, (_, i) => `sale-${i}`);
    const rows = await getHistoryFinancials('company', 'store', [...ids, ids[0]]);
    expect(rows.map(row => row.sale_id)).toEqual(ids);
    expect(rows.reduce((sum, row) => sum + row.gross_profit, 0)).toBe(820);
    expect(batches.some(batch => batch.includes('sale-204'))).toBe(true);
  });

  it('reports a denied financial request without fabricating zero profits', async () => {
    const builder = {
      select: () => builder, eq: () => builder, in: () => builder, order: () => builder,
      range: async () => ({ data: null, error: { message: 'permission denied for view sale_financials' } }),
    };
    from.mockReturnValue(builder);
    await expect(getHistoryFinancials('company', 'store', ['sale-1'])).rejects.toThrow('permission denied');
  });
});
