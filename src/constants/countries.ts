// Un seul pays réellement pris en charge de bout en bout aujourd'hui : les
// forfaits (plan_currency_prices) ne sont configurés qu'en GNF. Choisir un
// autre pays à l'inscription menait à un blocage sans solution au moment de
// payer ("Tarif non configuré pour la devise ..."). Retirer les autres pays
// de la liste plutôt que de corriger un tarif qui n'existe pas encore.
export const supportedCountries = [
  { code: 'GN', name: 'Guinée', currency: 'GNF' },
] as const;

export type SupportedCountryCode = typeof supportedCountries[number]['code'];

export function countryForCode(code: string) {
  return supportedCountries.find((country) => country.code === code);
}
