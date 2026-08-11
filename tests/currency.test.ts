import { describe, expect, it } from 'vitest';

import { countryForCode } from '../src/constants/countries';

describe('affectation pays-devise', () => {
  it.each([
    ['GN', 'GNF'], ['SN', 'XOF'], ['CI', 'XOF'], ['ML', 'XOF'],
    ['CM', 'XAF'], ['US', 'USD'], ['CA', 'CAD'], ['FR', 'EUR'], ['GB', 'GBP'],
  ])('%s utilise %s', (countryCode, currencyCode) => {
    expect(countryForCode(countryCode)?.currency).toBe(currencyCode);
  });
});
