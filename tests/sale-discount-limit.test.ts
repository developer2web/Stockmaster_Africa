import { expect, it } from 'vitest';
import { checkoutIssue, maxLineDiscount } from '@/features/sales/checkout';

// Retour testeur du 26/09 : Cerelac à 62 000 GNF, remise de 60 000 GNF, employé SANS la
// permission « Dépasser la limite normale de remise ».
it('bloque le cas signalé quelle que soit la limite de l’entreprise', () => {
  expect(maxLineDiscount(62000, 10, false)).toBe(6200);      // limite par défaut des nouvelles entreprises
  expect(maxLineDiscount(62000, 100, false)).toBe(61999);    // entreprise encore à 100 % : jamais le prix entier
  expect(60000 > maxLineDiscount(62000, 10, false)).toBe(true);
});

it('interdit une remise égale ou supérieure au prix de la ligne sans la permission', () => {
  expect(maxLineDiscount(7000, 100, false)).toBe(6999);
  expect(maxLineDiscount(1, 100, false)).toBe(0);
  expect(maxLineDiscount(0, 100, false)).toBe(0);
});

it('laisse un responsable (permission de dépassement) aller jusqu’au prix de la ligne', () => {
  expect(maxLineDiscount(62000, 10, true)).toBe(62000);
});

it('arrondit au franc inférieur et borne une limite invalide', () => {
  expect(maxLineDiscount(9999, 10, false)).toBe(999);
  expect(maxLineDiscount(10000, 150, false)).toBe(9999);
  expect(maxLineDiscount(10000, -5, false)).toBe(0);
  expect(maxLineDiscount(10000, Number.NaN, false)).toBe(9999);
});

it('empêche la validation tant qu’une remise dépasse le maximum', () => {
  const base = { itemCount: 1, storeId: 's', pending: false, settingsReady: true, zeroTotal: false, payment: 'cash', customerId: null, amountPaid: 0, total: 2000, creditAllowed: true };
  expect(checkoutIssue({ ...base, discountTooHigh: true })).toMatch(/maximum autorisé/);
  expect(checkoutIssue({ ...base, discountTooHigh: false })).toBeNull();
});
