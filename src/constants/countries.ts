export const supportedCountries = [
  { code: 'GN', name: 'Guinée', currency: 'GNF' },
  { code: 'SN', name: 'Sénégal', currency: 'XOF' },
  { code: 'CI', name: 'Côte d’Ivoire', currency: 'XOF' },
  { code: 'ML', name: 'Mali', currency: 'XOF' },
  { code: 'CM', name: 'Cameroun', currency: 'XAF' },
  { code: 'US', name: 'États-Unis', currency: 'USD' },
  { code: 'CA', name: 'Canada', currency: 'CAD' },
  { code: 'FR', name: 'France', currency: 'EUR' },
  { code: 'GB', name: 'Royaume-Uni', currency: 'GBP' },
] as const;

export type SupportedCountryCode = typeof supportedCountries[number]['code'];

export function countryForCode(code: string) {
  return supportedCountries.find((country) => country.code === code);
}
