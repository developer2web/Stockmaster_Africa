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
