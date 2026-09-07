import { beforeEach, describe, expect, it, vi } from 'vitest';

const backend = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('@/services/supabase/client', () => ({ supabase: backend }));
vi.mock('@/utils/operationId', () => ({ createOperationId: () => 'operation' }));
vi.mock('@/features/offline/storage', () => ({ withOfflineCache: vi.fn() }));

import { getSupplierStats } from '../src/features/products/api';
import { getCashBalance, getFinancialDetails } from '../src/features/reports/api';

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
function query(table: string) {
  let rows = tables[table] ?? [];
  const builder = {
    select: () => builder,
    eq: () => builder,
    gte: () => builder,
    lte: () => builder,
    order: () => builder,
    in: (column: string, ids: string[]) => {
      expect(ids.length).toBeLessThanOrEqual(100);
      rows = rows.filter((row) => ids.includes(String(row[column])));
      return builder;
    },
    range: async (from: number, to: number) => ({ data: rows.slice(from, Math.min(to + 1, from + 75)), error: null }),
  };
  return builder;
}

beforeEach(() => {
  tables = {};
  backend.from.mockImplementation(query);
  backend.rpc.mockReset();
});

describe('montants au-delà du plafond de 1000 lignes', () => {
  it('inclut les anciens achats dans les totaux et dettes fournisseurs', async () => {
    tables.purchases = Array.from({ length: 1201 }, () => ({ supplier_id: 'supplier', total: 10, amount_due: 3, created_at: '2026-09-07' }));
    expect(await getSupplierStats('company', 'store')).toEqual({ supplier: { total: 12010, due: 3603, count: 1201, lastDelivery: '2026-09-07' } });
  });

  it('calcule la caisse avec tous les dépôts et retraits', async () => {
    tables.cash_transactions = [...Array.from({ length: 1200 }, () => ({ transaction_type: 'deposit', amount: 10 })), { transaction_type: 'withdrawal', amount: 5 }];
    expect(await getCashBalance('company', null)).toBe(11995);
  });

  it('retourne tous les détails et les bénéfices sans longue requête de références', async () => {
    const sales = Array.from({ length: 1201 }, (_, id) => ({ id: String(id), total: 10 }));
    backend.rpc.mockResolvedValue({ data: sales, error: null });
    tables.sale_financials = sales.map((sale) => ({ sale_id: sale.id, gross_profit: 4 }));
    tables.expenses = Array.from({ length: 1201 }, () => ({ amount: 2 }));
    tables.cash_transactions = Array.from({ length: 1201 }, () => ({ amount: 10 }));
    const result = await getFinancialDetails('company', '2026-09-01', '2026-09-07', 'store');
    expect(result.expenses).toHaveLength(1201);
    expect(result.cash).toHaveLength(1201);
    expect(result.sales).toHaveLength(1201);
    expect(result.sales.reduce((sum, sale) => sum + sale.gross_profit, 0)).toBe(4804);
  });
});
