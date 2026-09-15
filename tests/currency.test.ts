import { describe, expect, it } from 'vitest';

import { countryForCode, supportedCountries } from '../src/constants/countries';

// Un seul pays réellement pris en charge de bout en bout aujourd'hui (les
// forfaits ne sont configurés qu'en GNF) — voir le commentaire dans
// src/constants/countries.ts. Les autres pays ont été retirés de la liste
// pour ne plus être proposés à l'inscription.
describe('affectation pays-devise', () => {
  it('GN utilise GNF', () => {
    expect(countryForCode('GN')?.currency).toBe('GNF');
  });
  it('ne propose qu’un seul pays', () => {
    expect(supportedCountries).toHaveLength(1);
  });
  it('un pays non pris en charge ne renvoie rien', () => {
    expect(countryForCode('SN')).toBeUndefined();
  });
});
