import { describe, expect, it, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/services/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('@/utils/operationId', () => ({ createOperationId: () => 'default-id' }));
import { recordSaleReturn } from '../src/features/sales/returns';

describe('reprise d’un remboursement', () => {
  it('réutilise le même identifiant après une réponse réseau perdue', async () => {
    const input = { saleId: 'sale', items: [{ saleItemId: 'item', quantity: 1, disposition: 'restock' as const }], refundMethod: 'cash', note: 'Erreur de quantité' };
    rpc.mockResolvedValueOnce({ error: { message: 'Network error' } }).mockResolvedValueOnce({ data: 'return', error: null });
    await expect(recordSaleReturn(input, 'stable-id')).rejects.toThrow();
    await expect(recordSaleReturn(input, 'stable-id')).resolves.toBe('return');
    expect(rpc.mock.calls[0][1].p_operation_id).toBe('stable-id');
    expect(rpc.mock.calls[1][1].p_operation_id).toBe('stable-id');
    expect(rpc.mock.calls[1][1].p_note).toBe('Erreur de quantité');
  });
});
