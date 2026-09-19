import { describe, expect, it } from 'vitest';
import { canAutofill, lotMargin, lotPriceFromUnit, unitPriceFromLot } from '../src/features/products/bulkPricing';

describe('prix du lot et prix à l’unité', () => {
  it('calcule le prix à l’unité depuis le lot et suit un changement de quantité', () => {
    expect(unitPriceFromLot('240000', '24')).toBe('10000');
    expect(unitPriceFromLot('240000', '12')).toBe('20000');
    expect(unitPriceFromLot('100000', '3')).toBe('33333');
  });
  it('ne calcule rien sur une saisie vide, nulle ou invalide', () => {
    for (const [lot, qty] of [['', '24'], ['240000', ''], ['0', '24'], ['-5', '24'], ['240000', '1e1'], ['240000', '0']]) expect(unitPriceFromLot(lot, qty)).toBeNull();
  });
  it('calcule le prix du lot depuis le prix à l’unité', () => {
    expect(lotPriceFromUnit('10000', '24')).toBe('240000');
    expect(lotPriceFromUnit('', '24')).toBeNull();
    expect(lotPriceFromUnit('10000', '0')).toBeNull();
  });
  it('remplit un champ vide ou resté sur la dernière valeur calculée, jamais une saisie manuelle', () => {
    expect(canAutofill('', null)).toBe(true);
    expect(canAutofill('10000', '10000')).toBe(true);
    expect(canAutofill('12500', '10000')).toBe(false);
    expect(canAutofill('12500', null)).toBe(false);
  });
  it('signale une vente du lot à perte, sans marge ou avec marge', () => {
    expect(lotMargin('200000', '240000')).toEqual({ kind: 'loss', amount: -40000 });
    expect(lotMargin('240000', '240000')).toEqual({ kind: 'none', amount: 0 });
    expect(lotMargin('300000', '240000')).toEqual({ kind: 'profit', amount: 60000 });
    expect(lotMargin('', '240000')).toBeNull();
  });
});
