import { describe, expect, it } from 'vitest';
import { formatQuantity, numericFieldValue, parseWholeNumber, wholeNumberError } from '../src/utils/number';

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

describe('wholeNumberError / parseWholeNumber', () => {
  it('accepte un entier positif ou nul, espaces de milliers tolérés', () => {
    expect(wholeNumberError('0')).toBeNull();
    expect(wholeNumberError('1 250')).toBeNull();
    expect(parseWholeNumber('1 250')).toBe(1250);
  });
  it('refuse sans jamais transformer la saisie', () => {
    expect(wholeNumberError('')).toBe('Valeur requise');
    expect(wholeNumberError('   ')).toBe('Valeur requise');
    expect(wholeNumberError('-100')).toMatch(/négative/);
    expect(wholeNumberError('20.75')).toMatch(/sans décimale/);
    expect(wholeNumberError('20,75')).toMatch(/sans décimale/);
    expect(wholeNumberError('1e3')).toMatch(/chiffres/);
    expect(wholeNumberError('1'.repeat(13))).toMatch(/trop grand/);
    for (const bad of ['', '-2', '1e3', '20.75', 'abc']) expect(parseWholeNumber(bad)).toBeNull();
  });
});

describe('plafond des montants', () => {
  it('refuse un montant au-dessus du plafond, accepte le plafond lui-même', () => {
    expect(wholeNumberError('1000000001', { max: 1_000_000_000 })).toMatch(/ne peut pas dépasser/);
    expect(wholeNumberError('1000000000', { max: 1_000_000_000 })).toBeNull();
    expect(parseWholeNumber('999999999999', { max: 1_000_000_000 })).toBeNull();
    expect(wholeNumberError('999999999999')).toBeNull();
  });
});
