import { describe, expect, it } from 'vitest';
import { checkoutIssue, matchesCustomer } from '../src/features/sales/checkout';

const ready = { itemCount: 2, storeId: 'store', pending: false, settingsReady: true, discountTooHigh: false, payment: 'cash', customerId: null, amountPaid: 0, total: 100, creditAllowed: true };

describe('explications avant validation de vente', () => {
  it('autorise les espèces sans client', () => expect(checkoutIssue(ready)).toBeNull());
  it('exige un client pour le crédit et les acomptes', () => {
    for (const payment of ['credit', 'partial']) expect(checkoutIssue({ ...ready, payment })).toContain('Choisissez un client');
  });
  it('refuse les acomptes invalides, y compris les valeurs non finies', () => {
    for (const amountPaid of [0, -1, 100, 101, NaN, Infinity]) expect(checkoutIssue({ ...ready, payment: 'partial', customerId: 'client', amountPaid })).toContain('L’acompte');
    expect(checkoutIssue({ ...ready, payment: 'partial', customerId: 'client', amountPaid: 50 })).toBeNull();
  });
  it('respecte le blocage des crédits et les limites de remise', () => {
    expect(checkoutIssue({ ...ready, payment: 'credit', customerId: 'client', creditAllowed: false })).toContain('désactivée');
    expect(checkoutIssue({ ...ready, discountTooHigh: true })).toContain('remise');
  });
  it('explique les données manquantes et les enregistrements en cours', () => {
    expect(checkoutIssue({ ...ready, invalidQuantity: true })).toContain('quantité');
    expect(checkoutIssue({ ...ready, itemCount: 0 })).toContain('article');
    expect(checkoutIssue({ ...ready, storeId: '' })).toContain('boutique');
    expect(checkoutIssue({ ...ready, settingsReady: false })).toContain('règles');
    expect(checkoutIssue({ ...ready, pending: true })).toContain('en cours');
  });
});

describe('recherche client', () => {
  const customer = { name: 'Mamadou Condé', phone: '+224 620-12-34-56' };
  it('ignore les accents et la casse', () => expect(matchesCustomer(customer, 'CONDE')).toBe(true));
  it('retrouve un téléphone malgré les séparateurs', () => expect(matchesCustomer(customer, '6201234')).toBe(true));
  it('ne transforme pas du texte en recherche téléphone', () => expect(matchesCustomer(customer, 'autre 620')).toBe(false));
  it('accepte une recherche vide et un numéro absent', () => {
    expect(matchesCustomer({ ...customer, phone: null }, '')).toBe(true);
    expect(matchesCustomer({ ...customer, phone: null }, '620')).toBe(false);
  });
});
