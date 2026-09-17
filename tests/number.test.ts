import { describe, expect, it } from 'vitest';
import { digitsOnly, formatQuantity, numericFieldValue } from '../src/utils/number';

describe('formatage des quantités', () => {
  it('retire les décimales inutiles', () => {
    expect(formatQuantity(10)).toBe('10');
    expect(formatQuantity('10.000')).toBe('10');
  });

  it('conserve les décimales significatives', () => {
    expect(formatQuantity(10.5)).toBe('10,5');
    expect(formatQuantity(2.125)).toBe('2,125');
  });

  // SM-20 (audit externe) : fr-FR sépare les milliers par une espace fine
  // insécable (U+202F), invisible selon la police/le rendu — fr-CA utilise
  // une espace insécable normale (U+00A0), toujours visible, pour le même
  // résultat lisible. On calcule les deux ici plutôt que de retaper le
  // caractère à la main (fragile, comme le bug lui-même) et on vérifie que
  // formatQuantity produit bien celui de fr-CA, jamais celui de fr-FR.
  it('sépare les milliers par l’espace insécable de fr-CA, jamais celle de fr-FR', () => {
    const frCaThousand = new Intl.NumberFormat('fr-CA').format(1500);
    const frFrThousand = new Intl.NumberFormat('fr-FR').format(1500);
    expect(frCaThousand).not.toBe(frFrThousand);
    expect(formatQuantity(1500)).toBe(frCaThousand);
  });
});

describe('numericFieldValue', () => {
  it('retire les zéros décimaux inutiles renvoyés par la base', () => {
    expect(numericFieldValue('5.000')).toBe('5');
    expect(numericFieldValue('1000.00')).toBe('1000');
  });
  it('conserve les décimales significatives', () => {
    expect(numericFieldValue('5.750')).toBe('5.75');
  });
  it('renvoie une chaîne vide pour une valeur absente ou invalide', () => {
    expect(numericFieldValue(null)).toBe('');
    expect(numericFieldValue(undefined)).toBe('');
    expect(numericFieldValue('abc')).toBe('');
  });
});

describe('digitsOnly', () => {
  it('retire le séparateur décimal et tout caractère non numérique', () => {
    expect(digitsOnly('5.5')).toBe('55');
    expect(digitsOnly('5,5')).toBe('55');
    expect(digitsOnly('1 250')).toBe('1250');
    expect(digitsOnly('-3')).toBe('3');
  });
  it('laisse un entier déjà propre inchangé', () => {
    expect(digitsOnly('42')).toBe('42');
    expect(digitsOnly('')).toBe('');
  });
});
