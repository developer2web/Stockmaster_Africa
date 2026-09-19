import { describe, expect, it } from 'vitest';

import { ProductFieldError, saveError } from '../src/features/products/saveError';

describe('erreur d’enregistrement d’un produit', () => {
  it('désigne le code-barres en doublon', () => {
    const error = saveError({ code: '23505', message: 'duplicate key value violates unique constraint "products_store_barcode_key"', details: 'Key (store_id, barcode)=(1) already exists.' });
    expect(error).toBeInstanceOf(ProductFieldError);
    expect((error as ProductFieldError).field).toBe('barcode');
    expect((error as ProductFieldError).fieldMessage).toMatch(/code-barres/);
  });
  it('désigne la référence en doublon', () => {
    const error = saveError({ code: '23505', message: 'duplicate key value violates unique constraint "products_store_sku_key"' });
    expect((error as ProductFieldError).field).toBe('sku');
  });
  it('un doublon sans colonne identifiable garde le message général', () => {
    const error = saveError({ code: '23505', message: 'duplicate key value violates unique constraint "autre"' });
    expect(error).not.toBeInstanceOf(ProductFieldError);
    expect(error.message).toBe('Cette information est déjà utilisée.');
  });
});
