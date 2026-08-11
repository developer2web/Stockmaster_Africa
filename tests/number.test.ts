import { describe, expect, it } from 'vitest';
import { formatQuantity } from '../src/utils/number';

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
