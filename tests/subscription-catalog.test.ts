import { beforeEach, describe, expect, it, vi } from 'vitest';
const backend = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/services/supabase/client', () => ({ supabase: backend }));
vi.mock('@/utils/operationId', () => ({ createOperationId: () => 'fixture' }));
vi.mock('@/features/offline/storage', () => ({ withOfflineCache: (_key: string, load: () => unknown) => load() }));
import { getPlans } from '@/features/subscriptions/api';

beforeEach(() => { backend.rpc.mockReset(); backend.from.mockReset(); });
describe('authoritative subscription catalog', () => {
  it('does not replace a failed billing catalog with legacy prices', async () => {
    backend.rpc.mockResolvedValue({ data: null, error: { message: 'Catalogue indisponible' } });
    await expect(getPlans('company')).rejects.toThrow('Catalogue indisponible');
    expect(backend.from).not.toHaveBeenCalled();
  });
  it('does not invent offers when the server returns an empty catalog', async () => {
    backend.rpc.mockResolvedValue({ data: [], error: null });
    expect(await getPlans('company')).toEqual([]);
    expect(backend.from).not.toHaveBeenCalled();
  });
  it('preserves prices, names and disabled rights from the billing catalog', async () => {
    backend.rpc.mockResolvedValue({ error: null, data: [{ id: 'plan', code: 'premium', name: 'Business Équipe', monthly_price: 142857, annual_price: 1428570, currency: 'GNF', max_businesses: 3, max_stores: 4, max_employees: 8, plan_features: [{ feature_key: 'pdf_export', is_enabled: false, usage_limit: null }] }] });
    expect((await getPlans('company'))[0]).toMatchObject({ name: 'Business Équipe', monthlyPrice: 142857, annualPrice: 1428570, features: [{ featureKey: 'pdf_export', isEnabled: false }] });
  });
});
