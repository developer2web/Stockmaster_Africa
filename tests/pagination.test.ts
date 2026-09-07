import { describe, expect, it } from 'vitest';
import { fetchAllRows } from '../src/services/supabase/pagination';

describe('lecture complète des données financières', () => {
  it('récupère plus de 1000 lignes même avec un plafond serveur inférieur', async () => {
    const input = Array.from({ length: 1251 }, (_, id) => ({ id, amount: id + 1 }));
    const result = await fetchAllRows(async (from, to) => ({
      data: input.slice(from, Math.min(to + 1, from + 200)), error: null,
    }));
    expect(result).toEqual(input);
    expect(result.reduce((sum, row) => sum + row.amount, 0)).toBe(783126);
  });

  it('refuse un résultat partiel si une page échoue', async () => {
    await expect(fetchAllRows(async (from) => from === 0
      ? { data: [{ id: 1 }], error: null }
      : { data: null, error: { message: 'Accès refusé' } },
    )).rejects.toThrow('Accès refusé');
  });
});
