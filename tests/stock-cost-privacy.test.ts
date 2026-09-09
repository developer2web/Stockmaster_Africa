import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), values: new Map<string, string>() }));
vi.mock('@/services/supabase/client', () => ({ supabase: { from: mocks.from } }));
vi.mock('@/utils/operationId', () => ({ createOperationId: () => 'operation' }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => mocks.values.get(key) ?? null,
  setItem: async (key: string, value: string) => { mocks.values.set(key, value); },
  removeItem: async (key: string) => { mocks.values.delete(key); },
} }));

import { getStockLevels } from '@/features/inventory/api';
import { getProducts } from '@/features/products/api';

let requests: { table: string; columns: string; filters: Record<string, string> }[];
let networkError: string | null;

beforeEach(() => {
  mocks.values.clear();
  requests = [];
  networkError = null;
  mocks.from.mockImplementation((table: string) => {
    const request = { table, columns: '', filters: {} as Record<string, string> };
    requests.push(request);
    const builder = {
      select: (columns: string) => { request.columns = columns; return builder; },
      eq: (column: string, value: string) => { request.filters[column] = value; return builder; },
      order: () => builder,
      limit: () => builder,
      range: () => builder,
      then: (resolve: (result: unknown) => unknown) => {
        const pricing = { sale_price: 100, ...(request.columns.includes('purchase_price') ? { purchase_price: 60 } : {}) };
        return Promise.resolve(resolve({
          data: networkError ? null : [table === 'stock_levels'
            ? { id: 'stock', quantity: 3, product: { name: 'Produit', ...pricing } }
            : { id: 'product', name: 'Produit', ...pricing }],
          error: networkError ? { message: networkError } : null,
        }));
      },
    };
    return builder;
  });
});

describe('confidentialité des coûts dans les requêtes stock et catalogue', () => {
  it('consulte les quantités et prix de vente sans demander le prix d’achat', async () => {
    const stock = await getStockLevels('company', undefined, 'store');
    const products = await getProducts('company', 'store');
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.columns).not.toContain('purchase_price');
      expect(request.filters).toEqual({ company_id: 'company', store_id: 'store' });
    }
    expect(stock[0].product).toEqual({ name: 'Produit', sale_price: 100 });
    expect(products[0]).not.toHaveProperty('purchase_price');
  });

  it('conserve le coût sur demande pour la valorisation propriétaire et les achats', async () => {
    expect((await getStockLevels('company', undefined, 'store', true))[0].product?.purchase_price).toBe(60);
    expect((await getProducts('company', 'store', '', 0, true))[0].purchase_price).toBe(60);
    expect(requests.every(request => request.columns.includes('purchase_price'))).toBe(true);
  });

  it('ne réutilise pas le cache financier après passage à une consultation sans coûts', async () => {
    await getStockLevels('company', undefined, 'store', true);
    await getProducts('company', 'store', '', 0, true);
    networkError = 'Network request failed';
    await expect(getStockLevels('company', undefined, 'store')).rejects.toThrow();
    await expect(getProducts('company', 'store')).rejects.toThrow();
  });

  it('conserve un cache hors ligne sans coûts distinct des données financières', async () => {
    await getStockLevels('company', undefined, 'store');
    await getProducts('company', 'store');
    await getStockLevels('company', undefined, 'store', true);
    await getProducts('company', 'store', '', 0, true);
    networkError = 'Network request failed';
    expect((await getStockLevels('company', undefined, 'store'))[0].product).not.toHaveProperty('purchase_price');
    expect((await getProducts('company', 'store'))[0]).not.toHaveProperty('purchase_price');
  });

  it('ignore les anciens caches de listes qui contenaient systématiquement le coût', async () => {
    for (const key of ['stock-levels:company:all:store', 'products:company:store::0']) {
      mocks.values.set(`stockmaster:offline-cache:v1:${key}`, JSON.stringify({ savedAt: new Date().toISOString(), value: [{ purchase_price: 60 }] }));
    }
    networkError = 'Network request failed';
    await expect(getStockLevels('company', undefined, 'store')).rejects.toThrow();
    await expect(getProducts('company', 'store')).rejects.toThrow();
  });
});
