import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupOpenFoodFacts } from '../src/features/products/openFoodFacts';

describe('recherche approximative Open Food Facts', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('ne fait aucun appel réseau pour un code-barres mal formé', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(lookupOpenFoodFacts('abc')).resolves.toBeNull();
    await expect(lookupOpenFoodFacts('123')).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retrouve un produit connu et privilégie le nom francophone', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      status: 1,
      product: { product_name: 'Peak MILK POWDER 400G', product_name_fr: 'Peak Lait en poudre 400G', brands: 'Peak', image_front_url: 'https://images.example/peak.jpg' },
    })));
    await expect(lookupOpenFoodFacts('8716200727716')).resolves.toEqual({
      name: 'Peak Lait en poudre 400G',
      imageUrl: 'https://images.example/peak.jpg',
      brand: 'Peak',
    });
  });

  it('retombe sur le nom générique si aucun nom francophone n’est fourni', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      status: 1,
      product: { product_name: 'Peak MILK POWDER 400G' },
    })));
    await expect(lookupOpenFoodFacts('8716200727716')).resolves.toMatchObject({ name: 'Peak MILK POWDER 400G' });
  });

  it('renvoie null quand le produit est introuvable dans la base', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status: 0 })));
    await expect(lookupOpenFoodFacts('0000000000000')).resolves.toBeNull();
  });

  it('renvoie null sans lever d’erreur si le serveur répond en échec', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    await expect(lookupOpenFoodFacts('8716200727716')).resolves.toBeNull();
  });

  it('renvoie null sans lever d’erreur en cas de coupure réseau', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')));
    await expect(lookupOpenFoodFacts('8716200727716')).resolves.toBeNull();
  });
});
