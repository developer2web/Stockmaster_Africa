vi.mock('@/services/storage/encryptedStorage', async () => {
  const { default: storage } = await import('@react-native-async-storage/async-storage');
  return { decryptStoredValue: async (_key: string, raw: string) => raw, isEncryptedValue: () => true, writeEncryptedStorage: (key: string, value: string) => storage.setItem(key, value) };
});
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
import { getProduct, getProducts } from '@/features/products/api';
import { readProductCosts } from '@/features/products/costs';

let requests: { table: string; columns: string; filters: Record<string, string> }[];
let networkError: string | null;
let canReadCost: boolean;
let costServiceMissing: boolean;

beforeEach(() => {
  mocks.values.clear();
  requests = [];
  networkError = null;
  canReadCost = true;
  costServiceMissing = false;
  mocks.from.mockImplementation((table: string) => {
    const request = { table, columns: '', filters: {} as Record<string, string> };
    requests.push(request);
    let offset = 0;
    let single = false;
    const builder = {
      select: (columns: string) => { request.columns = columns; return builder; },
      eq: (column: string, value: string) => { request.filters[column] = value; return builder; },
      order: () => builder,
      limit: () => builder,
      in: () => builder,
      single: () => { single = true; return builder; },
      range: (from: number) => { offset = from; return builder; },
      then: (resolve: (result: unknown) => unknown) => {
        if (costServiceMissing && ['product_costs','product_variant_costs'].includes(table)) return Promise.resolve(resolve({data:null,error:{message:'Could not find public.product_costs in the schema cache'}}));
        const pricing = { sale_price: 100 };
        const rows = table === 'product_costs'
          ? canReadCost && offset === 0 ? [{ product_id: 'product', purchase_price: 60 }] : []
          : table === 'product_variant_costs'
            ? canReadCost && offset === 0 ? [{ product_variant_id: 'variant', purchase_price: null }] : []
            : [table === 'stock_levels'
              ? { id: 'stock', product_id: 'product', quantity: 3, product: { name: 'Produit', ...pricing } }
              : { id: 'product', name: 'Produit', ...pricing, ...(single ? { product_variants: [{ id: 'variant', sale_price: 120 }] } : {}) }];
        return Promise.resolve(resolve({
          data: networkError ? null : single ? rows[0] : rows,
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
    expect(requests.filter(request => ['products','stock_levels'].includes(request.table))
      .every(request => !request.columns.includes('purchase_price'))).toBe(true);
    expect(requests.some(request => request.table === 'product_costs')).toBe(true);
  });

  it('ne devine aucun coût lorsque le serveur ne l’autorise pas', async () => {
    canReadCost = false;
    expect((await getProducts('company', 'store', '', 0, true))[0]).not.toHaveProperty('purchase_price');
    expect((await getStockLevels('company', undefined, 'store', true))[0].product).not.toHaveProperty('purchase_price');
    await expect(getProduct('product')).rejects.toThrow('prix d’achat');
  });

  it('préserve le coût et l’héritage null des variantes pour une édition autorisée', async () => {
    const product = await getProduct('product');
    expect(product.purchase_price).toBe(60);
    expect(product.product_variants?.[0].purchase_price).toBeNull();
    expect(requests.filter(request => request.table === 'products')
      .every(request => !request.columns.includes('purchase_price'))).toBe(true);
  });

  it('évite une lecture globale des coûts si la liste des produits est vide', async () => {
    const costs = await readProductCosts([], true);
    expect(costs.products.size).toBe(0);
    expect(costs.variants.size).toBe(0);
    expect(requests).toHaveLength(0);
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

it('keeps stock quantities available when the separate cost service is not deployed', async () => {
  costServiceMissing = true;
  const stock = await getStockLevels('company', undefined, 'store', false);
  expect(stock[0].quantity).toBe(3);
  expect(stock[0].product).not.toHaveProperty('purchase_price');
  await expect(readProductCosts(['product'])).rejects.toThrow('schema cache');
  expect((await getStockLevels('company', undefined, 'store', false))[0].quantity).toBe(3);
});
